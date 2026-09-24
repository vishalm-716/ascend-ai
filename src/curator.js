// src/curator.js — the AI Curator Agent: Plan + Curate
// Takes the identity model + recent feedback as input and returns a structured next-best-action.
// Uses a configured LLM (OpenAI-compatible) when available; otherwise a transparent heuristic
// curator that still adapts to gaps, readiness, and feedback.
const store = require('./store');
const { localDateStr, offsetDate, shortTitle, truncate } = require('./util');
const {
  SYSTEM_PROMPT, buildCuratorPrompt, buildGapGeneratorPrompt, extractJson,
  RECOVERY_ACTIONS, DIVERSITY_ACTIONS, PLATEAU_ACTIONS, actionFromGapStep,
} = require('./prompts');

const KINDS = new Set(['action', 'task', 'idea', 'mindset', 'resource']);

// ---- LLM guardrails: never hammer the provider, never let failures hurt the app ----
let llmCooldownUntil = 0; // after a 429/5xx, skip LLM calls briefly and use the fallback
let llmInFlight = 0;      // at most one concurrent LLM call (gap-gen + curation fire close together)

function llmAvailable() {
  return Date.now() >= llmCooldownUntil && llmInFlight < 1;
}
function noteLlmFailure() {
  llmCooldownUntil = Date.now() + 60 * 1000; // 1-minute cooldown
}

// ---------------- context ----------------

function buildContext(userId) {
  const identity = store.getIdentity(userId);
  const gaps = store.getGapSteps(userId);
  const recent = store.getRecentActions(userId, 20);
  const checkins = store.getCheckins(userId);
  const settings = store.getUserSettings(userId);
  const daysSinceStart = identity
    ? Math.max(1, Math.round((Date.now() - new Date(identity.created_at + 'Z').getTime()) / 86400000))
    : 1;
  return { identity, gaps, recent, checkins, settings, daysSinceStart };
}

// ---------------- LLM path ----------------

async function callLLM(ctx, opts) {
  const key = ctx.settings.aiKey || process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!llmAvailable()) return null; // provider is cooling down — use the heuristic curator
  const base = (ctx.settings.aiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = ctx.settings.aiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = buildCuratorPrompt(ctx, opts);
  llmInFlight++;
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.9,
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!resp.ok) {
      console.error('[curator] LLM HTTP', resp.status, '— cooling down for 60s');
      noteLlmFailure();
      return null;
    }
    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    if (!parsed || !parsed.title) return null;
    return { action: normalize(parsed), provider: 'openai-compatible', model, prompt, raw: content };
  } catch (err) {
    console.error('[curator] LLM call failed, using fallback:', err.message);
    noteLlmFailure();
    return null;
  } finally {
    llmInFlight = Math.max(0, llmInFlight - 1);
  }
}

function normalize(raw) {
  const kind = KINDS.has(raw.kind) ? raw.kind : 'action';
  return {
    title: String(raw.title).slice(0, 160),
    kind,
    description: String(raw.description || '').slice(0, 1000),
    why: String(raw.why || '').slice(0, 1000),
    diversity: Boolean(raw.diversity),
  };
}

// ---------------- fallback heuristic curator ----------------

function kindsRejectedRecently(recent, n = 6) {
  const counts = {};
  recent.slice(0, n).forEach((a) => {
    if (a.status === 'rejected' || a.status === 'replaced') counts[a.kind] = (counts[a.kind] || 0) + 1;
  });
  return counts;
}

function lastCuratedIndex(gaps, recent) {
  const last = {};
  recent.forEach((a) => { if (a.gap_step_id) last[a.gap_step_id] = a.action_date; });
  const pending = gaps.filter((g) => g.status !== 'done');
  if (!pending.length) return -1;
  // prefer not-done, then least recently curated, then earliest position
  const sorted = [...pending].sort((a, b) => {
    const la = last[a.id] || '0000-00-00';
    const lb = last[b.id] || '0000-00-00';
    if (la !== lb) return la < lb ? -1 : 1;
    return a.position - b.position;
  });
  return gaps.findIndex((g) => g.id === sorted[0].id);
}

