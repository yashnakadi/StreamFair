import { ExtensionMessage, FetchProxyResponse } from '../shared/types';

// Generate and persist install_id
async function getOrCreateInstallId(): Promise<string> {
  const result = await chrome.storage.local.get('install_id');
  if (result.install_id) return result.install_id;

  const id = crypto.randomUUID();
  await chrome.storage.local.set({ install_id: id });
  return id;
}

// Handle messages from content scripts
chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      console.error('[sw] message error:', err);
      sendResponse({ error: err.message });
    });
    return true; // keep channel open for async response
  }
);

async function handleMessage(message: ExtensionMessage): Promise<any> {
  switch (message.type) {
    case 'GET_INSTALL_ID':
      return getOrCreateInstallId();

    case 'FETCH_PROXY': {
      const { url, method, headers, body } = message;
      const resp = await fetch(url, {
        method,
        headers,
        body: body || undefined,
      });
      const data = await resp.json().catch(() => null);
      const result: FetchProxyResponse = {
        ok: resp.ok,
        status: resp.status,
        data,
      };
      return result;
    }

    case 'SET_BADGE': {
      const { text, color } = message;
      await chrome.action.setBadgeText({ text });
      if (color) {
        await chrome.action.setBadgeBackgroundColor({ color });
      }
      return { ok: true };
    }

    case 'GET_WALLET': {
      const stored = await chrome.storage.local.get(['wallet_address', 'wallet_seed']);
      if (stored.wallet_address && stored.wallet_seed) {
        return { address: stored.wallet_address, seed: stored.wallet_seed };
      }
      return null;
    }
  }
}

// Initialize install_id on extension install; open onboarding for new installs
chrome.runtime.onInstalled.addListener(async (details) => {
  const id = await getOrCreateInstallId();
  console.log('[sw] StreamPay installed, id:', id);

  if (details.reason === 'install') {
    // Check if wallet already exists (shouldn't on fresh install)
    const stored = await chrome.storage.local.get('wallet_seed');
    if (!stored.wallet_seed) {
      const onboardingUrl = chrome.runtime.getURL('onboarding.html');
      chrome.tabs.create({ url: onboardingUrl });
    }
  }
});
