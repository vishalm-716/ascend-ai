// src/store.js — data access layer
const db = require('./db');

const now = () => new Date().toISOString();

/** SQLite-style datetime('now') string (local clock, same format the DB uses). */
function sqliteNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const clampReadiness = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : 3;
};

// ---------- users ----------
const createUser = (email, passwordHash) => {
  const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, passwordHash);
  return { id: Number(r.lastInsertRowid), email };
};

const getUserByEmail = (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email);
const getUserById = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

/** Google is the only sign-in: find the user by email, or create them (no password). */
const findOrCreateGoogleUser = (email) => {
  const existing = getUserByEmail(email);
  if (existing) return existing;
  return createUser(email, 'google-oauth:no-password');
};
const updateUserSettings = (userId, settings) => {
  const u = getUserById(userId);
  const clean = {};
  for (const [k, v] of Object.entries(settings)) if (v !== undefined) clean[k] = v;
  const merged = { ...JSON.parse(u.settings || '{}'), ...clean };
  db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(merged), userId);
  return merged;
};
const getUserSettings = (userId) => JSON.parse(getUserById(userId).settings || '{}');
const deleteUser = (userId) => { db.prepare('DELETE FROM users WHERE id = ?').run(userId); };

// ---------- sessions ----------
const createSession = (userId, token, expiresAt) => {
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
};
const getSession = (token) => db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
const deleteSession = (token) => { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); };
const deleteSessionsForUser = (userId) => { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId); };

// ---------- identity model ----------
const getIdentity = (userId) => db.prepare('SELECT * FROM identity_models WHERE user_id = ?').get(userId);

