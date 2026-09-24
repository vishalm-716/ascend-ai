// server.js — Ascend API server
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');

// A hackathon demo must never die silently. Log and keep serving instead of crashing.
process.on('uncaughtException', (err) => console.error('[server] uncaught exception (continuing):', err));
process.on('unhandledRejection', (reason) => console.error('[server] unhandled rejection (continuing):', reason));
const store = require('./src/store');
const { createSession, authRequired, setSessionCookie, clearSessionCookie } = require('./src/auth');
const googleOAuth = require('./src/google-oauth');
const curator = require('./src/curator');
const metrics = require('./src/metrics');
const { seedDemo } = require('./src/seed');
const { weekStartStr, offsetDate } = require('./src/util');

const app = express();
// PORT=0 or garbage means "pick the default" — some shells export PORT=0 as "unset"
const PORT = Number(process.env.PORT) || 4637;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API responses are live state (identity model, gap map, today's thread) — never let a
// browser or intermediary serve a stale copy. The SPA must always see fresh data.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// cookie parsing
app.use((req, res, next) => {
  const header = req.headers.cookie || '';
  const cookies = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) cookies[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  req.cookies = cookies;
  next();
});

const maskKey = (k) => (k ? k.slice(0, 4) + '…' + k.slice(-4) : '');
const parseId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const badId = (res) => res.status(400).json({ error: 'Invalid id' });

// ---------------- auth (Google is the only sign-in) ----------------

// tells the frontend whether Google sign-in is set up, so it can explain itself
app.get('/api/auth/config', (req, res) => {
  res.json({ google: { configured: googleOAuth.isConfigured() } });
});

// start the Google consent flow
app.get('/api/auth/google', (req, res) => {
  if (!googleOAuth.isConfigured()) {
    return res.status(400).json({ error: 'Google sign-in is not configured yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env' });
  }
  const state = googleOAuth.newState();
  res.cookie('ascend_oauth_state', state, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 10 * 60 * 1000 });
  res.redirect(googleOAuth.authUrl(state, googleOAuth.redirectUri(req)));
});

// Google redirects here after consent
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, state, error: googleError } = req.query;
  const expected = req.cookies?.ascend_oauth_state;
  res.clearCookie('ascend_oauth_state', { path: '/' });
  const fail = (msg) => res.redirect(`/?error=${encodeURIComponent(msg)}`);
  // never reflect the raw Google error string back at the client — fixed messages only
  if (googleError) return fail(googleError === 'access_denied' ? 'Sign-in was cancelled' : 'Sign-in failed');
  const stateOk = Boolean(expected && state && state.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected)));
  if (!code || !stateOk) return fail('Sign-in failed: the request did not match (please try again)');
  try {
    const tokens = await googleOAuth.exchangeCode(code, googleOAuth.redirectUri(req));
    const profile = await googleOAuth.fetchProfile(tokens.access_token);
    const email = String(profile.email || '').trim().toLowerCase();
    if (!email) return fail('Sign-in failed: Google returned no email address');
    const user = store.findOrCreateGoogleUser(email);
    const session = createSession(user.id);
    setSessionCookie(res, session.token, session.expires);
    res.redirect('/');
  } catch (err) {
    console.error('[google-oauth]', err);
    fail(err.message || 'Sign-in failed');
  }
});

