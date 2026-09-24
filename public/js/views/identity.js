// views/identity.js — the Model phase: a visible, editable identity model
import { API } from '../api.js';
import { esc, toast, spinner, confirmDialog, loadingView, errorView } from '../ui.js';

const CATEGORIES = ['habit', 'skill', 'project', 'mindset', 'resource', 'growth'];

const CAT_ICONS = {
  habit: '🔄',
  skill: '⚡',
  project: '🚀',
  mindset: '🧠',
  resource: '📚',
  growth: '🌱',
};

export async function renderIdentity(app) {
  app.innerHTML = loadingView('Loading your identity model…');
  try {
    const { identity, gaps, ai } = await API.get('/api/profile');
    draw(app, identity, gaps, ai);
  } catch (err) {
    app.innerHTML = errorView(err.message);
  }
}

function draw(app, identity, gaps, ai) {
  const readiness = identity.readiness;
  const readinessLabel = ['', 'Exhausted — rest first', 'Low — gentle days', 'Steady', 'Ready to stretch', 'Fired up'][readiness];

  const completedGaps = gaps.filter(g => g.status === 'done').length;
  const totalGaps = gaps.length;
  const gapPercent = totalGaps > 0 ? Math.round((completedGaps / totalGaps) * 100) : 0;

  app.innerHTML = `
  <div class="view">
    <div class="greet">
      <div>
        <div class="eyebrow">your identity model</div>
        <h1>Who you are becoming</h1>
        <div class="date">Not a black box — this is the model Ascend reasons over. Edit it any time.</div>
      </div>
      <button class="btn btn-primary" id="id-save">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Save changes
      </button>
    </div>

    <div class="identity-hero">
      <div class="identity-hero-content">
        <h2>Your aspiration</h2>
        <p style="font-size:var(--text-md);color:var(--ink-soft);line-height:1.6;margin-top:var(--sp-2)">${esc(identity.aspiration) || '<em class="muted">Not set yet</em>'}</p>
        <div class="identity-hero-stats">
          <div class="identity-hero-stat">
            <span class="num">${totalGaps}</span>
            <span class="lbl">Gap steps</span>
          </div>
          <div class="identity-hero-stat">
            <span class="num">${completedGaps}</span>
            <span class="lbl">Completed</span>
          </div>
          <div class="identity-hero-stat">
            <span class="num">${readiness}/5</span>
            <span class="lbl">Readiness</span>
          </div>
        </div>
      </div>
      <div class="identity-hero-ring">
        ${progressRingBig(gapPercent)}
      </div>
    </div>

    <div class="id-grid">
      <div>
        <div class="card">
          <h3 class="card-title">
            <span style="font-size:20px" aria-hidden="true">🌱</span>
            Aspirational self
          </h3>
          <div class="field">
            <label class="field-label" for="f-aspiration">Who do you want to become?</label>
            <textarea id="f-aspiration" rows="2">${esc(identity.aspiration)}</textarea>
          </div>
          <div class="field">
            <label class="field-label" for="f-domain">Domains of focus</label>
            <input id="f-domain" type="text" value="${esc(identity.domain)}" />
          </div>
          <div class="two-col">
            <div class="field">
              <label class="field-label" for="f-values">Values</label>
              <textarea id="f-values" rows="3">${esc(identity.values)}</textarea>
            </div>
            <div class="field">
              <label class="field-label" for="f-nonneg">Non-negotiables</label>
              <textarea id="f-nonneg" rows="3">${esc(identity.non_negotiables)}</textarea>
            </div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">
            <span style="font-size:20px" aria-hidden="true">🌊</span>
            Current state
          </h3>
          <div class="field">
            <label class="field-label" for="f-habits">Habits & routines</label>
            <input id="f-habits" type="text" value="${esc(identity.habits)}" />
          </div>
          <div class="two-col">
            <div class="field"><label class="field-label" for="f-level">Skill level</label><input id="f-level" type="text" value="${esc(identity.skill_level)}" /></div>
            <div class="field"><label class="field-label" for="f-energy">Energy</label><input id="f-energy" type="text" value="${esc(identity.energy)}" /></div>
          </div>
          <div class="two-col">
            <div class="field"><label class="field-label" for="f-time">Time available</label><input id="f-time" type="text" value="${esc(identity.time_available)}" /></div>
            <div class="field"><label class="field-label" for="f-constraint">Biggest constraint</label><input id="f-constraint" type="text" value="${esc(identity.biggest_constraint)}" /></div>
          </div>
          <div class="field mb-0">
            <label class="field-label">Readiness — <span id="ready-label">${readiness}/5 · ${readinessLabel}</span></label>
            <div class="slider-row">
              <input type="range" id="f-readiness" min="1" max="5" step="1" value="${readiness}" />
              <span class="chip chip-soft" id="ready-chip">${readiness}/5</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="flex-between" style="margin-bottom:12px">
            <h3 class="card-title" style="margin:0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--sage-deep)"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              Gap map
            </h3>
            <button class="btn btn-ghost btn-sm" id="gap-regen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Remap with AI
            </button>
          </div>
          <p class="muted" style="margin-bottom:14px">The delta between who you are and who you're becoming, broken into small steps. Check one off and Ascend adapts.</p>
          ${totalGaps > 0 ? `
            <div style="margin-bottom:var(--sp-4)">
              <div class="flex-between" style="margin-bottom:var(--sp-2)">
                <span style="font-size:var(--text-xs);color:var(--ink-faint)">${completedGaps} of ${totalGaps} completed</span>
                <span style="font-size:var(--text-xs);color:var(--sage-deep);font-weight:600">${gapPercent}%</span>
              </div>
              <div class="gap-progress-bar"><div class="gap-progress-fill" style="width:${gapPercent}%"></div></div>
            </div>
          ` : ''}
          <div id="gap-list">${renderGaps(gaps)}</div>
          <button class="btn btn-soft btn-block mt" id="gap-add">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add a step
          </button>
        </div>
      </div>
    </div>
  </div>`;

  bind(app, identity, gaps, ai);
}

