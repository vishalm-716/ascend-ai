// src/util.js — shared helpers
function pad(n) { return String(n).padStart(2, '0'); }

/** Local server date as YYYY-MM-DD */
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date N days ago/forward as YYYY-MM-DD */
function offsetDate(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return localDateStr(d);
}

/** Monday of the week containing the given date (local) */
function mondayOf(d = new Date()) {
  const m = new Date(d);
  const day = m.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  m.setDate(m.getDate() + diff);
  return m;
}

function weekStartStr(d = new Date()) { return localDateStr(mondayOf(d)); }

/** Parse YYYY-MM-DD (local) to a Date at noon to dodge TZ issues */
function parseLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

function daysBetween(a, b) {
  return Math.round((parseLocal(b) - parseLocal(a)) / 86400000);
}

/** Short, human date like "Aug 3" */
function shortDate(dateStr) {
  const d = parseLocal(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function truncate(s, n = 80) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

/** Keep the first ~6 words of a title for copy like "Do the smallest version of X" */
function shortTitle(s, words = 8) {
  if (!s) return '';
  const parts = s.split(/\s+/).filter(Boolean);
  return parts.length <= words ? s : parts.slice(0, words).join(' ') + '…';
}

module.exports = { localDateStr, offsetDate, mondayOf, weekStartStr, parseLocal, daysBetween, shortDate, truncate, shortTitle };
