# Ascend ▲

**An agentic AI curator for personal growth and self-transformation.**

Ascend helps any individual become the person they imagine becoming — in **any** area of
life they choose: career, health, mindset, creativity, relationships, discipline,
finances, learning, or anything else the user defines. It is not limited to one domain.

Most platforms optimize for attention. Ascend optimizes for human potential: it holds a
living, **editable** identity model of who you are and who you want to be, then curates
**one next-best action per day** — with a "why" tied to your specific gap map, readiness,
and recent feedback.

---

## The Identity Loop

```
Sense → Model → Plan → Curate → Deliver → Reflect → Adapt
```

| Phase | Where | What happens |
|---|---|---|
| **Sense** | Onboarding wizard | "Who do you want to become?" + habits, energy, time, constraint, values, readiness |
| **Model** | Identity page | Editable aspirational self, current state, readiness — **not a black box** |
| **Plan + Curate** | AI Curator Agent | One next-best action per day from identity model + recent feedback; occasional **diversity injection** (an adjacent idea you didn't ask for) |
| **Deliver** | Daily dashboard | Today's action + "why", progress visuals, Mark done / Not useful / Give me something different |
| **Reflect + Adapt** | Weekly check-in | 1–5 rating + note → updates identity model, gap map, readiness → tomorrow's thread adapts |
| **North-star metrics** | Progress page | Goal progress, habit consistency, usefulness rate (rejection = signal), gap-closure trend over weeks |

## Tech stack

- **Backend:** Node.js 22+, Express 5, built-in `node:sqlite` (zero native deps)
- **Auth:** Google OAuth 2.0 is the **only** sign-in option; httpOnly session cookies
- **Frontend:** vanilla ES-module SPA, hand-rolled SVG charts, zero build step
- **AI:** OpenAI-compatible chat-completions call (works with OpenAI, Groq, DeepSeek,
  Ollama, LM Studio…) with a **transparent heuristic curator fallback** so the app is
  fully functional even with no API key

## Run it

```bash
cd ascend
npm install
npm start          # → http://localhost:4637
```

> The shell may export `PORT` — if the app prints a different port, open that one.

### Optional: connect a real LLM

Two ways (the built-in curator works without either):

1. **Env vars** — copy `.env.example` to `.env` and fill in:
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_BASE_URL=https://api.openai.com/v1
   OPENAI_MODEL=gpt-4o-mini
   ```
2. **In-app** — open ⚙ Settings and paste any OpenAI-compatible key + model + base URL.
   The key is stored in your user settings and used for daily curation and gap-map
   generation. Every call is logged in the **🧠 curator log** (with the raw prompt and
   output) so you can demo the agentic flow.

### Sign in with Google (the only login)

1. [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services →
   Credentials → Create credentials → OAuth client ID → Web application**.
2. Add an **Authorized redirect URI** that matches exactly:
   `http://localhost:4637/api/auth/google/callback` (use your actual port — or set
   `ASCEND_BASE_URL` to your public URL when deployed).
3. Copy `.env.example` to `.env` and fill in `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, then restart.

The login screen shows **"Continue with Google"**; if credentials are missing it says so
and dims the button instead of breaking.

### Demo

Click **"Explore with a demo profile"** on the login screen — it seeds a rich profile
with ~3 weeks of history, gap steps, check-ins, and metrics so judges see a living loop
immediately, no Google account needed. Or sign in with Google and walk the real
onboarding.

> Security note for judges: the optional API key is stored (masked in every response)
> inside the local SQLite database — fine for a hackathon demo, not for production.

## Project structure

```
ascend/
  server.js              Express server + all API routes
  src/
    db.js                SQLite connection + schema
    store.js             data access layer
    auth.js              scrypt hashing, sessions, middleware
    curator.js           the AI Curator Agent (LLM + fallback, gap-map generation)
    prompts.js           LLM prompt builders + fallback content pools
    metrics.js           north-star metrics computation
    seed.js              demo profile
    util.js              date/string helpers
  public/
    index.html           SPA shell
    css/styles.css       calm, warm design system
    js/                  ES-module frontend (api, ui, charts, router, views)
  data/ascend.db         SQLite database (created at runtime)
```

## API surface (key endpoints)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/google` (+ `/callback`), `/api/auth/config`, POST `/api/auth/demo` | auth |
| GET | `/api/profile` | identity model + gaps + AI settings |
| POST | `/api/onboarding` | create identity model **and** generate gap map |
| PATCH | `/api/identity` | edit the identity model |
| POST / PATCH / DELETE | `/api/gaps…` | gap map CRUD |
| GET | `/api/today` | ensure + return today's curated action |
| POST | `/api/actions/:id/feedback` | done / not useful |
| POST | `/api/actions/:id/different` | regenerate today's action |
| POST | `/api/checkins` | weekly reflection → adapts readiness |
| GET | `/api/metrics`, `/api/curator-log` | north-star metrics, AI reasoning log |
