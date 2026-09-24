// views/auth.js — sign in. Google is the only option (plus the demo profile).
import { API } from '../api.js';
import { esc, toast, spinner } from '../ui.js';

const GOOGLE_LOGO = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>`;

export function renderAuth(app) {
  const params = new URLSearchParams(location.search);
  const errMsg = params.get('error');
  if (errMsg) {
    setTimeout(() => toast(decodeURIComponent(errMsg), 'err'), 150);
    history.replaceState(null, '', location.pathname);
  }

  app.innerHTML = `
  <div class="auth-wrap">
    <div class="auth-panel">
      <div class="auth-brand">
        <div class="brand-mark" aria-hidden="true">▲</div>
        <div>
          <div class="brand-name">Ascend</div>
          <div class="brand-sub">your growth companion</div>
        </div>
      </div>
      <div class="auth-card">
        <h2 class="auth-title">Welcome back</h2>
        <p class="auth-sub">Sign in with Google to continue your practice.</p>
        <a class="btn btn-google btn-block" id="auth-google" href="/api/auth/google" role="button">
          ${GOOGLE_LOGO}<span>Continue with Google</span>
        </a>
        <p class="auth-note" id="auth-google-note" hidden>
          Google sign-in isn't configured on this server yet. Add <code>GOOGLE_CLIENT_ID</code> and
          <code>GOOGLE_CLIENT_SECRET</code> to <code>.env</code> (see README), then restart.
        </p>
        <div class="auth-divider" role="separator">or</div>
        <button class="btn btn-soft btn-block" id="auth-demo" role="button">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Explore with a demo profile
        </button>
      </div>
    </div>
    <div class="auth-hero" role="img" aria-label="Ascend identity loop visualization">
      <div class="auth-hero-inner">
        <div class="eyebrow" style="color:rgba(251,250,245,0.7)">the identity loop</div>
        <h1>Become the person you imagine — one small, chosen action at a time.</h1>
        <p>Ascend holds a living model of who you are and who you want to be, then curates a single next best action every day — across career, health, mindset, creativity, money, or whatever you choose. No feeds. No guilt. Just a thoughtful companion.</p>
        <div class="auth-rings">
          <span class="ring-step"><span class="ring-dot"></span>Sense</span>
          <span class="ring-step"><span class="ring-dot"></span>Model</span>
          <span class="ring-step"><span class="ring-dot"></span>Plan</span>
          <span class="ring-step"><span class="ring-dot"></span>Curate</span>
          <span class="ring-step"><span class="ring-dot"></span>Reflect</span>
          <span class="ring-step"><span class="ring-dot"></span>Adapt</span>
        </div>
      </div>
    </div>
  </div>`;

  API.get('/api/auth/config').then((cfg) => {
    const link = app.querySelector('#auth-google');
    const note = app.querySelector('#auth-google-note');
    if (!cfg?.google?.configured) {
      link.classList.add('disabled');
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      note.hidden = false;
    }
  }).catch(() => { /* keep the button live; the server will explain */ });

  app.querySelector('#auth-demo').onclick = async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.innerHTML = spinner() + ' Building demo profile…';
    try {
      await API.post('/api/auth/demo');
      const me = await fetch('/api/auth/me').then((r) => r.json()).catch(() => null);
      if (!me || !me.user) throw new Error('Session did not stick — please try again');
      location.replace('/');
    } catch (err) {
      toast(err.message, 'err');
      b.disabled = false;
      b.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Explore with a demo profile`;
    }
  };
}