function progressRingBig(percent) {
  const size = 100, stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${percent}% gap closure">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--sage-deep)" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
      transform="rotate(-90 ${size/2} ${size/2})" style="transition: stroke-dashoffset 1s var(--ease);"/>
    <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="var(--font-display)" font-size="${size*0.26}"
      fill="var(--ink)" font-weight="500">${percent}%</text>
  </svg>`;
}

function renderGaps(gaps) {
  if (!gaps.length) return `<div class="empty"><div class="big" aria-hidden="true">🗺️</div><h3>No steps yet</h3><p>Add one manually or let AI remap your gap map.</p></div>`;
  return gaps.map((g) => `
    <div class="gap-item ${g.status === 'done' ? 'done' : ''}" data-id="${g.id}">
      <div class="gap-top">
        <input type="checkbox" class="gap-check" ${g.status === 'done' ? 'checked' : ''} title="Toggle complete" aria-label="Mark ${esc(g.title)} as ${g.status === 'done' ? 'incomplete' : 'complete'}" />
        <div class="gap-cat-icon gap-cat-${esc(g.category)}" title="${esc(g.category)}" aria-hidden="true">${CAT_ICONS[g.category] || '🌱'}</div>
        <div class="gap-body">
          <div class="gap-title">${esc(g.title)}</div>
          ${g.description ? `<div class="gap-desc">${esc(g.description)}</div>` : ''}
          <div class="gap-meta">
            <span class="chip chip-soft">${esc(g.category)}</span>
            ${g.prerequisites ? `<span class="gap-prereq">↳ needs: ${esc(g.prerequisites)}</span>` : ''}
            ${g.status === 'in_progress' ? '<span class="chip chip-ready-mid">in progress</span>' : ''}
          </div>
        </div>
        <div class="gap-actions">
          <button class="icon-btn" data-act="edit" title="Edit step" aria-label="Edit ${esc(g.title)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn" data-act="del" title="Delete step" aria-label="Delete ${esc(g.title)}" style="color:var(--ink-faint)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>`).join('');
}

