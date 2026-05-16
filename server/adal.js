/**
 * server/adal.js
 *
 * Shared wrapper around the ADAL CLI (https://docs.sylph.ai). Every LLM hop
 * in Crucible — forging, current-model runs, challenger runs, judge — flows
 * through `runAdal` here.
 *
 * Empirical notes (from probing v1.1.4):
 * - `-m` requires the CATALOG KEY field (e.g. `zai-glm-4.7-flashx`), NOT
 *   the bare slug shown in the public docs (`glm-4.7-flashx`). Source of
 *   truth: `~/.adal/model_catalog.json`.
 * - `-p` "system prompt override" is functionally a no-op; ADAL's harness
 *   prompt + ~15 tool schemas are always injected. We don't pass `-p`.
 * - ADAL acquires `~/.adal/settings.json.lock` per process. Parallel calls
 *   can deadlock on it. We expose ADAL_CONCURRENCY (default 1) so the
 *   default is safe; bump to 2-4 only after the deadlock workaround is
 *   validated. Each call gets a unique cwd so per-project session state
 *   doesn't collide.
 * - Headless JSON has no token-usage fields. Callers approximate from
 *   string length.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ADAL_CMD = process.env.ADAL_CMD || 'adal';
const MAX_CONCURRENCY = Math.max(1, Number(process.env.ADAL_CONCURRENCY) || 1);

// ---- Model key mapping ---------------------------------------------------
// Maps scanner-detected model strings to ADAL catalog keys. Legacy models
// (e.g. gpt-4o, claude-3-5-sonnet) have no direct ADAL equivalent; we
// substitute the closest current-gen model in the same family. Embedding
// callsites have no ADAL counterpart at all and return null — callers must
// short-circuit those.
const MODEL_KEY_MAP = {
  // OpenAI legacy → current-gen substitute
  'gpt-4o':                       'openai-gpt-5-mini',
  'gpt-4o-mini':                  'openai-gpt-5-mini',
  'gpt-4o-2024-08-06':            'openai-gpt-5-mini',
  'gpt-4':                        'openai-gpt-5-mini',
  'gpt-4-turbo':                  'openai-gpt-5-mini',
  'gpt-3.5-turbo':                'openai-gpt-5-mini',

  // Anthropic legacy → current-gen substitute
  'claude-3-5-sonnet':            'anthropic-claude-sonnet-4-6',
  'claude-3-5-sonnet-20241022':   'anthropic-claude-sonnet-4-6',
  'claude-3-opus':                'anthropic-claude-opus-4-6',
  'claude-3-haiku':               'anthropic-claude-haiku-4-5-20251001',
  'claude-sonnet-4':              'anthropic-claude-sonnet-4-6',

  // Google legacy → current-gen substitute
  'gemini-1.5-pro':               'google-gemini-3.1-pro-preview',
  'gemini-1.5-flash':             'google-gemini-3-flash-preview',
  'gemini-2.0-flash-001':         'google-gemini-3-flash-preview',

  // Embeddings — no ADAL equivalent; caller must skip
  'text-embedding-3-large':       null,
  'text-embedding-3-small':       null,
  'text-embedding-ada-002':       null,
};

function resolveAdalKey(modelString) {
  if (!modelString) return null;
  const m = modelString.toLowerCase();
  if (m in MODEL_KEY_MAP) return MODEL_KEY_MAP[m];
  // Already an ADAL catalog key (e.g. "zai-glm-4.7-flashx")? Pass through.
  if (/^(openai|anthropic|google|zai|deepseek|kimi|minimax|chatgpt_web)-/.test(m)) {
    return m;
  }
  // Heuristic family match for anything else.
  if (m.includes('claude') && m.includes('opus'))  return 'anthropic-claude-opus-4-6';
  if (m.includes('claude') && m.includes('haiku')) return 'anthropic-claude-haiku-4-5-20251001';
  if (m.includes('claude'))                        return 'anthropic-claude-sonnet-4-6';
  if (m.includes('gpt'))                           return 'openai-gpt-5-mini';
  if (m.includes('gemini'))                        return 'google-gemini-3-flash-preview';
  if (m.includes('embedding'))                     return null;
  return null;
}

// ---- Health check (cached) ----------------------------------------------
let adalAvailable = null;
function checkAdal() {
  if (adalAvailable !== null) return Promise.resolve(adalAvailable);
  return new Promise(resolve => {
    const p = spawn(ADAL_CMD, ['-v'], { stdio: 'ignore' });
    p.on('error', () => { adalAvailable = false; resolve(false); });
    p.on('close', code => { adalAvailable = code === 0; resolve(adalAvailable); });
  });
}

// ---- Concurrency pool ----------------------------------------------------
let active = 0;
const waiters = [];
function acquire() {
  if (active < MAX_CONCURRENCY) { active++; return Promise.resolve(); }
  return new Promise(r => waiters.push(r));
}
function release() {
  active--;
  const next = waiters.shift();
  if (next) { active++; next(); }
}

// ---- Stable inference cwd -----------------------------------------------
// We learned the hard way that minting a fresh cwd per call doesn't unlock
// parallelism (ADAL deadlocks on settings.json.lock regardless of cwd) and
// makes every call slow (ADAL re-inits per-project state). Inference calls
// without an explicit cwd share one stable dir so ADAL caches stay warm.
// The forger passes its own project-specific cwd, which still works.
const INFERENCE_CWD = path.join(os.tmpdir(), 'crucible-adal-inference');
fs.mkdirSync(INFERENCE_CWD, { recursive: true });

// ---- Core runner --------------------------------------------------------
/**
 * @param {Object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]          ADAL catalog key, e.g. "zai-glm-4.7-flashx"
 * @param {string} [opts.cwd]            working directory; auto-minted if absent
 * @param {string[]} [opts.allowedTools] ADAL tool groups, e.g. ["Read","Search"]
 * @param {number} [opts.timeoutMs]      default 120_000
 * @returns {Promise<{ok:true, answer:string, model:string, session_id:string, raw:any}
 *                 | {ok:false, error:string, model?:string, session_id?:string, raw?:any}>}
 */
