/**
 * Platform abstraction — detects which site we're on and exports
 * the correct utility functions.
 */
import * as youtube from './youtube-utils';
import * as prime from './prime-utils';

export type Platform = 'youtube' | 'prime' | 'unknown';

export interface PlatformUtils {
  platform: Platform;
  getVideoId: () => string | null;
  getVideoElement: () => HTMLVideoElement | null;
  getPlayerContainer: () => HTMLElement | null;
  getVideoTitle: () => string;
  getChannelName: () => string;
  isAdPlaying: () => boolean;
  onNavigate: (callback: () => void) => void;
  getHomePage: () => string;
}

export function detectPlatform(): Platform {
  const host = window.location.hostname;
  if (host.includes('youtube.com')) return 'youtube';
  if (host.includes('primevideo.com') || host.includes('amazon.com')) return 'prime';
  return 'unknown';
}

export function getPlatformUtils(): PlatformUtils | null {
  const platform = detectPlatform();

  switch (platform) {
    case 'youtube':
      return {
        platform,
        getVideoId: youtube.getVideoId,
        getVideoElement: youtube.getVideoElement,
        getPlayerContainer: youtube.getPlayerContainer,
        getVideoTitle: youtube.getVideoTitle,
        getChannelName: youtube.getChannelName,
        isAdPlaying: youtube.isAdPlaying,
        onNavigate: youtube.onYouTubeNavigate,
        getHomePage: () => 'https://www.youtube.com',
      };

    case 'prime':
      return {
        platform,
        getVideoId: prime.getVideoId,
        getVideoElement: prime.getVideoElement,
        getPlayerContainer: prime.getPlayerContainer,
        getVideoTitle: prime.getVideoTitle,
        getChannelName: prime.getChannelName,
        isAdPlaying: prime.isAdPlaying,
        onNavigate: prime.onNavigate,
        getHomePage: prime.getHomePage,
      };

    default:
      return null;
  }
}
