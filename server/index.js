require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('./db');
const { projectWorkDir } = require('./scanner');
const {
  createUser, verifyPassword, updateProfile, changePassword,
  startSession, destroySession,
  setSessionCookie, clearSessionCookie, requireAuth, attachUser, COOKIE
} = require('./auth');
const gh = require('./github');
const pipeline = require('./pipeline');
const { checkAdal, MAX_CONCURRENCY } = require('./adal');

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(attachUser);

// ---- API: meta ------------------------------------------------------------
app.get('/api/meta', async (req, res) => {
  const has_adal = await checkAdal();
  res.json({
    ok: true,
    user: req.user || null,
    github_configured: gh.isConfigured(),
    has_adal,
    adal_cmd: process.env.ADAL_CMD || 'adal',
    adal_concurrency: MAX_CONCURRENCY,
    challengers: (process.env.CHALLENGER_MODELS ||
      'zai-glm-4.7-flashx,anthropic-claude-haiku-4-5-20251001,google-gemini-3-flash-preview,openai-gpt-5-mini').split(',').map(s => s.trim()),
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

// ---- API: user profile ----------------------------------------------------
app.patch('/api/user', requireAuth, (req, res) => {
  try {
    const updated = updateProfile(req.user.id, req.body || {});
    res.json({ ok: true, user: updated });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/user/password', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    changePassword(req.user.id, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
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

app.get('/api/evaluations/:id', requireAuth, (req, res) => {
  const evalId = req.params.id;
  const e = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(evalId);
  if (!e) return res.status(404).json({ error: 'Not found' });
  // Ownership: the evaluation's project must belong to req.user.
  const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(e.project_id);
  if (!proj || proj.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  const test_cases = db.prepare(
    'SELECT id, idx, input_json, golden_output FROM test_cases WHERE evaluation_id = ? ORDER BY idx'
  ).all(evalId);
  const model_runs = db.prepare(
    'SELECT id, test_case_id, model, output, passed, tokens, cost_usd, latency_ms, judge_reason, ts FROM model_runs WHERE evaluation_id = ? ORDER BY test_case_id, id'
  ).all(evalId);
  res.json({
    evaluation: rowToEval(e),
    project: { id: proj.id, name: proj.name, owner: proj.owner, fullName: proj.full_name },
    test_cases,
    model_runs,
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

// ---- Patch generation -----------------------------------------------------
// Re-implementations of the client-side threshold logic so the server
// can independently decide which callsites qualify. Kept tiny and
// dependency free; mirrors pickWinnerAt + evalAtThreshold in screens-app.jsx.
function _pickWinnerAt(results, threshold) {
  if (!results || !results.per_challenger) return null;
  const entries = Object.entries(results.per_challenger);
  let best = null;
  for (const [model, info] of entries) {
    if ((info.pass_rate || 0) >= threshold) {
      const cost = Number(info.total_cost) || 0;
      if (!best || cost < (best.total_cost ?? Infinity)) {
        best = { model, pass_rate: info.pass_rate || 0, total_cost: cost, meetsBar: true };
      }
    }
  }
  if (best) return best;
  for (const [model, info] of entries) {
    if (!best || (info.pass_rate || 0) > (best.pass_rate || -1)) {
      best = { model, pass_rate: info.pass_rate || 0, total_cost: Number(info.total_cost) || 0, meetsBar: false };
    }
  }
  return best;
}
function _unprefixModelId(adalKey) {
  if (!adalKey) return '';
  const prefixes = ['openai-', 'anthropic-', 'google-', 'zai-', 'deepseek-', 'kimi-', 'minimax-', 'chatgpt_web-'];
  for (const p of prefixes) {
    if (adalKey.startsWith(p)) return adalKey.slice(p.length);
  }
  return adalKey;
}

// Construct one unified diff hunk for a single line replacement, with up
// to 3 lines of context above and below. `findStr` is the exact model
// string the scanner detected, which we replace with `newId`.
function _buildHunk(lines, targetLineIdx, findStr, newId) {
  let foundIdx = -1;
  if (targetLineIdx >= 0 && targetLineIdx < lines.length && lines[targetLineIdx].includes(findStr)) {
    foundIdx = targetLineIdx;
  } else {
    for (let d = 1; d <= 5 && foundIdx === -1; d++) {
      if (targetLineIdx - d >= 0 && lines[targetLineIdx - d].includes(findStr)) foundIdx = targetLineIdx - d;
      else if (targetLineIdx + d < lines.length && lines[targetLineIdx + d].includes(findStr)) foundIdx = targetLineIdx + d;
    }
  }
  if (foundIdx === -1) return { hunk: null, reason: `'${findStr}' not found within 5 lines of expected location` };
  const oldLine = lines[foundIdx];
  const newLine = oldLine.replace(findStr, newId);
  if (newLine === oldLine) return { hunk: null, reason: 'replacement would be a no-op' };

  const ctxStart = Math.max(0, foundIdx - 3);
  const ctxEnd = Math.min(lines.length, foundIdx + 4);
  const oldStart = ctxStart + 1;
  const count = ctxEnd - ctxStart;

  const body = [];
  for (let i = ctxStart; i < ctxEnd; i++) {
    if (i === foundIdx) {
      body.push('-' + oldLine);
      body.push('+' + newLine);
    } else {
      body.push(' ' + lines[i]);
    }
  }
  return { hunk: `@@ -${oldStart},${count} +${oldStart},${count} @@\n${body.join('\n')}` };
}

app.get('/api/projects/:id/patch', requireAuth, (req, res) => {
  const p = getProject(req.user.id, req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });

  const workDir = projectWorkDir(p.id);
  if (!fs.existsSync(workDir)) {
    return res.status(410).json({
      error: 'Patch unavailable. The repository was not cloned to disk for this project. Demo projects skip cloning; only projects scanned from a real GitHub repo have downloadable patches.'
    });
  }

  const qualityBar = Math.max(50, Math.min(100, Number(req.query.qualityBar) || 80));

  const rows = db.prepare(`
    SELECT e.id as eval_id, e.current_model, e.test_count, e.results_json,
           c.file_path, c.line, c.model as callsite_model
    FROM evaluations e
    JOIN callsites c ON c.id = e.callsite_id
    WHERE e.project_id = ?
    ORDER BY c.file_path, c.line
  `).all(p.id);

  const eligible = [];
  for (const r of rows) {
    if (!r.results_json) continue;
    let results;
    try { results = JSON.parse(r.results_json); } catch { continue; }
    const winner = _pickWinnerAt(results, qualityBar);
    if (!winner || !winner.meetsBar) continue;
    const cur = Number(results.current_total_cost) || 0;
    const win = Number(winner.total_cost) || 0;
    if (cur <= 0 || cur <= win) continue;
    eligible.push({
      file_path: r.file_path,
      line: r.line,
      callsiteModel: r.callsite_model || r.current_model,
      winnerKey: winner.model,
    });
  }

  if (eligible.length === 0) {
    return res.status(404).json({
      error: `No callsites qualify at the ${qualityBar}% quality bar. Lower the threshold or add more challenger models, then try again.`
    });
  }

  const byFile = {};
  for (const e of eligible) {
    if (!byFile[e.file_path]) byFile[e.file_path] = [];
    byFile[e.file_path].push(e);
  }

  const parts = [];
  const warnings = [];
  for (const [filePath, entries] of Object.entries(byFile)) {
    const absPath = path.join(workDir, filePath);
    let content;
    try { content = fs.readFileSync(absPath, 'utf8'); }
    catch { warnings.push(`# skipped: ${filePath} not found on disk`); continue; }
    const lines = content.split('\n');
    const hunks = [];
    // Sort entries by line ascending so multiple hunks in one file appear in order.
    entries.sort((a, b) => a.line - b.line);
    for (const ent of entries) {
      const newId = _unprefixModelId(ent.winnerKey);
      const { hunk, reason } = _buildHunk(lines, ent.line - 1, ent.callsiteModel, newId);
      if (!hunk) {
        warnings.push(`# skipped ${filePath}:${ent.line} (${reason})`);
        continue;
      }
      hunks.push(hunk);
    }
    if (hunks.length === 0) continue;
    parts.push([
      `diff --git a/${filePath} b/${filePath}`,
      `--- a/${filePath}`,
      `+++ b/${filePath}`,
      ...hunks,
    ].join('\n'));
  }

  let body = '';
  if (warnings.length) body += warnings.join('\n') + '\n\n';
  body += parts.join('\n\n') + '\n';

  res.set('Content-Type', 'text/x-patch; charset=utf-8');
  res.send(body);
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
  let results = null;
  if (e.results_json) {
    try { results = JSON.parse(e.results_json); } catch (_) {}
  }
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
    results,
  };
}

// ---- Static frontend ------------------------------------------------------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = Number(process.env.PORT) || 4317;
app.listen(PORT, async () => {
  console.log(`\n  🔥  Crucible running at http://localhost:${PORT}\n`);
  console.log(`     github oauth:  ${gh.isConfigured() ? 'configured' : 'NOT configured (demo flow available)'}`);
  const adalOK = await checkAdal();
  console.log(`     adal:          ${process.env.ADAL_CMD || 'adal'} ${adalOK ? '(healthy)' : '(NOT installed — pipeline will run in demo mode)'}`);
  console.log(`     concurrency:   ${MAX_CONCURRENCY}`);
  pipeline.start();
});
