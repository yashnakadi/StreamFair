/**
 * Amazon Prime Video utilities — mirrors youtube-utils.ts interface.
 */

/**
 * Extract a video/content ID from the Prime Video URL.
 * Handles:
 *   /detail/ASIN/...
 *   /dp/ASIN/...
 *   /gp/video/detail/ASIN/...
 */
export function getVideoId(): string | null {
  const path = window.location.pathname;

  // /detail/<ASIN>  or  /gp/video/detail/<ASIN>
  const detailMatch = path.match(/\/(?:gp\/video\/)?detail\/([A-Z0-9]{10,})/i);
  if (detailMatch) return `prime-${detailMatch[1]}`;

  // /dp/<ASIN>
  const dpMatch = path.match(/\/dp\/([A-Z0-9]+)/i);
  if (dpMatch) return `prime-${dpMatch[1]}`;

  return null;
}

/**
 * Get the primary <video> element on the page.
 */
export function getVideoElement(): HTMLVideoElement | null {
  // Prime Video SDK renders a <video> inside the player container
  return document.querySelector('.scalingVideoContainer video') ||
    document.querySelector('[id*="dv-web-player"] video') ||
    document.querySelector('.rendererContainer video') ||
    document.querySelector('video');
}

/**
 * Get the video player container.
 * Walks up from the <video> element to find a suitably sized ancestor,
 * since Prime Video's class names change frequently.
 */
export function getPlayerContainer(): HTMLElement | null {
  // Try known selectors first
  const known: HTMLElement | null =
    document.querySelector('.webPlayerContainer') ||
    document.querySelector('[id*="dv-web-player"]') ||
    document.querySelector('.atvwebplayersdk-overlays-container') ||
    document.querySelector('.rendererContainer');
  if (known) return known;

  // Fallback: walk up from the video element to find a visible container
  const video = getVideoElement();
  if (!video) return null;

  let el: HTMLElement | null = video.parentElement;
  while (el && el !== document.body) {
    const rect = el.getBoundingClientRect();
    if (rect.width >= 300 && rect.height >= 150) {
      return el;
    }
    el = el.parentElement;
  }

  // Last resort: video's direct parent
  return video.parentElement;
}

/**
 * Get the content title from the page.
 */
export function getVideoTitle(): string {
  const el =
    document.querySelector('.atvwebplayersdk-title-text') ||
    document.querySelector('[data-automation-id="title"]') ||
    document.querySelector('.dv-node-dp-title') ||
    document.querySelector('h1');
  if (el?.textContent?.trim()) return el.textContent.trim();

  // Fallback: parse from document title (e.g. "Watch Movie Name | Prime Video")
  const docTitle = document.title.replace(/\s*[\|–—]\s*Prime Video.*$/i, '').trim();
  return docTitle || '';
}

/**
 * Get the channel / studio name.
 */
export function getChannelName(): string {
  const el =
    document.querySelector('[data-automation-id="meta-info-studio"]') ||
    document.querySelector('.dv-node-dp-badges');
  return el?.textContent?.trim() || 'Prime Video';
}

/**
 * Detect if a pre-roll ad is currently playing.
 */
export function isAdPlaying(): boolean {
  // Prime Video ad indicators
  return !!document.querySelector('.adTimerText') ||
    !!document.querySelector('.atvwebplayersdk-ad-timer') ||
    !!document.querySelector('[class*="adBreak"]');
}

/**
 * Observe Prime Video navigations.
 * Prime Video is a SPA — watch for URL changes via polling + popstate.
 */
export function onNavigate(callback: () => void): void {
  // popstate for back/forward
  window.addEventListener('popstate', callback);

  // Poll for URL changes (Prime Video doesn't fire a custom nav event)
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      callback();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Landing page URL for "Complete" redirect.
 */
export function getHomePage(): string {
  if (window.location.hostname.includes('primevideo.com')) {
    return 'https://www.primevideo.com';
  }
  return 'https://www.amazon.com/gp/video/storefront';
}
