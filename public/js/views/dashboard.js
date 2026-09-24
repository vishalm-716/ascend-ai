// views/dashboard.js — today's curated action + feedback + progress signals
import { API } from '../api.js';
import { esc, toast, greeting, todayNice, plural, openModal, spinner, loadingView, errorView } from '../ui.js';
import { go } from '../router.js';

let state = null;

const KIND_LABEL = { action: 'Real-world step', task: 'Focused task', idea: 'Idea to sit with', mindset: 'Mindset shift', resource: 'A resource' };
const KIND_ICON = { action: '🎯', task: '⚡', idea: '💡', mindset: '🧠', resource: '📚' };

export async function renderDashboard(app) {
  app.innerHTML = loadingView("Fetching today's thread…");
  try {
    const data = await API.get('/api/today');
    state = data;
    draw(app);
  } catch (err) {
    app.innerHTML = errorView(err.message);
  }
}

function draw(app) {
  const { action, identity, checkinDue, metrics } = state;
  const readiness = identity.readiness;
  const readyChip = readiness <= 2 ? '<span class="chip chip-ready-low">low capacity today</span>'
    : readiness <= 3 ? '<span class="chip chip-ready-mid">steady</span>'
    : '<span class="chip chip-ready-high">ready to stretch</span>';

  const todayStatus = action.status;
  let actionZone;
  if (todayStatus === 'done') {
    actionZone = `
      <div class="done-state">
        <div class="big">✓</div>
        <p><b>That one's done.</b> You showed up today — that's the whole loop. Ascend will keep the next thread gentle and responsive.</p>
        <button class="btn btn-ghost btn-sm" id="btn-diff" style="margin-left:auto">Not quite it? Swap it</button>
      </div>`;
  } else if (todayStatus === 'rejected') {
    actionZone = `
      <div class="done-state" style="background:var(--danger-soft)">
        <div class="big">🪶</div>
        <p><b>Noted.</b> Rejection is signal — Ascend has adjusted and will avoid this kind of thread for a while.</p>
        <button class="btn btn-clay btn-sm" id="btn-diff" style="margin-left:auto">Give me something different</button>
      </div>`;
  } else {
    actionZone = `
      <div class="today-actions">
        <button class="btn btn-primary fb-done" id="btn-done">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Mark done
        </button>
        <button class="btn fb-reject" id="btn-reject">Not useful for me</button>
        <button class="btn fb-diff" id="btn-diff">Give me something different</button>
      </div>`;
  }

  app.innerHTML = `
  <div class="view">
    <div class="greet">
      <div>
        <div class="eyebrow">${esc(todayNice())}</div>
        <h1>${greeting()}, ${esc(state.userEmail ? state.userEmail.split('@')[0] : 'friend')}.</h1>
        <div class="date">${esc(plural(metrics.rhythm, 'quiet day'))} of showing up · ${readyChip}</div>
      </div>
    </div>

    <div class="card today-card">
      <div class="today-kind">
        <span class="chip chip-kind">${KIND_ICON[action.kind] || '🌱'} ${KIND_LABEL[action.kind] || action.kind}</span>
        ${action.diversity ? '<span class="chip chip-diversity">✦ diversity injection — outside your usual pattern</span>' : ''}
        <button class="icon-btn" id="btn-log" title="How Ascend chose this" style="margin-left:auto" aria-label="View curator reasoning">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
        </button>
      </div>
      <h2 class="today-title">${esc(action.title)}</h2>
      <p class="today-desc">${esc(action.description)}</p>
      <div class="today-why"><b>Why this one, for you</b>${esc(action.why)}</div>
      ${actionZone}
    </div>

    ${checkinDue ? `
      <div class="nudge" role="status">
        <div class="nud-ico">💬</div>
        <p>It's time for your weekly reflection — a minute that makes tomorrow's thread smarter.</p>
        <b id="nudge-checkin" tabindex="0" role="link">Reflect now →</b>
      </div>` : ''}

    <div class="stats-grid stagger-in">
      <div class="stat">
        <div class="stat-label">Gap closure</div>
        <div class="stat-value">${metrics.goal ? `${metrics.goal.done}/${metrics.goal.total}` : '—'}</div>
        <div class="stat-note">steps toward your aspiration</div>
      </div>
      <div class="stat">
        <div class="stat-label">Consistency</div>
        <div class="stat-value">${metrics.consistency.daysShown}<span style="font-size:15px;color:var(--ink-faint)">/${metrics.consistency.window}d</span></div>
        <div class="stat-note">no pressure — just pattern</div>
      </div>
      <div class="stat">
        <div class="stat-label">Usefulness</div>
        <div class="stat-value">${metrics.usefulness === null ? '—' : metrics.usefulness + '%'}</div>
        <div class="stat-note">${metrics.judged.done} kept · ${metrics.judged.rejected} rejected (signal)</div>
      </div>
      <div class="stat">
        <div class="stat-label">Readiness</div>
        <div class="stat-value">${readiness}<span style="font-size:15px;color:var(--ink-faint)">/5</span></div>
        <div class="stat-note">${['', 'exhausted — rest first', 'low — gentle day', 'steady', 'ready', 'fired up'][readiness]}</div>
      </div>
    </div>

    <div class="card week-mini mt">
      <h3 class="card-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-faint)"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Recent threads
      </h3>
      <div id="recent-list"><div class="muted">${spinner()} loading…</div></div>
    </div>
  </div>`;

  bind(app);
}

