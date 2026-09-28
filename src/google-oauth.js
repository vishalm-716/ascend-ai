// src/google-oauth.js — Google sign-in (the only login option)
// Standard OAuth2 authorization-code flow against Google's endpoints, using
// Node's global fetch (no extra deps). Credentials come from the environment:
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  (Google Cloud Console → OAuth client)
//   ASCEND_BASE_URL                          (optional: public base URL for the
//                                             redirect URI; defaults to the host
//                                             the request came in on)
const crypto = require('node:crypto');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

const SCOPES = ['openid', 'email', 'profile'];

function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function newState() {
  return crypto.randomBytes(24).toString('hex');
}

// CSRF state is normally verified against a short-lived cookie, but serverless
// browsers can lose/race that cookie (prefetch, double navigation) and then a
// perfectly legitimate sign-in dies. So we also SIGN the state with the client
// secret: if the cookie is gone, a valid signature still proves the state came
// from us. Verify with either mechanism; both together are belt and braces.
function signState(state) {
  return crypto.createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET || 'ascend-dev').update(state).digest('hex').slice(0, 32);
}

/** State param handed to Google: nonce + our signature. */
function signedState(state) {
  return `${state}.${signState(state)}`;
}

/** True if the callback's state is one we issued (cookie match OR valid signature). */
function verifyState(stateParam, cookieValue) {
  if (!stateParam || typeof stateParam !== 'string') return false;
  const dot = stateParam.lastIndexOf('.');
  if (dot > 0) {
    const nonce = stateParam.slice(0, dot);
    const sig = stateParam.slice(dot + 1);
    const expectedSig = signState(nonce);
    if (sig.length === expectedSig.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return true;
  }
  if (cookieValue && cookieValue.length === stateParam.length) {
    return crypto.timingSafeEqual(Buffer.from(stateParam), Buffer.from(cookieValue));
  }
  return false;
}

/** The exact redirect URI Google must be told about: <base>/api/auth/google/callback.
 *  Public HTTPS deployments must speak https here — Google compares this string
 *  byte-for-byte against the redirect URIs registered in the OAuth client. */
function redirectUri(req) {
  let base = process.env.ASCEND_BASE_URL;
  if (!base && req) {
    base = `${req.protocol}://${req.get('host')}`;
  }
  if (!base) base = 'https://localhost:4637';
  // A plain-http base on a public host would never match Google's records, so
  // upgrade any non-local http:// base to https://.
  if (/^http:\/\/\d+\./.test(base) || (/^http:\/\//.test(base) && !/localhost|127\.0\.0\.1/.test(base))) {
    base = base.replace(/^http:\/\//, 'https://');
  }
  return `${base.replace(/\/+$/, '')}/api/auth/google/callback`;
}

/** Consent-screen URL. `state` is verified on the callback to prevent CSRF.
 *  Accepts (nonce, redirectUri) or (nonce, signedState, redirectUri). */
function authUrl(state, signedStateOrRedirectUri, maybeRedirectUri) {
  const stateParam = maybeRedirectUri ? signedStateOrRedirectUri : state;
  const redirectUriStr = maybeRedirectUri || signedStateOrRedirectUri;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUriStr,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state: stateParam,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Exchange the authorization code for tokens. */
async function exchangeCode(code, redirectUriStr) {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUriStr,
    grant_type: 'authorization_code',
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const err = new Error(data.error_description || data.error || `Google token exchange failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Fetch the signed-in user's profile (email, name, picture). */
async function fetchProfile(accessToken) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await res.json().catch(() => ({}));
  if (!res.ok || !profile.email || profile.verified_email === false) throw new Error('Could not read your Google profile');
  return profile; // { id, email, verified_email, name, given_name, picture, locale }
}

module.exports = { isConfigured, newState, signedState, verifyState, redirectUri, authUrl, exchangeCode, fetchProfile };
