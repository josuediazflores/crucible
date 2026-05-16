/* Shared components — exported to window for cross-file use */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* ---- Iconography (line, 1.5px, no fill) ---- */
function Icon({ name, size = 16, stroke = 1.5 }) {
  const props = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round"
  };
  switch (name) {
    case "github":
      return <svg {...props}><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>;
    case "dashboard":
      return <svg {...props}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>;
    case "search":
      return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>;
    case "settings":
      return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></svg>;
    case "arrow-right":
      return <svg {...props}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case "arrow-left":
      return <svg {...props}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>;
    case "check":
      return <svg {...props}><path d="m5 12 5 5L20 7"/></svg>;
    case "x":
      return <svg {...props}><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case "plus":
      return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case "logout":
      return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>;
    case "lock":
      return <svg {...props}><rect x="4" y="11" width="16" height="10" rx="1"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>;
    case "mail":
      return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 7 9 6 9-6"/></svg>;
    case "user":
      return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>;
    case "repo":
      return <svg {...props}><path d="M4 4v15.5A2.5 2.5 0 0 0 6.5 22H20V6a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 6.5Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></svg>;
    case "branch":
      return <svg {...props}><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M18 9a4 4 0 0 1-4 4H6"/></svg>;
    case "spark":
      return <svg {...props}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>;
    case "flame":
      return <svg {...props}><path d="M12 22c4 0 7-2.7 7-7 0-3-2-5-2-8 0-2-1-4-3-5 .5 3-2 5-3.5 6.5C9 10 7 12 7 15c0 4.3 3 7 5 7Z"/></svg>;
    case "scale":
      return <svg {...props}><path d="M12 3v18M3 7h18M7 7l-3 7a4 4 0 0 0 8 0L9 7M17 7l-3 7a4 4 0 0 0 8 0l-3-7"/></svg>;
    case "code":
      return <svg {...props}><path d="m8 6-6 6 6 6M16 6l6 6-6 6"/></svg>;
    case "dot":
      return <svg {...props}><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>;
    case "folder":
      return <svg {...props}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>;
    case "chevron-r":
      return <svg {...props}><path d="m9 6 6 6-6 6"/></svg>;
    case "chevron-d":
      return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>;
    case "file":
      return <svg {...props}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6"/></svg>;
    case "play":
      return <svg {...props}><path d="M6 4v16l14-8Z"/></svg>;
    case "pause":
      return <svg {...props}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case "info":
      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>;
    case "bell":
      return <svg {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></svg>;
    case "help":
      return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/></svg>;
    default: return null;
  }
}

/* ---- Logo lockup (icon + wordmark) ---- */
function Logo({ size = 26, dark = false, iconOnly = false, wordmarkOnly = false }) {
  const iconSrc = dark ? "assets/crucible-icon-dark.svg" : "assets/crucible-icon.svg";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {!wordmarkOnly && (
        <img src={iconSrc} alt="" style={{ height: size, width: "auto", display: "block" }} />
      )}
      {!iconOnly && (
        <span style={{
          fontFamily: "var(--font-display)", fontWeight: 900,
          fontSize: size * 0.82, letterSpacing: "-0.04em",
          color: dark ? "var(--paper)" : "var(--ink)", lineHeight: 1
        }}>crucible</span>
      )}
    </div>
  );
}

/* ---- Just the crucible icon ---- */
function CrucibleIcon({ size = 24, dark = false }) {
  return <img src={dark ? "assets/crucible-icon-dark.svg" : "assets/crucible-icon.svg"} alt="" style={{ height: size, width: "auto", display: "block" }} />;
}

/* ---- Animated counter ---- */
function useTickingCounter(target, ms = 1400, start = 0) {
  const [val, setVal] = useState(start);
  useEffect(() => {
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

/* ---- Sidebar nav (used post-onboarding) ---- */
function Sidebar({ user, active, onNavigate, onLogout }) {
  return (
    <aside className="sidebar">
      <div style={{ padding: "22px 20px 18px" }}>
        <Logo size={24} />
      </div>

      <div style={{ padding: "8px 12px" }}>
        <div
          className={"sidebar-link " + (active === "dashboard" ? "active" : "")}
          onClick={() => onNavigate("dashboard")}
        >
          <Icon name="dashboard" size={16} />
          Dashboard
        </div>
      </div>

      <div style={{ padding: "20px 20px 6px" }}>
        <div className="eyebrow">Account</div>
      </div>
      <div style={{ padding: "0 12px" }}>
        <div className="sidebar-link"><Icon name="settings" size={16} />Settings</div>
        <div className="sidebar-link"><Icon name="help" size={16} />Documentation</div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        margin: "12px",
        padding: "12px",
        borderTop: "1px solid var(--hairline)",
        display: "flex", alignItems: "center", gap: 10
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 2, background: "var(--ink)",
          color: "var(--paper)", display: "grid", placeItems: "center",
          fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 13
        }}>{(user?.name || "U")[0].toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name || "User"}</div>
          <div style={{ fontSize: 11, color: "var(--ink-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
        </div>
        <button className="btn-quiet" style={{ padding: 6 }} onClick={onLogout} title="Sign out">
          <Icon name="logout" size={15} />
        </button>
      </div>
    </aside>
  );
}

/* ---- Step rail (3-stage scan progress) ---- */
function StageRail({ stage }) {
  // stage 0=probing, 1=forging, 2=tempering, 3=done
  const stages = [
    { key: "probing",  label: "Probing",   sub: "Scanning repository",  icon: "search" },
    { key: "forging",  label: "Forging",   sub: "Building evaluations", icon: "flame"  },
    { key: "tempering",label: "Tempering", sub: "Running models",       icon: "scale"  }
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
      {stages.map((s, i) => {
        const status = stage > i ? "done" : stage === i ? "active" : "idle";
        return (
          <div key={s.key} style={{
            padding: "20px 22px",
            borderRight: i < 2 ? "1px solid var(--hairline)" : "none",
            background: status === "active" ? "var(--paper)" : "transparent",
            position: "relative"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 26, height: 26, borderRadius: 2,
                background: status === "done" ? "var(--pass)" : status === "active" ? "var(--ember)" : "var(--paper-deep)",
                color: status === "idle" ? "var(--ink-faint)" : "var(--paper)",
                display: "grid", placeItems: "center"
              }}>
                {status === "done"
                  ? <Icon name="check" size={14} />
                  : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{String(i+1).padStart(2,"0")}</span>}
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 16, letterSpacing: "-0.02em" }}>
                {s.label}
              </div>
              {status === "active" && (
                <div className="pulse-dot" style={{
                  marginLeft: "auto",
                  width: 6, height: 6, borderRadius: 50, background: "var(--ember)"
                }} />
              )}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)" }}>{s.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { Icon, Logo, CrucibleIcon, Sidebar, StageRail, useTickingCounter });
