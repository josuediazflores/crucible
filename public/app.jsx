/* App root — Auth → GitHub → Repos → Dashboard / Detail. Backend-backed. */
const { useState: useS, useEffect: useE, useCallback: useC, useMemo: useM } = React;

function App() {
  const [route, setRoute] = useS("loading");
  const [user, setUser] = useS(null);
  const [meta, setMeta] = useS(null);
  const [ghAccount, setGhAccount] = useS(null);
  const [projects, setProjects] = useS([]);
  const [openId, setOpenId] = useS(null);

  useE(() => {
    (async () => {
      try {
        const m = await api.meta();
        setMeta(m);
        if (!m.user) { setRoute("auth"); return; }
        setUser(m.user);
        const ghs = await api.githubStatus();
        if (!ghs.connected) { setRoute("gh"); return; }
        setGhAccount(ghs.account);
        const ps = await api.projects();
        setProjects(ps.projects || []);
        // If just landed from OAuth ?gh=connected, route to repos picker
        const params = new URLSearchParams(location.search);
        if (params.get('gh') === 'connected') {
          history.replaceState(null, '', '/');
          if ((ps.projects || []).length === 0) { setRoute("repos"); return; }
        }
        setRoute(ps.projects && ps.projects.length ? "dashboard" : "repos");
      } catch (e) { setRoute("auth"); }
    })();
  }, []);

  /* Poll projects when on the dashboard */
  useE(() => {
    if (route !== "dashboard") return;
    let alive = true;
    const tick = async () => {
      try {
        const ps = await api.projects();
        if (!alive) return;
        setProjects(ps.projects || []);
      } catch (_) {}
      if (alive) timer = setTimeout(tick, 1200);
    };
    let timer = setTimeout(tick, 1200);
    return () => { alive = false; clearTimeout(timer); };
  }, [route]);

  /* handlers */
  const handleAuth = (u) => { setUser(u); setRoute("gh"); };
  const handleGh = (gh) => { setGhAccount(gh); setRoute("repos"); };
  const handleProjectsImported = (ps) => { setProjects(ps); setRoute("dashboard"); };
  const handleLogout = async () => {
    try { await api.signout(); } catch(_){}
    setUser(null); setGhAccount(null); setProjects([]);
    setRoute("auth");
  };
  const openProject = (id) => { setOpenId(id); setRoute("detail"); };

  if (route === "loading") {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", background: "var(--paper)" }}>
        <div style={{ opacity: 0.4 }}><Logo size={28} /></div>
      </div>
    );
  }

  if (route === "auth") return <AuthScreen onAuth={handleAuth} />;
  if (route === "gh") return <GitHubConnectScreen user={user} meta={meta || {}} onConnected={handleGh} onBack={handleLogout} />;
  if (route === "repos") return <RepoConnectScreen user={user} account={ghAccount} onDone={handleProjectsImported} onBack={() => setRoute("gh")} />;

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <Sidebar
        user={user}
        active={"dashboard"}
        onNavigate={() => setRoute("dashboard")}
        onLogout={handleLogout}
      />
      {route === "dashboard" && (
        <Dashboard
          user={user}
          meta={meta}
          projects={projects}
          onOpen={openProject}
          onAddRepo={() => setRoute("repos")}
        />
      )}
      {route === "detail" && openId && (
        <RepoDetail projectId={openId} onBack={() => setRoute("dashboard")} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
