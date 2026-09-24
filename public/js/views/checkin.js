// views/checkin.js — the Reflect + Adapt phase: weekly review
import { API } from '../api.js';
import { esc, toast, spinner, formatWhen, loadingView, errorView } from '../ui.js';
import { go } from '../router.js';

const RATING_WORDS = ['', 'Tough week — survival mode', 'A hard but survivable week', 'A decent, ordinary week', 'A genuinely good week', 'A week to be proud of'];

export async function renderCheckin(app) {
  app.innerHTML = loadingView('Loading…');
  try {
    const [profile, { checkins }] = await Promise.all([
      API.get('/api/profile'),
      API.get('/api/checkins'),
    ]);
    draw(app, profile, checkins);
  } catch (err) {
    app.innerHTML = errorView(err.message);
  }
}

function draw(app, profile, checkins) {
  let rating = 0;
  let energy = 3;
  let readiness = profile.identity?.readiness ?? 3;

  app.innerHTML = `
  <div class="view">
    <div class="greet">
      <div>
        <div class="eyebrow">weekly reflection</div>
        <h1>How did your week go?</h1>
        <div class="date">A minute of honesty now makes every future thread smarter. This updates your identity model, gap map and readiness.</div>
      </div>
    </div>

    <div class="card checkin-card">
      <div class="field">
        <label class="field-label">Overall, this week felt…</label>
        <div class="stars" id="ck-stars" role="radiogroup" aria-label="Rate your week 1 to 5">
          ${[1, 2, 3, 4, 5].map((n) => `<div class="star" data-r="${n}" role="radio" aria-checked="false" aria-label="${n} star${n > 1 ? 's' : ''}" tabindex="0">★</div>`).join('')}
        </div>
        <div class="star-label" id="ck-word" aria-live="polite">Tap a star</div>
      </div>
      <div class="field">
        <label class="field-label" for="ck-energy">Energy this week <span class="muted">(${energy}/5)</span></label>
        <div class="slider-row"><input type="range" id="ck-energy" min="1" max="5" step="1" value="${energy}" /><span class="chip chip-soft" id="ck-energy-chip">${energy}/5</span></div>
      </div>
      <div class="field">
        <label class="field-label" for="ck-note">Anything worth telling Ascend? <span class="muted">(optional)</span></label>
        <textarea id="ck-note" rows="3" placeholder="What worked, what didn't, how you feel about the week…"></textarea>
      </div>
      <div class="field">
        <label class="field-label">Readiness for next week <span class="muted">— what kind of threads do you want?</span></label>
        <div class="slider-row">
          <input type="range" id="ck-readiness" min="1" max="5" step="1" value="${readiness}" />
          <span class="chip chip-soft" id="ck-ready-chip">${readiness}/5</span>
        </div>
        <div class="field-hint">Gentle on low days, stretchy on strong ones.</div>
      </div>
      <button class="btn btn-primary" id="ck-submit">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Reflect & adapt
      </button>
    </div>

    <div class="card mt">
      <h3 class="card-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-faint)"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
        Past reflections
      </h3>
      <div id="ck-past" class="stagger-in">
        ${checkins.length ? checkins.map((c) => `
          <div class="past-checkin">
            <div class="pc-head">
              <span>Week of ${esc(formatWhen(c.week_start))}</span>
              <span>${'★'.repeat(c.rating)}<span style="color:var(--line-strong)">${'★'.repeat(5 - c.rating)}</span> ${c.energy ? `· energy ${c.energy}/5` : ''}</span>
            </div>
            ${c.note ? `<div class="pc-note">${esc(c.note)}</div>` : '<div class="muted">No note</div>'}
          </div>`).join('') : '<div class="empty" style="padding:20px 0"><div class="big" aria-hidden="true">💬</div><p>Your reflections will appear here — the model learns from each one.</p></div>'}
      </div>
    </div>
  </div>`;

  const stars = app.querySelectorAll('#ck-stars .star');
  const word = app.querySelector('#ck-word');
  stars.forEach((s) => {
    s.addEventListener('click', () => {
      rating = Number(s.dataset.r);
      stars.forEach((x) => {
        const isActive = Number(x.dataset.r) <= rating;
        x.classList.toggle('on', isActive);
        x.setAttribute('aria-checked', isActive && Number(x.dataset.r) === rating ? 'true' : 'false');
      });
      word.textContent = RATING_WORDS[rating];
    });
    s.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        s.click();
      }
    });
  });

  const energySlider = app.querySelector('#ck-energy');
  const energyChip = app.querySelector('#ck-energy-chip');
  const energyLabel = energySlider.closest('.field').querySelector('.field-label');
  energySlider.addEventListener('input', () => {
    energy = Number(energySlider.value);
    energyChip.textContent = `${energy}/5`;
    energyLabel.innerHTML = `Energy this week <span class="muted">(${energy}/5)</span>`;
  });

  const readySlider = app.querySelector('#ck-readiness');
  app.querySelector('#ck-ready-chip').textContent = `${readiness}/5`;
  readySlider.addEventListener('input', () => { readiness = Number(readySlider.value); app.querySelector('#ck-ready-chip').textContent = `${readiness}/5`; });

  app.querySelector('#ck-submit').onclick = async () => {
    if (!rating) return toast('Tap a star to rate your week first', 'err');
    const btn = app.querySelector('#ck-submit');
    btn.disabled = true; btn.innerHTML = spinner() + ' Adapting…';
    try {
      await API.post('/api/checkins', {
        rating,
        energy,
        note: app.querySelector('#ck-note').value.trim(),
        readiness,
      });
      toast('Recorded — Ascend has adapted your model', 'success');
      go('today');
    } catch (err) { toast(err.message, 'err'); btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Reflect & adapt`;
    }
  };
}
