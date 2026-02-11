-- Track how much RLUSD has been streamed so far (in cents)
ALTER TABLE watch_sessions ADD COLUMN amount_streamed REAL NOT NULL DEFAULT 0;

-- Store XRPL transaction hashes for each payment
CREATE TABLE IF NOT EXISTS payment_ledger (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      TEXT NOT NULL,
  amount_cents    REAL NOT NULL,
  rlusd_amount    TEXT NOT NULL,
  tx_hash         TEXT NOT NULL,
  tx_type         TEXT NOT NULL CHECK(tx_type IN ('stream','final','refund')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES watch_sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_session ON payment_ledger(session_id);
