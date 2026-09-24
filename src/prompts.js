// src/prompts.js — LLM prompt builders + fallback content pools
const { shortTitle, shortDate } = require('./util');

const SYSTEM_PROMPT = `You are Ascend, a calm, warm, deeply insightful personal-growth curator. You help ONE person become the person they imagine becoming — in any domain of life they choose (career, health, mindset, creativity, relationships, discipline, finances, learning, or anything else). You are not a generic recommendation engine; you hold a living "identity model" of this person: their aspiration, values, non-negotiables, current state, a readiness signal, and a gap map of steps between who they are and who they want to be.

Each day you recommend exactly ONE "next best action" for them. It may be a tiny real-world action, a short task, an idea or mindset shift, or a resource. Your choice must follow their gap map, their readiness, and their recent feedback.

Tone: supportive, thoughtful, honest — like a trusted friend-mentor, never a guilt-tripping productivity coach. No pressure, no manipulation. Speak plainly and warmly.

Rules:
- Recommend exactly ONE action. It must be small and doable TODAY given their time and energy.
- Readiness 1-2 means low capacity: favor rest, consolidation, or a tiny mindset step. Readiness 4-5 means a gentle challenge is fine.
- If recent actions were rejected, do not repeat that kind of action.
- About 1 in 6 actions should be a "diversity" action: something outside their usual pattern — an adjacent idea, a contrarian perspective, something they didn't know to ask for (set "diversity": true).
- The "why" MUST reference their specific identity model, gap map, readiness, or feedback. Never generic filler.

Respond ONLY with a JSON object (no markdown, no prose outside it):
{"title": "...", "kind": "action|task|idea|mindset|resource", "description": "1-3 concrete sentences", "why": "2-3 sentences tied to their identity model, gap map, readiness, or recent feedback", "diversity": true|false}`;

function buildCuratorPrompt(ctx, opts = {}) {
  const { identity, gaps, recent, checkins } = ctx;
  const lines = [];

  lines.push('IDENTITY MODEL');
  lines.push(`Aspiration: ${identity.aspiration || '(not set)'}`);
  lines.push(`Domain: ${identity.domain || 'personal growth'}`);
  lines.push(`Values: ${identity.values || '(not set)'}`);
  lines.push(`Non-negotiables: ${identity.non_negotiables || '(not set)'}`);
  lines.push('Current state:');
  lines.push(`- Habits: ${identity.habits || '—'}`);
  lines.push(`- Skill level: ${identity.skill_level || '—'}`);
  lines.push(`- Energy: ${identity.energy || '—'}`);
  lines.push(`- Time available: ${identity.time_available || '—'}`);
  lines.push(`- Biggest constraint: ${identity.biggest_constraint || '—'}`);
  lines.push(`Readiness (1-5): ${identity.readiness}`);

  lines.push('');
  lines.push('GAP MAP (steps toward the aspiration, with status)');
  if (!gaps.length) lines.push('(no steps defined yet)');
  gaps.forEach((g, i) => {
    lines.push(`${i + 1}. [${g.status}] "${g.title}" — ${g.description || ''} (category: ${g.category})`);
  });

  const recentCopy = [...recent].slice(0, 14);
  lines.push('');
  lines.push('RECENT ACTIONS (newest first, with your feedback)');
  if (!recentCopy.length) lines.push('(none yet)');
  recentCopy.forEach((a) => {
    lines.push(`- ${a.action_date} [${a.status}] "${a.title}" (${a.kind}${a.diversity ? ', diversity' : ''})`);
  });

  const checkinsCopy = [...checkins].slice(0, 3);
  lines.push('');
  lines.push('WEEKLY CHECK-INS (most recent first)');
  if (!checkinsCopy.length) lines.push('(none yet)');
  checkinsCopy.forEach((c) => {
    lines.push(`- Week of ${shortDate(c.week_start)}: rating ${c.rating}/5${c.energy ? `, energy ${c.energy}/5` : ''} — "${c.note || ''}"`);
  });

  lines.push('');
  lines.push('CURATION INSTRUCTION FOR TODAY');
  lines.push(`- Today's date: ${shortDate(opts.date)}`);
  if (opts.different) {
    lines.push(`- IMPORTANT: The user asked for something DIFFERENT from the last action "${opts.avoidTitle || ''}". Your action must be clearly different in kind and content.`);
  }
  if (opts.forceDiversity) {
    lines.push('- IMPORTANT: Surface something genuinely outside the user\'s usual pattern (diversity injection requested).');
  }
  lines.push('- Return the single best next action as JSON.');

  return lines.join('\n');
}

