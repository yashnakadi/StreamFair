import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/connection';
import { WatchSession } from '../types';
import { recomputeAvgWatchRatio } from './video';

export function createSession(installId: string, videoId: string, priceQuoted: number): WatchSession {
  const sessionId = uuidv4();
  getDb().prepare(`
    INSERT INTO watch_sessions (session_id, install_id, video_id, price_quoted)
    VALUES (?, ?, ?, ?)
  `).run(sessionId, installId, videoId, priceQuoted);

  return getDb().prepare('SELECT * FROM watch_sessions WHERE session_id = ?').get(sessionId) as WatchSession;
}

export function getSession(sessionId: string): WatchSession | undefined {
  return getDb().prepare('SELECT * FROM watch_sessions WHERE session_id = ?').get(sessionId) as WatchSession | undefined;
}

export function updateSessionTime(sessionId: string, secondsWatched: number): void {
  getDb().prepare('UPDATE watch_sessions SET seconds_watched = ? WHERE session_id = ?')
    .run(secondsWatched, sessionId);
}

export function updateAmountStreamed(sessionId: string, amountStreamed: number): void {
  getDb().prepare('UPDATE watch_sessions SET amount_streamed = ? WHERE session_id = ?')
    .run(amountStreamed, sessionId);
}

export function recordPayment(
  sessionId: string,
  amountCents: number,
  rlusdAmount: string,
  txHash: string,
  txType: 'stream' | 'final' | 'refund'
): void {
  getDb().prepare(`
    INSERT INTO payment_ledger (session_id, amount_cents, rlusd_amount, tx_hash, tx_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, amountCents, rlusdAmount, txHash, txType);
}

export function getSessionPayments(sessionId: string): any[] {
  return getDb().prepare('SELECT * FROM payment_ledger WHERE session_id = ? ORDER BY created_at')
    .all(sessionId);
}

export function endSession(sessionId: string, secondsWatched: number, priceFinal: number): WatchSession | undefined {
  const db = getDb();
  db.prepare(`
    UPDATE watch_sessions
    SET status = 'completed', seconds_watched = ?, price_final = ?, ended_at = datetime('now')
    WHERE session_id = ?
  `).run(secondsWatched, priceFinal, sessionId);

  const session = getSession(sessionId);
  if (session) {
    recomputeAvgWatchRatio(session.video_id);
  }
  return session;
}

export function declineSession(installId: string, videoId: string, priceQuoted: number): WatchSession {
  const sessionId = uuidv4();
  getDb().prepare(`
    INSERT INTO watch_sessions (session_id, install_id, video_id, status, price_quoted, ended_at)
    VALUES (?, ?, ?, 'declined', ?, datetime('now'))
  `).run(sessionId, installId, videoId, priceQuoted);

  return getDb().prepare('SELECT * FROM watch_sessions WHERE session_id = ?').get(sessionId) as WatchSession;
}

export function listSessions(limit = 100): WatchSession[] {
  return getDb().prepare('SELECT * FROM watch_sessions ORDER BY started_at DESC LIMIT ?').all(limit) as WatchSession[];
}

export function listSessionsByInstallId(installId: string, limit = 50): any[] {
  return getDb().prepare(`
    SELECT
      s.session_id,
      s.video_id,
      s.status,
      s.price_quoted,
      s.price_final,
      s.seconds_watched,
      s.amount_streamed,
      s.started_at,
      s.ended_at,
      COALESCE(v.title, s.video_id) AS video_title,
      COALESCE(v.channel, '') AS channel,
      COALESCE(v.duration_seconds, 0) AS duration_seconds,
      (SELECT COUNT(*) FROM payment_ledger p WHERE p.session_id = s.session_id) AS payment_count,
      (SELECT COALESCE(SUM(p.amount_cents), 0) FROM payment_ledger p WHERE p.session_id = s.session_id) AS total_paid_cents
    FROM watch_sessions s
    LEFT JOIN videos v ON v.video_id = s.video_id
    WHERE s.install_id = ?
    ORDER BY s.started_at DESC
    LIMIT ?
  `).all(installId, limit);
}
