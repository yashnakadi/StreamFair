import { getDb } from '../db/connection';
import { WatchEvent, EventType } from '../types';

export function insertEvent(
  sessionId: string,
  eventType: EventType,
  timestampSeconds: number,
  metadata?: string
): WatchEvent {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO watch_events (session_id, event_type, timestamp_seconds, metadata)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, eventType, timestampSeconds, metadata ?? null);

  return db.prepare('SELECT * FROM watch_events WHERE event_id = ?')
    .get(result.lastInsertRowid) as WatchEvent;
}
