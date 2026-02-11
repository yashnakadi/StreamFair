import { Router, Request, Response } from 'express';
import { paymentProvider } from '../services/payment-provider';
import { XrplPaymentProvider } from '../services/payment-provider';
import { getSessionPayments } from '../models/session';
import { getDb } from '../db/connection';

const router = Router();

// GET /api/xrpl/status — check XRPL connection and wallet balances
router.get('/xrpl/status', async (_req: Request, res: Response) => {
  const provider = paymentProvider as XrplPaymentProvider;
  const status = await provider.getStatus();
  res.json(status);
});

// GET /api/xrpl/payments/:sessionId — get payment history for a session
router.get('/xrpl/payments/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;
  const payments = getSessionPayments(sessionId);
  res.json(payments);
});

// GET /api/xrpl/payments — get all recent payments
router.get('/xrpl/payments', (_req: Request, res: Response) => {
  const payments = getDb()
    .prepare('SELECT * FROM payment_ledger ORDER BY created_at DESC LIMIT 50')
    .all();
  res.json(payments);
});

export default router;