function buildGapGeneratorPrompt(identity) {
  return [
    'The person below wants to become something specific. Break the distance between who they are and who they want to be into 3-6 small, concrete gap-closure steps.',
    '',
    `Aspiration: ${identity.aspiration || '(not set)'}`,
    `Domain: ${identity.domain || 'personal growth'}`,
    `Values: ${identity.values || '(not set)'}`,
    `Non-negotiables: ${identity.non_negotiables || '(not set)'}`,
    'Current state:',
    `- Habits: ${identity.habits || '—'}`,
    `- Skill level: ${identity.skill_level || '—'}`,
    `- Energy: ${identity.energy || '—'}`,
    `- Time available: ${identity.time_available || '—'}`,
    `- Biggest constraint: ${identity.biggest_constraint || '—'}`,
    `Readiness: ${identity.readiness}/5`,
    '',
    'Each step must be small, achievable in days/weeks, and specific to THIS person and domain. Vary the categories (habit, skill, project, mindset, resource, growth). Include prerequisites as short text when a step builds on another.',
    'CRITICAL — the map must respond to the CURRENT STATE, not just the aspiration:',
    '- Low readiness (1-2): lead with a gentle, tiny step and say so in its description.',
    '- High readiness (4-5): include one deliberately bigger stretch step.',
    '- Size steps around the biggest constraint, energy and time available.',
    '- If values or non-negotiables are set, anchor at least one step to a specific value.',
    '- If the same aspiration is remapped with a different current state, the steps MUST change accordingly — never return a generic map.',
    '',
    'Respond ONLY with a JSON object: {"steps": [{"title": "...", "description": "...", "category": "habit|skill|project|mindset|resource|growth", "prerequisites": ""}]}',
  ].join('\n');
}

/** Safely extract a JSON object from an LLM reply */
function extractJson(content) {
  if (!content) return null;
  const trimmed = content.trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* fall through */ }
  }
  return null;
}

// ---------------- fallback content pools ----------------

const RECOVERY_ACTIONS = [
  {
    title: 'Rest deliberately',
    kind: 'mindset',
    description: 'Do nothing productive for 20 minutes. No phone, no guilt — sit with a warm drink, stare out a window, or lie still. Rest is a skill, and today it is your task.',
    why: 'You are running on low capacity right now. Forcing another push would borrow from tomorrow, so Ascend is prescribing recovery instead of productivity.',
  },
  {
    title: 'The two-minute re-entry',
    kind: 'action',
    description: 'Pick the ONE thing you are avoiding, and spend just two minutes on it. Set a timer. That is it — momentum, not completion.',
    why: 'When energy is low, the gap between "thinking about it" and "starting it" is the real enemy. Two minutes rebuilds the loop without demanding much of you today.',
  },
  {
    title: 'Name the drain',
    kind: 'mindset',
    description: 'Write down the one thing draining your energy right now, then one tiny way to remove or shrink it tomorrow. One sentence each is enough.',
    why: 'Your biggest constraint is what you told us — this is a gentle way to make it smaller instead of fighting it.',
  },
  {
    title: 'One completed micro-loop',
    kind: 'action',
    description: 'Finish one tiny task today: reply to that message, clear your desk, close a dozen tabs. Completion breeds completion.',
    why: 'A single finished thing resets your sense of agency, which matters more than volume on a low-readiness day.',
  },
];

const DIVERSITY_ACTIONS = [
  {
    title: 'Read something you disagree with',
    kind: 'idea',
    description: 'Find one article or essay arguing the opposite of a belief you hold about your own growth. Read it for five minutes and notice what it stirs in you.',
    why: 'You have been consistent lately, which is great — and exactly why Ascend is injecting a contrarian angle. Identities harden when they only ever hear themselves echoed.',
    diversity: true,
  },
  {
    title: 'The "who already is this?" question',
    kind: 'idea',
    description: 'Pick one real person who already embodies the identity you want. Ask: what does an average week look like for them? Borrow one concrete detail for your own week.',
    why: 'You described the person you want to become, but not the texture of their ordinary days. This fills that gap with something specific rather than abstract.',
    diversity: true,
  },
  {
    title: 'Do less, on purpose',
    kind: 'mindset',
    description: 'Look at your week and remove one commitment that does not serve who you are becoming. Not reschedule — remove.',
    why: 'Growth is usually framed as adding things. This is the adjacent move: subtraction is often the highest-leverage step, and it is the one you did not ask for.',
    diversity: true,
  },
  {
    title: 'Attention audit',
    kind: 'action',
    description: 'Set a five-minute timer and list everything your attention touched today. Circle the three things that mattered. Notice what the rest was doing there.',
    why: 'Your constraint is what you told us — this turns that vague pressure into a concrete, non-judgmental picture you can actually see.',
    diversity: true,
  },
  {
    title: 'Write the counter-identity',
    kind: 'idea',
    description: 'Draft three lines about the person you would become if your current constraints were allowed to win. Then notice which of those lines you do not actually believe.',
    why: 'Often the fear that drives us is vaguer and older than reality. Naming it makes it smaller, and gives your aspiration something sharp to contrast against.',
    diversity: true,
  },
  {
    title: 'Steal from an unlikely field',
    kind: 'resource',
    description: 'Spend ten minutes with a resource from a field unrelated to yours — cooking, running, chess, poetry, gardening. Extract one principle you can borrow.',
    why: 'Adjacent ideas are where breakthroughs hide. Your domain has a vocabulary that is too familiar to surprise you anymore; another field will.',
    diversity: true,
  },
];

