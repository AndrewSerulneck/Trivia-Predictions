// ─────────────────────────────────────────────────────────────────────────────
// screen-shared.jsx  ·  Shared device primitives + Join & Challenges screens
//
// MAPS TO REAL APP:
//   components/ui/PageShell.tsx, AppShell.tsx          → ScreenShell / MiniTopBar chrome
//   components/ui/NotificationBell.tsx                 → bell button in MiniTopBar
//   components/join/* , app/join/page.tsx              → JoinScreen
//   components/challenges/PendingChallengesPanel.tsx   → ChallengesScreen + ChallengeRow
//   .tp-exit-pill (globals.css)                        → ExitChip (the one warm element)
//
// Shared helpers are exported to window so the per-screen game files
// (screen-pickem / screen-fantasy / screen-bingo / screen-trivia) can reuse them.
// ─────────────────────────────────────────────────────────────────────────────

// screens-mockup.jsx — six phone-screen mockups for the design canvas.
// Each screen is self-contained; inline styles keep them isolated.

// ─────────────────────────────────────────────────────────────
// Shared scaffolding helpers (small, no name collisions)
// ─────────────────────────────────────────────────────────────
const STATUS_BAR_INSET = 54; // iOS frame status bar reserve
const HOME_INDICATOR_INSET = 28;

function ScreenShell({ accent = "#22d3ee", bg = "#020617", children, scroll = true }) {
  return (
    <div style={{
      position: "absolute", inset: 0, background: bg,
      color: "#f8fafc", fontFamily: "Nunito, system-ui, sans-serif",
      paddingTop: STATUS_BAR_INSET, paddingBottom: HOME_INDICATOR_INSET,
      display: "flex", flexDirection: "column", overflow: scroll ? "auto" : "hidden",
    }}>{children}</div>
  );
}

function MiniTopBar({ accent = "#67e8f9", title, exitLabel = "Venue", showHam = true }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 14px 12px", gap: 8, flexShrink: 0,
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {showHam ? (
        <button style={{
          width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)",
          background: "#0f172a", color: "#f8fafc", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      ) : (
        <ExitChip label={exitLabel}/>
      )}
      <div style={{
        fontFamily: "'Bree Serif', serif", fontSize: 17, lineHeight: 1,
        letterSpacing: "0.04em", textTransform: "uppercase", color: accent,
        textShadow: "0 1px 0 rgba(0,0,0,0.5)",
      }}>{title}</div>
      <button style={{
        position: "relative", width: 36, height: 36, borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.10)", background: "#0f172a",
        color: "#f8fafc", cursor: "pointer",
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{margin:"0 auto",display:"block"}}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 9H3c0-1 3-2 3-9zM10 21a2 2 0 0 0 4 0"/></svg>
        <span style={{position:"absolute",top:7,right:7,width:7,height:7,borderRadius:"50%",background:"#f43f5e"}}/>
      </button>
    </div>
  );
}

function ExitChip({ label = "Venue" }) {
  return (
    <button style={{
      background: "linear-gradient(to right, #a93d3a, #c8573e, #e9784e)",
      border: "1px solid #1c2b3a", color: "#fff7ea",
      borderRadius: 9999, padding: "0 12px", height: 36,
      display: "inline-flex", alignItems: "center", gap: 7,
      fontFamily: "Nunito,system-ui,sans-serif", fontWeight: 800, fontSize: 12,
      letterSpacing: "0.02em", cursor: "pointer", whiteSpace: "nowrap",
    }}>
      <span style={{
        display:"inline-flex",alignItems:"center",justifyContent:"center",
        width: 20, height: 20, borderRadius:"50%",
        background:"rgba(255,247,234,0.20)", fontSize:11,
      }}>←</span>
      {label}
    </button>
  );
}

function Eyebrow({ color = "#67e8f9", children, style }) {
  return <div style={{
    fontWeight: 900, fontSize: 10.5, letterSpacing: "0.16em",
    textTransform: "uppercase", color, ...style,
  }}>{children}</div>;
}

