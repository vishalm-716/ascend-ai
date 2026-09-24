// views/onboarding.js — the Sense phase: a 4-step wizard
import { API } from '../api.js';
import { esc, toast, spinner } from '../ui.js';
import { go } from '../router.js';

const DOMAIN_SUGGESTIONS = [
  { label: 'Career & work', icon: '💼', eg: 'A senior engineer people trust, shipping work that matters' },
  { label: 'Health & energy', icon: '🌿', eg: 'Someone with steady energy, strong sleep, and a body that keeps up' },
  { label: 'Mindset & confidence', icon: '🧭', eg: 'A calm, self-assured person who isn\'t rattled by setbacks' },
  { label: 'Creativity', icon: '🎨', eg: 'A writer who finishes and ships, not just starts' },
  { label: 'Relationships', icon: '🕊️', eg: 'A warm, present friend and partner people feel safe with' },
  { label: 'Discipline & focus', icon: '⚡', eg: 'Someone who follows through on what they say they\'ll do' },
  { label: 'Finances & freedom', icon: '🪙', eg: 'A person with savings, no money anxiety, and room to choose' },
  { label: 'Learning & skill', icon: '📚', eg: 'A lifelong learner with real, visible skill depth' },
];

const ENERGY_OPTS = ['High and steady', 'Medium — better in the mornings', 'Medium — better in the evenings', 'Low and variable'];
const TIME_OPTS = ['~15 minutes a day', '~30 minutes a day', '~45–60 minutes a day', 'A couple of hours, mostly weekends'];
const LEVEL_OPTS = ['Just starting', 'Getting going', 'Intermediate', 'Quite advanced'];

const STEPS = [
  { title: 'Who do you want to become?' },
  { title: 'Where are you today?' },
  { title: 'What do you refuse to trade?' },
  { title: 'How ready do you feel?' },
];

