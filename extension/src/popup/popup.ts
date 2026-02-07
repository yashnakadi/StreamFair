import { API_BASE } from '../shared/constants';
import { TransactionHistoryEntry } from '../shared/types';

const $ = (id: string) => document.getElementById(id)!;

function showState(stateId: string, message?: string) {
  ['loading', 'empty', 'error', 'no-wallet', 'tx-list', 'summary']
    .forEach(id => $(id).style.display = 'none');

  const el = $(stateId);
  el.style.display = stateId === 'tx-list' ? 'block' : 'flex';
  if (message) el.textContent = message;
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatAmount(cents: number): string {
  if (cents < 100) return `${cents}c`;
  return `$${(cents / 100).toFixed(2)}`;
}

function renderTransactions(sessions: TransactionHistoryEntry[]) {
  showState('tx-list');

  const listEl = $('tx-list');
  let totalSpentCents = 0;

  listEl.innerHTML = sessions.map(s => {
    const paidCents = s.total_paid_cents || s.amount_streamed || 0;
    totalSpentCents += paidCents;

    const date = new Date(s.started_at + 'Z');
    const timeStr = formatRelativeTime(date);

    const mins = Math.floor(s.seconds_watched / 60);
    const secs = s.seconds_watched % 60;
    const watchTime = `${mins}:${String(secs).padStart(2, '0')}`;

    const statusClass = s.status === 'completed' ? 'status-completed'
                      : s.status === 'active'    ? 'status-active'
                      : 'status-declined';

    const title = s.video_title || s.video_id;

    return `
      <div class="tx-card">
        <div class="tx-row-top">
          <span class="tx-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
          <span class="tx-status ${statusClass}">${s.status}</span>
        </div>
        <div class="tx-row-mid">
          <span class="tx-amount">${formatAmount(paidCents)}</span>
          ${s.channel ? `<span class="tx-channel">${escapeHtml(s.channel)}</span>` : ''}
        </div>
        <div class="tx-row-bot">
          <span>${timeStr}</span>
          <span>${watchTime} watched</span>
        </div>
      </div>
    `;
  }).join('');

  $('summary').style.display = 'flex';
  $('total-spent').textContent = formatAmount(totalSpentCents);
}

async function init() {
  const stored = await chrome.storage.local.get(['install_id', 'wallet_address', 'wallet_seed']);

  if (!stored.wallet_seed || !stored.wallet_address) {
    showState('no-wallet');
    $('btn-setup').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
      window.close();
    });
    return;
  }

  if (!stored.install_id) {
    showState('error', 'No install ID found. Try reinstalling the extension.');
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/sessions/history`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Install-Id': stored.install_id,
      },
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || `Request failed (${resp.status})`);
    }

    const sessions: TransactionHistoryEntry[] = await resp.json();

    if (sessions.length === 0) {
      showState('empty');
      return;
    }

    renderTransactions(sessions);
  } catch (err: any) {
    showState('error', err.message || 'Failed to load transactions');
  }
}

init();