app.post('/api/auth/logout', (req, res) => {
  if (req.cookies?.ascend_session) store.deleteSession(req.cookies.ascend_session);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.cookies?.ascend_session;
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const session = store.getSession(token);
  if (!session || new Date(session.expires_at) < new Date()) {
    if (session) store.deleteSession(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  const user = store.getUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const identity = store.getIdentity(user.id);
  res.json({ user: { email: user.email, id: user.id }, hasIdentity: Boolean(identity) });
});

app.post('/api/auth/demo', (req, res) => {
  try {
    const demo = seedDemo();
    const session = createSession(demo.userId);
    setSessionCookie(res, session.token, session.expires);
    res.json({ user: { email: demo.email }, demo: true });
  } catch (err) {
    console.error('[demo]', err);
    res.status(500).json({ error: 'Could not create demo profile' });
  }
});

// ---------------- profile / identity ----------------

app.get('/api/profile', authRequired, async (req, res) => {
  const identity = store.getIdentity(req.userId);
  const settings = store.getUserSettings(req.userId);
  res.json({
    identity,
    gaps: store.getGapSteps(req.userId),
    onboardingComplete: Boolean(identity),
    ai: {
      enabled: Boolean(settings.aiKey || process.env.OPENAI_API_KEY),
      hasKey: Boolean(settings.aiKey),
      envKey: Boolean(process.env.OPENAI_API_KEY),
      model: settings.aiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      maskedKey: settings.aiKey ? maskKey(settings.aiKey) : null,
      baseUrl: settings.aiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    },
    user: { email: store.getUserById(req.userId).email },
  });
});

app.post('/api/onboarding', authRequired, async (req, res) => {
  const fields = req.body || {};
  const required = ['aspiration'];
  for (const k of required) {
    if (!fields[k] || !String(fields[k]).trim()) return res.status(400).json({ error: 'Tell us who you want to become — that is the starting point' });
  }
  const readiness = Math.min(5, Math.max(1, Number(fields.readiness) || 3));
  const identity = store.upsertIdentity(req.userId, {
    aspiration: String(fields.aspiration).trim(),
    domain: String(fields.domain || 'personal growth').trim(),
    values: String(fields.values || '').trim(),
    non_negotiables: String(fields.non_negotiables || '').trim(),
    habits: String(fields.habits || '').trim(),
    skill_level: String(fields.skill_level || '').trim(),
    energy: String(fields.energy || '').trim(),
    time_available: String(fields.time_available || '').trim(),
    biggest_constraint: String(fields.biggest_constraint || '').trim(),
    readiness,
  });
  // the agent maps the aspiration into concrete gap steps
  const gaps = await curator.generateGapSteps(req.userId, identity);
  res.json({ identity, gaps });
});

app.patch('/api/identity', authRequired, (req, res) => {
  const fields = req.body || {};
  const identity = store.upsertIdentity(req.userId, fields);
  res.json({ identity, gaps: store.getGapSteps(req.userId) });
});

// ---------------- gap steps ----------------

app.post('/api/gaps', authRequired, (req, res) => {
  const { title, description, category, prerequisites } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'A step needs a title' });
  const step = store.addGapStep(req.userId, { title: String(title).trim(), description, category, prerequisites });
  res.json({ step });
});

app.patch('/api/gaps/:id', authRequired, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return badId(res);
  const step = store.updateGapStep(req.userId, id, req.body || {});
  if (!step) return res.status(404).json({ error: 'Step not found' });
  res.json({ step });
});

app.delete('/api/gaps/:id', authRequired, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return badId(res);
  store.deleteGapStep(req.userId, id);
  res.json({ ok: true });
});

app.post('/api/gaps/regenerate', authRequired, async (req, res) => {
  const identity = store.getIdentity(req.userId);
  if (!identity) return res.status(400).json({ error: 'Finish onboarding first' });
  // ALWAYS regenerates fresh from the current identity model (aspiration, current state,
  // readiness) — never a cached/stored map. regeneratedAt lets the frontend prove freshness.
  const gaps = await curator.generateGapSteps(req.userId, identity);
  res.json({ gaps, regeneratedAt: new Date().toISOString() });
});

// ---------------- daily actions & feedback ----------------

app.get('/api/today', authRequired, async (req, res) => {
  const identity = store.getIdentity(req.userId);
  if (!identity) return res.status(400).json({ error: 'Finish onboarding first' });
  const action = await curator.ensureTodayAction(req.userId);
  const lastCheckin = store.getLastCheckin(req.userId);
  const checkinDue = !lastCheckin || lastCheckin.week_start !== weekStartStr();
  res.json({ action, identity, checkinDue, lastCheckin, metrics: metrics.computeMetrics(req.userId) });
});

