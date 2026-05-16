# Crucible

Automated AI evaluations for enterprise GitHub repos.

Crucible connects to a GitHub account, walks the repos you select, finds every
LLM callsite (OpenAI / Anthropic / OpenRouter / LangChain / etc.), reverse-
engineers each one into an evaluation (prompt template, output schema, test
cases), then runs it against a slate of cheaper challenger models via
OpenRouter and uses **Claude Opus 4.7** as the judge. The output: for each
callsite, the cheapest model that still passes — and the % you'll save by
switching.

```
Probing  →  Forging   →  Tempering  →  Tempered
(scan)      (build evals) (run + judge)  (results)
```

The whole stack is local: Node/Express + SQLite. No cloud.

---

## Quick start

```bash
cp .env.example .env
# edit .env (keys are all OPTIONAL — the app degrades gracefully to demo mode)
npm install
npm start
# open http://localhost:4317
```

### Optional keys

| key                   | what it enables                                                  |
| --------------------- | ---------------------------------------------------------------- |
| `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | Real GitHub OAuth — clone & scan your real repos.   |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Opus 4.7 judge + Claude-driven prompt extraction. Uses your Claude **subscription** via the Agent SDK — no metered API tokens. |
| `OPENROUTER_API_KEY`  | Actually run the challenger models (one key, many providers).    |
| `ADAL_CMD` (path to `adal`) | Use ADAL CLI as the coding agent during Forging (preferred over the Agent SDK if installed). |

Without keys, the dashboard still works end-to-end — it falls back to a
high-fidelity simulation that mirrors what the real pipeline would do, so you
can demo the UX without burning credits.

### Claude Agent SDK setup (OAuth — no Anthropic API charges)

Crucible uses [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk),
which delegates inference to Claude Code under the hood. That means **you can
authenticate against your Claude Pro/Max/Team/Enterprise subscription** instead
of using a metered Anthropic API key.

```bash
# 1. Install Claude Code (only needs to be done once):
npm i -g @anthropic-ai/claude-code

# 2. Generate a long-lived (~1 year) OAuth token:
claude setup-token
#   Walks you through OAuth in a browser, then prints an sk-ant-oat01-... token.

# 3. Paste it into .env:
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-…
```

That single token replaces the old `ANTHROPIC_API_KEY` requirement. (If you do
set both, the SDK still prefers `CLAUDE_CODE_OAUTH_TOKEN`.)

### GitHub OAuth setup

1. https://github.com/settings/developers → **New OAuth App**
2. Homepage URL: `http://localhost:4317`
3. Authorization callback URL: `http://localhost:4317/api/github/callback`
4. Copy the client ID / secret into `.env`.

### ADAL setup (optional but cool)

ADAL is the SylphAI coding agent. Install + log in once interactively, then
Crucible will shell out to it headlessly.

```bash
npm i -g @sylphai/adal-cli
adal              # log in once, credentials get cached
# from now on Crucible can call:
#   adal -q "<prompt>" -o json --yolo --allowed-tools "Read,Search"
```

If `adal` isn't on the PATH or `-v` fails, Crucible falls through to direct
Anthropic SDK calls.

---

## Architecture

```
public/                  # the design — React + Babel-standalone (no build step)
  index.html             #   loads the bundle
  styles.css             #   design tokens (Paper / Ember / Ink), forge palette
  api.js                 #   thin fetch wrapper
  components.jsx         #   shared icons + Logo + Sidebar + StageRail
  screens-auth.jsx       #   sign in / sign up / GitHub / repo picker
  screens-app.jsx        #   dashboard + repo detail (4 stages)
  app.jsx                #   router, polls /api/projects
  assets/                #   crucible icons (light/dark)

server/                  # Node 18+, no transpile
  index.js               #   Express routes + static
  db.js                  #   better-sqlite3 with the full schema
  auth.js                #   bcrypt + session cookies (httpOnly)
  github.js              #   OAuth dance, listRepos, demo accounts
  scanner.js             #   git clone + regex callsite detector
  forger.js              #   ADAL → Claude → fallback eval spec extractor
  tempering.js           #   OpenRouter runner + Claude Opus judge
  pipeline.js            #   the background queue: probing → forging → tempering

data/crucible.db         # SQLite (created on first run; in .gitignore)
work/                    # cloned repos live here (also gitignored)
```

