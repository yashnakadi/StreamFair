import { getDb } from '../db/connection';
import { Video } from '../types';

export function upsertVideo(videoId: string, title: string, channel: string, durationSeconds: number): Video {
  const db = getDb();

  // Insert with avg_watch_ratio = 100 (default full engagement for new videos)
  // On conflict, only update metadata, not the avg_watch_ratio
  db.prepare(`
    INSERT INTO videos (video_id, title, channel, duration_seconds, avg_watch_ratio)
    VALUES (?, ?, ?, ?, 100.0)
    ON CONFLICT(video_id) DO UPDATE SET
      title = excluded.title,
      channel = excluded.channel,
      duration_seconds = excluded.duration_seconds,
      updated_at = datetime('now')
  `).run(videoId, title, channel, durationSeconds);

  return db.prepare('SELECT * FROM videos WHERE video_id = ?').get(videoId) as Video;
}

export function getVideo(videoId: string): Video | undefined {
  return getDb().prepare('SELECT * FROM videos WHERE video_id = ?').get(videoId) as Video | undefined;
}

export function setOverridePrice(videoId: string, price: number | null): Video | undefined {
  const db = getDb();
  db.prepare('UPDATE videos SET override_price = ?, updated_at = datetime(\'now\') WHERE video_id = ?')
    .run(price, videoId);
  return getVideo(videoId);
}

/**
 * Recompute avg_watch_ratio (0–100 scale) from completed sessions.
 *
 * If a manual_avg_watch_ratio seed exists, it counts as one extra data point
 * in the average — so it naturally dilutes as real sessions accumulate.
 */
export function recomputeAvgWatchRatio(videoId: string): void {
  const db = getDb();

  // Get session-based ratio data (0–1 per session, then we scale to 0–100)
  const row = db.prepare(`
    SELECT
      COUNT(*) as cnt,
      AVG(
        CASE WHEN v.duration_seconds > 0
          THEN CAST(s.seconds_watched AS REAL) / v.duration_seconds
          ELSE 0
        END
      ) as avg_ratio
    FROM watch_sessions s
    JOIN videos v ON v.video_id = s.video_id
    WHERE s.video_id = ? AND s.status = 'completed'
  `).get(videoId) as { cnt: number; avg_ratio: number | null } | undefined;

  const sessionCount = row?.cnt ?? 0;
  const sessionAvgRatio = (row?.avg_ratio ?? 0) * 100; // convert 0–1 → 0–100

  // Blend with manual seed if it exists (counts as 1 data point)
  const video = getVideo(videoId);
  const manualSeed = video?.manual_avg_watch_ratio;

  let finalRatio: number;
  if (sessionCount === 0 && manualSeed !== null && manualSeed !== undefined) {
    finalRatio = manualSeed;
  } else if (sessionCount > 0 && manualSeed !== null && manualSeed !== undefined) {
    // manual seed counts as 1 extra data point
    finalRatio = (sessionAvgRatio * sessionCount + manualSeed) / (sessionCount + 1);
  } else {
    finalRatio = sessionAvgRatio;
  }

  db.prepare('UPDATE videos SET avg_watch_ratio = ?, updated_at = datetime(\'now\') WHERE video_id = ?')
    .run(Math.round(finalRatio * 100) / 100, videoId);
}

export function setManualAvgRatio(videoId: string, ratio: number | null): Video | undefined {
  const db = getDb();
  db.prepare('UPDATE videos SET manual_avg_watch_ratio = ?, updated_at = datetime(\'now\') WHERE video_id = ?')
    .run(ratio, videoId);

  // If setting the seed and there are no sessions yet, also update avg_watch_ratio directly
  if (ratio !== null) {
    const row = db.prepare(`
      SELECT COUNT(*) as cnt FROM watch_sessions
      WHERE video_id = ? AND status = 'completed'
    `).get(videoId) as { cnt: number };

    if (row.cnt === 0) {
      db.prepare('UPDATE videos SET avg_watch_ratio = ? WHERE video_id = ?')
        .run(ratio, videoId);
    } else {
      // Re-blend with existing sessions
      recomputeAvgWatchRatio(videoId);
    }
  }

  return getVideo(videoId);
}

/**
 * Returns the effective avg watch ratio (0–100) for pricing.
 * This is always avg_watch_ratio since the manual seed is already
 * blended into it by recomputeAvgWatchRatio / setManualAvgRatio.
 */
export function effectiveAvgRatio(video: Video): number {
  return video.avg_watch_ratio;
}

export function listVideos(limit = 50): Video[] {
  return getDb().prepare('SELECT * FROM videos ORDER BY updated_at DESC LIMIT ?').all(limit) as Video[];
}