function fallbackCurate(ctx, opts = {}) {
  const { identity, gaps, recent, checkins } = ctx;
  const reasons = [];
  const readiness = identity?.readiness ?? 3;

  reasons.push({ signal: 'readiness', value: readiness,
    note: readiness <= 2 ? 'low capacity — leaning toward recovery' : readiness >= 4 ? 'high capacity — a stretch is okay' : 'steady — moderate sizing' });

  // recent feedback adaptation
  const rejectedKinds = kindsRejectedRecently(recent);
  const rejectedTitles = new Set(recent.filter((a) => a.status === 'rejected').map((a) => a.title.toLowerCase()));
  if (Object.keys(rejectedKinds).length) {
    reasons.push({ signal: 'recent_feedback', value: rejectedKinds,
      note: `avoiding kinds the user has been rejecting: ${Object.keys(rejectedKinds).join(', ')}` });
  }

  const lastCheckins = [...checkins].slice(0, 3);
  if (lastCheckins.length >= 2) {
    const trend = lastCheckins.map((c) => c.rating);
    const declining = trend[0] < trend[1];
    if (declining) reasons.push({ signal: 'checkin_trend', value: trend, note: 'ratings trending down — softening the next action' });
  }

  // decide the mode
  let mode;
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const diversityDue = dayOfYear % 6 === 0;
  const forceDiversity = Boolean(opts.forceDiversity);

  if (opts.different) {
    mode = 'different';
    reasons.push({ signal: 'user_request', value: 'different', note: 'user asked for something different from the last action' });
  } else if (readiness <= 2 && !forceDiversity) {
    mode = 'recovery';
  } else if (forceDiversity || diversityDue || Math.random() < 0.14) {
    mode = 'diversity';
    reasons.push({ signal: 'diversity_injection', value: true, note: 'occasional diversity keeps the model from reinforcing the current identity' });
  } else {
    mode = 'gap';
  }

  const poolPick = (pool) => {
    const avoid = opts.avoidTitle ? opts.avoidTitle.toLowerCase() : '';
    let chosen = pool[Math.floor(Math.random() * pool.length)];
    let guard = 0;
    while ((avoid && chosen.title.toLowerCase() === avoid) && guard < 4) {
      chosen = pool[Math.floor(Math.random() * pool.length)];
      guard++;
    }
    return chosen;
  };

  let result;

  if (mode === 'recovery') {
    result = poolPick(RECOVERY_ACTIONS);
    reasons.push({ signal: 'mode', value: 'recovery', note: 'low readiness — the task today is rest or gentle re-entry' });
  } else if (mode === 'different') {
    const prev = recent[0];
    const prevKind = prev?.kind;
    // try to pick something from a different family than the previous action
    if (prevKind === 'mindset' || prevKind === 'idea') {
      result = gaps.length ? gapResult(gaps, recent, identity, reasons) : poolPick(PLATEAU_ACTIONS);
    } else {
      result = poolPick(DIVERSITY_ACTIONS);
    }
    if (result && opts.avoidTitle && result.title.toLowerCase() === opts.avoidTitle.toLowerCase()) {
      result = gaps.length ? gapResult(gaps, recent, identity, reasons) : poolPick(PLATEAU_ACTIONS);
    }
  } else if (mode === 'diversity') {
    result = poolPick(DIVERSITY_ACTIONS);
    reasons.push({ signal: 'mode', value: 'diversity', note: 'adjacent idea surfaced deliberately' });
  } else {
    result = gapResult(gaps, recent, identity, reasons);
    if (!result) result = poolPick(PLATEAU_ACTIONS);
  }

  if (!result) result = poolPick(PLATEAU_ACTIONS);

  const final = {
    title: result.title,
    kind: result.kind || 'action',
    description: result.description,
    why: result.why,
    diversity: Boolean(result.diversity),
    gap_step_id: result.gap_step_id || null,
  };
  return { action: final, reasons, mode };
}

