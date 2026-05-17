/**
 * Tempering — run each test case against the current model AND each challenger
 * via the ADAL CLI, then use Claude Opus (also via ADAL) as the judge to
 * compare outputs.
 *
 * Final scoring:
 *   - per (eval, challenger) pass rate
 *   - winner = cheapest challenger with passRate >= QUALITY_BAR
 *   - savings_pct = (current_cost - winner_cost) / current_cost
 */
const db = require('./db');
const { runAdal, runAdalJson, resolveAdalKey } = require('./adal');

const JUDGE_MODEL = process.env.JUDGE_MODEL || 'anthropic-claude-opus-4-7';
const QUALITY_BAR = Number(process.env.QUALITY_BAR || 80);   // % pass needed to be a viable winner

// USD per 1M tokens (rough, public list — kept here for *relative* savings math).
const MODEL_PRICING = {
  // Current models (the ones found in code)
  'gpt-4o':                       { in: 2.50,  out: 10.00 },
  'gpt-4o-2024-08-06':            { in: 2.50,  out: 10.00 },
  'gpt-4':                        { in: 30.00, out: 60.00 },
  'gpt-4-turbo':                  { in: 10.00, out: 30.00 },
  'gpt-3.5-turbo':                { in: 0.50,  out: 1.50 },
  'claude-3-5-sonnet':            { in: 3.00,  out: 15.00 },
  'claude-3-5-sonnet-20241022':   { in: 3.00,  out: 15.00 },
  'claude-3-opus':                { in: 15.00, out: 75.00 },
  'claude-3-haiku':               { in: 0.25,  out: 1.25 },
  'claude-sonnet-4':              { in: 3.00,  out: 15.00 },
  'text-embedding-3-large':       { in: 0.13,  out: 0 },
  'text-embedding-3-small':       { in: 0.02,  out: 0 },
  'gemini-1.5-pro':               { in: 1.25,  out: 5.00 },
  // Challengers (ADAL catalog keys)
  'zai-glm-4.7-flashx':                       { in: 0.10,  out: 0.30 },
  'anthropic-claude-haiku-4-5-20251001':      { in: 1.00,  out: 5.00 },
  'google-gemini-3-flash-preview':            { in: 0.10,  out: 0.40 },
  'openai-gpt-5-mini':                        { in: 0.15,  out: 0.60 },
  'anthropic-claude-sonnet-4-6':              { in: 3.00,  out: 15.00 },
  'anthropic-claude-opus-4-7':                { in: 15.00, out: 75.00 },
  'anthropic-claude-opus-4-6':                { in: 10.00, out: 50.00 },
  'google-gemini-3.1-pro-preview':            { in: 1.25,  out: 5.00 },
};

function pricingFor(model) {
  if (!model) return null;
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  // best-effort family match
  const lc = model.toLowerCase();
  for (const key of Object.keys(MODEL_PRICING)) {
    if (lc.includes(key.toLowerCase()) || key.toLowerCase().includes(lc)) return MODEL_PRICING[key];
  }
  return { in: 1.0, out: 3.0 };  // unknown
}

function approxTokens(s) { return Math.max(1, Math.ceil((s || '').length / 4)); }

function estimateCost(model, inText, outText) {
  const p = pricingFor(model);
  const inTok = approxTokens(inText);
  const outTok = approxTokens(outText);
  return ((inTok / 1_000_000) * p.in) + ((outTok / 1_000_000) * p.out);
}

function buildMessages(evaluation, testCase) {
  const input = typeof testCase.input_json === 'string'
    ? JSON.parse(testCase.input_json || '{}') : (testCase.input_json || {});
  let prompt = evaluation.prompt_template || '';
  for (const [k, v] of Object.entries(input)) {
    prompt = prompt.replaceAll(`{${k}}`, String(v));
  }
  // If template wasn't filled in, append input as JSON.
  if (!prompt) prompt = 'Process the following input and respond.\n\nINPUT: ' + JSON.stringify(input);
  return [{ role: 'user', content: prompt }];
}

// Flatten chat messages into a single string for `adal -q`. ADAL doesn't
// take a structured messages array; the model sees the rendered text.
function flatten(messages) {
  return messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
}

// Run one challenger model via ADAL. Returns the shape the rest of the
// pipeline expects: {output, latency_ms, tokens_in, tokens_out}.
async function callAdalChallenger(model, messages) {
  const t0 = Date.now();
  const prompt = flatten(messages);
  const res = await runAdal({
    prompt,
    model,                       // already an ADAL catalog key (CHALLENGER_MODELS)
    timeoutMs: 90_000,
  });
  const output = res.ok ? res.answer : `[error] ${res.error}`;
  return {
    output,
    latency_ms: Date.now() - t0,
    tokens_in: approxTokens(prompt),
    tokens_out: approxTokens(output),
  };
}