async function runAdal(opts) {
  const prompt = opts && opts.prompt;
  if (!prompt) return { ok: false, error: 'no_prompt' };

  if (!(await checkAdal())) return { ok: false, error: 'adal_not_installed' };

  const cwd = opts.cwd || INFERENCE_CWD;
  const model = opts.model || undefined;
  const allowedTools = Array.isArray(opts.allowedTools) ? opts.allowedTools : null;
  const timeoutMs = Number(opts.timeoutMs) || 120_000;

  await acquire();
  try {
    return await spawnAdal({ prompt, model, cwd, allowedTools, timeoutMs });
  } finally {
    release();
  }
}

function spawnAdal({ prompt, model, cwd, allowedTools, timeoutMs }) {
  return new Promise(resolve => {
    const args = ['-q', prompt, '-o', 'json'];
    if (model) args.push('-m', model);
    // Only enable tools when explicitly requested. Tools imply --yolo so
    // ADAL doesn't sit waiting on a UI confirmation that will never come.
    if (allowedTools && allowedTools.length) {
      args.push('--yolo', '--allowed-tools', allowedTools.join(','));
    }
    // `detached: true` makes the child the leader of its own process
    // group. On timeout we send SIGKILL to the whole group with
    // process.kill(-pid, …) so the bun worker dies too — without this,
    // SIGKILL on the wrapper leaves an orphaned worker that keeps holding
    // ~/.adal/settings.json.lock and blocks every subsequent call.
    const proc = spawn(ADAL_CMD, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-proc.pid, 'SIGKILL'); } catch (_) {
        try { proc.kill('SIGKILL'); } catch (_2) {}
      }
    }, timeoutMs);

    proc.on('error', err => {
      clearTimeout(timer);
      resolve({ ok: false, error: 'spawn_error: ' + err.message });
    });
    proc.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return resolve({ ok: false, error: 'timeout' });
      // ADAL prints JSON for both success and failure cases.
      try {
        const parsed = JSON.parse(stdout);
        if (parsed && parsed.success === false) {
          return resolve({
            ok: false,
            error: parsed.error || `adal failure (exit ${code})`,
            model: parsed.model,
            session_id: parsed.session_id,
            raw: parsed,
          });
        }
        return resolve({
          ok: true,
          answer: typeof parsed.answer === 'string' ? parsed.answer : '',
          model: parsed.model,
          session_id: parsed.session_id,
          raw: parsed,
        });
      } catch (e) {
        return resolve({
          ok: false,
          error: code !== 0
            ? `adal exit ${code}: ${stderr.slice(-400) || stdout.slice(-200)}`
            : `adal stdout not JSON: ${stdout.slice(0, 200)}`,
        });
      }
    });
  });
}

// ---- JSON helpers --------------------------------------------------------
function extractJsonObject(text) {
  if (!text) return null;
  const first = text.indexOf('{');
  if (first < 0) return null;
  let depth = 0, end = -1, inString = false, escaped = false;
  for (let i = first; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') inString = !inString;
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(text.slice(first, end + 1)); }
  catch { return null; }
}

async function runAdalJson(opts) {
  const res = await runAdal(opts);
  if (!res.ok) return { ...res, json: null };
  const json = extractJsonObject(res.answer);
  return { ...res, json };
}

module.exports = {
  ADAL_CMD,
  MAX_CONCURRENCY,
  MODEL_KEY_MAP,
  resolveAdalKey,
  checkAdal,
  runAdal,
  runAdalJson,
  extractJsonObject,
};