const upsertIdentity = (userId, fields) => {
  const existing = getIdentity(userId);
  const data = {
    aspiration: fields.aspiration ?? existing?.aspiration ?? '',
    domain: fields.domain ?? existing?.domain ?? 'personal growth',
    values: fields.values ?? existing?.values ?? '',
    non_negotiables: fields.non_negotiables ?? existing?.non_negotiables ?? '',
    habits: fields.habits ?? existing?.habits ?? '',
    skill_level: fields.skill_level ?? existing?.skill_level ?? '',
    energy: fields.energy ?? existing?.energy ?? '',
    time_available: fields.time_available ?? existing?.time_available ?? '',
    biggest_constraint: fields.biggest_constraint ?? existing?.biggest_constraint ?? '',
    readiness: clampReadiness(fields.readiness ?? existing?.readiness ?? 3),
  };
  if (existing) {
    db.prepare(`UPDATE identity_models SET
      aspiration = ?, domain = ?, "values" = ?, non_negotiables = ?, habits = ?, skill_level = ?,
      energy = ?, time_available = ?, biggest_constraint = ?, readiness = ?, updated_at = ?
      WHERE user_id = ?`)
      .run(data.aspiration, data.domain, data.values, data.non_negotiables, data.habits,
        data.skill_level, data.energy, data.time_available, data.biggest_constraint, data.readiness, now(), userId);
  } else {
    db.prepare(`INSERT INTO identity_models
      (user_id, aspiration, domain, "values", non_negotiables, habits, skill_level, energy,
       time_available, biggest_constraint, readiness)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, data.aspiration, data.domain, data.values, data.non_negotiables, data.habits,
        data.skill_level, data.energy, data.time_available, data.biggest_constraint, data.readiness);
  }
  return getIdentity(userId);
};

// ---------- gap steps ----------
const getGapSteps = (userId) =>
  db.prepare('SELECT * FROM gap_steps WHERE user_id = ? ORDER BY position ASC, id ASC').all(userId);

const addGapStep = (userId, { title, description, category, prerequisites, position }) => {
  const r = db.prepare(
    'INSERT INTO gap_steps (user_id, title, description, category, prerequisites, position) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, title, description, category || 'growth', prerequisites || '', position ?? 999);
  return db.prepare('SELECT * FROM gap_steps WHERE id = ?').get(Number(r.lastInsertRowid));
};

const updateGapStep = (userId, id, fields) => {
  const existing = db.prepare('SELECT * FROM gap_steps WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return null;
  const status = fields.status ?? existing.status;
  // completed_at only moves when the status actually changes (plain edits keep it)
  let completedAt = existing.completed_at;
  if (status !== existing.status) {
    completedAt = status === 'done' ? sqliteNow() : null;
  }
  db.prepare('UPDATE gap_steps SET title = ?, description = ?, category = ?, prerequisites = ?, status = ?, completed_at = ? WHERE id = ?')
    .run(fields.title ?? existing.title, fields.description ?? existing.description,
      fields.category ?? existing.category, fields.prerequisites ?? existing.prerequisites,
      status, completedAt, id);
  return db.prepare('SELECT * FROM gap_steps WHERE id = ?').get(id);
};

const deleteGapStep = (userId, id) => {
  db.prepare('DELETE FROM gap_steps WHERE id = ? AND user_id = ?').run(id, userId);
};
const replaceGapSteps = (userId, steps) => {
  db.prepare('DELETE FROM gap_steps WHERE user_id = ?').run(userId);
  steps.forEach((s, i) => addGapStep(userId, { ...s, position: i }));
  return getGapSteps(userId);
};

// ---------- daily actions ----------
const getActionById = (userId, id) =>
  db.prepare('SELECT * FROM daily_actions WHERE id = ? AND user_id = ?').get(id, userId);

const getTodayAction = (userId, date) =>
  db.prepare('SELECT * FROM daily_actions WHERE user_id = ? AND action_date = ? ORDER BY id DESC LIMIT 1')
    .get(userId, date);

const getRecentActions = (userId, limit = 14) =>
  db.prepare('SELECT * FROM daily_actions WHERE user_id = ? ORDER BY action_date DESC, id DESC LIMIT ?')
    .all(userId, limit);

const getActionsBetween = (userId, from, to) =>
  db.prepare('SELECT * FROM daily_actions WHERE user_id = ? AND action_date >= ? AND action_date <= ? ORDER BY action_date ASC, id ASC')
    .all(userId, from, to);

const insertAction = (userId, { date, title, kind, description, why, diversity, gapStepId }) => {
  const r = db.prepare(
    'INSERT INTO daily_actions (user_id, action_date, title, kind, description, why, diversity, gap_step_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, date, title, kind, description, why, diversity ? 1 : 0, gapStepId ?? null);
  return getActionById(userId, Number(r.lastInsertRowid));
};

const setActionStatus = (userId, id, status) => {
  db.prepare('UPDATE daily_actions SET status = ? WHERE id = ? AND user_id = ?').run(status, id, userId);
};

// ---------- feedback ----------
const logFeedback = (userId, actionId, type) => {
  db.prepare('INSERT INTO feedback_log (user_id, action_id, type) VALUES (?, ?, ?)').run(userId, actionId, type);
};

// ---------- check-ins ----------
const addCheckin = (userId, { weekStart, rating, note, energy }) => {
  const r = db.prepare(
    'INSERT INTO checkins (user_id, week_start, rating, note, energy) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, weekStart, rating, note, energy ?? null);
  return db.prepare('SELECT * FROM checkins WHERE id = ?').get(Number(r.lastInsertRowid));
};

const getCheckins = (userId) =>
  db.prepare('SELECT * FROM checkins WHERE user_id = ? ORDER BY week_start DESC').all(userId);

const getLastCheckin = (userId) =>
  db.prepare('SELECT * FROM checkins WHERE user_id = ? ORDER BY week_start DESC LIMIT 1').get(userId);

// ---------- AI call log ----------
const logAiCall = (userId, { provider, model, prompt, response, meta }) => {
  const r = db.prepare(
    'INSERT INTO ai_calls (user_id, provider, model, prompt, response, meta) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, provider, model ?? null, prompt ?? null, response ?? null, meta ? JSON.stringify(meta) : null);
  return Number(r.lastInsertRowid);
};

const getLatestAiCall = (userId) =>
  db.prepare('SELECT * FROM ai_calls WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);

const getAiCalls = (userId, limit = 30) =>
  db.prepare('SELECT * FROM ai_calls WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);

module.exports = {
  createUser, getUserByEmail, getUserById, findOrCreateGoogleUser, updateUserSettings, getUserSettings, deleteUser,
  createSession, getSession, deleteSession, deleteSessionsForUser,
  getIdentity, upsertIdentity,
  getGapSteps, addGapStep, updateGapStep, deleteGapStep, replaceGapSteps,
  getActionById, getTodayAction, getRecentActions, getActionsBetween, insertAction, setActionStatus,
  logFeedback,
  addCheckin, getCheckins, getLastCheckin,
  logAiCall, getLatestAiCall, getAiCalls,
};
