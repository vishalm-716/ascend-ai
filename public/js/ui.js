// ui.js — shared UI helpers
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function toast(msg, kind = '') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  el.setAttribute('role', 'alert');
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px) scale(0.96)';
    setTimeout(() => el.remove(), 320);
  }, 2800);
}

export function openModal(html, { onMount } = {}) {
  const root = document.getElementById('modal-root');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => {
    back.querySelector('.modal').style.animation = 'none';
    back.style.opacity = '0';
    back.style.transition = 'opacity 0.2s';
    setTimeout(() => back.remove(), 200);
  };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  root.appendChild(back);
  if (onMount) onMount(back);
  return { close, root: back };
}

export function confirmDialog(title, message, confirmLabel = 'Yes', danger = false) {
  return new Promise((resolve) => {
    const { close, root } = openModal(`
      <div class="modal-head"><h3>${esc(title)}</h3></div>
      <div class="modal-body"><p class="page-sub">${esc(message)}</p></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-act="no">Cancel</button>
        <button class="btn ${danger ? 'btn-danger-soft' : 'btn-primary'}" data-act="yes">${esc(confirmLabel)}</button>
      </div>`);
    root.querySelector('[data-act="no"]').onclick = () => { close(); resolve(false); };
    root.querySelector('[data-act="yes"]').onclick = () => { close(); resolve(true); };
  });
}

export function spinner() {
  return '<div class="spinner" aria-hidden="true"></div>';
}

/** Render a loading skeleton card */
export function skeleton(type = 'card') {
  if (type === 'card') {
    return `<div class="skeleton skeleton-card" aria-label="Loading…"></div>`;
  }
  if (type === 'text') {
    return `<div class="skeleton skeleton-text w80" aria-hidden="true"></div>
            <div class="skeleton skeleton-text w60" aria-hidden="true"></div>
            <div class="skeleton skeleton-text w40" aria-hidden="true"></div>`;
  }
  if (type === 'page') {
    return `<div class="view" style="padding:40px 0">
      <div class="skeleton skeleton-title" aria-label="Loading…"></div>
      <div class="skeleton skeleton-text w80" aria-hidden="true"></div>
      <div class="skeleton skeleton-text w60" aria-hidden="true"></div>
      <div style="height:24px" aria-hidden="true"></div>
      <div class="skeleton skeleton-card" aria-hidden="true"></div>
      <div class="skeleton skeleton-card" aria-hidden="true"></div>
    </div>`;
  }
  return `<div class="skeleton" style="height:40px" aria-label="Loading…"></div>`;
}

/** Render an empty state */
export function emptyState(icon, title, description) {
  return `<div class="empty">
    <div class="big" aria-hidden="true">${icon}</div>
    ${title ? `<h3>${esc(title)}</h3>` : ''}
    ${description ? `<p>${esc(description)}</p>` : ''}
  </div>`;
}

/** Show a loading spinner centered in a view */
export function loadingView(message = 'Loading…') {
  return `<div class="view" style="display:flex;justify-content:center;padding:80px 0" role="status" aria-label="${esc(message)}">
    ${spinner()}<span class="muted" style="margin-left:12px">${esc(message)}</span>
  </div>`;
}

/** Show an error state in a view */
export function errorView(message) {
  return `<div class="view">${emptyState('🌫️', '', esc(message))}</div>`;
}

export function formatWhen(iso) {
  try {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T12:00:00') : new Date(iso + 'Z');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return iso; }
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Resting well';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function todayNice() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function plural(n, w) { return `${n} ${w}${n === 1 ? '' : 's'}`; }
