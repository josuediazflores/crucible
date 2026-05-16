/**
 * Forging stage — for each detected callsite, build an "evaluation":
 *   { prompt template, output format/schema, 20-50 test cases, metric }.
 *
 * Strategy:
 *   1. If ADAL is installed, shell out to it (via ./adal helpers) with
 *      Read/Search tools scoped to the cloned repo so the agent can read
 *      surrounding files and infer the prompt template.
 *   2. Else: synthesize plausible test cases from the callsite snippet alone.
 */
const path = require('path');
const db = require('./db');
const { projectWorkDir } = require('./scanner');
const { checkAdal, runAdalJson, extractJsonObject } = require('./adal');

const JUDGE_MODEL = process.env.JUDGE_MODEL || 'anthropic-claude-opus-4-7';
const FORGER_MODEL = process.env.FORGER_MODEL || 'anthropic-claude-sonnet-4-6';
const CHALLENGER_LIST = (process.env.CHALLENGER_MODELS ||
  'zai-glm-4.7-flashx,anthropic-claude-haiku-4-5-20251001,google-gemini-3-flash-preview,openai-gpt-5-mini'
).split(',').map(s => s.trim()).filter(Boolean);

const FORGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    purpose: { type: 'string' },
    prompt_template: { type: 'string' },
    input_variables: { type: 'array', items: { type: 'string' } },
    output_format: { type: 'string', enum: ['text', 'json', 'tool_call', 'embedding'] },
    output_schema: { type: ['string', 'null'] },
    metric: { type: 'string', enum: ['structured-match', 'llm-judge', 'cosine-recall', 'tool-correctness'] },
    test_cases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          input: { type: 'object' },
          golden_output: { type: 'string' }
        },
        required: ['input']
      }
    }
  },
  required: ['title', 'prompt_template', 'output_format', 'metric', 'test_cases']
};

const FORGE_PROMPT = (rel, line, snippet, model) => `You are reverse-engineering a single LLM callsite in a code repository.

CALLSITE: ${rel}:${line}
CURRENT MODEL: ${model || 'unknown'}

CODE SNIPPET:
\`\`\`
${snippet}
\`\`\`

Your job: read the surrounding files if needed and respond with ONE JSON object only, no prose, with this shape:

{
  "title": "short human title for this evaluation (≤ 6 words)",
  "purpose": "one sentence on what this callsite does",
  "prompt_template": "the prompt template the code sends to the model, with {placeholder} variables",
  "input_variables": ["names of placeholders the prompt needs"],
  "output_format": "text" | "json" | "tool_call" | "embedding",
  "output_schema": "optional JSON schema OR tool schema as a string; null if free text",
  "metric": "structured-match" | "llm-judge" | "cosine-recall" | "tool-correctness",
  "test_cases": [
    { "input": { "<var>": "value" }, "golden_output": "what the current model would ideally return" }
    // 8–12 realistic, diverse test cases. Cover edge cases.
  ]
}

If the snippet is too thin, infer reasonable test cases from context. Output the JSON object only.`;

async function extractEvalSpec(project, callsite) {
  const rel = callsite.file_path;
  const line = callsite.line;
  const snippet = callsite.snippet || '';
  const model = callsite.model || 'unknown';
  const prompt = FORGE_PROMPT(rel, line, snippet, model);

  // 1) Try ADAL with Read/Search tools scoped to the cloned repo.
  if (await checkAdal()) {
    try {
      const cwd = projectWorkDir(project.id);
      const haveRepo = cwd && require('fs').existsSync(cwd);
      const res = await runAdalJson({
        prompt,
        model: FORGER_MODEL,
        cwd: haveRepo ? cwd : undefined,
        allowedTools: haveRepo ? ['Read', 'Search'] : null,
        timeoutMs: 120_000,
      });
      if (res.ok && res.json && Array.isArray(res.json.test_cases) && res.json.test_cases.length) {
        return res.json;
      }
      if (!res.ok) console.error('[forger] adal:', res.error);
      else console.error('[forger] adal returned no parseable test_cases');
    } catch (err) {
      console.error('[forger] adal threw:', err.message);
    }
  }
  // 2) Heuristic fallback — synthesize plausible test cases from the snippet.
  return synthesizeFallback(callsite);
}

