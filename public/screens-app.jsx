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
function RepoDetail({ projectId, onBack }) {
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
        {project.stage >= 3 && <DoneStage project={project} evaluations={data.evaluations} />}
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
function DoneStage({ project, evaluations }) {
  const evals = evaluations || [];
  const passing = evals.filter(e => (e.savingsPct || 0) > 0);
  const avg = passing.length ? Math.round(passing.reduce((a,e)=>a+(e.savingsPct||0),0) / passing.length) : 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
      <div className="card" style={{ padding: "28px 32px", background: "var(--ink)", color: "var(--paper)", borderColor: "transparent" }}>
        <div className="eyebrow" style={{ color: "rgba(245,241,232,0.5)" }}>Verdict</div>
        <div className="display" style={{ fontSize: 44, margin: "10px 0 6px", lineHeight: 0.95 }}>
          You're overpaying by <span style={{ color: "var(--ember)" }}>{avg}%</span>.
        </div>
        <div style={{ color: "rgba(245,241,232,0.7)", fontSize: 15, maxWidth: 640 }}>
          {evals.length} evaluations completed. For each callsite, Crucible found a smaller model
          that meets your quality bar. Switch with confidence — every winner passes the same tests.
        </div>
      </div>

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
                  <span className="mono" style={{ color: "var(--ember-deep)", fontWeight: 500 }}>{e.winner || '—'}</span>
                </td>
                <td style={tdStyle}>
                  <div className="row gap-2">
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 18 }}>{e.passRate ?? '—'}%</span>
                    {e.passRate >= 80 && <span className="chip pass" style={{ fontSize: 10 }}>pass</span>}
                  </div>
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: "var(--ember)" }}>−{e.savingsPct || 0}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Re-runs nightly. Crucible will notify you when a smaller model becomes viable.
          </div>
          <div className="row gap-2">
            <button className="btn btn-ghost"><Icon name="code" size={14} />Export migration diff</button>
            <button className="btn btn-primary">Apply recommendations<Icon name="arrow-right" size={14} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, RepoDetail });
