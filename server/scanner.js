const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const db = require('./db');

const WORK_DIR = path.join(__dirname, '..', 'work');
if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });

const SCANNABLE_EXTS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.java', '.kt',
  '.cs', '.swift', '.php', '.ex', '.exs', '.scala'
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'target', 'vendor', '.turbo',
  'coverage', '.cache', '.parcel-cache', 'out'
]);

// ---- Pattern-based detectors -----------------------------------------------
// Each pattern: { re, provider, callKind, modelGroup? }
// modelGroup: if present, extract model name from this regex capture group.
const PATTERNS = [
  // OpenAI Python: client.chat.completions.create(model="...")
  { re: /\b(?:openai|client)\.(?:chat\.completions|completions)\.create\s*\(\s*[\s\S]{0,400}?model\s*=\s*["']([^"']+)["']/g,
    provider: 'openai', callKind: 'chat', modelGroup: 1 },
  // OpenAI JS: openai.chat.completions.create({ model: "..." })
  { re: /\b(?:openai|client)\.chat\.completions\.create\s*\(\s*\{[\s\S]{0,400}?model\s*:\s*["']([^"']+)["']/g,
    provider: 'openai', callKind: 'chat', modelGroup: 1 },
  // OpenAI Embeddings
  { re: /\b(?:openai|client)\.embeddings\.create\s*\(\s*[\s\S]{0,300}?model\s*[=:]\s*["']([^"']+)["']/g,
    provider: 'openai', callKind: 'embedding', modelGroup: 1 },
  // Anthropic: client.messages.create({ model: "..." }) — Python + JS
  { re: /\b(?:anthropic|client)\.messages\.create\s*\(\s*\{?[\s\S]{0,400}?model\s*[=:]\s*["']([^"']+)["']/g,
    provider: 'anthropic', callKind: 'chat', modelGroup: 1 },
  // Anthropic completions (legacy)
  { re: /\b(?:anthropic|client)\.completions\.create\s*\(\s*\{?[\s\S]{0,400}?model\s*[=:]\s*["']([^"']+)["']/g,
    provider: 'anthropic', callKind: 'completion', modelGroup: 1 },
  // Google generative AI
  { re: /(?:genai|google_genai|GenerativeModel)\s*\(\s*[\s\S]{0,200}?["']([^"']*(?:gemini|palm)[^"']*)["']/gi,
    provider: 'google', callKind: 'chat', modelGroup: 1 },
  // fetch to OpenAI / Anthropic / OpenRouter endpoints
  { re: /fetch\s*\(\s*["']https?:\/\/api\.openai\.com\/v1\/(chat\/completions|completions|embeddings)["']/g,
    provider: 'openai', callKind: 'chat' },
  { re: /fetch\s*\(\s*["']https?:\/\/api\.anthropic\.com\/v1\/messages["']/g,
    provider: 'anthropic', callKind: 'chat' },
  { re: /fetch\s*\(\s*["']https?:\/\/openrouter\.ai\/api\/v1\//g,
    provider: 'openrouter', callKind: 'chat' },
  // LangChain
  { re: /\bChat(OpenAI|Anthropic|GoogleGenerativeAI)\s*\(\s*[\s\S]{0,300}?model(?:_name)?\s*[=:]\s*["']([^"']+)["']/g,
    provider: 'langchain', callKind: 'chat', modelGroup: 2 },
  // raw model strings in well-known providers
  { re: /["'](gpt-4o(?:-mini)?(?:-\d{4}-\d{2}-\d{2})?)["']/g,                    provider: 'openai',    callKind: 'unknown', modelGroup: 1 },
  { re: /["'](gpt-4(?:\.5|-turbo|-32k)?(?:-\d{4}-\d{2}-\d{2})?)["']/g,            provider: 'openai',    callKind: 'unknown', modelGroup: 1 },
  { re: /["'](gpt-3\.5-turbo[\w-]*)["']/g,                                       provider: 'openai',    callKind: 'unknown', modelGroup: 1 },
  { re: /["'](claude-3-(?:5-)?(?:sonnet|haiku|opus)[\w.-]*)["']/g,                provider: 'anthropic', callKind: 'unknown', modelGroup: 1 },
  { re: /["'](claude-(?:sonnet|haiku|opus)-[\w.-]+)["']/g,                       provider: 'anthropic', callKind: 'unknown', modelGroup: 1 },
  { re: /["'](text-embedding-(?:3-(?:small|large)|ada-002))["']/g,                provider: 'openai',    callKind: 'embedding', modelGroup: 1 },
  { re: /["'](gemini-(?:1\.5-(?:pro|flash)|2\.0-flash)[\w.-]*)["']/g,             provider: 'google',    callKind: 'chat',     modelGroup: 1 },
];

// Detect if output is parsed as JSON / structured
const JSON_HINTS = [
  /response_format\s*[=:]\s*\{?\s*["']?type["']?\s*[=:]\s*["']json/i,
  /\.parse\s*\(\s*\w+\s*\)/,
  /JSON\.parse\(/,
  /response_model\s*=\s*\w+/,
  /BaseModel/,
  /pydantic/i,
  /zod/i,
];
const TOOL_HINTS = [/tools\s*[=:]\s*\[/, /tool_choice/, /functions\s*[=:]\s*\[/];

function looksLikeRepo(p) {
  try { return fs.existsSync(path.join(p, '.git')) || fs.existsSync(path.join(p, 'package.json')) || fs.existsSync(path.join(p, 'pyproject.toml')); }
  catch { return false; }
}

function projectWorkDir(projectId) {
  return path.join(WORK_DIR, projectId.replace(/[^a-zA-Z0-9_-]/g, '_'));
}

function spawnPromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    p.stdout.on('data', d => stdout += d.toString());
    p.stderr.on('data', d => stderr += d.toString());
    p.on('error', reject);
    p.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited ${code}: ${stderr || stdout}`));
    });
  });
}

async function cloneRepo(project, accessToken) {
  const dir = projectWorkDir(project.id);
  if (fs.existsSync(dir)) {
    try { await fsp.rm(dir, { recursive: true, force: true }); } catch (_) {}
  }
  // Build URL with token for private repos.
  let cloneUrl = project.clone_url;
  if (!cloneUrl) cloneUrl = `https://github.com/${project.owner}/${project.name}.git`;
  if (accessToken && cloneUrl.startsWith('https://github.com/')) {
    cloneUrl = cloneUrl.replace('https://', `https://x-access-token:${accessToken}@`);
  }
  await spawnPromise('git', ['clone', '--depth', '1', cloneUrl, dir]);
  return dir;
}

async function* walkFiles(rootDir) {
  // Async generator: walk tree, yield candidate scannable files (skip large + binary + skip dirs).
  const stack = [rootDir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = await fsp.readdir(cur, { withFileTypes: true }); }
    catch { continue; }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue;
        if (ent.name.startsWith('.') && ent.name !== '.github') continue;
        stack.push(full);
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (!SCANNABLE_EXTS.has(ext)) continue;
        let stat;
        try { stat = await fsp.stat(full); } catch { continue; }
        if (stat.size > 256 * 1024) continue;  // skip very large files
        yield { full, rel: path.relative(rootDir, full), size: stat.size };
      }
    }
  }
}

function extractPromptExcerpt(snippet) {
  // Best-effort: find a content/messages/prompt assignment and grab next ~200 chars.
  const m = snippet.match(/(?:prompt|messages|input|content|system|user)\s*[=:]\s*([`"'])([\s\S]{0,400}?)\1/i);
  if (m) return m[2].slice(0, 320).trim();
  return null;
}

function detectOutputFormat(snippet) {
  for (const re of TOOL_HINTS) if (re.test(snippet)) return 'tool_call';
  for (const re of JSON_HINTS) if (re.test(snippet)) return 'json';
  if (/embedding/i.test(snippet)) return 'embedding';
  if (/stream\s*[=:]\s*True/i.test(snippet) || /\.stream\(/i.test(snippet)) return 'stream';
  return 'text';
}

function buildCallKindFromOutputFormat(callKind, fmt) {
  if (callKind === 'embedding' || fmt === 'embedding') return 'embedding';
  if (fmt === 'tool_call') return 'tool';
  return callKind || 'chat';
}

function lineNumberAt(text, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function logScanEvent(projectId, kind, p, note) {
  db.prepare('INSERT INTO scan_events (project_id, ts, kind, path, note) VALUES (?, ?, ?, ?, ?)')
    .run(projectId, Date.now(), kind, p || null, note || null);
}

async function scanRepoFiles(project, onProgress) {
  const dir = projectWorkDir(project.id);
  if (!fs.existsSync(dir)) throw new Error(`Repo not cloned: ${dir}`);

  const insertCallsite = db.prepare(`INSERT INTO callsites
    (project_id, file_path, line, provider, model, call_kind, snippet, prompt_excerpt, output_format)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const distinctModels = new Set();
  let filesScanned = 0;
  let aiCallsites = 0;

  for await (const file of walkFiles(dir)) {
    filesScanned += 1;
    let txt;
    try { txt = await fsp.readFile(file.full, 'utf8'); }
    catch { continue; }

    // Per-file dedupe: byCharIdx ranges that have already been claimed,
    // and (model, ~line) pairs to avoid the loose model-string patterns
    // re-firing inside a previously-matched SDK call.
    const claimedRanges = [];           // [start, end]
    const claimedByModel = new Set();   // `${model}@${approxLineBucket}`
    let hits = [];
    for (const pat of PATTERNS) {
      pat.re.lastIndex = 0;
      let m;
      while ((m = pat.re.exec(txt)) !== null) {
        const idx = m.index;
        const end = idx + m[0].length;
        // skip if this match is inside an already-claimed SDK call range
        if (claimedRanges.some(([a, b]) => idx >= a && idx < b + 600)) continue;
        const line = lineNumberAt(txt, idx);
        const model = pat.modelGroup ? (m[pat.modelGroup] || null) : null;
        const bucket = `${model || pat.provider}@${Math.floor(line / 8)}`;
        if (claimedByModel.has(bucket)) continue;
        claimedByModel.add(bucket);
        claimedRanges.push([idx, end]);
        const sStart = Math.max(0, idx - 100);
        const sEnd = Math.min(txt.length, idx + m[0].length + 300);
        const snippet = txt.slice(sStart, sEnd);
        const outputFormat = detectOutputFormat(snippet);
        const promptExcerpt = extractPromptExcerpt(snippet);
        const callKind = buildCallKindFromOutputFormat(pat.callKind, outputFormat);

        insertCallsite.run(
          project.id, file.rel, line, pat.provider, model || null,
          callKind, snippet, promptExcerpt, outputFormat
        );
        if (model) distinctModels.add(model);
        aiCallsites += 1;
        hits.push({ line, model, kind: callKind });
      }
    }

    if (hits.length) {
      logScanEvent(project.id, 'hit', file.rel,
        hits.slice(0, 3).map(h => `${h.kind}${h.model ? `(${h.model})` : ''}`).join(', '));
    } else if (filesScanned % 7 === 0) {
      logScanEvent(project.id, 'file', file.rel, null);
    }

    if (onProgress && filesScanned % 5 === 0) {
      await onProgress({
        filesScanned, aiCallsites,
        distinctModels: distinctModels.size,
      });
    }
  }

  if (onProgress) await onProgress({
    filesScanned, aiCallsites, distinctModels: distinctModels.size,
  });
  return { filesScanned, aiCallsites, distinctModels: distinctModels.size };
}

module.exports = { cloneRepo, scanRepoFiles, projectWorkDir, logScanEvent };