// Same plumbing for the "current" model — but the scanner-detected model
// string (e.g. "gpt-4o") usually isn't an ADAL catalog key, so we resolve
// it to the closest current-gen substitute.
async function callCurrentModel(model, messages) {
  const t0 = Date.now();
  const prompt = flatten(messages);
  const adalKey = resolveAdalKey(model);
  if (!adalKey) {
    // Embedding callsites and other unmappable models — short-circuit.
    return {
      output: `[skipped] no ADAL equivalent for "${model}"`,
      latency_ms: 0, tokens_in: 0, tokens_out: 0,
    };
  }
  const res = await runAdal({ prompt, model: adalKey, timeoutMs: 60_000 });
  const output = res.ok ? res.answer : `[error] ${res.error}`;
  return {
    output,
    latency_ms: Date.now() - t0,
    tokens_in: approxTokens(prompt),
    tokens_out: approxTokens(output),
  };
}

const JUDGE_PROMPT = (eva, input, golden, current, challenger) => `You are an evaluator deciding whether a CHALLENGER LLM's answer is at least as good as the CURRENT model's answer for the same task.

TASK: ${eva.title}
METRIC: ${eva.metric}
EXPECTED OUTPUT FORMAT: ${tryReadFormat(eva)}
INPUT: ${JSON.stringify(input)}
${golden ? `IDEAL/GOLDEN: ${golden}\n` : ''}
CURRENT MODEL OUTPUT (${eva.current_model}):
"""${current}"""

CHALLENGER OUTPUT:
"""${challenger}"""

Decide: does CHALLENGER pass? Pass = roughly as accurate, on-format, and useful as CURRENT for this task. Be strict on format violations.

Respond with ONE JSON object ONLY:
{ "pass": true|false, "reason": "≤ 25 words" }`;

function tryReadFormat(eva) {
  return (eva.metric === 'structured-match' ? 'json'
        : eva.metric === 'tool-correctness' ? 'tool call'
        : eva.metric === 'cosine-recall' ? 'embedding vector'
        : 'free text');
}

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pass: { type: 'boolean' },
    reason: { type: 'string' }
  },
  required: ['pass', 'reason']
};

async function judgePair(eva, input, golden, currentOut, challengerOut) {
  try {
    const res = await runAdalJson({
      prompt: JUDGE_PROMPT(eva, input, golden, currentOut, challengerOut),
      model: JUDGE_MODEL,
      timeoutMs: 45_000,
    });
    if (res.ok && res.json && typeof res.json.pass === 'boolean') {
      return { pass: res.json.pass, reason: String(res.json.reason || '').slice(0, 200) };
    }
    if (!res.ok) console.error('[judge] adal:', res.error);
    else console.error('[judge] unparseable answer');
  } catch (err) {
    console.error('[judge] threw:', err.message);
  }
  // Defensive default: when the judge fails, do NOT silently pass the challenger.
  // Use string similarity as a transparent fallback so the run still completes.
  return {
    pass: jaccard(currentOut, challengerOut) > 0.35,
    reason: 'judge_unparseable_fallback',
  };
}

