import { Router, Request, Response } from 'express';
import { extractInstallId } from '../middleware/install-id';
import { getVideo } from '../models/video';
import {
  createSession, getSession, updateSessionTime, updateAmountStreamed,
  endSession, declineSession, recordPayment, getSessionPayments,
  listSessionsByInstallId,
} from '../models/session';
import { insertEvent } from '../models/event';
import { paymentProvider } from '../services/payment-provider';
import { EventType } from '../types';

const router = Router();

// POST /api/sessions — start a new watch session
router.post('/sessions', extractInstallId, (req: Request, res: Response) => {
  const { videoId, priceQuoted } = req.body;
  if (!videoId || priceQuoted === undefined) {
    res.status(400).json({ error: 'videoId and priceQuoted required' });
    return;
  }

  const session = createSession(req.installId!, videoId, priceQuoted);
  insertEvent(session.session_id, 'play', 0);
  res.status(201).json(session);
});

// POST /api/sessions/decline — record a declined session
router.post('/sessions/decline', extractInstallId, (req: Request, res: Response) => {
  const { videoId, priceQuoted } = req.body;
  if (!videoId || priceQuoted === undefined) {
    res.status(400).json({ error: 'videoId and priceQuoted required' });
    return;
  }

  const session = declineSession(req.installId!, videoId, priceQuoted);
  res.status(201).json(session);
});

// GET /api/sessions/history — get current user's session + payment history
router.get('/sessions/history', extractInstallId, (req: Request, res: Response) => {
  const sessions = listSessionsByInstallId(req.installId!);
  res.json(sessions);
});

// POST /api/sessions/:id/events — log a watch event + stream micro-payment on heartbeat
router.post('/sessions/:id/events', async (req: Request, res: Response) => {
  const sessionId = req.params.id as string;
  const { eventType, timestampSeconds, metadata } = req.body;

  const validTypes: EventType[] = ['play', 'pause', 'seek', 'heartbeat', 'end'];
  if (!validTypes.includes(eventType)) {
    res.status(400).json({ error: `eventType must be one of: ${validTypes.join(', ')}` });
    return;
  }

  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // Update seconds watched on heartbeats
  if (eventType === 'heartbeat' && typeof timestampSeconds === 'number') {
    const secs = Math.floor(timestampSeconds);
    updateSessionTime(sessionId, secs);
    session.seconds_watched = secs;  // keep in-memory object in sync
  }

  const event = insertEvent(sessionId, eventType, timestampSeconds || 0, metadata);

  // On heartbeat: calculate and send micro-payment for the increment
  let payment = null;
  if (eventType === 'heartbeat' && session.status === 'active') {
    const walletSeed = req.headers['x-wallet-seed'] as string | undefined;
    payment = await processStreamPayment(session, walletSeed);
  }

  res.status(201).json({ event, payment });
});

// POST /api/sessions/:id/end — finalize a session + send remaining RLUSD
router.post('/sessions/:id/end', async (req: Request, res: Response) => {
  const sessionId = req.params.id as string;
  const { secondsWatched } = req.body;

  const session = getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  if (session.status !== 'active') {
    res.status(400).json({ error: 'Session already ended' });
    return;
  }

  const finalSeconds = secondsWatched || session.seconds_watched;
  updateSessionTime(sessionId, finalSeconds);

  // Calculate total owed
  const video = getVideo(session.video_id);
  const watchRatio = video && video.duration_seconds > 0
    ? Math.min(finalSeconds / video.duration_seconds, 1)
    : 1;
  const priceFinal = Math.round(session.price_quoted * watchRatio);

  // Send any remaining unpaid delta
  const alreadyPaid = session.amount_streamed;
  const delta = Math.max(0, priceFinal - alreadyPaid);

  let payment = null;
  if (delta > 0) {
    const walletSeed = req.headers['x-wallet-seed'] as string | undefined;
    const result = await paymentProvider.charge(
      session.install_id, delta, `final:${sessionId}`, walletSeed
    );
    if (result.success) {
      updateAmountStreamed(sessionId, alreadyPaid + delta);
      recordPayment(sessionId, delta, (delta / 100).toFixed(6), result.transactionId, 'final');
      payment = result;
    }
  }

  insertEvent(sessionId, 'end', finalSeconds);
  const ended = endSession(sessionId, finalSeconds, priceFinal);

  // Include payment history
  const payments = getSessionPayments(sessionId);

  res.json({ session: ended, payments, finalPayment: payment });
});

/**
 * Process a streaming micro-payment based on the seconds watched so far.
 * Calculates the total owed at this point, subtracts what's already been streamed,
 * and sends only the delta.
 */
async function processStreamPayment(session: {
  session_id: string;
  install_id: string;
  video_id: string;
  price_quoted: number;
  seconds_watched: number;
  amount_streamed: number;
}, walletSeed?: string) {
  const video = getVideo(session.video_id);
  if (!video || video.duration_seconds <= 0) return null;

  // How much should have been paid by now (prorated)
  const watchRatio = Math.min(session.seconds_watched / video.duration_seconds, 1);
  const owedSoFar = Math.round(session.price_quoted * watchRatio);

  // How much is the increment
  const delta = Math.max(0, owedSoFar - session.amount_streamed);
  if (delta <= 0) return null;

  const result = await paymentProvider.charge(
    session.install_id, delta, `stream:${session.session_id}:${session.seconds_watched}s`, walletSeed
  );

  if (result.success) {
    const newTotal = session.amount_streamed + delta;
    updateAmountStreamed(session.session_id, newTotal);
    recordPayment(session.session_id, delta, (delta / 100).toFixed(6), result.transactionId, 'stream');
  }

  return result;
}

export default router;
