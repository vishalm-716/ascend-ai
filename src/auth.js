// src/auth.js — password hashing (scrypt) + session tokens + Express middleware
const crypto = require('node:crypto');
const store = require('./store');

const SESSION_TTL_DAYS = 30;
const COOKIE_NAME = 'ascend_session';

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, s, 64).toString('hex');
  return `${s}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  // Google-created users carry a sentinel hash — never crash on it, just fail the check
  if (!salt || !hash || !/^[0-9a-f]+$/i.test(hash)) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createSession(userId) {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000).toISOString();
  store.createSession(userId, token, expires);
  return { token, expires };
}

/** Express middleware: resolves session cookie -> req.userId */
function authRequired(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const session = store.getSession(token);
  if (!session) return res.status(401).json({ error: 'Session expired' });
  if (new Date(session.expires_at) < new Date()) {
    store.deleteSession(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  req.userId = session.user_id;
  req.sessionToken = token;
  next();
}

/** Cookie helpers */
function setSessionCookie(res, token, expires) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 3600 * 1000,
    expires,
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = {
  hashPassword, verifyPassword, createSession, authRequired, setSessionCookie, clearSessionCookie, COOKIE_NAME,
};