function synthesizeFallback(cs) {
  const ext = path.extname(cs.file_path).toLowerCase();
  const isPy = ext === '.py';
  const title = guessTitleFromPath(cs.file_path);
  const fmt = cs.output_format || 'text';
  const metric = fmt === 'json' ? 'structured-match'
              : fmt === 'tool_call' ? 'tool-correctness'
              : (cs.call_kind === 'embedding' ? 'cosine-recall' : 'llm-judge');
  const promptExcerpt = cs.prompt_excerpt
    || `Process the user input from ${cs.file_path}:${cs.line} and return ${fmt === 'json' ? 'a JSON object' : 'an answer'}.`;
  const examples = [
    'Customer wants to cancel an order placed yesterday.',
    'A new bug report came in: app crashes on launch on Android 14.',
    'Summarize the following meeting notes into 3 bullet points.',
    'Classify this support ticket: "I need a refund for double-charge".',
    'Extract action items from the conversation transcript below.',
    'Detect sentiment (positive / neutral / negative) for this review.',
    'Generate a short reply that acknowledges the customer is upset.',
    'Decide which tool to call given the user message.',
  ];
  const test_cases = examples.slice(0, 8).map(ex => ({
    input: { user_message: ex },
    golden_output: fmt === 'json' ? '{"label":"...", "confidence":0.9}' : 'A concise, on-policy response.'
  }));
  return {
    title,
    purpose: `LLM callsite at ${cs.file_path}:${cs.line}`,
    prompt_template: promptExcerpt + '\n\nUSER: {user_message}',
    input_variables: ['user_message'],
    output_format: fmt,
    output_schema: null,
    metric,
    test_cases,
  };
}

function guessTitleFromPath(p) {
  const base = path.basename(p, path.extname(p));
  return base.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 50);
}

function challengersFor(currentModel) {
  // Drop any challenger that matches the current model identity (provider+family) heuristically.
  const cur = (currentModel || '').toLowerCase();
  return CHALLENGER_LIST.filter(m => !cur || !m.toLowerCase().endsWith(cur.split('/').pop()));
}

async function forgeEvaluationsForProject(project, onProgress) {
  const callsites = db.prepare('SELECT * FROM callsites WHERE project_id = ? ORDER BY id').all(project.id);
  const drafted = [];
  for (const cs of callsites) {
    let spec;
    try { spec = await extractEvalSpec(project, cs); }
    catch (err) {
      console.error('[forger] extract failed for', cs.file_path + ':' + cs.line, err.message);
      spec = synthesizeFallback(cs);
    }

    const evalId = `${project.id}-e${cs.id}`;
    const now = Date.now();
    const challengers = challengersFor(cs.model);
    const callsiteLabel = `${cs.file_path}:${cs.line}`;

    db.prepare(`INSERT OR REPLACE INTO evaluations
      (id, project_id, callsite_id, title, callsite_label, current_model, challengers, metric,
       test_count, drafted, progress, status, prompt_template, schema_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 'drafted', ?, ?, ?, ?)`).run(
      evalId, project.id, cs.id,
      spec.title || guessTitleFromPath(cs.file_path),
      callsiteLabel,
      cs.model || 'unknown',
      JSON.stringify(challengers),
      spec.metric || 'llm-judge',
      Array.isArray(spec.test_cases) ? spec.test_cases.length : 0,
      spec.prompt_template || '',
      spec.output_schema ? String(spec.output_schema) : null,
      now, now
    );

    const insertCase = db.prepare(`INSERT INTO test_cases
      (evaluation_id, idx, input_json, golden_output) VALUES (?, ?, ?, ?)`);
    db.prepare('DELETE FROM test_cases WHERE evaluation_id = ?').run(evalId);
    (spec.test_cases || []).forEach((tc, i) => {
      insertCase.run(evalId, i, JSON.stringify(tc.input ?? {}), tc.golden_output ?? null);
    });

    drafted.push(evalId);
    if (onProgress) await onProgress({ drafted: drafted.length, total: callsites.length });
  }
  return drafted;
}

module.exports = {
  forgeEvaluationsForProject, extractEvalSpec, checkAdal,
  CHALLENGER_LIST, FORGER_MODEL, JUDGE_MODEL
};
