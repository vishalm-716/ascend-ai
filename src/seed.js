// src/seed.js — builds the demo profile so judges see a living identity loop
const store = require('./store');
const { hashPassword, createSession } = require('./auth');
const { offsetDate, weekStartStr, localDateStr } = require('./util');

const DEMO_EMAIL = 'demo@ascend.app';
const DEMO_PASSWORD = 'demo1234';

function seedDemo() {
  // reset any existing demo user (cascade wipes all their data)
  const existing = store.getUserByEmail(DEMO_EMAIL);
  if (existing) store.deleteUser(existing.id);

  const user = store.createUser(DEMO_EMAIL, hashPassword(DEMO_PASSWORD));
  const userId = user.id;

  const identity = store.upsertIdentity(userId, {
    aspiration: 'A calm, healthy, financially free software engineer who ships work that matters and leads with kindness',
    domain: 'career + health + money + creativity',
    values: 'Curiosity\nIntegrity\nDeep work\nKindness\nHealth',
    non_negotiables: '8 hours of sleep\nNo phone for the first hour of the day\nSunday dinner with family',
    habits: 'Wake at 7am\nGym 3x a week\n1 hour of deep work daily\nJournaling — happens sometimes',
    skill_level: 'Intermediate — good at building things, shaky at finishing and networking',
    energy: 'Medium — strongest in the mornings, crashes after 8pm',
    time_available: 'About 45–60 focused minutes a day, plus weekends',
    biggest_constraint: 'Phone distraction and an evening energy crash',
    readiness: 4,
  });

  // gap map across several domains, with history baked in
  const steps = [
    { title: 'Ship one portfolio project end to end', description: 'A small but complete project that shows your full range — designed, built, documented, deployed.', category: 'project', prerequisites: '', status: 'done', position: 0 },
    { title: 'Sharpen your professional story', description: 'Rewrite your resume, LinkedIn and bio so a stranger understands your value in 30 seconds.', category: 'skill', prerequisites: 'Portfolio project shipped', status: 'done', position: 1 },
    { title: 'Lock a daily movement habit', description: 'Ten minutes of movement every day — a walk, stretch, or gym session. Consistency over intensity.', category: 'habit', prerequisites: '', status: 'in_progress', position: 2 },
    { title: 'Set up automatic savings', description: 'Automate a small transfer to savings the day you get paid, and track spending for one week.', category: 'habit', prerequisites: '', status: 'in_progress', position: 3 },
    { title: 'Network with three people who do what you want', description: 'Three honest, low-pressure conversations with people a few steps ahead of you.', category: 'skill', prerequisites: 'Story sharpened', status: 'pending', position: 4 },
    { title: 'Fix one sleep lever', description: 'Pick one change — screen-off time, caffeine cut-off — that improves sleep quality this week.', category: 'habit', prerequisites: '', status: 'pending', position: 5 },
  ];
  steps.forEach((s) => {
    const created = store.addGapStep(userId, { title: s.title, description: s.description, category: s.category, prerequisites: s.prerequisites, position: s.position });
    if (s.status === 'done') store.updateGapStep(userId, created.id, { status: 'done' });
    else if (s.status === 'in_progress') store.updateGapStep(userId, created.id, { status: 'in_progress' });
  });

  // ~3 weeks of history with human-looking variance (one 'different', a couple rejects)
  const titles = [
    ['Write the opening paragraph of your portfolio intro', 'task'],
    ['Ten-minute walk before your deep-work block', 'action'],
    ['Name the belief that quietly limits your asks', 'mindset'],
    ['Collect 10 references of work you admire', 'resource'],
    ['Block 25 minutes and finish the deploy checklist', 'task'],
    ['Track today\'s spending in one line', 'action'],
    ['The two-minute re-entry: start the thing you\'re avoiding', 'action'],
    ['Rewrite one bullet of your story out loud', 'skill'],
    ['Do the smallest version of the networking message', 'action'],
    ['Read something you disagree with', 'idea'],
    ['Plan one real meal for the week', 'action'],
    ['Write three small wins from today', 'habit'],
    ['Fix one sleep lever tonight', 'action'],
    ['Summarize this week\'s learnings in three bullets', 'skill'],
    ['Send one honest message to someone a step ahead', 'action'],
    ['Rest deliberately for twenty minutes', 'mindset'],
    ['Do the smallest version of the savings setup', 'action'],
    ['Practice saying the story of your growth in 60 seconds', 'skill'],
    ['Attention audit — five minutes', 'action'],
    ['One completed micro-loop: clear the desk', 'action'],
    ['Log three small wins from today', 'habit'],
    ['Deepen the portfolio project: add one case-study note', 'task'],
  ];
  const today = localDateStr();
  titles.forEach(([title, kind], i) => {
    const date = offsetDate(-(titles.length - i)); // oldest first
    if (date >= today) return;
    // human variance
    const r = Math.random();
    let status = 'done';
    if (i % 11 === 5) status = 'rejected';
    else if (r < 0.08) status = 'rejected';
    else if (r < 0.14) status = 'replaced';
    const diversity = i % 10 === 6;
    store.insertAction(userId, {
      date,
      title,
      kind,
      description: `A small curated step from Ascend for ${date}.`,
      why: 'Chosen to close a specific gap on your map, sized to your time and readiness.',
      diversity,
      gapStepId: null,
    });
    const act = store.getTodayAction(userId, date) || store.getRecentActions(userId, 100).find((a) => a.action_date === date);
    if (act) {
      store.setActionStatus(userId, act.id, status);
      if (status === 'done' || status === 'rejected' || status === 'replaced') store.logFeedback(userId, act.id, status === 'replaced' ? 'different' : status);
    }
  });

  // a couple of past check-ins
  store.addCheckin(userId, { weekStart: weekStartStr(new Date(new Date().getTime() - 14 * 86400000)), rating: 3, note: 'Rough week — inconsistent but I showed up most days. Networking still scares me.', energy: 3 });
  store.addCheckin(userId, { weekStart: weekStartStr(new Date(new Date().getTime() - 7 * 86400000)), rating: 4, note: 'Better. Two deep-work days in a row. The sleep lever helped.', energy: 4 });

  // some ai_call log entries so the curator log feels alive
  store.logAiCall(userId, { provider: 'fallback', model: 'heuristic-curator', prompt: 'identity context…', response: '{"title":"Do the smallest version of the networking message",…}', meta: { kind: 'daily_action', mode: 'gap', reasoning: [{ signal: 'gap_map', value: 'Network with three people…' }] } });
  store.logAiCall(userId, { provider: 'fallback', model: 'heuristic-curator', prompt: 'identity context…', response: '{"title":"Read something you disagree with",…}', meta: { kind: 'daily_action', mode: 'diversity', reasoning: [{ signal: 'diversity_injection', value: true }] } });

  // today's action is generated fresh by the real curator path
  return { email: DEMO_EMAIL, password: DEMO_PASSWORD, userId };
}

module.exports = { seedDemo, DEMO_EMAIL, DEMO_PASSWORD };
