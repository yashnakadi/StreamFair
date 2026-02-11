import { CSS } from '../shared/constants';

export interface GateCallbacks {
  onStart: () => void;
  onDecline: () => void;
}

/**
 * Creates a Shadow DOM overlay on the video player with pricing info
 * and Start Watching / Decline buttons.
 */
export function createGateOverlay(
  container: HTMLElement,
  priceCents: number,
  centsPerSecond: number,
  durationSeconds: number,
  videoTitle: string,
  callbacks: GateCallbacks,
  useFixed = false
): { remove: () => void } {
  const host = document.createElement('div');
  host.id = 'streampay-gate-host';
  host.style.cssText = useFixed
    ? 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:auto;'
    : 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:auto;';

  const shadow = host.attachShadow({ mode: 'closed' });

  const priceDisplay = priceCents < 100
    ? `${priceCents}¢`
    : `$${(priceCents / 100).toFixed(2)}`;

  // Format per-second rate
  const rateDisplay = centsPerSecond >= 0.01
    ? `${centsPerSecond.toFixed(4)}¢/sec`
    : `${(centsPerSecond * 100).toFixed(4)}¢/sec`;

  // Format duration
  const mins = Math.floor(durationSeconds / 60);
  const secs = durationSeconds % 60;
  const durationDisplay = `${mins}:${String(secs).padStart(2, '0')}`;

  shadow.innerHTML = `
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      .gate {
        position: ${useFixed ? 'fixed' : 'absolute'};
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(10, 10, 26, 0.95);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: ${CSS.fontMono};
        color: ${CSS.text};
        gap: 16px;
      }
      .logo {
        font-size: 14px;
        color: ${CSS.muted};
        text-transform: uppercase;
        letter-spacing: 2px;
      }
      .price-tag {
        font-size: 48px;
        font-weight: 700;
        color: ${CSS.accent};
        line-height: 1;
      }
      .price-label {
        font-size: 12px;
        color: ${CSS.muted};
        margin-top: -4px;
      }
      .rate-info {
        display: flex;
        gap: 24px;
        align-items: center;
        margin: 4px 0;
      }
      .rate-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }
      .rate-value {
        font-size: 16px;
        font-weight: 600;
        color: ${CSS.text};
      }
      .rate-label {
        font-size: 10px;
        color: ${CSS.muted};
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .divider {
        width: 1px;
        height: 28px;
        background: ${CSS.border};
      }
      .title {
        font-size: 14px;
        color: ${CSS.muted};
        max-width: 400px;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .buttons {
        display: flex;
        gap: 12px;
        margin-top: 8px;
      }
      button {
        font-family: ${CSS.fontMono};
        font-size: 14px;
        font-weight: 600;
        padding: 12px 32px;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .btn-start {
        background: ${CSS.accent};
        color: #fff;
      }
      .btn-start:hover {
        background: ${CSS.accentHover};
      }
      .btn-decline {
        background: transparent;
        border-color: ${CSS.border};
        color: ${CSS.muted};
      }
      .btn-decline:hover {
        border-color: ${CSS.danger};
        color: ${CSS.danger};
      }
    </style>
    <div class="gate">
      <div class="logo">// StreamPay</div>
      <div class="price-tag">${priceDisplay}</div>
      <div class="price-label">total for entire video</div>
      <div class="rate-info">
        <div class="rate-item">
          <span class="rate-value">${rateDisplay}</span>
          <span class="rate-label">streaming rate</span>
        </div>
        <div class="divider"></div>
        <div class="rate-item">
          <span class="rate-value">${durationDisplay}</span>
          <span class="rate-label">duration</span>
        </div>
      </div>
      <div class="title">${escapeHtml(videoTitle)}</div>
      <div class="buttons">
        <button class="btn-start">Start Watching</button>
        <button class="btn-decline">Decline</button>
      </div>
    </div>
  `;

  shadow.querySelector('.btn-start')!.addEventListener('click', callbacks.onStart);
  shadow.querySelector('.btn-decline')!.addEventListener('click', callbacks.onDecline);

  if (useFixed) {
    document.body.appendChild(host);
  } else {
    container.style.position = 'relative';
    container.appendChild(host);
  }

  return {
    remove: () => {
      host.remove();
    },
  };
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
