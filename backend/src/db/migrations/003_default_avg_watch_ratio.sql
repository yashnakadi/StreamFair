-- Set default avg_watch_ratio to 100 for new videos (full engagement assumed)
-- Update existing videos that have 0 avg_watch_ratio to 100
UPDATE videos
SET avg_watch_ratio = 100.0
WHERE avg_watch_ratio = 0.0
  AND manual_avg_watch_ratio IS NULL
  AND (SELECT COUNT(*) FROM watch_sessions WHERE video_id = videos.video_id AND status = 'completed') = 0;
