import { HEARTBEAT_INTERVAL_MS, METER_TICK_MS, API_BASE } from '../shared/constants';
import { apiFetch } from '../shared/api-client';

export interface MeterCallbacks {
  onTick: (secondsWatched: number) => void;
  onEnd: (secondsWatched: number) => void;
}

/**
 * Starts a 1-second tick accumulator that:
 * - Increments a seconds counter each tick
 * - Fires heartbeat events to the backend every HEARTBEAT_INTERVAL
 * - Calls onTick for badge updates
 */
export function startMeter(
  sessionId: string,
  videoElement: HTMLVideoElement,
  callbacks: MeterCallbacks
): { getSecondsWatched: () => number; stop: () => void } {
  let secondsWatched = 0;
  let heartbeatCounter = 0;
  let stopped = false;

  const tickInterval = setInterval(() => {
    if (stopped) return;
    if (videoElement.paused || videoElement.ended) return;

    secondsWatched++;
    heartbeatCounter++;
    callbacks.onTick(secondsWatched);

    // Send heartbeat
    if (heartbeatCounter >= HEARTBEAT_INTERVAL_MS / METER_TICK_MS) {
      heartbeatCounter = 0;
      apiFetch(`${API_BASE}/sessions/${sessionId}/events`, 'POST', {
        eventType: 'heartbeat',
        timestampSeconds: videoElement.currentTime,
      }).catch(() => {}); // fire-and-forget
    }
  }, METER_TICK_MS);

  // Listen for video end
  const onEnded = () => {
    if (stopped) return;
    callbacks.onEnd(secondsWatched);
  };
  videoElement.addEventListener('ended', onEnded);

  // Listen for pause/play events
  const onPause = () => {
    if (stopped) return;
    apiFetch(`${API_BASE}/sessions/${sessionId}/events`, 'POST', {
      eventType: 'pause',
      timestampSeconds: videoElement.currentTime,
    }).catch(() => {});
  };
  const onPlay = () => {
    if (stopped) return;
    apiFetch(`${API_BASE}/sessions/${sessionId}/events`, 'POST', {
      eventType: 'play',
      timestampSeconds: videoElement.currentTime,
    }).catch(() => {});
  };

  videoElement.addEventListener('pause', onPause);
  videoElement.addEventListener('play', onPlay);

  return {
    getSecondsWatched: () => secondsWatched,
    stop: () => {
      stopped = true;
      clearInterval(tickInterval);
      videoElement.removeEventListener('ended', onEnded);
      videoElement.removeEventListener('pause', onPause);
      videoElement.removeEventListener('play', onPlay);
    },
  };
}