export function renderOnboarding(app) {
  let step = 0;
  const data = { aspiration: '', domain: '', habits: '', level: '', energy: '', time: '', constraint: '', values: '', nonNeg: '', readiness: 3 };
  let busy = false;

  const shell = () => `
  <div class="onb-wrap">
    <div class="onb-top">
      <div class="auth-brand" style="margin:0">
        <div class="brand-mark" aria-hidden="true">▲</div><div class="brand-name">Ascend</div>
      </div>
      <div class="onb-steps" aria-label="Step ${step + 1} of ${STEPS.length}">${STEPS.map((_, i) => `<div class="onb-step ${i === step ? 'active' : i < step ? 'done' : ''}" aria-hidden="true"></div>`).join('')}</div>
    </div>
    <div class="onb-card" id="onb-card">
      <div class="onb-num">Step ${step + 1} of ${STEPS.length} · ${STEPS[step].title}</div>
      ${step === 0 ? step0() : step === 1 ? step1() : step === 2 ? step2() : step3()}
      <div class="onb-nav">
        <button class="btn btn-ghost" id="onb-back" ${step === 0 ? 'style="visibility:hidden"' : ''} aria-label="Go back to previous step">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          Back
        </button>
        <button class="btn btn-primary" id="onb-next">${step === 3 ? 'Begin my ascent' : 'Continue →'}</button>
      </div>
    </div>
  </div>`;

  const step0 = () => `
    <h2 class="onb-q">Who do you want to become?</h2>
    <p class="onb-sub">Any area of life — this is the north star everything else orbits.</p>
    <div class="field">
      <label class="field-label">Pick a domain (or describe your own)</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px" id="domain-chips">
        ${DOMAIN_SUGGESTIONS.map((d) => `<button type="button" class="chip chip-soft" data-d="${esc(d.label)}" style="cursor:pointer">${d.icon} ${esc(d.label)}</button>`).join('')}
      </div>
    </div>
    <div class="field">
      <label class="field-label" for="o-asp">Your aspiration, in your own words</label>
      <textarea id="o-asp" rows="3" placeholder="e.g. ${esc(DOMAIN_SUGGESTIONS[0].eg)}">${esc(data.aspiration)}</textarea>
      <div class="field-hint">A sentence is enough. You can edit this any time.</div>
    </div>`;

  const step1 = () => `
    <h2 class="onb-q">Where are you today?</h2>
    <p class="onb-sub">Honest answers help Ascend size your next action to reality — not to a motivational poster.</p>
    <div class="field">
      <label class="field-label" for="o-habits">Current habits & routines</label>
      <input id="o-habits" type="text" placeholder="e.g. Wake at 7am, gym 3x/week, scroll too much at night" value="${esc(data.habits)}" />
    </div>
    <div class="two-col">
      <div class="field">
        <label class="field-label" for="o-level">Skill level in this area</label>
        <select id="o-level">${LEVEL_OPTS.map((l) => `<option ${data.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="field-label" for="o-energy">Usual energy</label>
        <select id="o-energy">${ENERGY_OPTS.map((e) => `<option ${data.energy === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
      </div>
    </div>
    <div class="two-col">
      <div class="field">
        <label class="field-label" for="o-time">Time you can really give</label>
        <select id="o-time">${TIME_OPTS.map((t) => `<option ${data.time === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label class="field-label" for="o-constraint">Biggest life constraint right now</label>
        <input id="o-constraint" type="text" placeholder="e.g. phone distraction, long commute, low energy" value="${esc(data.constraint)}" />
      </div>
    </div>`;

  const step2 = () => `
    <h2 class="onb-q">What do you refuse to trade?</h2>
    <p class="onb-sub">Values guide which actions Ascend will never push you past.</p>
    <div class="two-col">
      <div class="field">
        <label class="field-label" for="o-values">Values — one per line</label>
        <textarea id="o-values" rows="4" placeholder="Curiosity&#10;Integrity&#10;Health">${esc(data.values)}</textarea>
      </div>
      <div class="field">
        <label class="field-label" for="o-nonneg">Non-negotiables</label>
        <textarea id="o-nonneg" rows="4" placeholder="8 hours of sleep&#10;No phone first hour&#10;Sunday with family">${esc(data.nonNeg)}</textarea>
        <div class="field-hint">The boundaries that stay fixed, no matter what.</div>
      </div>
    </div>`;

  const step3 = () => `
    <h2 class="onb-q">How ready do you feel, right now?</h2>
    <p class="onb-sub">Not a judgment — a signal. On low-readiness days Ascend prescribes rest or a gentle re-entry. On strong days, a stretch.</p>
    <div class="readiness-scale" id="ready-scale" role="radiogroup" aria-label="Readiness level">
      ${[1, 2, 3, 4, 5].map((n) => `<div data-r="${n}" class="${data.readiness === n ? 'sel' : ''}" role="radio" aria-checked="${data.readiness === n}" tabindex="0">${n}<br/><span style="font-size:11px">${['exhausted', 'low', 'steady', 'ready', 'fired up'][n - 1]}</span></div>`).join('')}
    </div>
    <div class="curating" style="display:none" id="curating">
      <div class="curating-mark" aria-hidden="true">🌱</div>
      <h3>Ascend is mapping your identity</h3>
      <div class="curating-list">
        <div data-c="0"><span class="tick">○</span> Sensing who you want to become</div>
        <div data-c="1"><span class="tick">○</span> Modeling your current state</div>
        <div data-c="2"><span class="tick">○</span> Building your gap map</div>
        <div data-c="3"><span class="tick">○</span> Curating today's first action</div>
      </div>
    </div>`;

  const draw = () => { app.innerHTML = shell(); bind(); };

  function bind() {
    if (step === 0) {
      const asp = app.querySelector('#o-asp');
      asp.addEventListener('input', () => { data.aspiration = asp.value; });
      app.querySelector('#domain-chips').addEventListener('click', (e) => {
        const chip = e.target.closest('[data-d]');
        if (!chip) return;
        app.querySelectorAll('#domain-chips .chip').forEach((c) => { c.classList.remove('chip-kind'); c.classList.add('chip-soft'); });
        chip.classList.add('chip-kind'); chip.classList.remove('chip-soft');
        data.domain = chip.dataset.d;
        const sug = DOMAIN_SUGGESTIONS.find((s) => s.label === chip.dataset.d);
        if (sug && !data.aspiration) asp.placeholder = sug.eg;
      });
    }
    if (step === 1) {
      app.querySelector('#o-habits').addEventListener('input', (e) => { data.habits = e.target.value; });
      app.querySelector('#o-level').addEventListener('change', (e) => { data.level = e.target.value; });
      app.querySelector('#o-energy').addEventListener('change', (e) => { data.energy = e.target.value; });
      app.querySelector('#o-time').addEventListener('change', (e) => { data.time = e.target.value; });
      app.querySelector('#o-constraint').addEventListener('input', (e) => { data.constraint = e.target.value; });
    }
    if (step === 2) {
      app.querySelector('#o-values').addEventListener('input', (e) => { data.values = e.target.value; });
      app.querySelector('#o-nonneg').addEventListener('input', (e) => { data.nonNeg = e.target.value; });
    }
    if (step === 3) {
      app.querySelector('#ready-scale').addEventListener('click', (e) => {
        const el = e.target.closest('[data-r]');
        if (!el) return;
        data.readiness = Number(el.dataset.r);
        app.querySelectorAll('#ready-scale div').forEach((d) => {
          const isActive = Number(d.dataset.r) === data.readiness;
          d.classList.toggle('sel', isActive);
          d.setAttribute('aria-checked', isActive ? 'true' : 'false');
        });
      });
      app.querySelector('#ready-scale').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.target.click(); }
      });
    }

    app.querySelector('#onb-back').onclick = () => { if (step > 0) { step--; draw(); } };
    app.querySelector('#onb-next').onclick = async () => {
      if (step === 0 && !data.aspiration.trim()) return toast('Tell us who you want to become — that\'s the whole point', 'err');
      if (step < 3) { step++; draw(); return; }
      await submit();
    };
  }

  async function submit() {
    if (busy) return;
    busy = true;
    const nextBtn = app.querySelector('#onb-next');
    const card = app.querySelector('#onb-card');
    nextBtn.disabled = true;
    app.querySelector('#onb-card').innerHTML = `
      <div class="onb-num">Initializing your companion</div>
      <div class="curating">
        <div class="curating-mark" aria-hidden="true">🌱</div>
        <h3>Ascend is mapping your identity</h3>
        <div class="curating-stage" aria-live="polite"></div>
        <div class="curating-list">
          <div data-c="0"><span class="tick">○</span> Sensing who you want to become</div>
          <div data-c="1"><span class="tick">○</span> Modeling your current state</div>
          <div data-c="2"><span class="tick">○</span> Building your gap map</div>
          <div data-c="3"><span class="tick">○</span> Curating today's first action</div>
        </div>
      </div>`;
    const stages = ['Sensing your aspiration…', 'Mapping habits, energy and constraints…', 'Breaking the gap into small steps…', 'Curating your first action…'];
    const items = card.querySelectorAll('.curating-list div');
    let i = 0;
    const timer = setInterval(() => {
      if (i < 4) {
        items.forEach((it, k) => { it.querySelector('.tick').textContent = k < i ? '✓' : '○'; it.classList.toggle('on', k <= i); });
        card.querySelector('.curating-stage').textContent = stages[Math.min(i, 3)];
        i++;
      }
    }, 650);
    try {
      await API.post('/api/onboarding', {
        aspiration: data.aspiration.trim(),
        domain: data.domain || 'personal growth',
        values: data.values.trim(),
        non_negotiables: data.nonNeg.trim(),
        habits: data.habits.trim(),
        skill_level: data.level,
        energy: data.energy,
        time_available: data.time,
        biggest_constraint: data.constraint.trim(),
        readiness: data.readiness,
      });
      clearInterval(timer);
      window.dispatchEvent(new CustomEvent('ascend:identity-ready'));
      toast('Your identity model is ready', 'success');
      go('today');
    } catch (err) {
      clearInterval(timer);
      toast(err.message, 'err');
      busy = false;
      draw();
    }
  }

  draw();
}
