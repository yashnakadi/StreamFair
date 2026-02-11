/**
 * Extract YouTube video ID from URL.
 */
export function getVideoId(): string | null {
  const url = new URL(window.location.href);
  if (url.pathname === '/watch') {
    return url.searchParams.get('v');
  }
  // Shorts
  const shortsMatch = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch) return shortsMatch[1];

  return null;
}

/**
 * Get the primary <video> element on the page.
 */
export function getVideoElement(): HTMLVideoElement | null {
  return document.querySelector('video.html5-main-video') ||
    document.querySelector('video');
}

/**
 * Get the video player container.
 */
export function getPlayerContainer(): HTMLElement | null {
  return document.querySelector('#movie_player') ||
    document.querySelector('.html5-video-player');
}

/**
 * Get video title from the page.
 */
export function getVideoTitle(): string {
  const el = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
    document.querySelector('h1.title');
  return el?.textContent?.trim() || '';
}

/**
 * Get channel name from the page.
 */
export function getChannelName(): string {
  const el = document.querySelector('#owner #channel-name a') ||
    document.querySelector('ytd-channel-name a');
  return el?.textContent?.trim() || '';
}

/**
 * Detect if an ad is currently playing.
 */
export function isAdPlaying(): boolean {
  const player = getPlayerContainer();
  if (!player) return false;
  return player.classList.contains('ad-showing') ||
    !!document.querySelector('.ytp-ad-player-overlay');
}

/**
 * Observe YouTube SPA navigations (yt-navigate-finish event).
 */
export function onYouTubeNavigate(callback: () => void): void {
  // YouTube fires this custom event on SPA navigations
  document.addEventListener('yt-navigate-finish', callback);

  // Also watch for popstate (back/forward)
  window.addEventListener('popstate', callback);
}