function gapResult(gaps, recent, identity, reasons) {
  const pending = gaps.filter((g) => g.status !== 'done');
  if (!pending.length) return null;
  const idx = lastCuratedIndex(gaps, recent);
  if (idx === -1) return null;
  const step = gaps[idx];
  reasons.push({ signal: 'gap_map', value: step.title, note: `closing gap "${truncate(step.title, 50)}"` });
  return actionFromGapStep(step, identity);
}

// ---------------- gap step generation ----------------

async function generateGapSteps(userId, identity) {
  // try LLM first
  const settings = store.getUserSettings(userId);
  const key = settings.aiKey || process.env.OPENAI_API_KEY;
  if (key && llmAvailable()) {
    const base = (settings.aiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = settings.aiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const prompt = buildGapGeneratorPrompt(identity);
    try {
      const resp = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You convert a person\'s aspiration into a small, concrete step-by-step growth map. Respond ONLY with JSON.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 900,
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const parsed = extractJson(data.choices?.[0]?.message?.content || '');
        if (parsed && Array.isArray(parsed.steps) && parsed.steps.length) {
          const steps = parsed.steps.slice(0, 6).map((s, i) => ({
            title: String(s.title || '').slice(0, 160),
            description: String(s.description || '').slice(0, 600),
            category: ['habit', 'skill', 'project', 'mindset', 'resource', 'growth'].includes(s.category) ? s.category : 'growth',
            prerequisites: String(s.prerequisites || '').slice(0, 200),
          })).filter((s) => s.title);
          store.logAiCall(userId, { provider: 'openai-compatible', model, prompt, response: JSON.stringify(steps), meta: { kind: 'gap_generation' } });
          if (steps.length) return store.replaceGapSteps(userId, steps);
        }
      } else {
        // 429/5xx: back off like the daily-action path does, so a burst of remap clicks
        // cannot hammer the provider and silently return the same fallback map every time
        console.error('[curator] gap-gen LLM HTTP', resp.status, '— cooling down for 60s');
        noteLlmFailure();
      }
    } catch (err) {
      console.error('[curator] gap-gen LLM failed, using fallback:', err.message);
      noteLlmFailure();
    }
  }
  // fallback: keyword-based decomposition
  const steps = fallbackGapSteps(identity);
  store.logAiCall(userId, { provider: 'fallback', model: 'heuristic-map', prompt: `aspiration: ${identity.aspiration}`, response: JSON.stringify(steps), meta: { kind: 'gap_generation' } });
  return store.replaceGapSteps(userId, steps);
}

