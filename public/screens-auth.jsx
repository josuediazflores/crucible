/* Auth + Onboarding screens — backend-backed */
const { useState: useState_a, useEffect: useEffect_a, useRef: useRef_a } = React;

/* ---- Decorative left panel (unchanged from design) ---- */
function ForgePanel({ lines }) {
  return (
    <div style={{
      background: "var(--ink)", color: "var(--paper)", flex: 1,
      padding: "44px 48px", display: "flex", flexDirection: "column",
      position: "relative", overflow: "hidden"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Logo size={28} dark />
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <div>
          <h1 className="display" style={{
            fontSize: 72, margin: 0, letterSpacing: "-0.04em",
            lineHeight: 0.95, maxWidth: 480
          }}>
            {lines[0]}<br/>
            <span style={{ color: "var(--ember)" }}>{lines[1]}</span>
          </h1>
        </div>
      </div>

      <div style={{
        position: "absolute", right: -120, bottom: -120,
        width: 360, height: 360, border: "1px solid rgba(245,241,232,0.06)",
        borderRadius: "50%"
      }} />
      <div style={{
        position: "absolute", right: -60, bottom: -60,
        width: 240, height: 240, border: "1px solid rgba(245,241,232,0.08)",
        borderRadius: "50%"
      }} />
      <div style={{
        position: "absolute", right: 20, bottom: 20,
        width: 120, height: 120, border: "1px solid var(--ember)",
        borderRadius: "50%", opacity: 0.5
      }} />
    </div>
  );
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState_a("signup");
  const [name, setName] = useState_a("");
  const [email, setEmail] = useState_a("");
  const [pw, setPw] = useState_a("");
  const [err, setErr] = useState_a("");
  const [busy, setBusy] = useState_a(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      const fn = mode === "signup" ? api.signup : api.signin;
      const res = await fn({ name, email, password: pw });
      onAuth(res.user);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--paper)" }}>
      <ForgePanel lines={["Smelt your", "model spend."]} />

      <div style={{ width: 480, padding: "44px 56px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h2 className="display" style={{ fontSize: 36, margin: "0 0 30px" }}>
          {mode === "signup" ? "Start a forge." : "Welcome back."}
        </h2>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {mode === "signup" && (
            <div className="field">
              <label>Name</label>
              <input className="input" placeholder="Ada Lovelace" value={name} onChange={e => setName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" placeholder="••••••••" value={pw} onChange={e => setPw(e.target.value)} />
          </div>

          {err && <div style={{ color: "var(--fail)", fontSize: 13 }}>{err}</div>}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginTop: 14, padding: "14px 20px" }}>
            {busy ? "…" : (mode === "signup" ? "Create account" : "Sign in")}
            <Icon name="arrow-right" size={16} />
          </button>
        </form>

        <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span className="muted">{mode === "signup" ? "Already have an account?" : "First time here?"}</span>
          <button className="btn-quiet" style={{ padding: 0, color: "var(--ember-deep)", fontWeight: 500 }}
            onClick={() => { setErr(""); setMode(mode === "signup" ? "signin" : "signup"); }}>
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </div>
      </div>
    </div>
  );
}

function GitHubConnectScreen({ user, meta, onConnected, onBack }) {
  const [phase, setPhase] = useState_a("idle"); // idle, oauth, success
  const [tick, setTick] = useState_a(0);
  const [err, setErr] = useState_a("");

  useEffect_a(() => {
    if (phase !== "oauth") return;
    let t = 0;
    const id = setInterval(() => {
      t += 1;
      setTick(t);
      if (t >= 3) clearInterval(id);
    }, 600);
    return () => clearInterval(id);
  }, [phase]);

  async function startOAuth() {
    setErr("");
    if (!meta.github_configured) {
      // Fall through to demo flow
      try {
        await api.githubDemo();
        setPhase("oauth");
        setTimeout(async () => {
          setPhase("success");
          await new Promise(r => setTimeout(r, 600));
          const st = await api.githubStatus();
          onConnected(st.account);
        }, 1800);
        return;
      } catch (e) { setErr(e.message); return; }
    }
    try {
      const { url } = await api.githubStart();
      window.location.href = url;
    } catch (e) { setErr(e.message); }
  }

  async function useDemo() {
    setErr("");
    try {
      await api.githubDemo();
      setPhase("oauth");
      setTimeout(async () => {
        setPhase("success");
        await new Promise(r => setTimeout(r, 600));
        const st = await api.githubStatus();
        onConnected(st.account);
      }, 1800);
    } catch (e) { setErr(e.message); }
  }

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--paper)" }}>
      <ForgePanel lines={["Connect", "your code."]} />

      <div style={{ width: 520, padding: "44px 56px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h2 className="display" style={{ fontSize: 36, margin: "0 0 8px" }}>Connect GitHub.</h2>
        <p className="muted" style={{ margin: "0 0 32px", fontSize: 14 }}>
          Crucible needs read access to your repositories to find AI calls and generate evaluations.
        </p>

        <div className="card" style={{ padding: 0, marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 20 }}>
            <div style={{
              width: 44, height: 44, background: "var(--ink)", color: "var(--paper)",
              display: "grid", placeItems: "center", borderRadius: 2
            }}>
              <Icon name="github" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 15 }}>GitHub</div>
              <div className="muted" style={{ fontSize: 12.5 }}>Read access to selected repositories</div>
            </div>
            {phase === "success"
              ? <span className="chip pass"><Icon name="check" size={11} />Connected</span>
              : phase === "oauth"
                ? <span className="chip ember"><span className="chip-dot pulse-dot" />Authorizing</span>
                : <span className="chip">Not connected</span>}
          </div>

          {phase === "oauth" && (
            <div className="hairline-t" style={{ padding: "14px 20px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-muted)" }}>
              <div>{tick >= 1 ? "✓" : "·"} Redirecting to github.com/login/oauth/authorize…</div>
              <div>{tick >= 2 ? "✓" : "·"} Awaiting authorization code…</div>
              <div>{tick >= 3 ? "✓" : "·"} Exchanging code for access token…</div>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
          {[
            { icon: "search", t: "Read repo contents" },
            { icon: "branch", t: "Read branch metadata" },
            { icon: "file",   t: "Read pull requests" },
            { icon: "lock",   t: "No write access" }
          ].map(s => (
            <div key={s.t} className="row gap-2" style={{ padding: "10px 12px", border: "1px solid var(--hairline)", borderRadius: 2, fontSize: 13 }}>
              <Icon name={s.icon} size={14} />{s.t}
            </div>
          ))}
        </div>

        {err && <div style={{ color: "var(--fail)", fontSize: 13, marginBottom: 14 }}>{err}</div>}

        <div className="row gap-3">
          <button className="btn btn-ghost" onClick={onBack}><Icon name="arrow-left" size={14} />Back</button>
          <button
            className="btn btn-dark"
            style={{ flex: 1, padding: "14px 20px" }}
            onClick={startOAuth}
            disabled={phase !== "idle"}
          >
            <Icon name="github" size={16} />
            {meta.github_configured ? "Authorize Crucible on GitHub" : "Continue with demo repos"}
          </button>
        </div>

        {meta.github_configured && (
          <div style={{ marginTop: 14, fontSize: 12.5 }}>
            <button className="btn-quiet" style={{ padding: 0, color: "var(--ember-deep)" }} onClick={useDemo}>
              Skip OAuth — explore with demo repos
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RepoConnectScreen({ user, account, onDone, onBack }) {
  const [query, setQuery] = useState_a("");
  const [selected, setSelected] = useState_a([]);
  const [repos, setRepos] = useState_a([]);
  const [loading, setLoading] = useState_a(true);
  const [importing, setImporting] = useState_a(false);
  const [err, setErr] = useState_a("");

  useEffect_a(() => {
    api.githubRepos()
      .then(r => setRepos(r.repos || []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = repos.filter(r =>
    !query || `${r.owner}/${r.name}`.toLowerCase().includes(query.toLowerCase())
  );

  function toggle(key) {
    setSelected(s => s.includes(key) ? s.filter(x => x !== key) : [...s, key]);
  }

  async function importRepos() {
    if (!selected.length) return;
    setImporting(true);
    try {
      const picked = selected.map(k => repos.find(r => `${r.owner}/${r.name}` === k)).filter(Boolean);
      const { projects } = await api.importProjects(picked);
      onDone(projects);
    } catch (e) { setErr(e.message); setImporting(false); }
  }

  return (
    <div style={{ display: "flex", height: "100%", background: "var(--paper)" }}>
      <ForgePanel lines={["Choose what", "to forge."]} />

      <div style={{ width: 560, padding: "44px 48px", display: "flex", flexDirection: "column" }}>
        <h2 className="display" style={{ fontSize: 36, margin: "0 0 8px" }}>Pick a repository.</h2>
        <p className="muted" style={{ margin: "0 0 24px", fontSize: 14 }}>
          Connected as <span className="mono" style={{ color: "var(--ink)" }}>@{account?.login}</span>
          {account?.demo && <span className="chip" style={{ marginLeft: 8 }}>demo</span>}.
        </p>

        <div className="row gap-2" style={{
          border: "1px solid var(--hairline)", padding: "10px 14px", borderRadius: 2,
          marginBottom: 14, background: "var(--paper-sunken)"
        }}>
          <Icon name="search" size={14} />
          <input
            className="input"
            placeholder="Search owner/repo…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, borderBottom: "none", padding: 0, fontSize: 14, background: "transparent" }}
          />
          <span className="mono faint" style={{ fontSize: 11 }}>{filtered.length} repos</span>
        </div>

        <div style={{ flex: 1, overflow: "auto", border: "1px solid var(--hairline)", borderRadius: 2, minHeight: 280 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-faint)", fontSize: 13 }}>Loading repositories…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-faint)", fontSize: 13 }}>No repositories.</div>
          ) : filtered.map(r => {
            const key = `${r.owner}/${r.name}`;
            const on = selected.includes(key);
            return (
              <div
                key={key}
                onClick={() => toggle(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                  borderBottom: "1px solid var(--hairline)",
                  cursor: "pointer",
                  background: on ? "var(--ember-tint)" : "transparent"
                }}
              >
                <div style={{
                  width: 18, height: 18, border: "1.5px solid " + (on ? "var(--ember-deep)" : "var(--ink-faint)"),
                  background: on ? "var(--ember-deep)" : "transparent",
                  color: "var(--paper)",
                  borderRadius: 2, display: "grid", placeItems: "center", flexShrink: 0
                }}>
                  {on && <Icon name="check" size={12} />}
                </div>
                <Icon name="repo" size={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    <span className="muted">{r.owner}</span>
                    <span style={{ color: "var(--ink-faint)" }}> / </span>
                    {r.name}
                  </div>
                  <div className="row gap-3 mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>
                    <span>{r.lang || "Unknown"}</span>
                    <span>·</span>
                    <span>{r.stars || 0}★</span>
                    <span>·</span>
                    <span>updated {r.lastPush || "recently"}</span>
                    {r.ai && <span className="chip ember" style={{ marginLeft: 6 }}>likely AI</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {err && <div style={{ color: "var(--fail)", fontSize: 13, marginTop: 10 }}>{err}</div>}

        <div className="row" style={{ marginTop: 18, justifyContent: "space-between" }}>
          <div className="muted" style={{ fontSize: 13 }}>
            {selected.length === 0 ? "Pick at least one repository." : `${selected.length} selected`}
          </div>
          <div className="row gap-3">
            <button className="btn btn-ghost" onClick={onBack}><Icon name="arrow-left" size={14} />Back</button>
            <button className="btn btn-primary" disabled={!selected.length || importing} onClick={importRepos}>
              {importing ? "Importing…" : `Import & start scanning`}
              {!importing && <Icon name="arrow-right" size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AuthScreen, GitHubConnectScreen, RepoConnectScreen });