const PLATEAU_ACTIONS = [
  {
    title: 'Deepen one completed step',
    kind: 'task',
    description: 'Every step on your map is done. Pick the one that mattered most and go one level deeper: a harder version, a real artifact, or a conversation about it.',
    why: 'You have closed the gaps you mapped. The next layer of growth is depth, not breadth — choosing one thing to master is the honest next move.',
  },
  {
    title: 'Redraw the map',
    kind: 'idea',
    description: 'Your gap map is complete. Write two or three new steps that represent the next layer of who you are becoming — then add them in your Identity page.',
    why: 'The aspiration is still bigger than the current version of you. A finished map is not the end; it is permission to draw a more ambitious one.',
  },
  {
    title: 'Practice the identity, quietly',
    kind: 'mindset',
    description: 'Today, live one small moment as the person you have been building toward — not for anyone, just for you. Notice how it feels from the inside.',
    why: 'You have done the work to become this person. Identity is now a daily practice, not a future destination — and it costs nothing to rehearse.',
  },
];

/** Kind-to-category mapping used when turning a gap step into a daily action */
const STEP_KIND = { habit: 'action', skill: 'task', project: 'task', mindset: 'mindset', resource: 'resource', growth: 'action' };

function actionFromGapStep(step, identity) {
  const kind = STEP_KIND[step.category] || 'action';
  const titlePart = shortTitle(step.title, 8);
  let title, description;
  switch (kind) {
    case 'task':
      title = `Make real progress on "${titlePart}"`;
      description = step.description
        ? `${step.description} Work on it in one focused block today — 25 minutes is plenty.`
        : `Spend one focused 25-minute block moving "${step.title}" forward. Choose the smallest next sub-task and do only that.`;
      break;
    case 'mindset':
      title = `Sit with "${titlePart}"`;
      description = step.description
        ? `${step.description} Take five minutes and write what it would mean, concretely, to have this.`
        : `Journal five lines about what "${step.title}" would actually change in your life if it were true tomorrow.`;
      break;
    case 'resource':
      title = `One resource for "${titlePart}"`;
      description = `Spend ${identity.time_available ? 'the time you have today' : '20 minutes'} with one high-quality resource (article, video, chapter) that moves "${step.title}" forward. Save one note from it.`;
      break;
    default:
      title = `The smallest version of "${titlePart}"`;
      description = step.description
        ? `${step.description} Do the smallest version of this today — the version you could do even on a bad day.`
        : `Do the smallest honest version of "${step.title}" today — the version you could still do on a bad day.`;
  }

  let why = `This directly closes a gap on your path to becoming "${shortTitle(identity.aspiration, 9)}" — the step "${step.title}".`;
  if (identity.biggest_constraint) {
    why += ` You told us ${shortTitle(identity.biggest_constraint, 8).toLowerCase()} is your biggest constraint, so this is intentionally sized to fit inside it.`;
  }
  if (identity.readiness >= 4) {
    why += ` Your readiness is high right now, so lean into it if today feels like a stretch day.`;
  } else if (identity.readiness <= 2) {
    why += ` Your readiness is low, so do the tiniest version and stop — showing up is the win today.`;
  }
  return { title, kind, description, why, diversity: false, gap_step_id: step.id };
}

module.exports = {
  SYSTEM_PROMPT, buildCuratorPrompt, buildGapGeneratorPrompt, extractJson,
  RECOVERY_ACTIONS, DIVERSITY_ACTIONS, PLATEAU_ACTIONS, actionFromGapStep,
};
