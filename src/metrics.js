// src/metrics.js — north-star metrics (visible to the user)
const store = require('./store');
const { localDateStr, offsetDate, parseLocal, shortDate, weekStartStr } = require('./util');

/** Latest action per date (replaced actions are superseded by their replacement). */
function latestPerDate(actions) {
  const map = new Map();
  for (const a of actions) map.set(a.action_date, a);
  return map;
}

function computeMetrics(userId) {
  const identity = store.getIdentity(userId);
  const gaps = store.getGapSteps(userId);
  const today = localDateStr();
  const from30 = offsetDate(-29);
  const actions30 = store.getActionsBetween(userId, from30, today);
  const byDate = latestPerDate(actions30);
  const days = [...byDate.values()];

  // ---- goal progress: % of gap steps completed (self-reported) ----
  const totalSteps = gaps.length;
  const doneSteps = gaps.filter((g) => g.status === 'done').length;
  const goalProgress = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : null;

  // ---- habit consistency: days engaged (non-replaced action exists) in the window ----
  const daysShown = days.filter((a) => a.status !== 'replaced').length;

  // ---- current rhythm: consecutive done days ending today or yesterday (gentle, no guilt) ----
  let rhythm = 0;
  {
    let cursor = new Date();
    const todayHasAction = byDate.has(today);
    if (!todayHasAction) cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 400; i++) {
      const ds = localDateStr(cursor);
      const a = byDate.get(ds);
      if (a && a.status === 'done') { rhythm++; cursor.setDate(cursor.getDate() - 1); }
      else break;
    }
  }

  // ---- usefulness rate: done / (done + rejected) — rejection is also signal ----
  const judged = days.filter((a) => a.status === 'done' || a.status === 'rejected');
  const doneCount = judged.filter((a) => a.status === 'done').length;
  const rejectedCount = judged.length - doneCount;
  const usefulness = judged.length ? Math.round((doneCount / judged.length) * 100) : null;

  // ---- habit calendar: last 30 days statuses ----
  const calendar = [];
  for (let i = 29; i >= 0; i--) {
    const ds = offsetDate(-i);
    const a = byDate.get(ds);
    calendar.push({ date: ds, status: a ? a.status : 'none', diversity: a ? Boolean(a.diversity) : false });
  }

  // ---- gap-closure trend: per week over the last 8 weeks ----
  // weeks must reflect FULL history (not just the 30-day window), so fetch all actions.
  const checkins = store.getCheckins(userId);
  const allActions = store.getActionsBetween(userId, '2020-01-01', today);
  const allByDate = latestPerDate(allActions);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(parseLocal(offsetDate(-(7 * i))));
    const ws = weekStartStr(weekStart);
    const wsDate = parseLocal(ws);
    const wsNext = new Date(wsDate); wsNext.setDate(wsDate.getDate() + 7);
    const weekCheckins = checkins.filter((c) => c.week_start === ws);
    const rating = weekCheckins.length
      ? Math.round((weekCheckins.reduce((s, c) => s + c.rating, 0) / weekCheckins.length) * 10) / 10
      : null;
    const completed = gaps.filter((g) => {
      if (!g.completed_at) return false;
      const t = new Date(g.completed_at).getTime();
      return t >= wsDate.getTime() && t < wsNext.getTime();
    }).length;
    const shown = [...allByDate.values()].filter((a) => {
      const d = parseLocal(a.action_date);
      return d.getTime() >= wsDate.getTime() && d.getTime() < wsNext.getTime() && a.status !== 'replaced';
    }).length;
    weeks.push({ label: shortDate(ws), rating, completed, shown });
  }

  // ---- check-in trend ----
  const checkinTrend = checkins.slice(0, 8).map((c) => ({ label: shortDate(c.week_start), rating: c.rating })).reverse();

  return {
    goalProgress,
    goal: { done: doneSteps, total: totalSteps },
    consistency: { daysShown, window: 30 },
    rhythm,
    usefulness,
    judged: { done: doneCount, rejected: rejectedCount },
    calendar,
    weeks,
    checkinTrend,
    today,
  };
}

module.exports = { computeMetrics };