function fallbackGapSteps(identity) {
  const text = `${identity.aspiration || ''} ${identity.domain || ''}`.toLowerCase();
  const readiness = identity.readiness ?? 3;
  const constraint = String(identity.biggest_constraint || '').trim();
  const energy = String(identity.energy || '').trim();
  const timeAvail = String(identity.time_available || '').trim();
  const values = String(identity.values || '').trim();
  const steps = [];
  const push = (title, description, category, prerequisites) => steps.push({ title, description, category, prerequisites });

  // pacing + current-state notes: this is what makes the map visibly respond to edits of
  // readiness / energy / constraint — not just aspiration keywords
  const paceNote = readiness <= 2
    ? 'Your readiness is low, so keep today\'s version tiny — five minutes is enough.'
    : readiness >= 4
      ? 'Your readiness is high, so make today\'s version a real push.'
      : 'Size it so it fits an ordinary day.';
  const constraintNote = constraint ? ` Work inside your biggest constraint — "${truncate(constraint, 60)}".` : '';
  const energyNote = energy ? ` Plan around your energy: ${truncate(energy, 60)}.` : '';
  const timeNote = timeAvail ? ` You said you have ${truncate(timeAvail, 40)} available.` : '';

  // low readiness leads with a gentle step — a visibly different map from the same aspiration
  if (readiness <= 2) {
    push('Rest first, then one micro-step',
      `Your readiness is ${readiness}/5 — low. Do one five-minute micro-version of the first step below, then stop. Showing up is the win today.${constraintNote}${energyNote}`, 'mindset', '');
  }

  if (/(career|work|job|engineer|developer|founder|startup|promot|portfolio|resume|interview|build a business)/.test(text)) {
    push('Clarify your career milestone', 'Define the single concrete role or milestone you want to reach in the next six months — one sentence, specific.', 'mindset', '');
    push('Build proof of one core skill', 'Create one tangible artifact — a project, portfolio piece, or case study — that demonstrates the skill your target role needs.', 'project', 'Milestone is defined');
    push('Sharpen your story', 'Rewrite your resume / LinkedIn / bio so a stranger understands what you deliver within 30 seconds.', 'skill', 'A proof artifact exists');
  }
  if (/(health|fitness|gym|sleep|energy|weight|run|yoga|diet|exercise|wellness|meditat)/.test(text)) {
    push('Lock a daily movement habit', 'Start with ten minutes of movement every day — a walk, a stretch, or the gym. Consistency over intensity.', 'habit', '');
    push('Fix one sleep lever', 'Pick one change — bedtime, screen-off time, caffeine cut-off — that improves your sleep this week.', 'habit', '');
    push('Plan real meals', 'Spend 30 minutes planning or prepping meals for the week so healthy choices become the easy choice.', 'habit', '');
  }
  if (/(money|financ|save|invest|debt|budget|income|wealth|side hustle|earn)/.test(text)) {
    push('Track your spending for a week', 'Write down every expense for seven days. Awareness comes before change.', 'habit', '');
    push('Set up automatic savings', 'Automate a small transfer to savings or investments the day you get paid.', 'action', 'Spending is tracked for a week');
    push('Write your one-year financial goal', 'Put a specific number and timeline on what financial freedom means to you.', 'mindset', '');
  }
  if (/(learn|study|skill|course|read|book|exam|academ|language|knowledge|master)/.test(text)) {
    push('Build a daily deep-work block', 'Schedule one 25-minute focused block every day for your most important learning.', 'habit', '');
    push('Summarize in your own words', 'After each learning session, write three bullet points of what you understood — this cements it.', 'skill', 'Deep-work block is running');
    push('Teach someone what you learned', 'Explain this week\'s topic to a friend or in a short written note. Teaching reveals the gaps.', 'skill', 'Two weeks of deep work');
  }
  if (/(disciplin|focus|procrastin|habit|routine|willpower|consisten|organi|self.?control)/.test(text)) {
    push('Pick one keystone habit', 'Choose the single habit that pulls everything else along, and design its daily trigger.', 'habit', '');
    push('Design your environment for focus', 'Remove one distraction from your workspace today — phone, notifications, clutter.', 'action', '');
    push('Start a done-list', 'Every evening, list what you actually finished. It builds momentum and self-trust.', 'habit', '');
  }
  if (/(relation|friend|family|partner|love|social|communicat|listen|parent|network)/.test(text)) {
    push('Reach out to one person', 'Message or call one person you care about whom you have not connected with recently.', 'action', '');
    push('Plan one real conversation', 'Schedule a no-phone conversation where you ask questions and actually listen.', 'skill', '');
    push('Repair or deepen one bond', 'Identify one relationship that needs attention and take one honest step toward it.', 'mindset', '');
  }
  if (/(creativ|art|write|music|design|draw|paint|video|content|invent|make things|build things)/.test(text)) {
    push('Create a daily output ritual', 'Make one small thing every day — a page, a sketch, a clip. Volume before polish.', 'habit', '');
    push('Collect ten references', 'Gather ten examples of work you admire and note what makes each one work.', 'resource', '');
    push('Finish one small piece', 'Complete one small creative piece from start to end this week. Shipping beats perfecting.', 'project', 'Ritual running for a week');
  }
  if (/(mindset|confidence|self.?esteem|anxiety|fear|belief|mindful|calm|inner|growth|purpose)/.test(text)) {
    push('Name one limiting belief', 'Write down one belief holding you back, and its opposite, more useful version.', 'mindset', '');
    push('Log three small wins tonight', 'Before bed, write three things that went well today — however small.', 'habit', '');
    push('Do one thing that scares you a little', 'Take one small brave action — a message, a question, a share. Size it so you can actually do it.', 'action', '');
  }

  // high readiness closes with a stretch move — visible only when the person is ready for it
  if (readiness >= 4) {
    push('One stretch move',
      `Your readiness is ${readiness}/5 — high. Pick the step on this map that feels hardest and do the slightly bigger version today.${timeNote}`, 'action', 'The gentle steps are in place');
  }

  // values anchored a step to a specific value when the model knows one
  if (values) {
    push('Live one value out loud',
      `Pick one of your values — "${truncate(values, 60)}" — and do one concrete thing today that embodies it.`, 'mindset', '');
  }

  // universal closers — every map gets these
  push('Define your version of success', 'Write three lines about what a successful version of you looks like in twelve months — in your own words.', 'mindset', '');
  push('Run one small experiment', 'Pick one assumption about your growth and test it this week with a tiny experiment.', 'action', 'Your success definition is written');

  // apply the pacing notes to the first step (the gentle lead when readiness is low, else
  // the first domain step) so the same keywords yield a visibly different map for a
  // different current state. The low-readiness lead already carries constraint/energy notes.
  const first = steps[0];
  if (first) {
    // when readiness is low the lead step already says it — don't repeat the pacing note
    const notes = readiness <= 2 ? `${timeNote}`.trim() : `${paceNote}${constraintNote}${energyNote}${timeNote}`.trim();
    first.description = notes ? `${first.description} ${notes}`.trim() : first.description;
  }

  // dedupe by title, cap at 6
  const seen = new Set();
  const unique = [];
  for (const s of steps) {
    const t = s.title.toLowerCase();
    if (!seen.has(t)) { seen.add(t); unique.push(s); }
    if (unique.length >= 6) break;
  }
  return unique;
}