function bind(app) {
  const btnDone = app.querySelector('#btn-done');
  const btnReject = app.querySelector('#btn-reject');
  const btnDiff = app.querySelector('#btn-diff');
  const btnLog = app.querySelector('#btn-log');

  if (btnDone) btnDone.onclick = async () => {
    btnDone.disabled = true; btnDone.innerHTML = spinner() + ' Noted';
    try {
      await API.post(`/api/actions/${state.action.id}/feedback`, { type: 'done' });
      toast('Beautiful. That thread is complete.', 'success');
      await refresh(app);
    } catch (e) { toast(e.message, 'err'); await refresh(app); }
  };
  if (btnReject) btnReject.onclick = async () => {
    btnReject.disabled = true;
    try {
      await API.post(`/api/actions/${state.action.id}/feedback`, { type: 'rejected' });
      toast('Noted — Ascend learns from that.');
      await refresh(app);
    } catch (e) { toast(e.message, 'err'); await refresh(app); }
  };
  if (btnDiff) btnDiff.onclick = async () => {
    if (btnDiff.disabled) return;
    btnDiff.disabled = true; btnDiff.innerHTML = spinner() + ' Curating…';
    try {
      const res = await API.post(`/api/actions/${state.action.id}/different`);
      toast('A different thread, curated for you.', 'success');
      state.action = res.action;
      draw(app);
    } catch (e) { toast(e.message, 'err'); btnDiff.disabled = false; btnDiff.innerHTML = 'Give me something different'; }
  };
  if (btnLog) btnLog.onclick = openCuratorLog;

  const nudge = app.querySelector('#nudge-checkin');
  if (nudge) {
    nudge.onclick = () => go('checkin');
    nudge.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('checkin'); } };
  }

  loadRecent(app);
}

async function refresh(app) {
  const data = await API.get('/api/today');
  state = data;
  draw(app);
}

async function loadRecent(app) {
  try {
    const { actions } = await API.get('/api/history');
    const list = app.querySelector('#recent-list');
    if (!list) return;
    const recent = actions.slice(0, 7);
    if (!recent.length) {
      list.innerHTML = `<div class="empty" style="padding:24px 0"><div class="big" aria-hidden="true">🌱</div><p>Your threads will appear here once you start.</p></div>`;
      return;
    }
    list.innerHTML = recent.map((a) => {
      const label = a.status === 'done' ? ['wst-done', 'done']
        : a.status === 'rejected' ? ['wst-rejected', 'not useful']
        : a.status === 'replaced' ? ['wst-replaced', 'swapped']
        : ['wst-pending', 'today'];
      return `<div class="week-row"><span class="wd">${esc(a.action_date.slice(5).replace('-', '/'))}</span><span class="wt">${esc(a.title)}</span><span class="wst ${label[0]}">${label[1]}</span></div>`;
    }).join('');
  } catch { /* non-fatal */ }
}

async function openCuratorLog() {
  const { close, root } = openModal(`
    <div class="modal-head"><h3>How Ascend chose this</h3><button class="icon-btn" data-x aria-label="Close">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button></div>
    <div class="modal-body"><div class="muted" style="padding:20px 0;text-align:center">${spinner()} pulling the curator's reasoning…</div></div>`);
  root.querySelector('[data-x]').onclick = close;
  try {
    const { calls } = await API.get('/api/curator-log');
    const call = calls[0];
    if (!call) { root.querySelector('.modal-body').innerHTML = '<p class="muted">No curator log yet.</p>'; return; }
    const meta = call.meta || {};
    const reasons = meta.reasoning || [];
    const kind = meta.kind || 'daily_action';
    root.querySelector('.modal-body').innerHTML = `
      <div class="flex" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <span class="chip chip-soft">${esc(call.provider === 'fallback' ? 'built-in curator' : call.provider)}</span>
        <span class="chip chip-soft">${esc(call.model || 'model')}</span>
        <span class="chip chip-soft">${esc(kind === 'gap_generation' ? 'gap map generation' : 'daily curation')}</span>
      </div>
      ${reasons.length ? `
        <div style="margin-bottom:10px">
          ${reasons.map((r) => `<div class="reason-item"><span class="reason-sig">${esc(r.signal)}</span><span class="reason-note">${esc(typeof r.note === 'string' ? r.note : JSON.stringify(r.value))}</span></div>`).join('')}
        </div>` : '<p class="muted">Reasoning trace available when the built-in curator is used. With a connected LLM, Ascend reasons inside the model.</p>'}
      <details class="prompt-details"><summary>Show the full prompt & raw output</summary><pre>${esc(call.prompt || '')}\n\n—\n\n${esc(call.response || '')}</pre></details>`;
  } catch (e) {
    root.querySelector('.modal-body').innerHTML = `<p class="muted">${esc(e.message)}</p>`;
  }
}
