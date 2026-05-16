const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'crucible.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS github_accounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  login        TEXT NOT NULL,
  github_id    INTEGER,
  avatar_url   TEXT,
  access_token TEXT,
  scopes       TEXT,
  connected_at INTEGER NOT NULL,
  is_demo      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner        TEXT NOT NULL,
  name         TEXT NOT NULL,
  full_name    TEXT NOT NULL,
  default_branch TEXT,
  lang         TEXT,
  stars        INTEGER DEFAULT 0,
  last_push    TEXT,
  clone_url    TEXT,
  is_demo      INTEGER NOT NULL DEFAULT 0,
  stage        INTEGER NOT NULL DEFAULT 0,
  progress     REAL NOT NULL DEFAULT 0,
  files_scanned INTEGER NOT NULL DEFAULT 0,
  ai_callsites INTEGER NOT NULL DEFAULT 0,
  distinct_models INTEGER NOT NULL DEFAULT 0,
  status_text  TEXT,
  error        TEXT,
  connected_at INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ts         INTEGER NOT NULL,
  kind       TEXT NOT NULL,  -- 'file' | 'hit' | 'log'
  path       TEXT,
  note       TEXT
);

CREATE INDEX IF NOT EXISTS idx_scan_events_proj ON scan_events(project_id, id DESC);

CREATE TABLE IF NOT EXISTS callsites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path  TEXT NOT NULL,
  line       INTEGER NOT NULL,
  provider   TEXT,           -- 'openai' | 'anthropic' | 'google' | 'cohere' | ...
  model      TEXT,            -- e.g. 'gpt-4o' or 'claude-3-5-sonnet'
  call_kind  TEXT,            -- 'chat' | 'completion' | 'embedding' | 'tool' | 'unknown'
  snippet    TEXT,            -- raw code snippet
  prompt_excerpt TEXT,        -- best-effort extracted prompt
  output_format  TEXT,        -- 'text' | 'json' | 'tool_call' | 'embedding' | 'unknown'
  schema_hint TEXT,           -- best-effort json schema or tool schema text
  metric     TEXT             -- 'structured-match' | 'llm-judge' | 'cosine-recall' | ...
);

CREATE INDEX IF NOT EXISTS idx_callsites_proj ON callsites(project_id);

CREATE TABLE IF NOT EXISTS evaluations (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  callsite_id  INTEGER REFERENCES callsites(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  callsite_label TEXT NOT NULL,         -- e.g. 'src/agents/router.ts:42'
  current_model  TEXT NOT NULL,
  challengers    TEXT NOT NULL,         -- JSON array of strings
  metric         TEXT NOT NULL,
  test_count     INTEGER NOT NULL,
  drafted        INTEGER NOT NULL DEFAULT 0,
  progress       REAL NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'queued',  -- queued|drafting|running|done|error
  winner         TEXT,
  pass_rate      INTEGER,
  savings_pct    INTEGER,
  results_json   TEXT,                    -- per-challenger pass rates and cost
  prompt_template TEXT,
  schema_json    TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evaluations_proj ON evaluations(project_id);

CREATE TABLE IF NOT EXISTS test_cases (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  idx           INTEGER NOT NULL,
  input_json    TEXT NOT NULL,
  golden_output TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_cases_eval ON test_cases(evaluation_id);

CREATE TABLE IF NOT EXISTS model_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_id TEXT NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  test_case_id  INTEGER NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  model         TEXT NOT NULL,
  output        TEXT,
  passed        INTEGER,           -- 0/1, null while pending
  tokens        INTEGER,
  cost_usd      REAL,
  latency_ms    INTEGER,
  judge_reason  TEXT,
  ts            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_runs_eval ON model_runs(evaluation_id);
`);

module.exports = db;
