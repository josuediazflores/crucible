/* Thin fetch wrapper. All endpoints are cookie-authenticated. */
const api = {
  async _json(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    let body = null;
    try { body = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error((body && body.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  },
  meta()                        { return api._json('/api/meta'); },
  signup(payload)               { return api._json('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) }); },
  signin(payload)               { return api._json('/api/auth/signin', { method: 'POST', body: JSON.stringify(payload) }); },
  signout()                     { return api._json('/api/auth/signout', { method: 'POST' }); },
  updateProfile(payload)        { return api._json('/api/user', { method: 'PATCH', body: JSON.stringify(payload) }); },
  changePassword(payload)       { return api._json('/api/user/password', { method: 'POST', body: JSON.stringify(payload) }); },
  githubStatus()                { return api._json('/api/github/status'); },
  githubStart()                 { return api._json('/api/github/start'); },
  githubDemo()                  { return api._json('/api/github/demo', { method: 'POST' }); },
  githubRepos()                 { return api._json('/api/github/repos'); },
  projects()                    { return api._json('/api/projects'); },
  importProjects(repos)         { return api._json('/api/projects', { method: 'POST', body: JSON.stringify({ repos }) }); },
  project(id)                   { return api._json(`/api/projects/${encodeURIComponent(id)}`); },
  rescan(id)                    { return api._json(`/api/projects/${encodeURIComponent(id)}/rescan`, { method: 'POST' }); },
};

window.api = api;
