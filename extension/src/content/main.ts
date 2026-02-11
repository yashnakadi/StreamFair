import { API_BASE } from '../shared/constants';
import { apiFetch, setBadge, getWalletSeed } from '../shared/api-client';
import { PriceResponse, SessionResponse } from '../shared/types';
import { getPlatformUtils, PlatformUtils } from './platform';
import { createGateOverlay } from './gate';
import { createChargingBadge } from './badge';
import { startMeter } from './meter';

type State = 'idle' | 'gated' | 'watching' | 'declined';

let currentState: State = 'idle';
let currentVideoId: string | null = null;
let cleanup: (() => void) | null = null;
let utils: PlatformUtils | null = null;

// Track which videos have been declined (per page load)
const declinedVideos = new Set<string>();

async function onVideoPage() {
  if (!utils) return;

  const videoId = utils.getVideoId();
  if (!videoId || videoId === currentVideoId) return;

  // Clean up previous session
  teardown();
  currentVideoId = videoId;

  // Skip if already declined this video
  if (declinedVideos.has(videoId)) {
    currentState = 'declined';
    return;
  }

  // Wait for video element to appear (longer timeout for Prime Video)
  const video = await waitForElement<HTMLVideoElement>(() => utils!.getVideoElement(), 8000);
  if (!video) {
    console.warn('[streampay] No video element found');
    return;
  }

  const container = utils.getPlayerContainer();
  if (!container) {
    console.warn('[streampay] No player container found');
    return;
  }

  console.log(`[streampay] Found video + container on ${utils.platform}`, {
    videoId,
    containerTag: container.tagName,
    containerClass: container.className.slice(0, 80),
    containerSize: `${container.offsetWidth}x${container.offsetHeight}`,
  });

  // Wait a moment for the page to populate metadata
  await sleep(500);

  // Skip ads
  if (utils.isAdPlaying()) {
    const adObserver = new MutationObserver(() => {
      if (!utils!.isAdPlaying()) {
        adObserver.disconnect();
        showGate(videoId, video, container);
      }
    });
    adObserver.observe(container, { attributes: true, childList: true, subtree: true });
    return;
  }

  showGate(videoId, video, container);
}

async function showGate(videoId: string, video: HTMLVideoElement, container: HTMLElement) {
  // Pause the video
  video.pause();

  // Block keyboard shortcuts (space, k) from resuming playback while gated
  const blockPlaybackKeys = (e: KeyboardEvent) => {
    if (currentState !== 'gated') return;
    if (e.code === 'Space' || e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };
  document.addEventListener('keydown', blockPlaybackKeys, true);

  // Also re-pause if video somehow starts playing while gated
  const guardPlay = () => {
    if (currentState === 'gated') video.pause();
  };
  video.addEventListener('play', guardPlay);

  function removeGuards() {
    document.removeEventListener('keydown', blockPlaybackKeys, true);
    video.removeEventListener('play', guardPlay);
  }

  // Fetch price — wait for video duration if not yet available
  const title = utils!.getVideoTitle();
  const channel = utils!.getChannelName();
  let duration = Math.floor(video.duration || 0);
  if (!duration || !isFinite(video.duration)) {
    // Wait up to 3s for metadata to load (Prime Video uses MSE)
    await new Promise<void>((resolve) => {
      if (video.duration && isFinite(video.duration)) return resolve();
      const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve(); };
      video.addEventListener('loadedmetadata', onMeta);
      setTimeout(() => { video.removeEventListener('loadedmetadata', onMeta); resolve(); }, 3000);
    });
    duration = Math.floor(video.duration || 0);
  }

  let priceRes;
  try {
    priceRes = await apiFetch(
      `${API_BASE}/videos/${videoId}/price?title=${encodeURIComponent(title)}&channel=${encodeURIComponent(channel)}&duration=${duration}`
    );
  } catch (err: any) {
    console.error('[streampay] Price fetch threw:', err);
    if (err?.message?.includes('Extension context invalidated')) {
      console.warn('[streampay] Extension context invalidated. Showing refresh notification.');
      showExtensionReloadNotification();
    }
    removeGuards();
    video.play().catch(() => {});
    return;
  }

  if (!priceRes.ok) {
    console.error('[streampay] Failed to fetch price:', priceRes);
    removeGuards();
    video.play().catch(() => {});
    return;
  }

  const priceData: PriceResponse = priceRes.data;
  currentState = 'gated';

  // Use fixed-position overlay for Prime Video (their player stacking context blocks absolute overlays)
  const useFixed = utils!.platform !== 'youtube';

  // Show overlay with total price + per-second rate
  const gate = createGateOverlay(
    container,
    priceData.priceCents,
    priceData.centsPerSecond,
    priceData.durationSeconds,
    title,
    {
      onStart: async () => {
        removeGuards();
        gate.remove();
        await startWatching(videoId, video, container, priceData);
      },
      onDecline: async () => {
        removeGuards();
        gate.remove();
        currentState = 'declined';
        declinedVideos.add(videoId);

        // Log decline
        apiFetch(`${API_BASE}/sessions/decline`, 'POST', {
          videoId,
          priceQuoted: priceData.priceCents,
        }).catch(() => {});

        setBadge('').catch(() => {});

        // Navigate back to the previous page
        history.back();
      },
    },
    useFixed
  );

  // Store cleanup
  cleanup = () => {
    removeGuards();
    gate.remove();
  };
}

