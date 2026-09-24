// router.js — minimal hash router
const routes = {};
let current = null;

export function route(name, fn) { routes[name] = fn; }

export function go(name) {
  if (location.hash !== `#/${name}`) location.hash = `#/${name}`;
  else navigate(name);
}

function navigate(name) {
  if (current === name) return;
  const fn = routes[name];
  const app = document.getElementById('app');
  if (fn) { fn(app); current = name; }
}

export function initRouter({ fallback }) {
  window.addEventListener('hashchange', () => handleHash(fallback));
  handleHash(fallback);
}

function handleHash(fallback) {
  const name = location.hash.replace(/^#\//, '') || fallback;
  if (routes[name]) navigate(name);
  else navigate(fallback);
}

export function currentRoute() { return current; }
export function setCurrent(n) { current = n; }