### The pipeline, in detail

1. **Probing** — `git clone --depth 1`, walk files, run regex detectors that
   look for OpenAI / Anthropic / LangChain SDK calls plus raw model name
   strings. Each hit becomes a `callsites` row with provider, model, call
   kind, output format hint, and a code snippet. Live events stream into
   `scan_events` so the UI's faux-terminal scroll feels real.

2. **Forging** — for each callsite, build an evaluation. Strategy:
   - If `ADAL_CMD` is set and ADAL is logged in, shell out:
     `adal -q "$FORGE_PROMPT" -o json --yolo --allowed-tools "Read,Search"`
     (run inside the cloned repo, so ADAL can read surrounding files).
   - Else if `CLAUDE_CODE_OAUTH_TOKEN` is set, call the **Claude Agent SDK**
     (`@anthropic-ai/claude-agent-sdk`) with the snippet, giving it
     `Read`/`Grep`/`Glob` tools scoped to the cloned repo and requesting a
     JSON-schema-validated response.
   - Else, synthesize plausible test cases from the snippet alone.
   The returned spec has: title, prompt template (with `{var}` placeholders),
   output format, metric, and 8–12 test cases with golden outputs.

3. **Tempering** — for each test case:
   - Run the **current model** (via OpenRouter; or the Claude Agent SDK if the
     current model is a Claude one and OpenRouter isn't configured).
   - Run **each challenger** via OpenRouter.
   - Judge each (current, challenger) pair with **Claude Opus 4.7** via the
     Claude Agent SDK (structured JSON output: `{pass, reason}`).
   The cheapest challenger with pass-rate ≥ `QUALITY_BAR` (default 80%) wins.

4. **Tempered** — UI flips to the verdict card; per-callsite recommendation
   shows winner model, pass rate, and savings %.

---

## API surface

| Method | Path                          | Notes                                     |
| ------ | ----------------------------- | ----------------------------------------- |
| GET    | `/api/meta`                   | Current user + which integrations are on. |
| POST   | `/api/auth/signup`            | `{ name, email, password }`               |
| POST   | `/api/auth/signin`            | `{ email, password }`                     |
| POST   | `/api/auth/signout`           |                                           |
| GET    | `/api/github/status`          |                                           |
| GET    | `/api/github/start`           | Returns `{ url }` to redirect to.         |
| GET    | `/api/github/callback`        | OAuth redirect target. Sets account.      |
| POST   | `/api/github/demo`            | Skips OAuth, attaches demo repos.         |
| GET    | `/api/github/repos`           | The user's repos.                         |
| GET    | `/api/projects`               | All projects + live stage/progress.       |
| POST   | `/api/projects`               | Import selected repos.                    |
| GET    | `/api/projects/:id`           | Full detail incl. callsites, events, evals. |
| POST   | `/api/projects/:id/rescan`    | Restart at probing.                       |

All routes are cookie-authenticated (`crucible_sid`, httpOnly, lax).

---

## Design system

From the original Crucible design bundle:

- **Paper** `#F5F1E8` / **Paper sunken** `#EDE7D8` / **Paper deep** `#E4DCC8`
- **Ink** `#0F0E0C` / **Ink muted** `#4A4742` / **Ink faint** `#8A857C`
- **Ember** `#DC4A1F` (accent) / **Ember deep** `#A8351A` / **Ember tint** `#F4D3C0`
- Fonts: **Unbounded** (Black, display), **DM Sans** (body), **JetBrains Mono** (code)
- Stage metaphor: Probing → Forging → Tempering → Tempered

---

## Roadmap / not-yet-done

- "Apply recommendations" button currently has no backing endpoint — it would
  open a PR replacing model strings.
- "Export migration diff" the same.
- Embedding-callsite evals use cosine recall in spec but the judge currently
  routes embeddings through the same LLM judge — should be specialized.
- ADAL multi-turn (`-r <session-id>`) — currently we only use single-shot.

---

## License

Private / internal hackathon project.
