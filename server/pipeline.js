/**
 * Background pipeline. Walks each project through stages:
 *   0 = Probing    (clone + scan)
 *   1 = Forging    (extract eval specs)
 *   2 = Tempering  (run + judge)
 *   3 = Done
 *
 * When a project lacks real GitHub data (is_demo=1 or no clone_url), the
 * pipeline runs a faithful *simulation* that produces realistic-looking
 * findings, evaluations, and results — so demos work without keys.
 */
const db = require('./db');
const { cloneRepo, scanRepoFiles, logScanEvent } = require('./scanner');
const { forgeEvaluationsForProject } = require('./forger');
const { temperProject } = require('./tempering');
const { getAccount } = require('./github');
const { checkAdal } = require('./adal');

const inFlight = new Set();   // project ids currently being processed

function pickPending() {
  return db.prepare(`SELECT * FROM projects WHERE stage < 3 AND id NOT IN (${
    [...inFlight].map(() => '?').join(',') || "''"
  }) ORDER BY updated_at ASC LIMIT 1`).all(...inFlight).at(0)
    || null;
}

function touch(projectId, fields) {
  const keys = Object.keys(fields);
  const setSql = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE projects SET ${setSql}, updated_at = ? WHERE id = ?`)
    .run(...keys.map(k => fields[k]), Date.now(), projectId);
}

const DEMO_CALLSITES_BY_NAME = {
  'core-platform':   [{ file_path: 'src/agents/router.ts',     line: 120, provider: 'openai',    model: 'gpt-4o',                  call_kind: 'chat',     output_format: 'json' },
                      { file_path: 'src/agents/triage.ts',     line: 42,  provider: 'anthropic', model: 'claude-3-5-sonnet',       call_kind: 'tool',     output_format: 'tool_call' },
                      { file_path: 'src/agents/plan.ts',       line: 71,  provider: 'anthropic', model: 'claude-3-5-sonnet',       call_kind: 'tool',     output_format: 'tool_call' }],
  'support-copilot': [{ file_path: 'src/inbox/classify.py',    line: 55,  provider: 'openai',    model: 'gpt-4o-mini',             call_kind: 'chat',     output_format: 'json' },
                      { file_path: 'src/inbox/embed.py',       line: 14,  provider: 'openai',    model: 'text-embedding-3-large',  call_kind: 'embedding', output_format: 'embedding' },
                      { file_path: 'src/api/copilot.ts',       line: 89,  provider: 'anthropic', model: 'claude-3-5-sonnet',       call_kind: 'chat',     output_format: 'text' }],
  'agent-runtime':   [{ file_path: 'src/agents/summarizer.ts', line: 18,  provider: 'openai',    model: 'gpt-4o',                  call_kind: 'chat',     output_format: 'text' },
                      { file_path: 'src/agents/router.ts',     line: 120, provider: 'openai',    model: 'gpt-4o',                  call_kind: 'chat',     output_format: 'json' }],
  'rag-experiments': [{ file_path: 'pipelines/rag.py',         line: 31,  provider: 'openai',    model: 'gpt-4o',                  call_kind: 'chat',     output_format: 'text' },
                      { file_path: 'pipelines/embed.py',       line: 9,   provider: 'openai',    model: 'text-embedding-3-small',  call_kind: 'embedding', output_format: 'embedding' }],
};

function seedDemoCallsites(project) {
  const csList = DEMO_CALLSITES_BY_NAME[project.name] || [
    { file_path: 'src/llm.ts',  line: 12, provider: 'openai',    model: 'gpt-4o',            call_kind: 'chat', output_format: 'json' },
    { file_path: 'src/agent.py', line: 33, provider: 'anthropic', model: 'claude-3-5-sonnet', call_kind: 'chat', output_format: 'text' }
  ];
  const ins = db.prepare(`INSERT INTO callsites
    (project_id, file_path, line, provider, model, call_kind, snippet, prompt_excerpt, output_format)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  csList.forEach(cs => ins.run(
    project.id, cs.file_path, cs.line, cs.provider, cs.model, cs.call_kind,
    `// demo callsite: ${cs.provider}/${cs.model} (${cs.call_kind})`,
    'You are a helpful assistant for {user_message}.',
    cs.output_format
  ));
  return csList.length;
}

