CREATE TABLE IF NOT EXISTS videos (
  video_id        TEXT PRIMARY KEY,
  title           TEXT NOT NULL DEFAULT '',
  channel         TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  avg_watch_ratio REAL NOT NULL DEFAULT 0.0,
  override_price  REAL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watch_sessions (
  session_id      TEXT PRIMARY KEY,
  install_id      TEXT NOT NULL,
  video_id        TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','declined')),
  price_quoted    REAL NOT NULL DEFAULT 0,
  price_final     REAL,
  seconds_watched INTEGER NOT NULL DEFAULT 0,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  FOREIGN KEY (video_id) REFERENCES videos(video_id)
);

CREATE TABLE IF NOT EXISTS watch_events (
  event_id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        TEXT NOT NULL,
  event_type        TEXT NOT NULL CHECK(event_type IN ('play','pause','seek','heartbeat','end')),
  timestamp_seconds REAL NOT NULL DEFAULT 0,
  metadata          TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES watch_sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_install ON watch_sessions(install_id);
CREATE INDEX IF NOT EXISTS idx_sessions_video   ON watch_sessions(video_id);
CREATE INDEX IF NOT EXISTS idx_events_session   ON watch_events(session_id);
