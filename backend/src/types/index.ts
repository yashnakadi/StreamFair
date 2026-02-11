// ── Video ──
export interface Video {
  video_id: string;
  title: string;
  channel: string;
  duration_seconds: number;
  avg_watch_ratio: number;
  manual_avg_watch_ratio: number | null;
  override_price: number | null;
  created_at: string;
  updated_at: string;
}

// ── Watch Session ──
export type SessionStatus = 'active' | 'completed' | 'declined';

export interface WatchSession {
  session_id: string;
  install_id: string;
  video_id: string;
  status: SessionStatus;
  price_quoted: number;
  price_final: number | null;
  seconds_watched: number;
  amount_streamed: number;
  started_at: string;
  ended_at: string | null;
}

// ── Payment Ledger ──
export type PaymentTxType = 'stream' | 'final' | 'refund';

export interface PaymentLedgerEntry {
  id: number;
  session_id: string;
  amount_cents: number;
  rlusd_amount: string;
  tx_hash: string;
  tx_type: PaymentTxType;
  created_at: string;
}

// ── Watch Event ──
export type EventType = 'play' | 'pause' | 'seek' | 'heartbeat' | 'end';

export interface WatchEvent {
  event_id: number;
  session_id: string;
  event_type: EventType;
  timestamp_seconds: number;
  metadata: string | null;
  created_at: string;
}

// ── Pricing ──
export interface PricingConfig {
  baseCentsPerSecond: number;  // base price per second in cents
}

export const DEFAULT_PRICING: PricingConfig = {
  baseCentsPerSecond: 0.2,      // 0.2 cents per second
};

// ── Payment Provider ──
export interface PaymentResult {
  success: boolean;
  transactionId: string;
  amountCents: number;
  error?: string;
}

export interface PaymentProvider {
  name: string;
  charge(installId: string, amountCents: number, memo: string, senderSeed?: string): Promise<PaymentResult>;
  refund(transactionId: string): Promise<PaymentResult>;
}