function bind(app, identity, gaps, ai) {
  const inputs = {
    aspiration: app.querySelector('#f-aspiration'),
    domain: app.querySelector('#f-domain'),
    values: app.querySelector('#f-values'),
    non_negotiables: app.querySelector('#f-nonneg'),
    habits: app.querySelector('#f-habits'),
    skill_level: app.querySelector('#f-level'),
    energy: app.querySelector('#f-energy'),
    time_available: app.querySelector('#f-time'),
    biggest_constraint: app.querySelector('#f-constraint'),
  };

  const slider = app.querySelector('#f-readiness');
  const readyChip = app.querySelector('#ready-chip');
  const readyLabel = app.querySelector('#ready-label');
  const labels = ['', 'Exhausted — rest first', 'Low — gentle days', 'Steady', 'Ready to stretch', 'Fired up'];
  slider.addEventListener('input', () => {
    const v = slider.value;
    readyChip.textContent = `${v}/5`;
    readyLabel.textContent = `${v}/5 · ${labels[v]}`;
  });

  app.querySelector('#id-save').onclick = async () => {
    const btn = app.querySelector('#id-save');
    btn.disabled = true; btn.innerHTML = spinner() + ' Saving…';
    const body = { ...Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value.trim()])), readiness: Number(slider.value) };
    try {
      await API.patch('/api/identity', body);
      toast('Identity model updated', 'success');
      btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save changes`;
    } catch (e) { toast(e.message, 'err'); btn.disabled = false;
      btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save changes`;
    }
  };

  // gap list events
  const list = app.querySelector('#gap-list');
  list.addEventListener('change', async (e) => {
    const item = e.target.closest('.gap-item');
    if (!item) return;
    const status = e.target.checked ? 'done' : 'pending';
    try {
      await API.patch(`/api/gaps/${item.dataset.id}`, { status });
      toast(e.target.checked ? 'Step completed — Ascend will adapt' : 'Step reopened', 'success');
      item.classList.toggle('done', status === 'done');
    } catch (err) { toast(err.message, 'err'); }
  });

  list.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const item = e.target.closest('.gap-item');
    const id = item.dataset.id;
    if (act.dataset.act === 'del') {
      const ok = await confirmDialog('Remove this step?', "It will disappear from your gap map. Today's and past threads stay as history.", 'Remove', true);
      if (!ok) return;
      try {
        await API.del(`/api/gaps/${id}`);
        item.style.transform = 'translateX(20px)';
        item.style.opacity = '0';
        setTimeout(() => item.remove(), 200);
        toast('Step removed');
      } catch (err) { toast(err.message, 'err'); }
    } else if (act.dataset.act === 'edit') {
      const g = gaps.find((x) => String(x.id) === String(id));
      editGap(app, g, () => renderIdentity(app));
    }
  });

  app.querySelector('#gap-add').onclick = () => editGap(app, null, () => renderIdentity(app));

  app.querySelector('#gap-regen').onclick = async () => {
    const ok = await confirmDialog('Remap your gap map with AI?', 'Your current steps will be replaced with a fresh decomposition of your aspiration. Your history stays.', 'Remap', true);
    if (!ok) return;
    const btn = app.querySelector('#gap-regen');
    const listEl = app.querySelector('#gap-list');
    btn.disabled = true; btn.innerHTML = spinner() + ' Mapping…';
    try {
      const res = await API.post('/api/gaps/regenerate');
      console.log('[ascend] remap response:', res);
      gaps = res.gaps;
      listEl.innerHTML = renderGaps(res.gaps);
      toast(`Gap map rebuilt — ${res.gaps.length} steps`, 'success');
      btn.disabled = false;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Remap with AI`;
    } catch (err) { toast(err.message, 'err'); btn.disabled = false;
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Remap with AI`;
    }
  };
}

function editGap(app, gap, done) {
  const id = gap ? gap.id : null;
  const isNew = !gap;
  const item = app.querySelector(`.gap-item[data-id="${id}"]`) || app.querySelector('#gap-list');
  if (isNew) {
    const wrap = document.createElement('div');
    wrap.id = 'gap-edit-wrap';
    wrap.style.animation = 'fadeUp 0.3s var(--ease-out)';
    app.querySelector('#gap-list').prepend(wrap);
    wrap.innerHTML = gapForm(null);
    bindGapForm(wrap, null, done);
  } else if (item) {
    item.classList.add('editing-gap');
    item.innerHTML = gapForm(gap);
    bindGapForm(item, gap, done);
  }
}

function gapForm(gap) {
  return `
    <div class="field" style="margin-bottom:10px">
      <input type="text" id="ge-title" placeholder="Step title" value="${esc(gap?.title || '')}" autofocus />
    </div>
    <div class="field" style="margin-bottom:10px">
      <input type="text" id="ge-desc" placeholder="What does this step involve? (optional)" value="${esc(gap?.description || '')}" />
    </div>
    <div class="two-col" style="gap:10px">
      <select id="ge-cat">
        ${CATEGORIES.map((c) => `<option ${gap?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
      <input type="text" id="ge-pre" placeholder="Prerequisites (optional)" value="${esc(gap?.prerequisites || '')}" />
    </div>
    <div class="flex mt-s">
      <button class="btn btn-primary btn-sm" id="ge-save">${gap ? 'Save' : 'Add step'}</button>
      <button class="btn btn-ghost btn-sm" id="ge-cancel">Cancel</button>
    </div>`;
}

function bindGapForm(wrap, gap, done) {
  wrap.querySelector('#ge-save').onclick = async () => {
    const title = wrap.querySelector('#ge-title').value.trim();
    if (!title) return toast('A step needs a title', 'err');
    const body = { title, description: wrap.querySelector('#ge-desc').value.trim(), category: wrap.querySelector('#ge-cat').value, prerequisites: wrap.querySelector('#ge-pre').value.trim() };
    try {
      if (gap) await API.patch(`/api/gaps/${gap.id}`, body);
      else await API.post('/api/gaps', body);
      toast(gap ? 'Step updated' : 'Step added to your map', 'success');
      done();
    } catch (err) { toast(err.message, 'err'); }
  };
  wrap.querySelector('#ge-cancel').onclick = done;
}
