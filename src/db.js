// src/db.js — SQLite connection + schema (uses Node's built-in node:sqlite)
// SQLite needs a WRITABLE filesystem. Locally this defaults to <repo>/data/ascend.db.
// On Vercel's serverless runtime the project filesystem is read-only (only /tmp is
// writable), so we fall back to a writable path there — data persists across warm
// invocations within a function instance, which is enough for a hackathon demo.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// SQLite needs a WRITABLE filesystem. On Vercel's serverless runtime the project
// filesystem is READ-ONLY (only /tmp is writable), so we use the OS temp dir there
// which is guaranteed writable and cross-platform (Linux: /tmp, Windows: C:\\Temp).
// Locally this defaults to <repo>/data/ascend.db.
const DB_FILE = process.env.ASCEND_DB ||
  (process.env.VERCEL === '1' || process.env.VERCEL_URL
    ? path.join(os.tmpdir(), 'ascend.db')
    : path.resolve(__dirname, '..', 'data', 'ascend.db'));

// Ensure the parent directory of the DB file exists and is writable before opening.
const DB_DIR = path.dirname(DB_FILE);
try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (e) { /* dir may already exist */ }

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  settings      TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_models (
  user_id            INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  aspiration         TEXT NOT NULL DEFAULT '',
  domain             TEXT NOT NULL DEFAULT 'personal growth',
  "values"          TEXT NOT NULL DEFAULT '',
  non_negotiables    TEXT NOT NULL DEFAULT '',
  habits             TEXT NOT NULL DEFAULT '',
  skill_level        TEXT NOT NULL DEFAULT '',
  energy             TEXT NOT NULL DEFAULT '',
  time_available     TEXT NOT NULL DEFAULT '',
  biggest_constraint TEXT NOT NULL DEFAULT '',
  readiness          INTEGER NOT NULL DEFAULT 3,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gap_steps (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'growth',
  prerequisites  TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending',
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at   TEXT
);

CREATE TABLE IF NOT EXISTS daily_actions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_date TEXT NOT NULL,
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'action',
  description TEXT NOT NULL DEFAULT '',
  why         TEXT NOT NULL DEFAULT '',
  diversity   INTEGER NOT NULL DEFAULT 0,
  gap_step_id INTEGER,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_id  INTEGER NOT NULL,
  type       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS checkins (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  rating     INTEGER NOT NULL,
  note       TEXT NOT NULL DEFAULT '',
  energy     INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_calls (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  model      TEXT,
  prompt     TEXT,
  response   TEXT,
  meta       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_actions_user_date ON daily_actions(user_id, action_date);
CREATE INDEX IF NOT EXISTS idx_gap_steps_user ON gap_steps(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_calls_user ON ai_calls(user_id);
`);

module.exports = db;
