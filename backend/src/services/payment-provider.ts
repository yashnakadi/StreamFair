import * as xrpl from 'xrpl';
import { PaymentProvider, PaymentResult } from '../types';

const XRPL_WS_URL = process.env.XRPL_WS_URL || 'wss://testnet.xrpl-labs.com';
const RLUSD_CURRENCY = process.env.XRPL_RLUSD_CURRENCY || '524C555344000000000000000000000000000000';
const RLUSD_ISSUER = process.env.XRPL_RLUSD_ISSUER || 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV';
const SENDER_SEED = process.env.XRPL_SENDER_SEED || '';
const RECEIVER_ADDRESS = process.env.XRPL_RECEIVER_ADDRESS || '';

export class XrplPaymentProvider implements PaymentProvider {
  name = 'xrpl-rlusd';
  private client: xrpl.Client;
  private senderWallet: xrpl.Wallet | null = null;
  private connected = false;

  constructor() {
    this.client = new xrpl.Client(XRPL_WS_URL, { connectionTimeout: 20000 });
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    if (!SENDER_SEED) {
      console.error('[xrpl] XRPL_SENDER_SEED not set in .env — run scripts/xrpl-setup.ts first');
      return;
    }
    if (!RECEIVER_ADDRESS) {
      console.error('[xrpl] XRPL_RECEIVER_ADDRESS not set in .env');
      return;
    }

    try {
      console.log('[xrpl] Connecting to', XRPL_WS_URL, '...');
      await this.client.connect();
      this.senderWallet = xrpl.Wallet.fromSeed(SENDER_SEED);
      this.connected = true;
      console.log('[xrpl] Connected! Sender:', this.senderWallet.classicAddress);
      console.log('[xrpl] Receiver:', RECEIVER_ADDRESS);

      // Log RLUSD balance
      const balances = await this.client.getBalances(this.senderWallet.classicAddress);
      const rlusd = balances.find(b => b.currency === RLUSD_CURRENCY);
      console.log('[xrpl] Sender RLUSD balance:', rlusd?.value ?? '0');
    } catch (err) {
      console.error('[xrpl] Failed to connect:', err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
      console.log('[xrpl] Disconnected');
    }
  }

  /** Expose the connected XRPL client for reuse (e.g. onboarding route). */
  getClient(): xrpl.Client | null {
    return this.connected ? this.client : null;
  }

  /** Expose the faucet/server wallet for seeding new user wallets. */
  getFaucetWallet(): xrpl.Wallet | null {
    return this.senderWallet;
  }

  async getStatus(): Promise<{
    connected: boolean;
    senderAddress: string | null;
    receiverAddress: string;
    senderBalances: any[];
    receiverBalances: any[];
  }> {
    if (!this.connected || !this.senderWallet) {
      return {
        connected: false,
        senderAddress: null,
        receiverAddress: RECEIVER_ADDRESS,
        senderBalances: [],
        receiverBalances: [],
      };
    }

    const senderBalances = await this.client.getBalances(this.senderWallet.classicAddress);
    const receiverBalances = await this.client.getBalances(RECEIVER_ADDRESS);

    return {
      connected: true,
      senderAddress: this.senderWallet.classicAddress,
      receiverAddress: RECEIVER_ADDRESS,
      senderBalances,
      receiverBalances,
    };
  }

  async charge(installId: string, amountCents: number, memo: string, senderSeed?: string): Promise<PaymentResult> {
    if (!this.connected) {
      return {
        success: false,
        transactionId: '',
        amountCents,
        error: 'XRPL not connected',
      };
    }

    // Use per-user wallet if seed provided, otherwise fall back to faucet wallet
    const wallet = senderSeed
      ? xrpl.Wallet.fromSeed(senderSeed)
      : this.senderWallet;

    if (!wallet) {
      return {
        success: false,
        transactionId: '',
        amountCents,
        error: 'No wallet available',
      };
    }

    if (amountCents <= 0) {
      return {
        success: true,
        transactionId: 'zero_amount',
        amountCents: 0,
      };
    }

    // Convert cents to RLUSD (1 cent = 0.01 RLUSD)
    const rlusdAmount = (amountCents / 100).toFixed(6);

    console.log(`[xrpl] Charging ${amountCents}¢ (${rlusdAmount} RLUSD) from ${wallet.classicAddress} for ${memo}`);

    try {
      const paymentTx: xrpl.Payment = {
        TransactionType: 'Payment',
        Account: wallet.classicAddress,
        Destination: RECEIVER_ADDRESS,
        Amount: {
          currency: RLUSD_CURRENCY,
          issuer: RLUSD_ISSUER,
          value: rlusdAmount,
        },
        Memos: [
          {
            Memo: {
              MemoType: Buffer.from('text/plain', 'utf8').toString('hex').toUpperCase(),
              MemoData: Buffer.from(memo, 'utf8').toString('hex').toUpperCase(),
            },
          },
        ],
      };

      const prepared = await this.client.autofill(paymentTx);
      const signed = wallet.sign(prepared);
      const result = await this.client.submitAndWait(signed.tx_blob);

      const meta = result.result.meta;
      const txResult = typeof meta === 'object' && meta !== null && 'TransactionResult' in meta
        ? (meta as any).TransactionResult
        : 'unknown';
      const txHash = result.result.hash || signed.hash;

      if (txResult === 'tesSUCCESS') {
        console.log(`[xrpl] Payment SUCCESS: ${txHash} (${rlusdAmount} RLUSD)`);
        return {
          success: true,
          transactionId: txHash,
          amountCents,
        };
      } else {
        console.error(`[xrpl] Payment FAILED: ${txResult}`, txHash);
        return {
          success: false,
          transactionId: txHash,
          amountCents,
          error: `XRPL payment failed: ${txResult}`,
        };
      }
    } catch (err: any) {
      console.error('[xrpl] Payment error:', err.message);
      return {
        success: false,
        transactionId: '',
        amountCents,
        error: err.message,
      };
    }
  }

  async refund(transactionId: string): Promise<PaymentResult> {
    // Refunds on XRPL would be a reverse payment — not implemented for MVP
    console.log(`[xrpl] Refund requested for ${transactionId} (not implemented)`);
    return {
      success: false,
      transactionId,
      amountCents: 0,
      error: 'Refunds not implemented in MVP',
    };
  }
}

// Singleton instance
export const paymentProvider = new XrplPaymentProvider();