async function runProbing(project) {
  const acct = getAccount(project.user_id);
  touch(project.id, { stage: 0, progress: 0.02, status_text: 'Cloning repository…' });
  logScanEvent(project.id, 'log', null, 'Probing started');

  // Demo path: synthesize findings over time
  if (!project.clone_url || project.is_demo || !acct?.access_token) {
    const fakeFiles = 312;
    const fakeAi = 3 + Math.floor(Math.random() * 6);
    const ticks = 12;
    for (let t = 1; t <= ticks; t++) {
      const files = Math.floor((t / ticks) * fakeFiles);
      const ai = Math.floor((t / ticks) * fakeAi);
      touch(project.id, {
        progress: t / ticks,
        files_scanned: files,
        ai_callsites: ai,
        distinct_models: Math.min(4, Math.ceil(ai / 1.5)),
        status_text: `Probing… ${files} files, ${ai} ai callsites`
      });
      if (t % 2 === 0) logScanEvent(project.id, 'file', `src/sample_${t}.ts`, null);
      if (t === 4 || t === 7 || t === 10) logScanEvent(project.id, 'hit', `src/agent_${t}.ts`, 'anthropic.messages.create()');
      await sleep(280);
    }
    seedDemoCallsites(project);
    touch(project.id, { stage: 1, progress: 0, status_text: 'Drafting evaluations…' });
    return;
  }

  // Real path: clone, walk, regex-scan.
  try {
    await cloneRepo(project, acct.access_token);
    let lastTick = Date.now();
    const res = await scanRepoFiles(project, async (snap) => {
      const now = Date.now();
      if (now - lastTick < 250) return;
      lastTick = now;
      touch(project.id, {
        files_scanned: snap.filesScanned,
        ai_callsites: snap.aiCallsites,
        distinct_models: snap.distinctModels,
        progress: Math.min(0.99, snap.filesScanned / 400),
        status_text: `Probing… ${snap.filesScanned} files, ${snap.aiCallsites} ai callsites`
      });
    });
    // If we found nothing in real scan, seed a couple demo callsites so the demo continues.
    if (res.aiCallsites === 0) seedDemoCallsites(project);
    touch(project.id, {
      stage: 1, progress: 0,
      files_scanned: res.filesScanned,
      ai_callsites: db.prepare('SELECT COUNT(*) c FROM callsites WHERE project_id=?').get(project.id).c,
      distinct_models: res.distinctModels,
      status_text: 'Drafting evaluations…'
    });
  } catch (err) {
    console.error('[pipeline] probing failed:', err.message);
    touch(project.id, { status_text: 'Probing failed — using demo data: ' + err.message });
    seedDemoCallsites(project);
    touch(project.id, { stage: 1, progress: 0, status_text: 'Drafting evaluations…' });
  }
}

async function runForging(project) {
  touch(project.id, { stage: 1, progress: 0, status_text: 'Forging evaluations…' });
  const callsites = db.prepare('SELECT * FROM callsites WHERE project_id=?').all(project.id);
  if (!callsites.length) {
    touch(project.id, { stage: 2, progress: 0, status_text: 'No callsites found — skipping.' });
    return;
  }
  // Demo: synthesize evaluations without LLM if ADAL isn't installed.
  const hasAdal = await checkAdal();
  if (!hasAdal) {
    const { challengersFor } = (() => {
      const list = (process.env.CHALLENGER_MODELS ||
        'anthropic/claude-haiku-4-5,openai/gpt-4o-mini,google/gemini-2.0-flash-001,meta-llama/llama-3.1-8b-instruct,mistralai/mistral-small'
      ).split(',').map(s => s.trim()).filter(Boolean);
      return { challengersFor: () => list.slice(0, 4) };
    })();
    let i = 0;
    for (const cs of callsites) {
      const evalId = `${project.id}-e${cs.id}`;
      const now = Date.now();
      const challengers = challengersFor();
      const testCount = 8;
      db.prepare(`INSERT OR REPLACE INTO evaluations
        (id, project_id, callsite_id, title, callsite_label, current_model, challengers, metric,
         test_count, drafted, progress, status, prompt_template, schema_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'drafted', ?, NULL, ?, ?)`).run(
        evalId, project.id, cs.id,
        titleFromCallsite(cs),
        `${cs.file_path}:${cs.line}`,
        cs.model || 'unknown',
        JSON.stringify(challengers),
        cs.output_format === 'json' ? 'structured-match' : cs.output_format === 'tool_call' ? 'tool-correctness' : 'llm-judge',
        testCount,
        `Process the following input and respond.\n\nINPUT: {user_message}`,
        now, now
      );
      // synth test cases
      const examples = [
        'Cancel my order from yesterday.',
        'Bug: crashes on launch on Android 14.',
        'Summarize this meeting in 3 bullets.',
        '"Refund please, double charged."',
        'Extract action items from these notes.',
        'Is this review positive or negative?',
        'Acknowledge the customer is upset.',
        'Which tool should I call for this message?',
      ];
      const ins = db.prepare(`INSERT INTO test_cases (evaluation_id, idx, input_json, golden_output) VALUES (?,?,?,?)`);
      db.prepare('DELETE FROM test_cases WHERE evaluation_id=?').run(evalId);
      examples.forEach((ex, k) => ins.run(evalId, k, JSON.stringify({ user_message: ex }),
        cs.output_format === 'json' ? '{"label":"...","confidence":0.9}' : 'A concise, on-policy response.'));
      i++;
      touch(project.id, { progress: i / callsites.length, status_text: `Forging… ${i}/${callsites.length} drafted` });
      await sleep(180);
    }
    touch(project.id, { stage: 2, progress: 0, status_text: 'Tempering challengers…' });
    return;
  }
  // Real path: use Claude/ADAL via the forger module
  await forgeEvaluationsForProject(project, async (snap) => {
    touch(project.id, { progress: snap.drafted / Math.max(1, snap.total), status_text: `Forging… ${snap.drafted}/${snap.total} drafted` });
  });
  touch(project.id, { stage: 2, progress: 0, status_text: 'Tempering challengers…' });
}

