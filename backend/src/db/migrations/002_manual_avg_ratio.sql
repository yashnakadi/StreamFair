-- Add manual avg watch ratio column (0-100 percentage scale)
ALTER TABLE videos ADD COLUMN manual_avg_watch_ratio REAL;

-- Convert existing avg_watch_ratio from 0-1 decimal to 0-100 percentage
UPDATE videos SET avg_watch_ratio = avg_watch_ratio * 100 WHERE avg_watch_ratio <= 1.0;
