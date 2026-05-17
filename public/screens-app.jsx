/* Dashboard + Repo detail — backend-driven */
const { useState: useS_d, useEffect: useE_d, useMemo: useM_d, useRef: useR_d } = React;

const STAGES = [
  { key: "probing",   label: "Probing",   verb: "Probing",   icon: "search" },
  { key: "forging",   label: "Forging",   verb: "Forging",   icon: "flame"  },
  { key: "tempering", label: "Tempering", verb: "Tempering", icon: "scale"  }
];

function stageChip(stageIdx) {
  if (stageIdx >= 3) return <span className="chip pass"><span className="chip-dot" />Tempered</span>;
  const s = STAGES[stageIdx] || STAGES[0];
  return <span className="chip ember"><span className="chip-dot pulse-dot" />{s.verb}</span>;
}

/* ============ Dashboard ============ */
function Dashboard({ user, projects, onOpen, onAddRepo, meta }) {
  const active = projects.filter(p => p.stage < 3).length;
  const completed = projects.filter(p => p.stage >= 3).length;
  const allEvalsWinners = useM_d(() => {
    // we don't have evals fully here; show what we have
    return projects.reduce((acc, p) => acc + (p.findings?.aiCalls || 0), 0);
  }, [projects]);

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--paper)" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 5, background: "var(--paper)",
        borderBottom: "1px solid var(--hairline)",
        padding: "18px 36px", display: "flex", alignItems: "center", gap: 16
      }}>
        <div style={{ flex: 1 }}>
          <div className="eyebrow">Dashboard</div>
          <h1 className="display" style={{ fontSize: 26, margin: "2px 0 0" }}>Your forge</h1>
        </div>
        <button className="btn btn-ghost"><Icon name="bell" size={14} /></button>
        <button className="btn btn-primary" onClick={onAddRepo}><Icon name="plus" size={14} />Connect repo</button>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
        borderBottom: "1px solid var(--hairline)",
        background: "var(--paper)"
      }}>
        {[
          { k: "REPOS UNDER FORGE", v: projects.length, sub: `${active} active`, em: false },
          { k: "EVALUATIONS BUILT", v: allEvalsWinners, sub: "across all repos", em: false },
          { k: "AVG SAVINGS",       v: "—", sub: "cheapest passing model", em: true },
          { k: "MODELS BENCHED",    v: meta?.challengers?.length || 5, sub: `via AdaL`, em: false }
        ].map((s, i) => (
          <div key={s.k} style={{
            padding: "22px 28px",
            borderRight: i < 3 ? "1px solid var(--hairline)" : "none"
          }}>
            <div className="eyebrow">{s.k}</div>
            <div className="display" style={{
              fontSize: 38, margin: "8px 0 4px",
              color: s.em ? "var(--ember)" : "var(--ink)"
            }}>{s.v}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "28px 36px 60px" }}>
        <div className="row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
          <div>
            <h2 className="display" style={{ fontSize: 22, margin: 0 }}>Repositories</h2>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {projects.length === 0 ? "No repos yet — connect one to start scanning." : `${projects.length} connected`}
            </div>
          </div>
          <div className="row gap-2">
            <span className="chip">All</span>
            <span className="chip" style={{ background: "transparent" }}>Active</span>
            <span className="chip" style={{ background: "transparent" }}>Tempered</span>
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState onAdd={onAddRepo} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {projects.map(p => (
              <RepoRow key={p.id} project={p} onOpen={() => onOpen(p.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="card" style={{ padding: 56, textAlign: "center" }}>
      <div style={{ width: 64, height: 64, margin: "0 auto 16px", display: "grid", placeItems: "center" }}>
        <CrucibleIcon size={56} />
      </div>
      <div className="display" style={{ fontSize: 22 }}>Nothing in the forge.</div>
      <div className="muted" style={{ margin: "4px 0 18px" }}>Connect your first repo to begin scanning.</div>
      <button className="btn btn-primary" onClick={onAdd}><Icon name="plus" size={14} />Connect repo</button>
    </div>
  );
}

function RepoRow({ project, onOpen }) {
  const stage = project.stage;
  const stageDef = STAGES[Math.min(stage, 2)];
  const pct = Math.round((project.progress || 0) * 100);
  const done = stage >= 3;

  return (
    <div
      onClick={onOpen}
      style={{
        background: "var(--paper-sunken)",
        border: "1px solid var(--hairline)",
        borderRadius: 2, cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = "var(--ink)"}
      onMouseLeave={e => e.currentTarget.style.borderColor = "var(--hairline)"}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ padding: "20px 24px", flex: "0 0 320px", borderRight: "1px solid var(--hairline)" }}>
          <div className="row gap-2 mono faint" style={{ fontSize: 11 }}>
            <Icon name="github" size={11} /> {project.owner}
            {project.isDemo && <span className="chip" style={{ marginLeft: 6, fontSize: 9 }}>demo</span>}
          </div>
          <div style={{
            fontFamily: "var(--font-display)", fontWeight: 900,
            fontSize: 22, letterSpacing: "-0.025em", marginTop: 6, marginBottom: 8
          }}>{project.name}</div>
          <div className="row gap-3 mono" style={{ fontSize: 11, color: "var(--ink-faint)" }}>
            <span>{project.lang}</span>
            <span>·</span>
            <span>{project.stars}★</span>
            <span>·</span>
            <span>updated {project.lastPush}</span>
          </div>
        </div>

        <div style={{ padding: "20px 24px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            {done
              ? <span className="chip pass"><Icon name="check" size={10} />Tempered</span>
              : stageChip(stage)}
            <span className="mono faint" style={{ fontSize: 11 }}>
              {done ? "ready" : `${pct}%`}
            </span>
          </div>

          <div className="row" style={{ gap: 4 }}>
            {STAGES.map((s, i) => {
              const segPct = stage > i ? 100 : stage === i ? Math.round((project.progress || 0) * 100) : 0;
              const isActive = stage === i;
              const isDone = stage > i;
              return (
                <div key={s.key} style={{ flex: 1 }}>
                  <div className="row mono" style={{ fontSize: 10, color: isActive ? "var(--ember-deep)" : isDone ? "var(--pass)" : "var(--ink-faint)", justifyContent: "space-between", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    <span>{String(i+1).padStart(2,"0")} {s.label}</span>
                    {isDone && <Icon name="check" size={10} />}
                  </div>
                  <div style={{ height: 4, background: "var(--paper-deep)", overflow: "hidden", borderRadius: 0, position: "relative" }}>
                    <div style={{
                      height: "100%",
                      width: `${segPct}%`,
                      background: isDone ? "var(--pass)" : "var(--ember)",
                      transition: "width 0.3s ease"
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mono faint" style={{ fontSize: 11.5 }}>
            {project.statusText || (done
              ? `Tempered`
              : stage === 0 ? `${project.findings.files} files · ${project.findings.aiCalls} ai callsites detected`
              : stage === 1 ? `Drafting evaluations…`
              : `Running models head-to-head…`)}
          </div>
        </div>

        <div style={{ padding: 20, display: "flex", alignItems: "center", borderLeft: "1px solid var(--hairline)" }}>
          <Icon name="chevron-r" size={20} />
        </div>
      </div>
    </div>
  );
}

/* ============ Repo Detail ============ */
function RepoDetail({ projectId, onBack, onOpenEval }) {
  const [data, setData] = useS_d(null);
  const [err, setErr] = useS_d("");

  useE_d(() => {
    let alive = true;
    let timer;
    async function load() {
      try {
        const d = await api.project(projectId);
        if (!alive) return;
        setData(d);
        // poll only while not done
        const done = d.project.stage >= 3;
        timer = setTimeout(load, done ? 5000 : 900);
      } catch (e) { if (alive) { setErr(e.message); timer = setTimeout(load, 2000); } }
    }
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [projectId]);

  if (err && !data) return <div style={{ padding: 40, color: 'var(--fail)' }}>Error: {err}</div>;
  if (!data) return <div style={{ padding: 40, color: 'var(--ink-faint)' }}>Loading…</div>;
  const project = data.project;

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--paper)" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 5, background: "var(--paper)",
        borderBottom: "1px solid var(--hairline)", padding: "16px 36px"
      }}>
        <div className="row gap-2 mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10 }}>
          <button className="btn-quiet" style={{ padding: 0 }} onClick={onBack}>Dashboard</button>
          <Icon name="chevron-r" size={11} />
          <span>{project.owner}</span>
          <Icon name="chevron-r" size={11} />
          <span style={{ color: "var(--ink)" }}>{project.name}</span>
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <h1 className="display" style={{ fontSize: 34, margin: 0, letterSpacing: "-0.03em" }}>
              {project.name}
            </h1>
            <div className="row gap-3 mono" style={{ fontSize: 12, color: "var(--ink-faint)", marginTop: 6 }}>
              <Icon name="github" size={11} />
              <span>{project.owner}/{project.name}</span>
              <span>·</span>
              <span>{project.defaultBranch || "main"}</span>
              <span>·</span>
              <span>{project.lang}</span>
              <span>·</span>
              <span>{project.stars}★</span>
              {project.isDemo && <span className="chip" style={{ marginLeft: 6 }}>demo</span>}
            </div>
          </div>
          <div className="row gap-2">
            {project.stage >= 3
              ? <span className="chip pass"><Icon name="check" size={10} />Tempered</span>
              : stageChip(project.stage)}
            <button className="btn btn-ghost" onClick={() => api.rescan(projectId).then(() => location.reload())}>
              <Icon name="play" size={14} />Re-run
            </button>
          </div>
        </div>
      </div>

      <div className="hairline-b">
        <StageRail stage={project.stage} />
      </div>

      <div style={{ padding: "28px 36px 60px" }}>
        {project.stage === 0 && <ProbeStage project={project} events={data.events} />}
        {project.stage === 1 && <ForgeStage project={project} evaluations={data.evaluations} />}
        {project.stage === 2 && <TemperStage project={project} evaluations={data.evaluations} />}
        {project.stage >= 3 && <DoneStage project={project} evaluations={data.evaluations} onOpenEval={onOpenEval} />}
      </div>
    </div>
  );
}

/* ----- Stage 1: Probing ----- */
function ProbeStage({ project, events }) {
  const f = project.findings;
  const lines = useM_d(() => buildLines(events), [events]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24 }}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="eyebrow">Step 01 · Probing</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginTop: 4 }}>Walking the repository</div>
          </div>
          <div className="chip ember"><span className="chip-dot pulse-dot" />Live</div>
        </div>
        <div style={{ padding: 0, background: "var(--ink)", color: "var(--paper)", maxHeight: 360, overflow: "hidden", position: "relative" }}>
          <div className="mono" style={{ padding: "14px 18px", fontSize: 12, lineHeight: 1.6 }}>
            {lines.length === 0 && <div style={{ opacity: 0.5 }}>$ probing repository…</div>}
            {lines.map((line, i) => (
              <div key={i} style={{ opacity: line.kind === "hit" ? 1 : 0.6, color: line.kind === "hit" ? "var(--ember)" : "var(--paper)" }}>
                <span style={{ color: "rgba(245,241,232,0.4)" }}>{line.t.padStart(10)} </span>
                {line.kind === "hit" ? "✦ " : "· "}
                {line.path}
                {line.note && <span style={{ marginLeft: 8, color: "rgba(245,241,232,0.45)" }}>{line.note}</span>}
              </div>
            ))}
          </div>
          <div style={{
            position: "absolute", left: 0, right: 0, height: 1, background: "var(--ember)",
            opacity: 0.5, animation: "scanline 2.4s linear infinite"
          }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Metric label="Files scanned"      value={f.files}     suffix="" big />
        <Metric label="AI callsites found" value={f.aiCalls}   suffix=" detections" emphasis />
        <Metric label="Distinct models"    value={f.models}    suffix=" provider/model pairs" />

        <div className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Detection ruleset</div>
          {[
            "OpenAI / Anthropic SDK imports",
            "fetch() to model.* endpoints",
            "LangChain / LlamaIndex chains",
            "Prompt templates & system msgs",
            "Tool / function-calling schemas"
          ].map(r => (
            <div key={r} className="row gap-2" style={{ padding: "6px 0", fontSize: 13 }}>
              <Icon name="check" size={12} /> {r}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildLines(events) {
  if (!events?.length) return [];
  const t0 = events[0].ts;
  return events.map(e => ({
    t: `+${((e.ts - t0)/1000).toFixed(2)}s`,
    path: e.path || "(scanning)",
    kind: e.kind,
    note: e.note
  })).slice(-16);
}

function Metric({ label, value, suffix, big, emphasis }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="eyebrow">{label}</div>
      <div style={{
        fontFamily: "var(--font-display)", fontWeight: 900,
        fontSize: big ? 44 : 32, letterSpacing: "-0.03em", marginTop: 4,
        color: emphasis ? "var(--ember)" : "var(--ink)",
        lineHeight: 1
      }}>{value}<span style={{ fontSize: 13, color: "var(--ink-faint)", fontWeight: 400, marginLeft: 6, letterSpacing: 0 }}>{suffix}</span></div>
    </div>
  );
}

/* ----- Stage 2: Forging ----- */
function ForgeStage({ project, evaluations }) {
  const evals = evaluations || [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24 }}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="eyebrow">Step 02 · Forging</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginTop: 4 }}>Drafting evaluations</div>
          </div>
          <div className="chip ember"><span className="chip-dot pulse-dot" />Generating</div>
        </div>
        <div>
          {evals.length === 0 && (
            <div style={{ padding: 20, color: "var(--ink-faint)", fontSize: 13 }}>Reading callsites…</div>
          )}
          {evals.map((e, i) => (
            <div key={e.id} style={{
              padding: "14px 20px",
              borderBottom: i < evals.length - 1 ? "1px solid var(--hairline)" : "none",
              display: "flex", alignItems: "center", gap: 14
            }}>
              <div style={{
                width: 28, height: 28, background: e.drafted ? "var(--ink)" : "var(--paper-deep)",
                color: e.drafted ? "var(--paper)" : "var(--ink-faint)",
                display: "grid", placeItems: "center", borderRadius: 2,
                fontFamily: "var(--font-mono)", fontSize: 11
              }}>{String(i+1).padStart(2,"0")}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{e.title}</div>
                <div className="mono faint" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {e.callsite} · {e.testCount} test cases · {e.metric}
                </div>
              </div>
              {e.drafted
                ? <span className="chip pass"><Icon name="check" size={10} />drafted</span>
                : <span className="chip"><span className="chip-dot pulse-dot" />queued</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Metric label="Evaluations queued" value={evals.length} big />
        <Metric label="Drafted" value={evals.filter(e => e.drafted).length} emphasis suffix={` of ${evals.length}`} />
        <div className="card" style={{ padding: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>What goes into an eval</div>
          <ul style={{ margin: 0, padding: "0 0 0 16px", fontSize: 13, lineHeight: 1.65 }}>
            <li>8–50 test cases per callsite</li>
            <li>Golden outputs from current model</li>
            <li>Metric: structured-match, factuality, or LLM-judge</li>
            <li>Frozen prompts & tool schemas</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ----- Stage 3: Tempering ----- */
function TemperStage({ project, evaluations }) {
  const evals = evaluations || [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="eyebrow">Step 03 · Tempering</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginTop: 4 }}>Running models against evals</div>
          </div>
          <div className="row gap-3">
            <div className="mono faint" style={{ fontSize: 11 }}>
              {evals.filter(e => e.status === "done").length}/{evals.length} complete
            </div>
            <div className="chip ember"><span className="chip-dot pulse-dot" />Running</div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--paper)", borderBottom: "1px solid var(--hairline)" }}>
              <th style={thStyle}>Evaluation</th>
              <th style={thStyle}>Current model</th>
              <th style={thStyle}>Challengers</th>
              <th style={thStyle}>Progress</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {evals.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: i < evals.length - 1 ? "1px solid var(--hairline)" : "none" }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500 }}>{e.title}</div>
                  <div className="mono faint" style={{ fontSize: 11 }}>{e.callsite}</div>
                </td>
                <td style={tdStyle}><span className="mono">{e.currentModel}</span></td>
                <td style={tdStyle}>
                  <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                    {(e.challengers || []).map(c => <span key={c} className="chip" style={{ fontSize: 10 }}>{c}</span>)}
                  </div>
                </td>
                <td style={{ ...tdStyle, width: 200 }}>
                  <div style={{ height: 4, background: "var(--paper-deep)", overflow: "hidden", position: "relative" }}>
                    <div style={{
                      height: "100%", width: `${Math.round((e.progress||0)*100)}%`,
                      background: e.status === "done" ? "var(--pass)" : "var(--ember)",
                      transition: "width 0.25s"
                    }}/>
                  </div>
                  <div className="mono faint" style={{ fontSize: 10.5, marginTop: 4 }}>{Math.round((e.progress||0)*100)}%</div>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {e.status === "done"
                    ? <span className="chip pass"><Icon name="check" size={10} />done</span>
                    : e.status === "running"
                      ? <span className="chip ember"><span className="chip-dot pulse-dot"/>running</span>
                      : <span className="chip">{e.status || "queued"}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row gap-3">
        <Metric label="Eval test cases run"  value={evals.reduce((a,e)=> a + Math.round((e.progress||0) * (e.testCount||0)), 0)} big />
        <Metric label="Models benched"        value={evals[0]?.challengers?.length || 0} suffix=" challengers each" />
        <Metric label="Pending"               value={evals.filter(e => e.status !== "done").length} emphasis />
      </div>
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "12px 20px", fontSize: 11, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-faint)", fontWeight: 400 };
const tdStyle = { padding: "14px 20px", verticalAlign: "top" };

/* ----- Stage 4: Done ----- */
/* Pick the winner client-side at a given quality threshold. Mirrors the
   backend logic in tempering.js so the user can drag a slider and see the
   recommendation shift live, without re-running the pipeline.
   Returns { model, pass_rate, total_cost, meetsBar } or null. */
function pickWinnerAt(results, threshold) {
  if (!results || !results.per_challenger) return null;
  const entries = Object.entries(results.per_challenger);
  let best = null;
  // Cheapest challenger meeting the bar.
  for (const [model, info] of entries) {
    if ((info.pass_rate || 0) >= threshold) {
      const cost = Number(info.total_cost) || 0;
      if (!best || cost < (best.total_cost ?? Infinity)) {
        best = { model, pass_rate: info.pass_rate || 0, total_cost: cost, meetsBar: true };
      }
    }
  }
  if (best) return best;
  // Fallback: highest pass rate, regardless of bar (matches backend).
  for (const [model, info] of entries) {
    if (!best || (info.pass_rate || 0) > (best.pass_rate || -1)) {
      best = { model, pass_rate: info.pass_rate || 0, total_cost: Number(info.total_cost) || 0, meetsBar: false };
    }
  }
  return best;
}

/* Project a single eval's economics at a given quality bar. */
function evalAtThreshold(e, threshold) {
  const empty = { winner: null, passRate: null, savingsPct: 0, savedPerCall: 0, currentPerCall: 0, meetsBar: false };
  const r = e?.results;
  if (!r) return empty;
  const w = pickWinnerAt(r, threshold);
  if (!w) return empty;
  const tc = e.testCount || 1;
  const cur = Number(r.current_total_cost) || 0;
  const win = Number(w.total_cost) || 0;
  if (cur <= 0) {
    return { winner: w.model, passRate: w.pass_rate, savingsPct: 0, savedPerCall: 0, currentPerCall: 0, meetsBar: w.meetsBar };
  }
  const savedPerCall = (cur > win) ? (cur - win) / tc : 0;
  const savingsPct = Math.max(0, Math.round((cur - win) / cur * 100));
  return {
    winner: w.model,
    passRate: w.pass_rate,
    savingsPct,
    savedPerCall,
    currentPerCall: cur / tc,
    meetsBar: w.meetsBar,
  };
}

function formatUSD(n) {
  if (!isFinite(n) || n <= 0) return '$0';
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 10_000) return '$' + Math.round(n / 1000) + 'K';
  if (n >= 1) return '$' + Math.round(n).toLocaleString();
  return '$' + n.toFixed(2);
}

function CostProjection({ evaluations, monthly, setMonthly, qualityBar, setQualityBar }) {
  // Per-eval threshold-aware projection (memoize the array work).
  const rows = evaluations.map(e => ({ e, t: evalAtThreshold(e, qualityBar) }));
  const projectables = rows.filter(({ t }) => t.currentPerCall > 0);
  if (!projectables.length) return null;

  const eligible = projectables.filter(({ t }) => t.meetsBar && t.savedPerCall > 0);
  // Spread monthly traffic evenly across ALL projectable callsites
  // (honest model — raising the bar drops dollars saved, doesn't concentrate them).
  const denom = Math.max(1, projectables.length);
  const perEvalCalls = Math.max(0, Math.floor((monthly || 0) / denom));

  const savedPerMonth = eligible.reduce((acc, { t }) => acc + t.savedPerCall * perEvalCalls, 0);
  const currentPerMonth = projectables.reduce((acc, { t }) => acc + t.currentPerCall * perEvalCalls, 0);
  const pctReclaimed = currentPerMonth > 0 ? Math.round((savedPerMonth / currentPerMonth) * 100) : 0;

  const volPresets = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];
  const barPresets = [60, 70, 80, 90];

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--hairline)" }}>
        <div className="eyebrow">Projection</div>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginTop: 4 }}>What this saves you</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
          Based on measured tokens × public list pricing. Estimate, not invoice.
        </div>
      </div>

      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--hairline)", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Volume */}
        <div>
          <div className="row" style={{ alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>If this code handles</span>
            <input
              className="input"
              type="number"
              min={0}
              step={1000}
              value={monthly}
              onChange={e => setMonthly(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 180, fontSize: 18, fontFamily: "var(--font-display)", fontWeight: 900, borderBottom: "2px solid var(--ink)", padding: "6px 0" }}
            />
            <span style={{ fontSize: 14 }}>requests / month…</span>
          </div>
          <div className="row gap-2" style={{ marginTop: 12, flexWrap: "wrap" }}>
            {volPresets.map(p => (
              <button
                key={p}
                className="chip"
                onClick={() => setMonthly(p)}
                style={{
                  cursor: "pointer",
                  background: monthly === p ? "var(--ink)" : "transparent",
                  color: monthly === p ? "var(--paper)" : "var(--ink-muted)",
                  border: "1px solid " + (monthly === p ? "var(--ink)" : "var(--hairline)"),
                  padding: "6px 12px",
                  fontSize: 11,
                }}
              >
                {p >= 1_000_000 ? (p / 1_000_000) + 'M' : (p / 1000) + 'K'}
              </button>
            ))}
          </div>
        </div>

        {/* Quality bar */}
        <div>
          <div className="row" style={{ alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>…and you accept models passing</span>
            <span style={{ fontSize: 22, fontFamily: "var(--font-display)", fontWeight: 900, minWidth: 56, color: "var(--ink)" }}>{qualityBar}%</span>
            <span style={{ fontSize: 14 }}>of test cases or more.</span>
          </div>
          <input
            type="range" min={50} max={100} step={5}
            value={qualityBar}
            onChange={e => setQualityBar(Number(e.target.value))}
            style={{ width: "100%", marginTop: 14, accentColor: "var(--ember)" }}
          />
          <div className="row gap-2" style={{ marginTop: 8, flexWrap: "wrap" }}>
            {barPresets.map(p => (
              <button
                key={p}
                className="chip"
                onClick={() => setQualityBar(p)}
                style={{
                  cursor: "pointer",
                  background: qualityBar === p ? "var(--ink)" : "transparent",
                  color: qualityBar === p ? "var(--paper)" : "var(--ink-muted)",
                  border: "1px solid " + (qualityBar === p ? "var(--ink)" : "var(--hairline)"),
                  padding: "6px 12px",
                  fontSize: 11,
                }}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div style={{ padding: "24px 24px", borderRight: "1px solid var(--hairline)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 42, lineHeight: 1, color: "var(--ember)" }}>
            {formatUSD(savedPerMonth)}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>saved per month</div>
        </div>
        <div style={{ padding: "24px 24px", borderRight: "1px solid var(--hairline)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 42, lineHeight: 1 }}>
            {formatUSD(savedPerMonth * 12)}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>annualized</div>
        </div>
        <div style={{ padding: "24px 24px" }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 42, lineHeight: 1 }}>
            {pctReclaimed}%
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>spend reclaimed</div>
        </div>
      </div>

      <div style={{ padding: "10px 24px 14px", borderTop: "1px solid var(--hairline)", fontSize: 11, color: "var(--ink-faint)" }}>
        {eligible.length} of {evaluations.length} callsite{evaluations.length === 1 ? '' : 's'} qualify at {qualityBar}% pass rate.
      </div>
    </div>
  );
}

/* Build a Markdown report from the current threshold-aware view. */
function generateReport(project, evals, qualityBar, monthly) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const rows = evals.map(e => ({ e, t: evalAtThreshold(e, qualityBar) }));
  const projectables = rows.filter(({ t }) => t.currentPerCall > 0);
  const eligible = projectables.filter(({ t }) => t.meetsBar && t.savedPerCall > 0);
  const denom = Math.max(1, projectables.length);
  const perEvalCalls = Math.max(0, Math.floor((monthly || 0) / denom));
  const totalMonthly = eligible.reduce((a, r) => a + r.t.savedPerCall * perEvalCalls, 0);
  const totalCurrent = projectables.reduce((a, r) => a + r.t.currentPerCall * perEvalCalls, 0);
  const pctReclaimed = totalCurrent > 0 ? Math.round((totalMonthly / totalCurrent) * 100) : 0;

  let md = `# Crucible Report — ${project.fullName || project.name}\n\n`;
  md += `Generated ${dateStr} · quality bar = ${qualityBar}% · volume = ${(monthly || 0).toLocaleString()} req/month\n\n`;
  md += `## Summary\n\n`;
  md += `- **${eligible.length} of ${evals.length} callsites** qualify for migration at ≥${qualityBar}% pass rate.\n`;
  md += `- **Projected savings**: ${formatUSD(totalMonthly)} / month, ${formatUSD(totalMonthly * 12)} / year.\n`;
  md += `- **Spend reclaimed**: ${pctReclaimed}%.\n\n`;

  if (eligible.length === 0) {
    md += `_No callsites meet the threshold at this quality bar. Lower the bar or add more challenger models in \`CHALLENGER_MODELS\`._\n\n`;
  } else {
    md += `## Recommendations\n\n`;
    eligible.forEach((r, i) => {
      const { e, t } = r;
      const monthlyDollar = formatUSD(t.savedPerCall * perEvalCalls);
      md += `### ${i + 1}. ${e.title}\n\n`;
      md += `- **Location**: \`${e.callsite}\`\n`;
      md += `- **Current**: \`${e.currentModel}\`\n`;
      md += `- **Recommended**: \`${t.winner}\`\n`;
      md += `- **Pass rate**: ${t.passRate}%\n`;
      md += `- **Cost reduction**: ${t.savingsPct}%\n`;
      md += `- **Projected at this volume**: ${monthlyDollar} / month\n\n`;
    });
  }

  const skipped = projectables.filter(r => !(r.t.meetsBar && r.t.savedPerCall > 0));
  if (skipped.length) {
    md += `## Skipped\n\n`;
    skipped.forEach(r => {
      const reason = !r.t.meetsBar
        ? `pass rate ${r.t.passRate ?? '—'}% is below the ${qualityBar}% bar`
        : `no cost reduction available with current challengers`;
      md += `- **${r.e.title}** \`${r.e.callsite}\` — ${reason}.\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;
  md += `_Methodology: each callsite was reverse-engineered into a set of representative test cases. Every test was run against the current model and each challenger via the ADAL CLI; Claude Opus 4.7 served as the judge. Pass rate is the fraction of cases the challenger matched in quality. Cost estimates use measured tokens × public list pricing — for planning, not invoicing._\n\n`;
  md += `_Generated by [Crucible](https://github.com/josuediazflores/crucible)._\n`;
  return md;
}

function downloadText(text, filename, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DoneStage({ project, evaluations, onOpenEval }) {
  const evals = evaluations || [];

  const [monthly, setMonthly] = useS_d(1_000_000);
  const [qualityBar, setQualityBar] = useS_d(80);

  const rows = evals.map(e => ({ e, t: evalAtThreshold(e, qualityBar) }));
  const projectables = rows.filter(({ t }) => t.currentPerCall > 0);
  const eligible = projectables.filter(({ t }) => t.meetsBar && t.savedPerCall > 0);
  const denom = Math.max(1, projectables.length);
  const perEvalCalls = Math.floor(monthly / denom);

  // Verdict-card avg savings comes from threshold-aware eligible set.
  const avg = eligible.length
    ? Math.round(eligible.reduce((a, r) => a + r.t.savingsPct, 0) / eligible.length)
    : 0;

  const onDownloadReport = () => {
    const safeName = String(project.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `crucible-${safeName}-${qualityBar}pct.md`;
    downloadText(generateReport(project, evals, qualityBar, monthly), filename);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
      <div className="card" style={{ padding: "28px 32px", background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }}>
        <div className="eyebrow" style={{ color: "rgba(245,241,232,0.5)" }}>Verdict</div>
        <div className="display" style={{ fontSize: 44, margin: "10px 0 6px", lineHeight: 0.95 }}>
          You're overpaying by <span style={{ color: "var(--ember)" }}>{avg}%</span>.
        </div>
        <div style={{ color: "rgba(245,241,232,0.7)", fontSize: 15, maxWidth: 640 }}>
          {evals.length} evaluations completed. {eligible.length} callsite{eligible.length === 1 ? '' : 's'} qualify for
          migration at the {qualityBar}% quality bar — every winner passes the same tests.
        </div>
      </div>

      <CostProjection
        evaluations={evals}
        monthly={monthly} setMonthly={setMonthly}
        qualityBar={qualityBar} setQualityBar={setQualityBar}
      />

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--hairline)" }}>
          <div className="eyebrow">Results</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginTop: 4 }}>Recommended model per callsite</div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--paper)", borderBottom: "1px solid var(--hairline)" }}>
              <th style={thStyle}>Evaluation</th>
              <th style={thStyle}>Current</th>
              <th style={thStyle}>Winner</th>
              <th style={thStyle}>Pass rate</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Savings</th>
              <th style={{ ...thStyle, textAlign: "right" }} title="At the volume above">$ / month</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ e, t }, i) => {
              const qualifies = t.meetsBar && t.savedPerCall > 0;
              const dollars = qualifies ? t.savedPerCall * perEvalCalls : null;
              return (
                <tr
                  key={e.id}
                  className="row-clickable"
                  onClick={() => onOpenEval && onOpenEval(e.id)}
                  style={{
                    borderBottom: i < rows.length - 1 ? "1px solid var(--hairline)" : "none",
                    cursor: onOpenEval ? "pointer" : "default",
                    opacity: qualifies ? 1 : 0.55,
                  }}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{e.title}</div>
                    <div className="mono faint" style={{ fontSize: 11 }}>{e.callsite}</div>
                  </td>
                  <td style={tdStyle}><span className="mono">{e.currentModel}</span></td>
                  <td style={tdStyle}>
                    {qualifies
                      ? <span className="mono" style={{ color: "var(--ember-deep)", fontWeight: 500 }}>{t.winner}</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td style={tdStyle}>
                    <div className="row gap-2">
                      <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18 }}>{t.passRate ?? '—'}%</span>
                      {qualifies && <span className="chip pass" style={{ fontSize: 10 }}>pass</span>}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {qualifies
                      ? <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: "var(--ember)" }}>−{t.savingsPct}%</span>
                      : <span className="muted">—</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {dollars
                      ? <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18 }}>{formatUSD(dollars)}</span>
                      : <span className="muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Re-runs nightly. Crucible will notify you when a smaller model becomes viable.
          </div>
          <div className="row gap-2">
            <button className="btn btn-ghost" onClick={onDownloadReport}>Download report</button>
            <button className="btn btn-primary">Apply recommendations<Icon name="arrow-right" size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----- Settings ----- */
function Settings({ user, onUserUpdate, onLogout }) {
  const [name, setName] = useS_d(user?.name || "");
  const [email, setEmail] = useS_d(user?.email || "");
  const [profileBusy, setProfileBusy] = useS_d(false);
  const [profileMsg, setProfileMsg] = useS_d(null);
  const [profileErr, setProfileErr] = useS_d("");

  const [curPw, setCurPw] = useS_d("");
  const [newPw, setNewPw] = useS_d("");
  const [confirmPw, setConfirmPw] = useS_d("");
  const [pwBusy, setPwBusy] = useS_d(false);
  const [pwMsg, setPwMsg] = useS_d(null);
  const [pwErr, setPwErr] = useS_d("");

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : "—";

  async function saveProfile(e) {
    e.preventDefault();
    setProfileBusy(true); setProfileErr(""); setProfileMsg(null);
    try {
      const res = await api.updateProfile({ name, email });
      onUserUpdate(res.user);
      setProfileMsg("Saved");
      setTimeout(() => setProfileMsg(null), 2000);
    } catch (e) { setProfileErr(e.message || "Could not save."); }
    setProfileBusy(false);
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwBusy(true); setPwErr(""); setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwErr("New password and confirmation don't match.");
      setPwBusy(false);
      return;
    }
    try {
      await api.changePassword({ currentPassword: curPw, newPassword: newPw });
      setCurPw(""); setNewPw(""); setConfirmPw("");
      setPwMsg("Password updated");
      setTimeout(() => setPwMsg(null), 2500);
    } catch (e) { setPwErr(e.message || "Could not update password."); }
    setPwBusy(false);
  }

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--paper)" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 5, background: "var(--paper)",
        borderBottom: "1px solid var(--hairline)", padding: "16px 36px"
      }}>
        <div className="row gap-2 mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10 }}>
          <span>Account</span>
          <Icon name="chevron-r" size={11} />
          <span style={{ color: "var(--ink)" }}>Settings</span>
        </div>
        <h1 className="display" style={{ fontSize: 34, margin: 0, letterSpacing: "-0.03em" }}>Settings</h1>
      </div>

      <div style={{ padding: "28px 36px 60px", display: "grid", gridTemplateColumns: "minmax(0, 640px)", gap: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Profile</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginBottom: 18 }}>Your account</div>
          <form onSubmit={saveProfile} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field">
              <label>Name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              Member since {memberSince}
            </div>
            {profileErr && <div style={{ color: "var(--fail)", fontSize: 13 }}>{profileErr}</div>}
            {profileMsg && <div style={{ color: "var(--ember-deep)", fontSize: 13 }}>{profileMsg}</div>}
            <div>
              <button className="btn btn-primary" type="submit" disabled={profileBusy}>
                {profileBusy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Security</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginBottom: 18 }}>Change password</div>
          <form onSubmit={savePassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="field">
              <label>Current password</label>
              <input className="input" type="password" value={curPw} onChange={e => setCurPw(e.target.value)} />
            </div>
            <div className="field">
              <label>New password</label>
              <input className="input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input className="input" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
            </div>
            {pwErr && <div style={{ color: "var(--fail)", fontSize: 13 }}>{pwErr}</div>}
            {pwMsg && <div style={{ color: "var(--ember-deep)", fontSize: 13 }}>{pwMsg}</div>}
            <div>
              <button className="btn btn-primary" type="submit" disabled={pwBusy}>
                {pwBusy ? "Updating…" : "Update password"}
              </button>
            </div>
          </form>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Session</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Sign out</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            Ends your session on this device. You can sign back in any time.
          </div>
          <button className="btn btn-ghost" onClick={onLogout}>
            <Icon name="logout" size={14} />Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----- Documentation ----- */
function Documentation() {
  const stages = [
    { name: "Probing",   text: "Walks each repository, applies pattern-matchers against the source, and records every detected LLM callsite — file, line, provider, model, and a prompt excerpt." },
    { name: "Forging",   text: "For each callsite, an AI coding agent reads the surrounding code and drafts an evaluation: prompt template, output schema, scoring metric, and 8–12 realistic test cases." },
    { name: "Tempering", text: "Runs every test case through the current model and each challenger. Claude Opus 4.7 acts as judge, deciding whether each challenger's output is at least as good as the current model's." },
    { name: "Tempered",  text: "Picks the cheapest challenger whose pass rate clears the quality bar. The winner, its pass rate, and the projected cost savings show up in your dashboard." },
  ];

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--paper)" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 5, background: "var(--paper)",
        borderBottom: "1px solid var(--hairline)", padding: "16px 36px"
      }}>
        <div className="row gap-2 mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10 }}>
          <span>Account</span>
          <Icon name="chevron-r" size={11} />
          <span style={{ color: "var(--ink)" }}>Documentation</span>
        </div>
        <h1 className="display" style={{ fontSize: 34, margin: 0, letterSpacing: "-0.03em" }}>How Crucible works</h1>
      </div>

      <div style={{ padding: "28px 36px 60px", display: "grid", gridTemplateColumns: "minmax(0, 780px)", gap: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Overview</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginBottom: 12 }}>What Crucible does</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Crucible scans your GitHub repositories for LLM callsites — every place your code calls
            OpenAI, Anthropic, Google, OpenRouter, LangChain, or a raw HTTP endpoint. For each one,
            it reverse-engineers an evaluation, runs that eval against a slate of cheaper challenger
            models, and tells you the cheapest model that still passes — plus the percentage you'd
            save by switching.
          </p>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Pipeline</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginBottom: 16 }}>The four stages</div>
          {stages.map((s, i) => (
            <div key={s.name} style={{
              display: "flex", gap: 16,
              paddingTop: i ? 14 : 0, paddingBottom: i === stages.length - 1 ? 0 : 14,
              borderTop: i ? "1px solid var(--hairline)" : "none"
            }}>
              <div className="mono" style={{ minWidth: 30, color: "var(--ink-faint)", fontSize: 12, paddingTop: 2 }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.name}</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)" }}>{s.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Results</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginBottom: 12 }}>Reading the dashboard</div>
          <ul style={{ paddingLeft: 18, margin: 0, fontSize: 14, lineHeight: 1.75 }}>
            <li><strong>Winner</strong> — the cheapest challenger model whose pass rate cleared the quality bar (default 80%).</li>
            <li><strong>Pass rate</strong> — fraction of test cases the winner passed, per the judge.</li>
            <li><strong>Savings %</strong> — projected cost reduction vs the current model, based on approximate token counts and published pricing.</li>
          </ul>
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "24px 24px 18px" }}>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Configuration</div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18 }}>Environment variables</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Set in your <code className="mono">.env</code> file. All have safe defaults.</div>
          </div>
          {[
            { key: "ADAL_CMD",          desc: <>Path to the <code className="mono">adal</code> binary.</>,                      def: "adal" },
            { key: "ADAL_CONCURRENCY",  desc: <>Max concurrent <code className="mono">adal -q</code> subprocesses.</>,           def: "1" },
            { key: "JUDGE_MODEL",       desc: <>ADAL catalog key used as the judge.</>,                                          def: "anthropic-claude-opus-4-7" },
            { key: "FORGER_MODEL",      desc: <>ADAL catalog key for eval drafting.</>,                                          def: "anthropic-claude-sonnet-4-6" },
            { key: "CHALLENGER_MODELS", desc: <>Comma-separated ADAL catalog keys to benchmark.</>,                              def: "haiku, gemini-flash, …" },
          ].map((row, i, arr) => (
            <div key={row.key} style={{
              display: "grid",
              gridTemplateColumns: "minmax(170px, max-content) 1fr",
              gap: 28,
              padding: "14px 24px",
              borderTop: "1px solid var(--hairline)",
              alignItems: "baseline",
              background: i % 2 === 1 ? "rgba(15, 14, 12, 0.015)" : "transparent",
            }}>
              <code className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", letterSpacing: 0.2 }}>
                {row.key}
              </code>
              <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-muted)" }}>
                {row.desc}
                <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-faint)", marginTop: 4 }}>
                  Default <code className="mono" style={{ color: "var(--ink-muted)" }}>{row.def}</code>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Privacy</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18, marginBottom: 12 }}>Where your code lives</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Crucible runs entirely on your machine. Repository clones, evaluations, and run results
            are stored in a local SQLite database. Nothing is uploaded anywhere except the prompts
            sent to your configured AI providers via the ADAL CLI.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ----- Per-eval drill-down ----- */
function ModelOutputCell({ run, role, isLast }) {
  if (!run) {
    return (
      <div style={{
        padding: 16, color: "var(--ink-faint)", fontSize: 12, fontStyle: "italic",
        borderRight: isLast ? "none" : "1px solid var(--hairline)",
      }}>
        — no run —
      </div>
    );
  }
  const passed = run.passed === 1;
  const failed = run.passed === 0;
  const cost = Number(run.cost_usd) || 0;
  const costStr = cost > 0 ? "$" + cost.toFixed(5) : "—";
  return (
    <div style={{
      padding: 16,
      borderRight: isLast ? "none" : "1px solid var(--hairline)",
      display: "flex", flexDirection: "column", minHeight: 0,
    }}>
      <div className="row" style={{ alignItems: "center", marginBottom: 10, fontSize: 11, gap: 8, flexWrap: "wrap" }}>
        <span className="eyebrow" style={{ fontSize: 10 }}>{role === "current" ? "Current" : "Challenger"}</span>
        <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{run.model}</span>
        <span className="row gap-2 mono" style={{ marginLeft: "auto", color: "var(--ink-faint)", fontSize: 11 }}>
          <span>{costStr}</span>
          <span>·</span>
          <span>{run.latency_ms ?? "—"}ms</span>
        </span>
      </div>
      <div className="mono" style={{
        fontSize: 12.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
        lineHeight: 1.55, maxHeight: 280, overflow: "auto",
        color: "var(--ink)", background: "rgba(15,14,12,0.025)",
        padding: "10px 12px", borderRadius: 2, flex: 1, minHeight: 60,
      }}>
        {run.output || "[empty]"}
      </div>
      {(passed || failed) && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
          {passed
            ? <span className="chip pass" style={{ fontSize: 10, fontWeight: 600 }}><span className="chip-dot" />PASS</span>
            : <span className="chip" style={{ fontSize: 10, fontWeight: 600, background: "var(--ember)", color: "var(--paper)", borderColor: "transparent" }}>✗ FAIL</span>}
          {run.judge_reason && (
            <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-muted)" }}>
              {run.judge_reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TestCasePanel({ tc, current, challengers }) {
  let input = {};
  try { input = JSON.parse(tc.input_json || '{}'); }
  catch { input = { raw: tc.input_json }; }
  const inputDisplay = typeof input.user_message === 'string'
    ? input.user_message
    : JSON.stringify(input);

  const cellCount = 1 + challengers.length;
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--hairline)" }}>
        <div className="row" style={{ alignItems: "baseline", gap: 14 }}>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", fontWeight: 600 }}>
            #{String(tc.idx + 1).padStart(2, '0')}
          </span>
          <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5, flex: 1 }}>
            {inputDisplay}
          </div>
        </div>
        {tc.golden_output && (
          <div className="row" style={{ marginTop: 10, gap: 10, alignItems: "baseline" }}>
            <span className="eyebrow" style={{ fontSize: 10 }}>Expected</span>
            <div style={{ fontSize: 12.5, color: "var(--ink-faint)", lineHeight: 1.5, flex: 1, fontStyle: "italic" }}>
              {tc.golden_output}
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cellCount}, minmax(0, 1fr))` }}>
        <ModelOutputCell run={current} role="current" isLast={challengers.length === 0} />
        {challengers.map((c, i) => (
          <ModelOutputCell key={c.id} run={c} role="challenger" isLast={i === challengers.length - 1} />
        ))}
      </div>
    </div>
  );
}

function EvalDetail({ evalId, onBack }) {
  const [data, setData] = useS_d(null);
  const [err, setErr] = useS_d(null);

  useE_d(() => {
    let alive = true;
    setData(null); setErr(null);
    api.evaluation(evalId)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(e.message || 'Failed to load.'); });
    return () => { alive = false; };
  }, [evalId]);

  if (err) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--paper)" }}>
        <div className="card" style={{ padding: 28, maxWidth: 480, textAlign: "center" }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Error</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, marginBottom: 10 }}>
            Couldn't load this evaluation
          </div>
          <div className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>{err}</div>
          <button className="btn btn-primary" onClick={onBack}>Back to project</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", background: "var(--paper)" }}>
        <div style={{ opacity: 0.35 }}><Logo size={26} /></div>
      </div>
    );
  }

  const { evaluation: e, project: proj, test_cases: tcs, model_runs: runs } = data;
  // Group runs by test_case_id. Identify the current-model row by passed === null.
  const byTc = {};
  for (const r of runs) {
    if (!byTc[r.test_case_id]) byTc[r.test_case_id] = { current: null, challengers: [] };
    if (r.passed === null) byTc[r.test_case_id].current = r;
    else byTc[r.test_case_id].challengers.push(r);
  }

  const passed = runs.filter(r => r.passed === 1).length;
  const failed = runs.filter(r => r.passed === 0).length;

  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--paper)" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 5, background: "var(--paper)",
        borderBottom: "1px solid var(--hairline)", padding: "16px 36px"
      }}>
        <div className="row gap-2 mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 10 }}>
          <button className="btn-quiet" style={{ padding: 0 }} onClick={onBack}>Dashboard</button>
          <Icon name="chevron-r" size={11} />
          <button className="btn-quiet" style={{ padding: 0 }} onClick={onBack}>{proj.name}</button>
          <Icon name="chevron-r" size={11} />
          <span style={{ color: "var(--ink)" }}>{e.title}</span>
        </div>
        <div className="row" style={{ alignItems: "flex-end", gap: 24 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="display" style={{ fontSize: 30, margin: 0, letterSpacing: "-0.03em" }}>{e.title}</h1>
            <div className="mono faint" style={{ fontSize: 12, marginTop: 6 }}>{e.callsite}</div>
          </div>
          <button className="btn btn-ghost" onClick={onBack}>
            <Icon name="chevron-r" size={13} />Back to project
          </button>
        </div>
        <div className="row gap-3" style={{ marginTop: 18, fontSize: 12, color: "var(--ink-muted)", flexWrap: "wrap" }}>
          <div className="row gap-2">
            <span className="eyebrow" style={{ fontSize: 10 }}>Current</span>
            <span className="mono">{e.currentModel}</span>
          </div>
          <span style={{ color: "var(--ink-faint)" }}>→</span>
          <div className="row gap-2">
            <span className="eyebrow" style={{ fontSize: 10 }}>Winner</span>
            <span className="mono" style={{ color: "var(--ember-deep)", fontWeight: 500 }}>{e.winner || "—"}</span>
          </div>
          <span style={{ color: "var(--ink-faint)" }}>·</span>
          <div className="row gap-2">
            <span className="eyebrow" style={{ fontSize: 10 }}>Pass rate</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900 }}>{e.passRate ?? "—"}%</span>
          </div>
          <span style={{ color: "var(--ink-faint)" }}>·</span>
          <div className="row gap-2">
            <span className="eyebrow" style={{ fontSize: 10 }}>Savings</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, color: "var(--ember)" }}>−{e.savingsPct ?? 0}%</span>
          </div>
          <span style={{ color: "var(--ink-faint)" }}>·</span>
          <div className="row gap-2">
            <span className="eyebrow" style={{ fontSize: 10 }}>Cases</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 900 }}>{tcs.length}</span>
            <span className="muted" style={{ fontSize: 11 }}>
              ({passed} pass · {failed} fail)
            </span>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 36px 60px", display: "flex", flexDirection: "column", gap: 18 }}>
        {tcs.length === 0 && (
          <div className="card" style={{ padding: 28, textAlign: "center" }}>
            <div className="muted">No test cases on this evaluation.</div>
          </div>
        )}
        {tcs.map(tc => {
          const group = byTc[tc.id] || { current: null, challengers: [] };
          return (
            <TestCasePanel
              key={tc.id}
              tc={tc}
              current={group.current}
              challengers={group.challengers}
            />
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, RepoDetail, EvalDetail, Settings, Documentation });