async function startWatching(
  videoId: string,
  video: HTMLVideoElement,
  container: HTMLElement,
  priceData: PriceResponse
) {
  // Create session
  const sessionRes = await apiFetch(`${API_BASE}/sessions`, 'POST', {
    videoId,
    priceQuoted: priceData.priceCents,
  });

  if (!sessionRes.ok) {
    console.error('[streampay] Failed to create session:', sessionRes);
    video.play();
    return;
  }

  const session: SessionResponse = sessionRes.data;
  currentState = 'watching';

  // Resume playback
  video.play();

  // Shared function to finalize session
  const finalizeSession = async (seconds: number) => {
    await endSession(session.session_id, seconds);
    badge.remove();
    meter.stop();
    currentState = 'idle';
    setBadge('').catch(() => {});
  };

  // Show charging badge with Resume/Complete controls
  const useFixed = utils!.platform !== 'youtube';
  const badge = createChargingBadge(container, {
    onResume: () => {
      video.play();
    },
    onComplete: async () => {
      video.pause();
      await finalizeSession(meter.getSecondsWatched());
      // Redirect to the platform's home page
      window.location.href = utils!.getHomePage();
    },
  }, useFixed);

  // Start metering
  const meter = startMeter(session.session_id, video, {
    onTick: (secondsWatched) => {
      badge.update(secondsWatched, priceData.priceCents, priceData.durationSeconds);
    },
    onEnd: async (secondsWatched) => {
      await finalizeSession(secondsWatched);
    },
  });

  // Set extension badge
  setBadge('$', '#1f7cff').catch(() => {});

  // Store cleanup — uses meter's tracked seconds (not video.currentTime which may be 0)
  cleanup = () => {
    const watched = meter.getSecondsWatched();
    meter.stop();
    badge.remove();
    if (watched > 0) {
      endSession(session.session_id, watched).catch(() => {});
    }
    setBadge('').catch(() => {});
  };
}

async function endSession(sessionId: string, secondsWatched: number) {
  await apiFetch(`${API_BASE}/sessions/${sessionId}/end`, 'POST', {
    secondsWatched,
  }).catch(() => {});
}

function teardown() {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  currentState = 'idle';
  currentVideoId = null;
}

// Utility: wait for an element to appear
function waitForElement<T extends Element>(
  selector: () => T | null,
  timeout: number
): Promise<T | null> {
  return new Promise((resolve) => {
    const el = selector();
    if (el) return resolve(el);

    const start = Date.now();
    const interval = setInterval(() => {
      const el = selector();
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        resolve(null);
      }
    }, 200);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Initialize
async function init() {
  utils = getPlatformUtils();
  if (!utils) {
    console.log('[streampay] Unsupported platform, skipping');
    return;
  }

  console.log(`[streampay] Content script loaded (${utils.platform})`);

  // Check if user has completed onboarding (has a wallet)
  let wallet;
  try {
    wallet = await getWalletSeed();
  } catch (err: any) {
    if (err?.message?.includes('Extension context invalidated')) {
      console.warn('[streampay] Extension was reloaded. Please refresh this page to continue.');
      showExtensionReloadNotification();
      return;
    }
    throw err;
  }

  if (!wallet) {
    console.log('[streampay] No wallet found — user needs to complete onboarding');
    setBadge('!', '#ff4444').catch(() => {});
    return;
  }

  // Handle initial page load
  onVideoPage();

  // Handle SPA navigations
  utils.onNavigate(() => {
    onVideoPage();
  });
}

function showExtensionReloadNotification() {
  // Inject a friendly notification telling the user to refresh
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    background: #1a1a2e;
    color: #e0e0f0;
    padding: 16px 20px;
    border-radius: 8px;
    border: 1px solid #ff6666;
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    z-index: 9999999;
    max-width: 320px;
    line-height: 1.5;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  `;
  notification.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 8px; color: #ff6666;">StreamPay Extension Updated</div>
    <div style="margin-bottom: 12px; color: #b8b8cc;">Please refresh this page to continue using StreamPay.</div>
    <button style="
      background: #ff6666;
      color: #fff;
      border: none;
      padding: 6px 14px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    ">Refresh Page</button>
  `;

  const btn = notification.querySelector('button')!;
  btn.addEventListener('click', () => {
    window.location.reload();
  });

  document.body.appendChild(notification);
}

init();