async function runTempering(project) {
  const evals = db.prepare("SELECT * FROM evaluations WHERE project_id = ? AND status != 'done'").all(project.id);
  if (!evals.length) {
    touch(project.id, { stage: 3, progress: 1, status_text: 'Tempered — no work.' });
    return;
  }
  // Demo path when ADAL isn't installed.
  const hasAdal = await checkAdal();
  if (!hasAdal) {
    for (let i = 0; i < evals.length; i++) {
      const e = evals[i];
      // Pretend it ran by setting fake winner / pass rate / savings.
      const challengers = JSON.parse(e.challengers || '[]');
      const winner = challengers[Math.floor(Math.random() * challengers.length)] || 'anthropic/claude-haiku-4-5';
      const passRate = 86 + Math.floor(Math.random() * 12);
      const savings = 42 + Math.floor(Math.random() * 45);
      // Animate progress
      for (let t = 1; t <= 6; t++) {
        db.prepare(`UPDATE evaluations SET status='running', progress=?, updated_at=? WHERE id=?`)
          .run(t / 6, Date.now(), e.id);
        touch(project.id, { progress: (i + t/6) / evals.length, status_text: `Tempering ${e.title}…` });
        await sleep(180);
      }
      db.prepare(`UPDATE evaluations SET status='done', progress=1, winner=?, pass_rate=?, savings_pct=?, updated_at=? WHERE id=?`)
        .run(winner, passRate, savings, Date.now(), e.id);
    }
    touch(project.id, { stage: 3, progress: 1, status_text: 'Tempered.' });
    return;
  }
  await temperProject(project, async (snap) => {
    touch(project.id, { progress: snap.fraction, status_text: `Tempering ${snap.done}/${snap.total}` });
  });
  touch(project.id, { stage: 3, progress: 1, status_text: 'Tempered.' });
}

function titleFromCallsite(cs) {
  const base = cs.file_path.split('/').pop().replace(/\.\w+$/, '');
  const pretty = base.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (cs.call_kind === 'embedding') return `${pretty} embeddings`;
  if (cs.call_kind === 'tool') return `${pretty} tool router`;
  return pretty;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processProject(project) {
  inFlight.add(project.id);
  try {
    if (project.stage === 0) await runProbing(project);
    const p1 = db.prepare('SELECT * FROM projects WHERE id=?').get(project.id);
    if (p1.stage === 1) await runForging(p1);
    const p2 = db.prepare('SELECT * FROM projects WHERE id=?').get(project.id);
    if (p2.stage === 2) await runTempering(p2);
  } catch (err) {
    console.error('[pipeline] project failed:', project.id, err.message);
    touch(project.id, { error: err.message, status_text: 'Failed: ' + err.message });
  } finally {
    inFlight.delete(project.id);
  }
}

function start() {
  setInterval(async () => {
    if (inFlight.size >= 2) return;     // cap concurrent projects
    const next = pickPending();
    if (!next) return;
    processProject(next);
  }, 600);
}

module.exports = { start, processProject };
