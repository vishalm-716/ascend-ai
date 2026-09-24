// app.js — bootstrap: session check, shell, routing, settings modal
import { API } from './api.js';
import { esc, toast, openModal, spinner } from './ui.js';
import { route, go, initRouter, setCurrent } from './router.js';
import { renderAuth } from './views/auth.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderDashboard } from './views/dashboard.js';
import { renderIdentity } from './views/identity.js';
import { renderCheckin } from './views/checkin.js';
import { renderProgress } from './views/progress.js';

let me = null;      // { email, id, hasIdentity }

/* SVG icon library — consistent, lightweight, inline */
const ICO = {
  today: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
  identity: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  checkin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  progress: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
};

const NAV = [
  { id: 'today', label: 'Today', icon: ICO.today },
  { id: 'identity', label: 'Identity', icon: ICO.identity },
  { id: 'checkin', label: 'Check-in', icon: ICO.checkin },
  { id: 'progress', label: 'Progress', icon: ICO.progress },
];

route('login', (app) => { setCurrent('login'); renderAuth(app); });
route('onboarding', (app) => { setCurrent('onboarding'); renderOnboarding(app); });
route('today', (app) => { setCurrent('today'); wrap(app, 'today', renderDashboard); });
route('identity', (app) => { setCurrent('identity'); wrap(app, 'identity', renderIdentity); });
route('checkin', (app) => { setCurrent('checkin'); wrap(app, 'checkin', renderCheckin); });
route('progress', (app) => { setCurrent('progress'); wrap(app, 'progress', renderProgress); });

/** Wrap authed views in the shell (sidebar + main). */
async function wrap(app, active, render) {
  if (me && !me.hasIdentity) {
    try {
      const res = await API.get('/api/auth/me');
      me = res.user;
      me.hasIdentity = res.hasIdentity;
    } catch {
      me = null;
      go('login');
      return;
    }
    if (!me.hasIdentity) { go('onboarding'); return; }
  }
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar" role="navigation" aria-label="Main navigation">
        <div class="brand">
          <div class="brand-mark" aria-hidden="true">▲</div>
          <div><div class="brand-name">Ascend</div><div class="brand-sub">growth companion</div></div>
        </div>
        <div class="nav-section-label">Navigate</div>
        ${NAV.map((n) => `<button class="nav-item ${n.id === active ? 'active' : ''}" data-nav="${n.id}" aria-current="${n.id === active ? 'page' : 'false'}"><span class="nav-ico">${n.icon}</span>${n.label}</button>`).join('')}
        <div class="sidebar-foot">
          <div class="user-chip">
            <div class="user-ava">${me ? esc(me.email.slice(0, 1).toUpperCase()) : '?'}</div>
            <div class="grow" style="min-width:0">
              <div class="user-mail">${me ? esc(me.email) : ''}</div>
            </div>
            <button class="icon-btn" id="btn-settings" title="Settings" style="width:28px;height:28px" aria-label="Open settings">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
          </div>
        </div>
      </aside>
      <main class="main" id="main-content"><div id="view-host"></div></main>
    </div>`;
  app.querySelectorAll('.nav-item').forEach((el) => el.addEventListener('click', () => go(el.dataset.nav)));
  app.querySelector('#btn-settings').onclick = openSettings;
  render(app.querySelector('#view-host'));
}

let booting = true;
window.addEventListener('ascend:identity-ready', () => { if (me) me.hasIdentity = true; });
window.addEventListener('ascend:unauth', () => {
  if (booting) return;
  me = null;
  toast('Please sign in again', 'err');
  go('login');
});

async function openSettings() {
  const { close, root } = openModal(`
    <div class="modal-head"><h3>Settings</h3><button class="icon-btn" data-x aria-label="Close settings">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button></div>
    <div class="modal-body"><div class="muted" style="padding:16px 0;text-align:center">${spinner()}</div></div>`);
  root.querySelector('[data-x]').onclick = close;

  let profile;
  try { profile = await API.get('/api/profile'); } catch (e) { root.querySelector('.modal-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const ai = profile.ai;
  const id = root.querySelector('.modal-body');

  id.innerHTML = `
    <div class="field">
      <div class="flex-between"><label class="field-label">AI curator engine</label>
        <span class="chip ${ai.enabled ? 'chip-ready-high' : 'chip-ready-mid'}">${ai.enabled ? '● live' : '○ built-in curator'}</span></div>
      <p class="hr-note">Ascend works out of the box with its built-in curator (no key needed). Connect any OpenAI-compatible API key — OpenAI, Groq, DeepSeek, Ollama, LM Studio — to power daily curation with a real LLM.</p>
    </div>
    <div class="field">
      <label class="field-label" for="set-key">API key ${ai.maskedKey ? `· stored ${esc(ai.maskedKey)}` : ''}</label>
      <input id="set-key" type="password" placeholder="sk-…" autocomplete="off" />
    </div>
    <div class="two-col">
      <div class="field">
        <label class="field-label" for="set-model">Model</label>
        <input id="set-model" type="text" value="${esc(ai.model)}" placeholder="gpt-4o-mini" />
      </div>
      <div class="field">
        <label class="field-label" for="set-base">Base URL</label>
        <input id="set-base" type="url" value="${esc(ai.baseUrl)}" />
      </div>
    </div>
    <div class="flex">
      <button class="btn btn-primary" id="set-save">Save AI settings</button>
      <button class="btn btn-ghost" id="set-clear" ${ai.hasKey ? '' : 'disabled'}>Remove key</button>
    </div>
    <div class="divider"></div>
    <div class="flex-between">
      <span class="hr-note">Signed in as <b>${esc(profile.user.email)}</b></span>
      <button class="btn btn-danger-soft btn-sm" id="set-logout">Sign out</button>
    </div>`;

  root.querySelector('#set-save').onclick = async () => {
    const btn = root.querySelector('#set-save');
    btn.disabled = true; btn.innerHTML = spinner() + ' Saving…';
    const patch = { aiKey: root.querySelector('#set-key').value.trim() };
    const model = root.querySelector('#set-model').value.trim();
    const base = root.querySelector('#set-base').value.trim();
    if (model) patch.aiModel = model;
    if (base) patch.aiBaseUrl = base;
    try {
      await API.put('/api/settings', patch);
      toast('AI settings saved — next curation will use your key');
      close();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Save AI settings'; }
  };
  root.querySelector('#set-clear').onclick = async () => {
    try { await API.put('/api/settings', { aiKey: '', aiModel: '', aiBaseUrl: '' }); toast('Key removed — built-in curator active'); close(); }
    catch (e) { toast(e.message, 'err'); }
  };
  root.querySelector('#set-logout').onclick = async () => {
    try { await API.post('/api/auth/logout'); } catch { /* ok */ }
    me = null;
    close();
    go('login');
  };
}

// ---------- boot ----------
async function boot() {
  const app = document.getElementById('app');
  try {
    const res = await API.get('/api/auth/me');
    me = res.user;
    me.hasIdentity = res.hasIdentity;
    const target = res.hasIdentity ? 'today' : 'onboarding';
    initRouter({ fallback: target });
    if (!location.hash) go(target);
  } catch {
    me = null;
    initRouter({ fallback: 'login' });
    if (!location.hash) go('login');
  } finally {
    booting = false;
  }
}

boot();