// ═════════════════════════════════════════════════════════════
// 1. JOIN / LOGIN SCREEN — Slab Tubes logo, scan QR primary
// ═════════════════════════════════════════════════════════════
function JoinScreen() {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: `radial-gradient(80% 50% at 50% 0%, rgba(34,211,238,.18), transparent 70%),
                   radial-gradient(60% 40% at 50% 100%, rgba(232,121,249,.10), transparent 70%),
                   #020617`,
      color: "#f8fafc", fontFamily: "Nunito, system-ui, sans-serif",
      paddingTop: STATUS_BAR_INSET + 24, paddingBottom: HOME_INDICATOR_INSET + 8,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>

      {/* Logo — Slab Tubes, centered */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 14, padding: "8px 18px 4px",
      }}>
        <span className="neon-ht neon-cy" style={{fontSize: 36}}>Hightop</span>
        <span className="neon-dash" style={{width: 22, height: 5}}></span>
        <span className="neon-ht neon-pk" style={{fontSize: 36}}>Challenge</span>
      </div>

      {/* Headline */}
      <div style={{padding: "32px 28px 0", textAlign: "center"}}>
        <div style={{
          fontFamily: "'Bree Serif', serif", fontSize: 30, lineHeight: 1.05,
          letterSpacing: "0.02em", textTransform: "uppercase", color: "#fff",
          textShadow: "0 1px 0 rgba(12,18,28,.8), 0 3px 0 rgba(12,18,28,.55)",
        }}>Game on at the bar.</div>
        <div style={{
          color: "#94a3b8", fontWeight: 600, fontSize: 13.5, lineHeight: 1.5,
          marginTop: 10, textWrap: "pretty",
        }}>
          Scan a Hightop QR at any partner venue to drop in. Anonymous,
          venue-locked, no card required.
        </div>
      </div>

      {/* Primary CTA: scan */}
      <div style={{padding: "26px 22px 0"}}>
        <button style={{
          width: "100%", background: "#22d3ee", color: "#0f172a",
          border: "none", borderRadius: 14, padding: "16px 18px",
          fontFamily: "Nunito", fontWeight: 900, fontSize: 15.5,
          letterSpacing: "0.02em", display: "inline-flex",
          alignItems: "center", justifyContent: "center", gap: 10,
          boxShadow: "0 0 0 1px rgba(34,211,238,0.30), 0 12px 32px rgba(34,211,238,0.28)",
          cursor: "pointer",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 17v4h-4M14 21h0"/>
          </svg>
          Open camera & scan venue QR
        </button>
        <div style={{
          color: "#64748b", fontWeight: 700, fontSize: 11, marginTop: 10, textAlign: "center",
          letterSpacing: "0.04em",
        }}>
          Point your camera at the QR on your table or coaster.
        </div>
      </div>

      {/* Manual code */}
      <div style={{padding: "22px 22px 0"}}>
        <Eyebrow color="#94a3b8" style={{marginBottom: 8}}>or enter code manually</Eyebrow>
        <div style={{display: "flex", gap: 8}}>
          <input placeholder="6-digit venue code" style={{
            flex: 1, background: "#1e293b", border: "1px solid #334155",
            color: "#f8fafc", padding: "12px 14px", borderRadius: 12,
            fontFamily: "Nunito", fontWeight: 700, fontSize: 16,
            letterSpacing: "0.18em", outline: "none",
          }}/>
          <button style={{
            background: "transparent", color: "#67e8f9",
            border: "1px solid rgba(34,211,238,0.45)", borderRadius: 12,
            padding: "0 16px", fontWeight: 800, fontSize: 13.5,
            letterSpacing: "0.04em", cursor: "pointer",
          }}>Join</button>
        </div>
      </div>

      {/* Divider */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "26px 28px 0",
      }}>
        <div style={{flex: 1, height: 1, background: "rgba(255,255,255,0.08)"}}/>
        <span style={{
          color: "#64748b", fontWeight: 800, fontSize: 10,
          letterSpacing: "0.18em", textTransform: "uppercase",
        }}>Returning player</span>
        <div style={{flex: 1, height: 1, background: "rgba(255,255,255,0.08)"}}/>
      </div>

      {/* Sign-in options */}
      <div style={{padding: "16px 22px 0", display: "flex", flexDirection: "column", gap: 8}}>
        <button style={{
          width: "100%", background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.16)", color: "#f8fafc",
          borderRadius: 12, padding: "12px 16px",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
          fontWeight: 800, fontSize: 13.5, cursor: "pointer",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
          Continue with email
        </button>
        <button style={{
          width: "100%", background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.16)", color: "#f8fafc",
          borderRadius: 12, padding: "12px 16px",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
          fontWeight: 800, fontSize: 13.5, cursor: "pointer",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="12" cy="18" r="0.8" fill="currentColor"/></svg>
          Continue with phone
        </button>
      </div>

      {/* Legal */}
      <div style={{
        padding: "0 28px", marginTop: "auto",
        textAlign: "center", color: "#475569", fontSize: 10.5, fontWeight: 600, lineHeight: 1.4,
      }}>
        By continuing you agree to the <u>Terms</u> and <u>Privacy Policy</u>. 21+ where prizes involve alcohol.
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
// 2. CHALLENGES PANEL — venue page, Challenges tab, with badges
// ═════════════════════════════════════════════════════════════

// Game-themed mini badge (40×40, slightly bigger than nav icons)
function ChallengeBadge({ kind }) {
  const wrap = {
    width: 44, height: 44, borderRadius: 11, position: "relative",
    overflow: "hidden", flexShrink: 0,
    border: "1.5px solid rgba(255,255,255,0.50)",
    boxShadow: "0 4px 10px rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  if (kind === "pickem") {
    // Sportsbook ticket — diagonal navy/magenta + ✓ stamp + perforation
    return (
      <div style={{...wrap,
        background: "linear-gradient(115deg, #1a2f72 0%, #1a2f72 48%, #6b1a4e 52%, #6b1a4e 100%)",
        borderColor: "#fde68a",
      }}>
        <div style={{
          position:"absolute",left:"50%",top:0,bottom:0,width:0,
          borderLeft:"1.5px dashed rgba(253,230,138,0.7)", transform:"translateX(-1px)",
        }}/>
        <div style={{
          width: 22, height: 22, borderRadius: 6, background: "#fde68a",
          color: "#1a2f72", display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 15, lineHeight: 1, transform: "rotate(-8deg)",
          boxShadow: "0 2px 0 rgba(0,0,0,.35)", position: "relative", zIndex: 2,
        }}>✓</div>
      </div>
    );
  }

  if (kind === "speed") {
    // Racing electric — near-black w/ yellow+lime stripes + bolt
    return (
      <div style={{...wrap, background: "#0a0a0f", borderColor: "#facc15"}}>
        <div style={{
          position:"absolute", inset:0,
          background:"repeating-linear-gradient(115deg, transparent 0 6px, rgba(250,204,21,.85) 6px 8.5px, transparent 8.5px 10.5px, rgba(132,204,22,.8) 10.5px 12.5px, transparent 12.5px 18px)",
          opacity:.7,
        }}/>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#facc15" style={{position:"relative",zIndex:2, filter:"drop-shadow(0 0 4px rgba(250,204,21,.7))"}}>
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/>
        </svg>
      </div>
    );
  }

  if (kind === "live") {
    // Broadcast — cyan/blue/violet gradient + big ?
    return (
      <div style={{...wrap,
        background: "linear-gradient(132deg, #0ea5e9 0%, #2563eb 42%, #7c3aed 100%)",
        borderColor: "rgba(207,250,254,0.9)",
      }}>
        <div style={{
          fontFamily: "'Bree Serif', serif", fontWeight: 900, fontSize: 30, lineHeight: 1,
          color: "#fff", textShadow: "0 2px 0 rgba(0,0,0,.4), 0 0 14px rgba(34,211,238,.7)",
          position: "relative", zIndex: 2,
        }}>?</div>
        <span style={{
          position:"absolute", left:6, top:5, fontFamily:"'Bree Serif',serif",
          fontWeight:900, fontSize:13, color:"rgba(254,240,138,.55)", transform:"rotate(-10deg)",
        }}>?</span>
      </div>
    );
  }

  if (kind === "fantasy") {
    // Chalkboard — forest + chalk grid + X/O play
    return (
      <div style={{...wrap, background: "#0a3128", borderColor: "rgba(254,243,199,0.7)"}}>
        <div style={{
          position:"absolute", inset:0,
          backgroundImage:"linear-gradient(rgba(254,243,199,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(254,243,199,.18) 1px, transparent 1px)",
          backgroundSize:"7px 7px",
        }}/>
        <span style={{
          position:"absolute", left:5, top:4, fontFamily:"'Bree Serif',serif",
          fontWeight:900, fontSize:18, color:"#fde68a", transform:"rotate(-10deg)",
          textShadow:"0 0 6px rgba(254,230,138,.4)", zIndex:2, lineHeight:1,
        }}>X</span>
        <span style={{
          position:"absolute", right:5, bottom:4, fontFamily:"'Bree Serif',serif",
          fontWeight:900, fontSize:18, color:"#67e8f9", transform:"rotate(6deg)",
          textShadow:"0 0 6px rgba(34,211,238,.4)", zIndex:2, lineHeight:1,
        }}>O</span>
        <svg viewBox="0 0 44 44" style={{position:"absolute",inset:0,zIndex:1}} fill="none" stroke="rgba(254,243,199,.55)" strokeWidth="1.2" strokeDasharray="3 2" strokeLinecap="round">
          <path d="M10 30 Q 22 8 34 22"/>
        </svg>
      </div>
    );
  }
  return null;
}

function ChallengeRow({ kind, name, rule, current, target, unit, pctOverride, prize, status, winner }) {
  // status: "in-progress" | "lost" | "won"
  const pct = pctOverride != null ? pctOverride : Math.min(100, Math.round((current/target)*100));
  const gradByKind = {
    pickem:  "linear-gradient(90deg, #a855f7, #ec4899)",
    speed:   "linear-gradient(90deg, #facc15, #84cc16)",
    live:    "linear-gradient(90deg, #22d3ee, #7c3aed)",
    fantasy: "linear-gradient(90deg, #34d399, #fde68a)",
  };
  const won = status === "won";
  const lost = status === "lost";

  return (
    <div style={{
      background: won ? "linear-gradient(180deg, rgba(16,185,129,.14), #0f172a)" : "#0f172a",
      border: won
        ? "1px solid rgba(52,211,153,0.65)"
        : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16, padding: "12px 14px",
      display: "grid", gridTemplateColumns: "44px 1fr", gap: 12,
      alignItems: "center",
      boxShadow: won ? "0 0 0 1px rgba(52,211,153,0.18), 0 10px 24px rgba(0,0,0,0.4)" : "0 8px 18px rgba(0,0,0,0.3)",
      cursor: won ? "pointer" : "default",
    }}>
      <ChallengeBadge kind={kind}/>
      <div style={{minWidth: 0, display: "flex", flexDirection: "column", gap: 4}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6}}>
          <div style={{fontWeight: 900, fontSize: 13, color: "#f8fafc", letterSpacing: "0.01em", lineHeight: 1.2}}>{name}</div>
          {lost ? (
            <span style={{
              fontSize: 9, fontWeight: 900, color: "#fda4af", letterSpacing: "0.12em",
              textTransform: "uppercase", whiteSpace: "nowrap",
            }}>Claimed</span>
          ) : won ? (
            <span style={{
              fontSize: 9, fontWeight: 900, color: "#6ee7b7", letterSpacing: "0.12em",
              textTransform: "uppercase", whiteSpace: "nowrap",
            }}>You won</span>
          ) : null}
        </div>
        <div style={{fontWeight: 600, fontSize: 10.5, color: "#94a3b8", lineHeight: 1.3}}>{rule}</div>

        {/* Gauge */}
        <div style={{
          height: 6, borderRadius: 9999, background: "rgba(255,255,255,0.08)",
          overflow: "hidden", marginTop: 4, opacity: lost ? 0.5 : 1,
        }}>
          <div style={{
            height: "100%", width: pct + "%", borderRadius: 9999,
            background: lost ? "rgba(148,163,184,.5)" : gradByKind[kind],
          }}/>
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: 4, gap: 6,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 900, color: lost ? "#64748b" : "#e2e8f0",
            fontVariantNumeric: "tabular-nums", letterSpacing: "0.03em",
          }}>
            {lost ? `Won by @${winner}` : `${current.toLocaleString()} / ${target.toLocaleString()}${unit ? " " + unit : ""}`}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 800,
            color: won ? "#6ee7b7" : lost ? "#64748b" : "#fde68a",
            letterSpacing: "0.06em", textTransform: won ? "uppercase" : "none",
          }}>
            {won ? "→ Tap to claim coupon" : prize}
          </span>
        </div>
      </div>
    </div>
  );
}

