// api.js — fetch wrapper for the Ascend API
export const API = {
  async request(method, path, body) {
    // the API is live state (identity, gap map, today's thread) — never accept a cached copy
    const opts = { method, headers: {}, cache: 'no-store' };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    if (res.status === 401) {
      // session expired → back to auth
      window.dispatchEvent(new CustomEvent('ascend:unauth'));
      throw new Error('Not signed in');
    }
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error(data?.error || 'Something went wrong');
    return data;
  },
  get: (p) => API.request('GET', p),
  post: (p, b) => API.request('POST', p, b),
  patch: (p, b) => API.request('PATCH', p, b),
  put: (p, b) => API.request('PUT', p, b),
  del: (p) => API.request('DELETE', p),
};
