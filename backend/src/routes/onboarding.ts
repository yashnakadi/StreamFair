import { Router, Request, Response } from 'express';
import * as xrpl from 'xrpl';
import { paymentProvider, XrplPaymentProvider } from '../services/payment-provider';

const RLUSD_CURRENCY = process.env.XRPL_RLUSD_CURRENCY || '524C555344000000000000000000000000000000';
const RLUSD_ISSUER = process.env.XRPL_RLUSD_ISSUER || 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV';
const STARTER_RLUSD = '2.000000'; // seed each new user with $2 RLUSD

const router = Router();

function getProviderAndClient() {
  const provider = paymentProvider as XrplPaymentProvider;
  const client = provider.getClient();
  return { provider, client };
}

// ---------------------------------------------------------------------------
// POST /api/onboarding/create-wallet — create a funded XRPL testnet wallet
// ---------------------------------------------------------------------------
router.post('/onboarding/create-wallet', async (_req: Request, res: Response) => {
  const { client } = getProviderAndClient();
  if (!client) {
    res.status(503).json({ success: false, error: 'XRPL not connected. Make sure the backend server is running.' });
    return;
  }

  try {
    console.log('[onboarding] Creating new testnet wallet...');
    const { wallet } = await client.fundWallet();
    console.log(`[onboarding] Wallet created: ${wallet.classicAddress}`);

    res.json({
      success: true,
      address: wallet.classicAddress,
      seed: wallet.seed,
    });
  } catch (err: any) {
    console.error('[onboarding] Create wallet error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/onboarding/import-wallet — validate a seed, check wallet status
// ---------------------------------------------------------------------------
router.post('/onboarding/import-wallet', async (req: Request, res: Response) => {
  const { seed } = req.body;
  if (!seed) {
    res.status(400).json({ success: false, error: 'seed is required' });
    return;
  }

  const { client } = getProviderAndClient();
  if (!client) {
    res.status(503).json({ success: false, error: 'XRPL not connected' });
    return;
  }

  // 1. Validate the seed first
  let wallet: xrpl.Wallet;
  try {
    wallet = xrpl.Wallet.fromSeed(seed);
  } catch (seedErr: any) {
    console.error('[onboarding] Invalid seed:', seedErr.message);
    res.status(400).json({ success: false, error: 'Invalid seed — ' + seedErr.message });
    return;
  }

  // 2. Seed is valid — now check on-ledger status
  const address = wallet.classicAddress;
  try {
    let xrpBalance = '0';
    let rlusdBalance = '0';
    let hasTrustline = false;
    let accountExists = false;

    try {
      const balances = await client.getBalances(address);
      accountExists = true;
      xrpBalance = balances.find((b: any) => b.currency === 'XRP')?.value ?? '0';
      rlusdBalance = balances.find((b: any) => b.currency === RLUSD_CURRENCY)?.value ?? '0';
    } catch (e: any) {
      const msg = e?.message || '';
      const errCode = e?.data?.error || '';
      if (msg.includes('actNotFound') || errCode === 'actNotFound') {
        accountExists = false;
      } else {
        throw e;
      }
    }

    // Check for RLUSD trustline (separate try so it doesn't block import)
    if (accountExists) {
      try {
        const linesResp: any = await client.request({
          command: 'account_lines',
          account: address,
          peer: RLUSD_ISSUER,
        } as any);
        hasTrustline = (linesResp.result.lines || []).some(
          (l: any) => l.currency === RLUSD_CURRENCY
        );
      } catch (e: any) {
        console.warn('[onboarding] account_lines check failed, skipping trustline check:', e.message);
        // Non-fatal — trustline status defaults to false
      }
    }

    res.json({ success: true, address, accountExists, xrpBalance, rlusdBalance, hasTrustline });
  } catch (err: any) {
    console.error('[onboarding] Ledger lookup error:', err.message);
    res.status(500).json({ success: false, error: 'Wallet is valid but ledger lookup failed: ' + err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/onboarding/set-trustline — set RLUSD trustline using the seed
// ---------------------------------------------------------------------------
router.post('/onboarding/set-trustline', async (req: Request, res: Response) => {
  const { seed } = req.body;
  if (!seed) {
    res.status(400).json({ success: false, error: 'seed is required' });
    return;
  }

  const { client } = getProviderAndClient();
  if (!client) {
    res.status(503).json({ success: false, error: 'XRPL not connected' });
    return;
  }

  try {
    const wallet = xrpl.Wallet.fromSeed(seed);
    console.log(`[onboarding] Setting RLUSD trustline for ${wallet.classicAddress}...`);

    const trustSetTx: xrpl.TrustSet = {
      TransactionType: 'TrustSet',
      Account: wallet.classicAddress,
      LimitAmount: {
        currency: RLUSD_CURRENCY,
        issuer: RLUSD_ISSUER,
        value: '1000000',
      },
    };

    const prepared = await client.autofill(trustSetTx);
    const signed = wallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    const meta = result.result.meta;
    const txResult =
      typeof meta === 'object' && meta !== null && 'TransactionResult' in meta
        ? (meta as any).TransactionResult
        : 'unknown';

    if (txResult !== 'tesSUCCESS') {
      console.error('[onboarding] TrustSet failed:', txResult);
      res.status(500).json({ success: false, error: `TrustSet failed: ${txResult}` });
      return;
    }

    console.log(`[onboarding] Trustline set for ${wallet.classicAddress}`);
    res.json({ success: true, txHash: result.result.hash });
  } catch (err: any) {
    console.error('[onboarding] TrustSet error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/onboarding/claim-rlusd — send starter RLUSD from faucet wallet
// ---------------------------------------------------------------------------
router.post('/onboarding/claim-rlusd', async (req: Request, res: Response) => {
  const { address } = req.body;
  if (!address) {
    res.status(400).json({ success: false, error: 'address is required' });
    return;
  }

  const { provider, client } = getProviderAndClient();
  const faucetWallet = provider.getFaucetWallet();

  if (!client) {
    res.status(503).json({ success: false, error: 'XRPL not connected' });
    return;
  }
  if (!faucetWallet) {
    res.status(503).json({ success: false, error: 'Faucet wallet not available' });
    return;
  }

  try {
    // Verify the destination has a RLUSD trustline first
    const linesResp: any = await client.request({
      command: 'account_lines',
      account: address,
      peer: RLUSD_ISSUER,
    } as any);
    const hasTrustline = (linesResp.result.lines || []).some(
      (l: any) => l.currency === RLUSD_CURRENCY
    );

    if (!hasTrustline) {
      res.status(400).json({
        success: false,
        error: 'RLUSD trustline not set. Please set up the trustline first (Step 3).',
      });
      return;
    }

    console.log(`[onboarding] Sending ${STARTER_RLUSD} RLUSD to ${address}...`);

    const paymentTx: xrpl.Payment = {
      TransactionType: 'Payment',
      Account: faucetWallet.classicAddress,
      Destination: address,
      Amount: {
        currency: RLUSD_CURRENCY,
        issuer: RLUSD_ISSUER,
        value: STARTER_RLUSD,
      },
      Memos: [
        {
          Memo: {
            MemoType: Buffer.from('text/plain', 'utf8').toString('hex').toUpperCase(),
            MemoData: Buffer.from(`onboarding:${address}`, 'utf8')
              .toString('hex')
              .toUpperCase(),
          },
        },
      ],
    };

    const prepared = await client.autofill(paymentTx);
    const signed = faucetWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);

    const meta = result.result.meta;
    const txResult =
      typeof meta === 'object' && meta !== null && 'TransactionResult' in meta
        ? (meta as any).TransactionResult
        : 'unknown';

    if (txResult !== 'tesSUCCESS') {
      console.error('[onboarding] RLUSD claim failed:', txResult);
      res.status(500).json({ success: false, error: `Payment failed: ${txResult}` });
      return;
    }

    console.log(`[onboarding] Sent ${STARTER_RLUSD} RLUSD to ${address}`);
    res.json({ success: true, txHash: result.result.hash, amount: STARTER_RLUSD });
  } catch (err: any) {
    console.error('[onboarding] Claim RLUSD error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/onboarding/status?address=<addr> — full wallet status check
// ---------------------------------------------------------------------------
router.get('/onboarding/status', async (req: Request, res: Response) => {
  const address = req.query.address as string;
  if (!address) {
    res.status(400).json({ error: 'address query parameter required' });
    return;
  }

  const { client } = getProviderAndClient();
  if (!client) {
    res.status(503).json({ error: 'XRPL not connected' });
    return;
  }

  try {
    let xrpBalance = '0';
    let rlusdBalance = '0';
    let hasTrustline = false;
    let accountExists = false;

    try {
      const balances = await client.getBalances(address);
      accountExists = true;
      xrpBalance = balances.find((b: any) => b.currency === 'XRP')?.value ?? '0';
      rlusdBalance = balances.find((b: any) => b.currency === RLUSD_CURRENCY)?.value ?? '0';
    } catch (e: any) {
      const msg = e?.message || '';
      const errCode = e?.data?.error || '';
      if (msg.includes('actNotFound') || errCode === 'actNotFound') {
        accountExists = false;
      } else {
        throw e;
      }
    }

    if (accountExists) {
      try {
        const linesResp: any = await client.request({
          command: 'account_lines',
          account: address,
          peer: RLUSD_ISSUER,
        } as any);
        hasTrustline = (linesResp.result.lines || []).some(
          (l: any) => l.currency === RLUSD_CURRENCY
        );
      } catch (e: any) {
        console.warn('[onboarding] account_lines check failed:', e.message);
      }
    }

    res.json({ address, accountExists, xrpBalance, rlusdBalance, hasTrustline });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/onboarding/balance?address=<addr> — backward-compatible balance check
// ---------------------------------------------------------------------------
router.get('/onboarding/balance', async (req: Request, res: Response) => {
  const address = req.query.address as string;
  if (!address) {
    res.status(400).json({ error: 'address query parameter required' });
    return;
  }

  const { client } = getProviderAndClient();
  if (!client) {
    res.status(503).json({ error: 'XRPL not connected' });
    return;
  }

  try {
    const balances = await client.getBalances(address);
    const rlusd = balances.find((b: any) => b.currency === RLUSD_CURRENCY);
    const xrpBal = balances.find((b: any) => b.currency === 'XRP');

    res.json({
      address,
      rlusdBalance: rlusd?.value ?? '0',
      xrpBalance: xrpBal?.value ?? '0',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
