// Messages between content script and service worker
export type MessageType =
  | 'GET_INSTALL_ID'
  | 'FETCH_PROXY'
  | 'SET_BADGE'
  | 'GET_WALLET';

export interface BaseMessage {
  type: MessageType;
}

export interface GetInstallIdMessage extends BaseMessage {
  type: 'GET_INSTALL_ID';
}

export interface FetchProxyMessage extends BaseMessage {
  type: 'FETCH_PROXY';
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface SetBadgeMessage extends BaseMessage {
  type: 'SET_BADGE';
  text: string;
  color?: string;
}

export interface GetWalletMessage extends BaseMessage {
  type: 'GET_WALLET';
}

export type ExtensionMessage = GetInstallIdMessage | FetchProxyMessage | SetBadgeMessage | GetWalletMessage;

export interface WalletInfo {
  address: string;
  seed: string;
}

export interface FetchProxyResponse {
  ok: boolean;
  status: number;
  data: any;
}

// Price lookup response
export interface PriceResponse {
  videoId: string;
  priceCents: number;
  centsPerSecond: number;
  avgWatchRatio: number;
  manualAvgWatchRatio: number | null;
  overridePrice: number | null;
  durationSeconds: number;
}

// Session response
export interface SessionResponse {
  session_id: string;
  install_id: string;
  video_id: string;
  status: string;
  price_quoted: number;
  price_final: number | null;
  seconds_watched: number;
  started_at: string;
  ended_at: string | null;
}

// Transaction history entry (from GET /api/sessions/history)
export interface TransactionHistoryEntry {
  session_id: string;
  video_id: string;
  status: string;
  price_quoted: number;
  price_final: number | null;
  seconds_watched: number;
  amount_streamed: number;
  started_at: string;
  ended_at: string | null;
  video_title: string;
  channel: string;
  duration_seconds: number;
  payment_count: number;
  total_paid_cents: number;
}