// ---------------- public entry points ----------------

async function curateNextAction(userId, opts = {}) {
  const ctx = buildContext(userId);
  const date = opts.date || localDateStr();

  // LLM first
  const llm = await callLLM(ctx, opts);
  if (llm) {
    store.logAiCall(userId, { provider: llm.provider, model: llm.model, prompt: llm.prompt, response: llm.raw, meta: { kind: 'daily_action', date } });
    return store.insertAction(userId, { date, ...llm.action });
  }

  // fallback
  const fb = fallbackCurate(ctx, opts);
  const action = store.insertAction(userId, {
    date,
    title: fb.action.title,
    kind: fb.action.kind,
    description: fb.action.description,
    why: fb.action.why,
    diversity: fb.action.diversity,
    gapStepId: fb.action.gap_step_id,
  });
  store.logAiCall(userId, {
    provider: 'fallback', model: 'heuristic-curator', prompt: buildCuratorPrompt(ctx, opts),
    response: JSON.stringify(fb.action),
    meta: { kind: 'daily_action', date, mode: fb.mode, reasoning: fb.reasons },
  });
  return action;
}

/** Ensure today's action exists; returns it. */
async function ensureTodayAction(userId) {
  const today = localDateStr();
  const existing = store.getTodayAction(userId, today);
  if (existing) return existing;
  return curateNextAction(userId, { date: today });
}

/** User asked for something different: mark old replaced, curate a new one. */
async function regenerateAction(userId, actionId) {
  const old = store.getActionById(userId, actionId);
  if (!old) return null;
  store.setActionStatus(userId, actionId, 'replaced');
  store.logFeedback(userId, actionId, 'different');
  return curateNextAction(userId, { date: old.action_date, different: true, avoidTitle: old.title });
}

module.exports = { curateNextAction, ensureTodayAction, regenerateAction, generateGapSteps, buildContext, fallbackCurate };
