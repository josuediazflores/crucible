/**
 * Thin wrapper around @anthropic-ai/claude-agent-sdk.
 *
 * Auth: the SDK reads CLAUDE_CODE_OAUTH_TOKEN from the environment when no API
 * key is set, so a Claude Pro/Max/Team subscriber can run `claude setup-token`
 * once and not need a metered Anthropic API key.
 *
 * The SDK is ESM-only and the rest of the project is CommonJS, so we lazy-load
 * it via dynamic import.
 */

let sdkPromise = null;
function loadSdk() {
  if (!sdkPromise) sdkPromise = import('@anthropic-ai/claude-agent-sdk');
  return sdkPromise;
}

function isConfigured() {
  return !!(process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

/**
 * Run a single-turn query through the Claude Agent SDK.
 *
 * @param {Object} opts
 * @param {string} opts.prompt
 * @param {string} [opts.model]               e.g. "claude-opus-4-7" or "haiku"
 * @param {string} [opts.system]              system prompt
 * @param {string} [opts.cwd]                 working directory (for Read/Grep tools)
 * @param {string[]} [opts.allowedTools]      default [] (no tools — pure inference)
 * @param {Object} [opts.schema]              JSON schema for structured output
 * @param {number} [opts.maxTurns]            default 1
 * @param {number} [opts.timeoutMs]           default 90_000
 *
 * @returns {Promise<{ ok: true, text: string, structured: any|null, raw: any[] } | { ok: false, error: string }>}
 */
async function runQuery(opts) {
  if (!isConfigured()) {
    return { ok: false, error: 'no_credentials' };
  }
  const {
    prompt, model, system, cwd,
    allowedTools = [],
    schema = null,
    maxTurns = 1,
    timeoutMs = 90_000,
  } = opts;

  let sdk;
  try { sdk = await loadSdk(); }
  catch (e) { return { ok: false, error: 'sdk_load_failed: ' + e.message }; }

  const queryOptions = {
    model,
    maxTurns,
    permissionMode: 'default',
    allowedTools,
  };
  if (system) queryOptions.systemPrompt = system;
  if (cwd) queryOptions.cwd = cwd;
  if (schema) {
    queryOptions.outputFormat = { type: 'json_schema', schema };
  }

  // Strip undefined keys so the SDK doesn't choke on them.
  for (const k of Object.keys(queryOptions)) {
    if (queryOptions[k] === undefined) delete queryOptions[k];
  }

  const collected = [];
  let textChunks = [];
  let structured = null;
  let resultMessage = null;
  let timedOut = false;

  const iterable = sdk.query({ prompt, options: queryOptions });
  const timer = setTimeout(() => {
    timedOut = true;
    if (iterable && typeof iterable.return === 'function') iterable.return();
  }, timeoutMs);

  try {
    for await (const msg of iterable) {
      collected.push(msg);
      if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            textChunks.push(block.text);
          }
        }
      } else if (msg.type === 'result') {
        resultMessage = msg;
        if (msg.result && typeof msg.result === 'string') textChunks.push(msg.result);
        if (msg.structured_output) structured = msg.structured_output;
      }
    }
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: timedOut ? 'timeout' : ('sdk_error: ' + err.message) };
  }
  clearTimeout(timer);

  return {
    ok: true,
    text: textChunks.join('').trim(),
    structured,
    raw: collected,
  };
}

/** Pull the largest balanced {...} block out of a string (heuristic JSON extractor). */
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

/**
 * Convenience wrapper for "give me JSON back" queries.
 * Tries structured output first; falls back to parsing the text response.
 */
async function runJsonQuery(opts) {
  const res = await runQuery(opts);
  if (!res.ok) return res;
  if (res.structured && typeof res.structured === 'object') {
    return { ...res, json: res.structured };
  }
  const parsed = extractJsonObject(res.text);
  return { ...res, json: parsed };
}

module.exports = { isConfigured, runQuery, runJsonQuery, extractJsonObject };
