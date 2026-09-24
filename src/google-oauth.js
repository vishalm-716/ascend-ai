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

/** The exact redirect URI Google must be told about: <base>/api/auth/google/callback */
function redirectUri(req) {
  const base = (process.env.ASCEND_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return `${base}/api/auth/google/callback`;
}

/** Consent-screen URL. `state` is verified on the callback to prevent CSRF. */
function authUrl(state, redirectUriStr) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUriStr,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
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

module.exports = { isConfigured, newState, redirectUri, authUrl, exchangeCode, fetchProfile };
