/* ──────────────────────────────────────────────────────────────
   StreamPay — Onboarding Page Script
   Multi-step guided wallet setup wizard
   ────────────────────────────────────────────────────────────── */

const API_BASE = 'http://localhost:4000/api';

// ── State ─────────────────────────────────────────────────────
let walletAddress = '';
let walletSeed = '';

// ── Element helpers ───────────────────────────────────────────
const $ = (id: string) => document.getElementById(id)!;

const screens: Record<string, HTMLElement> = {
  welcome:  $('screen-welcome'),
  import:   $('screen-import'),
  generate: $('screen-generate'),
  ready:    $('screen-ready'),
};

const loadingOverlay = $('loading-overlay');
const loadingTextEl  = $('loading-text');
const toastEl        = $('toast');

// ── Screen management ─────────────────────────────────────────
function showScreen(key: string) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  const target = screens[key];
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
  }
}

function showLoading(text: string) {
  loadingTextEl.textContent = text;
  loadingOverlay.classList.add('active');
}

function hideLoading() {
  loadingOverlay.classList.remove('active');
}

function showToast(msg: string, type: 'error' | 'success' = 'error') {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type} show`;
  setTimeout(() => toastEl.classList.remove('show'), 3500);
}

function showError(elementId: string, msg: string) {
  const el = $(elementId);
  el.textContent = msg;
  el.classList.add('show');
}

function hideError(elementId: string) {
  $(elementId).classList.remove('show');
}

// ── API helper ────────────────────────────────────────────────
async function api(path: string, method = 'GET', body?: any): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(`${API_BASE}${path}`, opts);
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || `Request failed (${resp.status})`);
  }
  return data;
}

// ── Clipboard helper ──────────────────────────────────────────
function copyToClipboard(text: string, btn: HTMLElement) {
  navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  });
}

// ── Chrome storage helper ─────────────────────────────────────
async function storeWallet(address: string, seed: string) {
  await chrome.storage.local.set({
    wallet_address: address,
    wallet_seed: seed,
  });
}

// ═══════════════════════════════════════════════════════════════
//  SCREEN 1 — Choice
// ═══════════════════════════════════════════════════════════════
$('choice-import').addEventListener('click', () => showScreen('import'));
$('choice-generate').addEventListener('click', generateWallet);

// ═══════════════════════════════════════════════════════════════
//  SCREEN 2a — Import wallet
// ═══════════════════════════════════════════════════════════════
$('btn-toggle-import-vis').addEventListener('click', () => {
  const input = $('import-seed-input') as HTMLInputElement;
  const btn = $('btn-toggle-import-vis');
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
});

$('import-seed-input').addEventListener('keydown', (e) => {
  if ((e as KeyboardEvent).key === 'Enter') importWallet();
});

$('btn-import-submit').addEventListener('click', importWallet);
$('btn-import-back').addEventListener('click', () => showScreen('welcome'));

// ═══════════════════════════════════════════════════════════════
//  SCREEN 2b — Generate wallet
// ═══════════════════════════════════════════════════════════════
$('btn-toggle-gen-vis').addEventListener('click', () => {
  const seedEl = $('gen-seed');
  const btn = $('btn-toggle-gen-vis');
  const style = seedEl.style as any;
  if (style.webkitTextSecurity === 'disc') {
    style.webkitTextSecurity = 'none';
    btn.textContent = 'Hide';
  } else {
    style.webkitTextSecurity = 'disc';
    btn.textContent = 'Show';
  }
});

$('btn-copy-address').addEventListener('click', () => {
  copyToClipboard(walletAddress, $('btn-copy-address'));
});

$('btn-copy-seed').addEventListener('click', () => {
  copyToClipboard(walletSeed, $('btn-copy-seed'));
});

$('btn-seed-saved').addEventListener('click', finishGenerate);
$('btn-generate-back').addEventListener('click', () => showScreen('welcome'));

// ═══════════════════════════════════════════════════════════════
//  SCREEN 3 — Ready
// ═══════════════════════════════════════════════════════════════
$('btn-start-youtube').addEventListener('click', () => {
  window.location.href = 'https://www.youtube.com';
});
$('btn-start-prime').addEventListener('click', () => {
  window.location.href = 'https://www.primevideo.com';
});

// ═══════════════════════════════════════════════════════════════
//  Actions
// ═══════════════════════════════════════════════════════════════

async function importWallet() {
  const seed = (($('import-seed-input') as HTMLInputElement).value || '').trim();
  if (!seed) {
    showError('import-error', 'Please enter your wallet seed.');
    return;
  }
  hideError('import-error');

  showLoading('Importing wallet\u2026');
  try {
    const data = await api('/onboarding/import-wallet', 'POST', { seed });
    walletAddress = data.address;
    walletSeed = seed;
    await storeWallet(walletAddress, walletSeed);

    hideLoading();
    populateReadyScreen(data.xrpBalance, data.rlusdBalance, data.hasTrustline);
    showScreen('ready');
    showToast('Wallet imported successfully!', 'success');
  } catch (err: any) {
    hideLoading();
    showError('import-error', err.message || 'Invalid seed or backend not reachable.');
  }
}

async function generateWallet() {
  showLoading('Creating testnet wallet\u2026');
  try {
    const data = await api('/onboarding/create-wallet', 'POST');
    walletAddress = data.address;
    walletSeed = data.seed;

    $('gen-address').textContent = walletAddress;
    $('gen-seed').textContent = walletSeed;

    hideLoading();
    showScreen('generate');
  } catch (err: any) {
    hideLoading();
    showToast(err.message || 'Failed to create wallet. Is the backend running?');
  }
}

async function finishGenerate() {
  hideError('generate-error');
  showLoading('Checking wallet status\u2026');
  try {
    const data = await api('/onboarding/import-wallet', 'POST', { seed: walletSeed });
    await storeWallet(walletAddress, walletSeed);

    hideLoading();
    populateReadyScreen(data.xrpBalance, data.rlusdBalance, data.hasTrustline);
    showScreen('ready');
    showToast('Wallet created successfully!', 'success');
  } catch (err: any) {
    hideLoading();
    showError('generate-error', err.message || 'Failed to verify wallet.');
  }
}

// ── Ready screen ──────────────────────────────────────────────

function populateReadyScreen(xrpBalance: string, rlusdBalance: string, hasTrustline: boolean) {
  $('ready-address').textContent = walletAddress;
  $('ready-rlusd').textContent = `${rlusdBalance} RLUSD`;
  $('ready-xrp').textContent = `${xrpBalance} XRP`;
  $('ready-trustline').textContent = hasTrustline ? '\u2713 Active' : '\u2717 Not set';
  $('ready-trustline').className = `summary-value ${hasTrustline ? 'green' : ''}`;
}

// ═══════════════════════════════════════════════════════════════
//  Init — check for existing wallet on page load
// ═══════════════════════════════════════════════════════════════
async function init() {
  // Check if wallet already stored
  const stored = await chrome.storage.local.get(['wallet_address', 'wallet_seed']);
  if (stored.wallet_address && stored.wallet_seed) {
    walletAddress = stored.wallet_address;
    walletSeed = stored.wallet_seed;

    try {
      const data = await api(`/onboarding/status?address=${walletAddress}`);
      populateReadyScreen(data.xrpBalance, data.rlusdBalance, data.hasTrustline);
      showScreen('ready');
    } catch {
      $('ready-address').textContent = walletAddress;
      showScreen('ready');
    }
    return;
  }

  // No wallet — show choice screen
  showScreen('welcome');
}

init();
