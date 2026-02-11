import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { runMigrations } from './db/migrate';
import { createApp } from './app';
import { paymentProvider } from './services/payment-provider';
import { XrplPaymentProvider } from './services/payment-provider';

const PORT = parseInt(process.env.PORT || '4000', 10);

async function main() {
  // Run migrations
  runMigrations();

  // Connect to XRPL
  const xrpl = paymentProvider as XrplPaymentProvider;
  await xrpl.connect();

  // Start server
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`[streamfair] Backend running on http://localhost:${PORT}`);
    console.log(`[streamfair] Admin dashboard: http://localhost:${PORT}/admin`);
    console.log(`[streamfair] XRPL status: http://localhost:${PORT}/api/xrpl/status`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[streamfair] Shutting down...');
    await xrpl.disconnect();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[streamfair] Startup failed:', err);
  process.exit(1);
});
