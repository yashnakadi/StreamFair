import { CSS } from '../shared/constants';

export interface BadgeCallbacks {
  onResume: () => void;
  onComplete: () => void;
}

/**
 * Creates a floating badge that shows the live charging cost.
 * Clickable — expands to show Resume / Complete buttons.
 */
export function createChargingBadge(
  container: HTMLElement,
  callbacks: BadgeCallbacks,
  useFixed = false
): {
  update: (secondsWatched: number, priceCents: number, durationSeconds: number) => void;
  remove: () => void;
} {
  const host = document.createElement('div');
  host.id = 'streampay-badge-host';
  host.style.cssText = useFixed
    ? 'position:fixed;top:12px;right:12px;z-index:2147483647;'
    : 'position:absolute;top:12px;right:12px;z-index:9998;';

  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host { display: block; }
      .badge-wrap {
        font-family: ${CSS.fontMono};
        cursor: pointer;
        user-select: none;
      }
      .badge {
        font-size: 13px;
        background: rgba(10, 10, 26, 0.9);
        border: 1px solid ${CSS.border};
        border-radius: 8px;
        padding: 6px 12px;
        color: ${CSS.text};
        display: flex;
        align-items: center;
        gap: 8px;
        backdrop-filter: blur(6px);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .badge:hover {
        border-color: ${CSS.accent};
      }
      .dot {
        width: 6px;
        height: 6px;
        background: ${CSS.success};
        border-radius: 50%;
        animation: pulse 1.5s ease-in-out infinite;
        flex-shrink: 0;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .cost {
        color: ${CSS.accent};
        font-weight: 600;
      }
      .time {
        color: ${CSS.muted};
        font-size: 11px;
      }

      /* Expanded panel */
      .panel {
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    opacity 0.2s ease,
                    margin-top 0.3s ease;
        margin-top: 0;
      }
      .panel.open {
        max-height: 120px;
        opacity: 1;
        margin-top: 8px;
      }
      .panel-inner {
        background: rgba(10, 10, 26, 0.95);
        border: 1px solid ${CSS.border};
        border-radius: 8px;
        padding: 10px;
        display: flex;
        gap: 8px;
        backdrop-filter: blur(6px);
      }
      .panel-btn {
        flex: 1;
        font-family: ${CSS.fontMono};
        font-size: 12px;
        font-weight: 600;
        padding: 8px 12px;
        border: 1px solid transparent;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }
      .btn-resume {
        background: ${CSS.accent};
        color: #fff;
      }
      .btn-resume:hover {
        background: ${CSS.accentHover};
      }
      .btn-complete {
        background: transparent;
        border-color: ${CSS.success};
        color: ${CSS.success};
      }
      .btn-complete:hover {
        background: ${CSS.success};
        color: #fff;
      }
    </style>
    <div class="badge-wrap">
      <div class="badge" id="badge">
        <span class="dot"></span>
        <span class="cost" id="cost">0¢</span>
        <span class="time" id="time">0:00</span>
      </div>
      <div class="panel" id="panel">
        <div class="panel-inner">
          <button class="panel-btn btn-resume" id="btn-resume">Resume</button>
          <button class="panel-btn btn-complete" id="btn-complete">Complete</button>
        </div>
      </div>
    </div>
  `;

  if (useFixed) {
    document.body.appendChild(host);
  } else {
    container.style.position = 'relative';
    container.appendChild(host);
  }

  const costEl = shadow.getElementById('cost')!;
  const timeEl = shadow.getElementById('time')!;
  const badgeEl = shadow.getElementById('badge')!;
  const panelEl = shadow.getElementById('panel')!;
  let expanded = false;

  // Toggle expand on badge click
  badgeEl.addEventListener('click', (e) => {
    e.stopPropagation();
    expanded = !expanded;
    panelEl.classList.toggle('open', expanded);
  });

  // Resume button
  shadow.getElementById('btn-resume')!.addEventListener('click', (e) => {
    e.stopPropagation();
    expanded = false;
    panelEl.classList.remove('open');
    callbacks.onResume();
  });

  // Complete button
  shadow.getElementById('btn-complete')!.addEventListener('click', (e) => {
    e.stopPropagation();
    expanded = false;
    panelEl.classList.remove('open');
    callbacks.onComplete();
  });

  return {
    update: (secondsWatched: number, priceCents: number, durationSeconds: number) => {
      // Prorated cost based on watch time
      const ratio = durationSeconds > 0
        ? Math.min(secondsWatched / durationSeconds, 1)
        : 0;
      const currentCost = Math.round(priceCents * ratio);
      costEl.textContent = currentCost < 100
        ? `${currentCost}¢`
        : `$${(currentCost / 100).toFixed(2)}`;

      const mins = Math.floor(secondsWatched / 60);
      const secs = secondsWatched % 60;
      timeEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
    },
    remove: () => {
      host.remove();
    },
  };
}
