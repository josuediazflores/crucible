require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const {
  createUser, verifyPassword, startSession, destroySession,
  setSessionCookie, clearSessionCookie, requireAuth, attachUser, COOKIE
} = require('./auth');
const gh = require('./github');
const pipeline = require('./pipeline');
const claudeAgent = require('./claudeAgent');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(attachUser);

// ---- API: meta ------------------------------------------------------------
app.get('/api/meta', (req, res) => {
  res.json({
    ok: true,
    user: req.user || null,
    github_configured: gh.isConfigured(),
    has_claude_agent: claudeAgent.isConfigured(),
    claude_agent_auth: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'oauth' : (process.env.ANTHROPIC_API_KEY ? 'api_key' : 'none'),
    has_openrouter: !!process.env.OPENROUTER_API_KEY,
    adal_cmd: process.env.ADAL_CMD || 'adal',
    challengers: (process.env.CHALLENGER_MODELS ||
      'anthropic/claude-haiku-4-5,openai/gpt-4o-mini,google/gemini-2.0-flash-001,meta-llama/llama-3.1-8b-instruct,mistralai/mistral-small').split(',').map(s => s.trim())
  });
});

// ---- API: auth ------------------------------------------------------------
app.post('/api/auth/signup', (req, res) => {
  try {
    const u = createUser(req.body || {});
    const { token, expires } = startSession(u.id);
    setSessionCookie(res, token, expires);
    res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/signin', (req, res) => {
  try {
    const u = verifyPassword(req.body || {});
    const { token, expires } = startSession(u.id);
    setSessionCookie(res, token, expires);
    res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email } });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/signout', requireAuth, (req, res) => {
  destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---- API: github ----------------------------------------------------------
app.get('/api/github/status', requireAuth, (req, res) => {
  const acct = gh.getAccount(req.user.id);
  res.json({
    configured: gh.isConfigured(),
    connected: !!acct,
    account: acct ? { login: acct.login, avatar_url: acct.avatar_url, demo: !!acct.is_demo } : null
  });
});

app.get('/api/github/start', requireAuth, (req, res) => {
  if (!gh.isConfigured()) {
    return res.status(400).json({ error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env, or use the demo flow.' });
  }
  const state = gh.newState(req.user.id);
  res.json({ url: gh.buildAuthorizeUrl(state) });
});

app.post('/api/github/demo', requireAuth, (req, res) => {
  gh.storeDemoAccount(req.user.id, req.user.email);
  res.json({ ok: true, account: gh.getAccount(req.user.id) });
});

app.get('/api/github/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code/state');
  const userId = gh.consumeState(state);
  if (!userId) return res.status(400).send('Invalid or expired state. Try again from the app.');
  try {
    const tokenResp = await gh.exchangeCodeForToken(code);
    const viewer = await gh.getViewer(tokenResp.access_token);
    gh.storeAccount(userId, viewer, tokenResp.access_token, tokenResp.scope || '');
    res.redirect('/?gh=connected');
  } catch (e) {
    console.error('OAuth callback failed:', e);
    res.status(500).send('OAuth failed: ' + e.message);
  }
});

app.get('/api/github/repos', requireAuth, async (req, res) => {
  const repos = await gh.listReposForUser(req.user.id);
  if (!repos) return res.status(400).json({ error: 'Connect GitHub first.' });
  res.json({ repos });
});

// ---- API: projects --------------------------------------------------------
app.get('/api/projects', requireAuth, (req, res) => {
  const rows = db.prepare(`SELECT * FROM projects WHERE user_id = ? ORDER BY connected_at DESC`).all(req.user.id);
  res.json({ projects: rows.map(rowToProject) });
});

app.post('/api/projects', requireAuth, (req, res) => {
  const { repos } = req.body || {};
  if (!Array.isArray(repos) || !repos.length) return res.status(400).json({ error: 'No repos given.' });
  const acct = gh.getAccount(req.user.id);
  const now = Date.now();
  const ins = db.prepare(`INSERT OR REPLACE INTO projects
    (id, user_id, owner, name, full_name, default_branch, lang, stars, last_push, clone_url, is_demo,
     stage, progress, files_scanned, ai_callsites, distinct_models, status_text, error, connected_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, ?, NULL, ?, ?)`);
  const out = [];
  for (const r of repos) {
    const fullName = r.full_name || `${r.owner}/${r.name}`;
    const id = `${req.user.id}/${fullName}`.toLowerCase().replace(/[^a-z0-9/_.-]/g, '-');
    ins.run(
      id, req.user.id, r.owner, r.name, fullName,
      r.default_branch || 'main', r.lang || 'Unknown', r.stars || 0,
      r.lastPush || 'recently', r.clone_url || null,
      (acct?.is_demo || !r.clone_url) ? 1 : 0,
      'Queued for probing…', now, now
    );
    out.push(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
  }
  res.json({ projects: out.map(rowToProject) });
});

app.get('/api/projects/:id', requireAuth, (req, res) => {
  const p = getProject(req.user.id, req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const callsites = db.prepare('SELECT * FROM callsites WHERE project_id = ? ORDER BY id').all(p.id);
  const events = db.prepare('SELECT * FROM scan_events WHERE project_id = ? ORDER BY id DESC LIMIT 40').all(p.id);
  const evals = db.prepare('SELECT * FROM evaluations WHERE project_id = ? ORDER BY id').all(p.id).map(rowToEval);
  res.json({
    project: rowToProject(p),
    callsites,
    events: events.reverse(),
    evaluations: evals,
  });
});

app.post('/api/projects/:id/rescan', requireAuth, (req, res) => {
  const p = getProject(req.user.id, req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM callsites WHERE project_id = ?').run(p.id);
  db.prepare('DELETE FROM scan_events WHERE project_id = ?').run(p.id);
  db.prepare('DELETE FROM evaluations WHERE project_id = ?').run(p.id);
  db.prepare(`UPDATE projects SET stage=0, progress=0, files_scanned=0, ai_callsites=0,
    distinct_models=0, status_text='Queued for probing…', error=NULL, updated_at=? WHERE id=?`)
    .run(Date.now(), p.id);
  res.json({ ok: true });
});

// ---- helpers --------------------------------------------------------------
function getProject(userId, id) {
  return db.prepare('SELECT * FROM projects WHERE user_id = ? AND id = ?').get(userId, id);
}
function rowToProject(p) {
  return {
    id: p.id,
    owner: p.owner,
    name: p.name,
    fullName: p.full_name,
    defaultBranch: p.default_branch,
    lang: p.lang,
    stars: p.stars,
    lastPush: p.last_push,
    isDemo: !!p.is_demo,
    stage: p.stage,
    progress: p.progress,
    statusText: p.status_text,
    error: p.error,
    findings: {
      files: p.files_scanned,
      aiCalls: p.ai_callsites,
      models: p.distinct_models,
    },
    connectedAt: p.connected_at,
    updatedAt: p.updated_at,
  };
}
function rowToEval(e) {
  return {
    id: e.id,
    title: e.title,
    callsite: e.callsite_label,
    currentModel: e.current_model,
    challengers: JSON.parse(e.challengers || '[]'),
    metric: e.metric,
    testCount: e.test_count,
    drafted: !!e.drafted,
    progress: e.progress,
    status: e.status,
    winner: e.winner,
    passRate: e.pass_rate,
    savingsPct: e.savings_pct,
  };
}

// ---- Static frontend ------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = Number(process.env.PORT) || 4317;
app.listen(PORT, () => {
  console.log(`\n  🔥  Crucible running at http://localhost:${PORT}\n`);
  console.log(`     github oauth:  ${gh.isConfigured() ? 'configured' : 'NOT configured (demo flow available)'}`);
  const claudeAuth = process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'OAuth (subscription)'
                  : process.env.ANTHROPIC_API_KEY ? 'API key (metered)'
                  : 'missing — judge/forger will use demo mode';
  console.log(`     claude:        ${claudeAuth}`);
  console.log(`     openrouter:    ${process.env.OPENROUTER_API_KEY ? 'configured' : 'missing — challengers will be simulated'}`);
  console.log(`     adal:          ${process.env.ADAL_CMD || 'adal'}`);
  pipeline.start();
});