function ChallengesScreen() {
  return (
    <ScreenShell accent="#e879f9">
      {/* TopBar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px 10px", gap: 8, flexShrink: 0,
      }}>
        <button style={{
          width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)",
          background: "#0f172a", color: "#f8fafc", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <div style={{
          fontFamily: "'Bree Serif', serif", fontSize: 16, lineHeight: 1,
          letterSpacing: "0.045em", textTransform: "uppercase", color: "#fff",
        }}>The Local Tavern</div>
        <button style={{
          position: "relative", width: 36, height: 36, borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.10)", background: "#0f172a",
          color: "#f8fafc", cursor: "pointer",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{margin:"0 auto",display:"block"}}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 9H3c0-1 3-2 3-9zM10 21a2 2 0 0 0 4 0"/></svg>
          <span style={{position:"absolute",top:7,right:7,width:7,height:7,borderRadius:"50%",background:"#f43f5e"}}/>
        </button>
      </div>

      {/* Segmented switcher */}
      <div style={{padding: "0 12px 10px", flexShrink: 0}}>
        <div style={{
          display: "flex", background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9999,
          padding: 4, gap: 2, boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        }}>
          {[
            {l: "Games", active: false, icon: <><rect x="4" y="6" width="16" height="12" rx="2"/><path d="M9 12h.01M15 12h.01"/></>},
            {l: "Leaderboard", active: false, icon: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/></>},
            {l: "Challenges", active: true, icon: <><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></>, pip: 2},
          ].map((t, i) => (
            <button key={i} style={{
              flex: 1, justifyContent: "center", display: "inline-flex",
              alignItems: "center", gap: 5, lineHeight: 1, padding: "9px 4px",
              borderRadius: 9999, border: "none",
              background: t.active ? "rgba(34,211,238,0.10)" : "transparent",
              boxShadow: t.active ? "inset 0 0 0 1px rgba(34,211,238,0.45)" : "none",
              color: t.active ? "#67e8f9" : "#94a3b8",
              fontWeight: 800, fontSize: 11, letterSpacing: "0.07em",
              textTransform: "uppercase", cursor: "pointer",
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              {t.l}
              {t.pip ? (
                <span style={{
                  display:"inline-flex",alignItems:"center",justifyContent:"center",
                  minWidth:14,height:14,padding:"0 4px",borderRadius:9999,
                  background:"#f43f5e",color:"#fff",fontSize:8,fontWeight:900,
                  marginLeft:1,
                }}>{t.pip}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Section header */}
      <div style={{padding: "4px 16px 6px", display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
        <Eyebrow color="#f0abfc">Active · 4 challenges</Eyebrow>
        <div style={{fontSize: 9.5, fontWeight: 700, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase"}}>
          Tonight · 6–10pm
        </div>
      </div>

      {/* Cards */}
      <div style={{padding: "4px 14px 0", display: "flex", flexDirection: "column", gap: 10}}>
        <ChallengeRow
          kind="pickem"
          name="First to 750 Pick 'Em points"
          rule="Pick 'Em · Tue & Thu · 6–9pm"
          current={468} target={750} unit="pts"
          status="in-progress"
          prize="$25 bar tab"
        />
        <ChallengeRow
          kind="speed"
          name="12 correct in a Speed Trivia round"
          rule="Speed Trivia · Mon · Tonight's 7pm round"
          current={7} target={12} unit="correct"
          status="in-progress"
          prize="Free app + draft"
        />
        <ChallengeRow
          kind="live"
          name="Top 3 in tonight's Live Showdown"
          rule="Live Trivia · Wed · 8:30pm · 30s answers"
          current={50} target={50} unit=""
          pctOverride={100}
          status="lost"
          winner="crab_rangoon42"
          prize="Free pitcher"
        />
        <ChallengeRow
          kind="fantasy"
          name="Beat the venue avg in Fantasy"
          rule="Fantasy · Tonight's NBA slate · Tip 7pm"
          current={142.8} target={124.4} unit="pts"
          pctOverride={100}
          status="won"
          prize=""
        />
      </div>

      {/* Legend / how-it-works strip */}
      <div style={{
        margin: "14px 14px 4px", padding: "10px 12px",
        background: "rgba(255,255,255,0.025)",
        border: "1px dashed rgba(255,255,255,0.10)", borderRadius: 12,
      }}>
        <Eyebrow color="#64748b" style={{marginBottom: 4}}>How challenges work</Eyebrow>
        <div style={{fontSize: 10.5, color: "#94a3b8", fontWeight: 600, lineHeight: 1.4, textWrap: "pretty"}}>
          Challenges are admin-set achievements at this venue. Be the first to hit the
          target while playing the right game during the right time window — win the coupon.
        </div>
      </div>
    </ScreenShell>
  );
}

// Export shared primitives + Join/Challenges for the per-screen game files & the board.
Object.assign(window, {
  STATUS_BAR_INSET, HOME_INDICATOR_INSET,
  ScreenShell, MiniTopBar, ExitChip, Eyebrow,
  JoinScreen, ChallengesScreen,
});
