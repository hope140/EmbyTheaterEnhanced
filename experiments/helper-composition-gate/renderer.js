'use strict';

const api = window.compositionGate;
const button = document.getElementById('probe');
const seek = document.getElementById('seek');
const status = document.getElementById('status');
const osd = document.getElementById('osd');
let interactive = false;
let lastMoveReport = 0;

function safeRect(element) {
  const rect = element.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function reportMetrics() {
  api.report('metrics', {
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    button: safeRect(button),
    slider: safeRect(seek),
    videoProbe: { x: Math.max(40, window.innerWidth * 0.18), y: Math.max(150, window.innerHeight * 0.36) }
  });
}

function updateHitTest(event) {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  const next = Boolean(target && target.closest('[data-interactive]'));
  if (next !== interactive) {
    interactive = next;
    api.setInteractive(next);
  }
  const now = performance.now();
  if (now - lastMoveReport > 100) {
    lastMoveReport = now;
    api.report('mousemove', { x: event.clientX, y: event.clientY, interactive: next });
  }
}

window.addEventListener('mousemove', updateHitTest, true);
window.addEventListener('resize', reportMetrics);
window.addEventListener('focus', () => api.report('focus'));
window.addEventListener('blur', () => api.report('blur'));
button.addEventListener('mouseenter', () => api.report('hover', { target: 'button' }));
button.addEventListener('click', () => {
  status.textContent = 'Button clicked';
  api.report('button', { id: 'probe' });
});
seek.addEventListener('click', event => {
  const rect = seek.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  status.textContent = `Seek ${Math.round(ratio * 100)}%`;
  api.report('slider', { ratio });
});
window.addEventListener('keydown', event => {
  if (![' ', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter'].includes(event.key)) return;
  event.preventDefault();
  api.report('keydown', { key: event.key, code: event.code });
}, true);

api.onState(value => {
  if (!value || typeof value !== 'object') return;
  if (typeof value.status === 'string') status.textContent = value.status;
  if (typeof value.osdVisible === 'boolean') osd.hidden = !value.osdVisible;
  if (value.requestMetrics === true) reportMetrics();
});

api.report('ready', {
  sandboxed: api.security.sandboxed,
  nodeGlobalsAbsent: typeof require === 'undefined' && typeof process === 'undefined'
});
reportMetrics();
