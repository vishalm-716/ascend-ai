// views/progress.js — north-star metrics: goal progress, consistency, usefulness, gap-closure trend
import { API } from '../api.js';
import { esc, spinner, loadingView, errorView } from '../ui.js';
import { ring, bars, habitGrid, sparkline } from '../charts.js';

export async function renderProgress(app) {
  app.innerHTML = loadingView('Crunching your signals…');
  try {
    const [metrics, { actions }] = await Promise.all([API.get('/api/metrics'), API.get('/api/history')]);
    draw(app, metrics, actions);
  } catch (err) {
    app.innerHTML = errorView(err.message);
  }
}

function draw(app, m, actions) {
  const goalPct = m.goalProgress === null ? 0 : m.goalProgress;
  const consistencyPct = m.consistency.daysShown ? Math.round((m.consistency.daysShown / m.consistency.window) * 100) : 0;
  const usefulPct = m.usefulness === null ? 0 : m.usefulness;

  const weekBars = m.weeks.filter((w) => w.shown > 0 || w.completed > 0 || w.rating !== null);
  const chartData = weekBars.length
    ? weekBars.map((w) => ({ label: w.label, value: w.completed, alt: false, rating: w.rating }))
    : null;

  const trendLine = m.checkinTrend.length ? m.checkinTrend.map((c) => c.rating) : null;

  app.innerHTML = `
  <div class="view">
    <div class="greet">
      <div>
        <div class="eyebrow">north-star signals</div>
        <h1>Your growth, honestly measured</h1>
        <div class="date">These are your metrics — not engagement bait. Rejection counts, rest counts, showing up counts.</div>
      </div>
    </div>

    <div class="metric-grid stagger-in">
      <div class="metric">
        <div class="metric-head"><span class="metric-label">Goal progress</span></div>
        <div class="ring-wrap">
          ${ring(goalPct)}
          <div class="ring-label"><b>${m.goal.done} of ${m.goal.total}</b> gap steps closed on your path to your aspiration.</div>
        </div>
        <div class="metric-sub">Self-reported · updated as you complete steps</div>
      </div>
      <div class="metric">
        <div class="metric-head"><span class="metric-label">Habit consistency</span></div>
        <div class="ring-wrap">
          ${ring(consistencyPct, { color: '#c07a5c' })}
          <div class="ring-label">Engaged on <b>${m.consistency.daysShown} of the last ${m.consistency.window} days</b> — no streaks demanded, just pattern.</div>
        </div>
        <div class="metric-sub">Current quiet rhythm: ${m.rhythm} ${m.rhythm === 1 ? 'day' : 'days'} in a row</div>
      </div>
      <div class="metric">
        <div class="metric-head"><span class="metric-label">Usefulness rate</span></div>
        <div class="ring-wrap">
          ${ring(usefulPct, { color: '#a89bc8' })}
          <div class="ring-label"><b>${m.judged.done} kept</b>, <b>${m.judged.rejected} rejected</b>. Rejection is signal — Ascend adapts.</div>
        </div>
        <div class="metric-sub">30-day window · completion and rejection both count</div>
      </div>
    </div>

    <div class="card mt">
      <h3 class="card-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-faint)"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        Gap-closure trend <span class="chip chip-soft" style="margin-left:auto">last 8 weeks</span>
      </h3>
      ${chartData
        ? `<div style="overflow-x:auto">${bars(chartData.map((d) => ({ label: d.label, value: d.value, alt: d.rating !== null })), { height: 170 })}</div>
           <p class="hr-note">Steps completed per week · bar highlighted when you also left a reflection that week</p>`
        : '<div class="empty" style="padding:24px 0"><div class="big" aria-hidden="true">📈</div><p>Weekly trend appears once you complete steps and leave reflections.</p></div>'}
    </div>

    <div class="card mt">
      <div class="flex-between">
        <h3 class="card-title" style="margin:0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-faint)"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Weekly reflections
        </h3>
        ${trendLine ? `<span class="chip chip-soft">${trendLine.join(' · ')} ★</span>` : ''}
      </div>
      ${trendLine ? `
        <div class="ring-wrap" style="justify-content:space-between;flex-wrap:wrap">
          <div>${sparkline(trendLine, { w: 300, h: 60, color: '#d9a441' })}</div>
          <div class="ring-label" style="max-width:220px">Your week ratings over time. Ascend watches this to tune gentleness vs. stretch.</div>
        </div>` : '<div class="muted" style="padding:12px 0">Ratings from your weekly reflections will form a line here.</div>'}
    </div>

    <div class="card mt">
      <h3 class="card-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-faint)"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Last 30 days <span class="chip chip-soft" style="margin-left:auto">✦ = diversity thread</span>
      </h3>
      ${habitGrid(m.calendar)}
    </div>

    <div class="card mt">
      <h3 class="card-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-faint)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        Thread history
      </h3>
      <div id="hist-list"></div>
    </div>
  </div>`;

  // history table
  const hist = app.querySelector('#hist-list');
  if (actions.length) {
    hist.innerHTML = `<div class="stagger-in">${actions.map((a) => `
      <div class="week-row">
        <span class="wd">${esc(a.action_date.slice(5).replace('-', '/'))}</span>
        <span class="wt">${esc(a.title)}</span>
        <span class="chip chip-soft" style="font-size:11px">${esc(a.kind)}${a.diversity ? ' ✦' : ''}</span>
        <span class="wst ${a.status === 'done' ? 'wst-done' : a.status === 'rejected' ? 'wst-rejected' : a.status === 'replaced' ? 'wst-replaced' : 'wst-pending'}">${a.status}</span>
      </div>`).join('')}</div>`;
  } else {
    hist.innerHTML = '<div class="empty" style="padding:20px 0"><div class="big" aria-hidden="true">📋</div><p>Your curated threads will appear here.</p></div>';
  }
}