function jaccard(a, b) {
  const A = new Set(String(a || '').toLowerCase().split(/\W+/).filter(Boolean));
  const B = new Set(String(b || '').toLowerCase().split(/\W+/).filter(Boolean));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

async function runEvaluation(evaluation, onTick) {
  const evalId = evaluation.id;
  const challengers = JSON.parse(evaluation.challengers || '[]');
  const cases = db.prepare('SELECT * FROM test_cases WHERE evaluation_id = ? ORDER BY idx').all(evalId);

  if (!cases.length) {
    db.prepare(`UPDATE evaluations SET status='done', progress=1, winner=?, pass_rate=0, savings_pct=0, updated_at=?, results_json=? WHERE id=?`).run(
      evaluation.current_model, Date.now(), JSON.stringify({ note: 'no test cases' }), evalId
    );
    return;
  }

  db.prepare(`UPDATE evaluations SET status='running', updated_at=? WHERE id=?`).run(Date.now(), evalId);

  const perChallenger = new Map();      // model -> { pass, fail, totalCost }
  challengers.forEach(m => perChallenger.set(m, { pass: 0, fail: 0, cost: 0 }));
  let currentTotalCost = 0;

  const insertRun = db.prepare(`INSERT INTO model_runs
    (evaluation_id, test_case_id, model, output, passed, tokens, cost_usd, latency_ms, judge_reason, ts)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (let i = 0; i < cases.length; i++) {
    const tc = cases[i];
    const input = JSON.parse(tc.input_json || '{}');
    const messages = buildMessages(evaluation, tc);

    // 1) Run current model
    let currentOut = tc.golden_output || '';
    let currentLat = 0, currentTokIn = 0, currentTokOut = 0;
    try {
      const r = await callCurrentModel(evaluation.current_model, messages);
      currentOut = r.output;
      currentLat = r.latency_ms;
      currentTokIn = r.tokens_in;
      currentTokOut = r.tokens_out;
    } catch (err) {
      console.error('[temper] current-model err:', err.message);
    }
    const currentCost = estimateCost(evaluation.current_model, JSON.stringify(messages), currentOut);
    currentTotalCost += currentCost;
    insertRun.run(evalId, tc.id, evaluation.current_model, currentOut, null,
      currentTokIn + currentTokOut, currentCost, currentLat, null, Date.now());

    // 2) Run each challenger + judge
    for (const ch of challengers) {
      let out = '', lat = 0, tIn = 0, tOut = 0;
      try {
        const r = await callAdalChallenger(ch, messages);
        out = r.output; lat = r.latency_ms; tIn = r.tokens_in; tOut = r.tokens_out;
      } catch (err) {
        out = ''; lat = 0; tIn = 0; tOut = 0;
        console.error('[temper] challenger err', ch, err.message);
      }
      const cost = estimateCost(ch, JSON.stringify(messages), out);
      const j = await judgePair(evaluation, input, tc.golden_output, currentOut, out);
      const passed = j.pass ? 1 : 0;
      const bucket = perChallenger.get(ch);
      if (j.pass) bucket.pass += 1; else bucket.fail += 1;
      bucket.cost += cost;
      insertRun.run(evalId, tc.id, ch, out, passed, tIn + tOut, cost, lat, j.reason, Date.now());
    }

    const progress = (i + 1) / cases.length;
    db.prepare(`UPDATE evaluations SET progress=?, updated_at=? WHERE id=?`)
      .run(progress, Date.now(), evalId);
    if (onTick) await onTick({ progress, completed: i + 1, total: cases.length });
  }

  // Pick winner: cheapest challenger with passRate >= QUALITY_BAR
  let winner = null, winnerPass = 0, winnerCost = Infinity;
  const passRatesByModel = {};
  for (const [m, b] of perChallenger.entries()) {
    const total = b.pass + b.fail || 1;
    const passRate = Math.round((b.pass / total) * 100);
    passRatesByModel[m] = { pass_rate: passRate, total_cost: b.cost };
    if (passRate >= QUALITY_BAR && b.cost < winnerCost) {
      winner = m; winnerPass = passRate; winnerCost = b.cost;
    }
  }
  // If none reached the bar, pick the *highest pass rate* anyway so the UI can still show it.
  if (!winner) {
    let bestRate = -1;
    for (const [m, info] of Object.entries(passRatesByModel)) {
      if (info.pass_rate > bestRate) { winner = m; bestRate = info.pass_rate; winnerCost = info.total_cost; winnerPass = info.pass_rate; }
    }
  }

  const savingsPct = currentTotalCost > 0
    ? Math.max(0, Math.round(((currentTotalCost - winnerCost) / currentTotalCost) * 100))
    : 0;

  db.prepare(`UPDATE evaluations SET status='done', progress=1, winner=?, pass_rate=?, savings_pct=?, results_json=?, updated_at=? WHERE id=?`).run(
    winner, winnerPass, savingsPct, JSON.stringify({ per_challenger: passRatesByModel, current_total_cost: currentTotalCost, winner_total_cost: winnerCost }),
    Date.now(), evalId
  );
}

async function temperProject(project, onProgress) {
  const evals = db.prepare("SELECT * FROM evaluations WHERE project_id = ? AND status != 'done' ORDER BY id").all(project.id);
  let i = 0;
  for (const e of evals) {
    await runEvaluation(e, async () => {
      const done = db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE project_id = ? AND status = 'done'").get(project.id).c;
      if (onProgress) await onProgress({ done, total: evals.length + done - i, fraction: done / Math.max(1, evals.length) });
    });
    i++;
    if (onProgress) await onProgress({ done: i, total: evals.length, fraction: i / Math.max(1, evals.length) });
  }
}

module.exports = { temperProject, runEvaluation, estimateCost, pricingFor, JUDGE_MODEL, QUALITY_BAR };
