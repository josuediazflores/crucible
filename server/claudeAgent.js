/**
 * Compatibility shim — preserves the existing module surface so callers
 * (`forger.js`, `tempering.js`, `pipeline.js`, `index.js`) don't have to
 * change their imports while the ADAL migration is in flight.
 *
 * All real work happens in `./adal`.
 *
 * Original module wrapped @anthropic-ai/claude-agent-sdk; that dependency
 * is now inert (orphaned in package.json for a follow-up cleanup).
 */
const adal = require('./adal');

// Existing callers expect `isConfigured()` to be synchronous, but the new
// check spawns `adal -v`. Cache the resolved value so the second call is
// synchronous. Returns a Promise on first call, a boolean afterward — both
// truthy/falsy in the same way callers consume.
let cached = null;
function isConfigured() {
  if (cached !== null) return cached;
  const p = adal.checkAdal().then(v => { cached = v; return v; });
  return p;
}

/**
 * Pre-existing signature:
 *   runQuery({ prompt, model, system, cwd, allowedTools, schema, maxTurns, timeoutMs })
 * Ignored under ADAL: `system` (no real `-p` override), `schema` (no
 * server-side enforcement), `maxTurns` (single-turn semantics by default).
 * The legacy return shape was `{ok, text, structured, raw}` or `{ok:false, error}`.
 * We adapt to that.
 */
async function runQuery(opts = {}) {
  const res = await adal.runAdal({
    prompt: opts.prompt,
    model: adal.resolveAdalKey(opts.model) || opts.model,
    cwd: opts.cwd,
    allowedTools: opts.allowedTools,
    timeoutMs: opts.timeoutMs,
  });
  if (!res.ok) return { ok: false, error: res.error || 'adal_failure' };
  return {
    ok: true,
    text: res.answer || '',
    structured: null,   // ADAL has no structured-output enforcement
    raw: res.raw ? [res.raw] : [],
  };
}

/**
 * Pre-existing signature:
 *   runJsonQuery(opts) → runQuery result + { json }
 */
async function runJsonQuery(opts = {}) {
  const res = await runQuery(opts);
  if (!res.ok) return { ...res, json: null };
  const json = adal.extractJsonObject(res.text);
  return { ...res, json };
}

module.exports = {
  isConfigured,
  runQuery,
  runJsonQuery,
  extractJsonObject: adal.extractJsonObject,
};