app.post('/api/actions/:id/feedback', authRequired, (req, res) => {
  const { type } = req.body || {};
  const id = parseId(req.params.id);
  if (!id) return badId(res);
  const action = store.getActionById(req.userId, id);
  if (!action) return res.status(404).json({ error: 'Action not found' });
  if (!['done', 'rejected'].includes(type)) return res.status(400).json({ error: 'Invalid feedback type' });
  store.setActionStatus(req.userId, action.id, type);
  store.logFeedback(req.userId, action.id, type);
  res.json({ action: store.getActionById(req.userId, action.id) });
});

app.post('/api/actions/:id/different', authRequired, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return badId(res);
  const action = store.getActionById(req.userId, id);
  if (!action) return res.status(404).json({ error: 'Action not found' });
  const replacement = await curator.regenerateAction(req.userId, action.id);
  if (!replacement) return res.status(500).json({ error: 'Could not curate a replacement' });
  res.json({ action: replacement });
});

app.get('/api/history', authRequired, (req, res) => {
  res.json({ actions: store.getRecentActions(req.userId, 30) });
});

// ---------------- check-ins ----------------

app.get('/api/checkins', authRequired, (req, res) => {
  res.json({ checkins: store.getCheckins(req.userId) });
});

app.post('/api/checkins', authRequired, (req, res) => {
  const { rating, note, energy, readiness } = req.body || {};
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return res.status(400).json({ error: 'Rate your week from 1 to 5' });
  const checkin = store.addCheckin(req.userId, { weekStart: weekStartStr(), rating: r, note: String(note || ''), energy: Number.isInteger(Number(energy)) ? Number(energy) : null });
  // check-in updates the identity model: readiness adapts (explicit value wins, else blended)
  const identity = store.getIdentity(req.userId);
  let newReadiness = identity.readiness;
  if (Number.isInteger(Number(readiness)) && Number(readiness) >= 1 && Number(readiness) <= 5) {
    newReadiness = Number(readiness);
  } else {
    newReadiness = Math.min(5, Math.max(1, Math.round((identity.readiness + r) / 2)));
  }
  store.upsertIdentity(req.userId, { readiness: newReadiness });
  res.json({ checkin, readiness: newReadiness });
});

// ---------------- metrics & curator log ----------------

app.get('/api/metrics', authRequired, (req, res) => {
  res.json(metrics.computeMetrics(req.userId));
});

app.get('/api/curator-log', authRequired, (req, res) => {
  const calls = store.getAiCalls(req.userId, 30).map((c) => ({
    id: c.id, provider: c.provider, model: c.model, created_at: c.created_at,
    meta: (() => { try { return JSON.parse(c.meta || '{}'); } catch { return {}; } })(),
    prompt: c.prompt, response: c.response,
  }));
  res.json({ calls });
});

app.put('/api/settings', authRequired, (req, res) => {
  const { aiKey, aiModel, aiBaseUrl } = req.body || {};
  const patch = {};
  if (typeof aiKey === 'string') patch.aiKey = aiKey.trim();
  if (typeof aiModel === 'string' && aiModel.trim()) patch.aiModel = aiModel.trim();
  if (typeof aiBaseUrl === 'string') patch.aiBaseUrl = aiBaseUrl.trim();
  const settings = store.updateUserSettings(req.userId, patch);
  res.json({
    ai: {
      enabled: Boolean(settings.aiKey || process.env.OPENAI_API_KEY),
      hasKey: Boolean(settings.aiKey),
      model: settings.aiModel || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      maskedKey: settings.aiKey ? maskKey(settings.aiKey) : null,
      baseUrl: settings.aiBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    },
  });
});

// ---------------- health & fallback ----------------

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// SPA fallback (Express 5: no bare '*' route, use a middleware instead)
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Something went wrong' });
});

// ---------------- server bootstrap ----------------
// Local dev: listen on the configured port.
// Vercel (serverless): export `app` so the platform can invoke it as a function.
if (process.env.VERCEL === '1') {
  module.exports = app;
} else {
  const server = app.listen(PORT, () => {
    console.log(`Ascend running → http://localhost:${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT} is already in use — another Ascend instance is running.`);
      console.error(`[server] Stop that instance (or set PORT to a free one) and restart.`);
    } else {
      console.error('[server] listen error:', err);
    }
  });
}

