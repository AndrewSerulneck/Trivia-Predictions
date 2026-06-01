// HightopUI.jsx — shared primitives for the Hightop Challenge UI kit
// Loads after React/Babel. Exports components to window for screens.jsx to use.
// All visual tokens trace back to ../../colors_and_type.css.

// ─────────────────────────────────────────────────────────────
// Eyebrow — accent-colored, tracked, all-caps section label.
// ─────────────────────────────────────────────────────────────
function Eyebrow({ accent = "cyan", children, style }) {
  const color = {
    cyan: "var(--ht-cyan-300)",
    emerald: "var(--ht-emerald-300)",
    amber: "var(--ht-amber-300)",
    fuchsia: "var(--ht-fuchsia-300)",
    rose: "var(--ht-rose-300)",
    violet: "var(--ht-violet-400)",
    muted: "var(--ht-fg-muted)",
  }[accent];
  return (
    <div style={{
      fontFamily: "var(--ht-font-body)",
      fontWeight: 900, fontSize: 12, letterSpacing: "0.14em",
      textTransform: "uppercase", color, ...style,
    }}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// AccentCard — surface panel with an optional accent border.
// All non-game-identity panels use this.
// ─────────────────────────────────────────────────────────────
const ACCENT_BORDER = {
  cyan: "rgba(34, 211, 238, 0.6)",
  emerald: "rgba(52, 211, 153, 0.6)",
  amber: "rgba(252, 211, 77, 0.6)",
  fuchsia: "rgba(240, 171, 252, 0.6)",
  rose: "rgba(251, 113, 133, 0.6)",
  hairline: "rgba(255, 255, 255, 0.08)",
};
function AccentCard({ accent = "hairline", padding = 16, radius = 16, style, children }) {
  return (
    <section style={{
      background: "var(--ht-surface)",
      border: `1px solid ${ACCENT_BORDER[accent] || ACCENT_BORDER.hairline}`,
      borderRadius: radius,
      padding,
      ...style,
    }}>{children}</section>
  );
}

// ─────────────────────────────────────────────────────────────
// Button — primary / secondary / ghost.
// Use ExitPill for back/leave actions, never this.
// ─────────────────────────────────────────────────────────────
function Button({ variant = "primary", accent = "cyan", children, onClick, disabled, full, style }) {
  const base = {
    fontFamily: "var(--ht-font-body)", fontWeight: 800, fontSize: 16,
    border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
    padding: "14px 18px", cursor: disabled ? "not-allowed" : "pointer",
    transition: "all .15s ease", lineHeight: 1.2, width: full ? "100%" : "auto",
    opacity: disabled ? 0.5 : 1, letterSpacing: "0.01em",
  };
  const accentFill = {
    cyan: { bg: "var(--ht-cyan-400)", fg: "#0f172a" },
    emerald: { bg: "var(--ht-emerald-500)", fg: "#0f172a" },
    amber: { bg: "var(--ht-amber-400)", fg: "#0f172a" },
    violet: { bg: "var(--ht-violet-500)", fg: "#ffffff" },
  }[accent] || { bg: "var(--ht-cyan-400)", fg: "#0f172a" };

  const variantStyle = {
    primary: { background: accentFill.bg, color: accentFill.fg, fontWeight: 900 },
    secondary: {
      background: "transparent", color: "var(--ht-fg-primary)",
      borderColor: "rgba(255,255,255,0.18)",
    },
    ghost: {
      background: `rgba(34, 211, 238, 0.10)`, color: "var(--ht-cyan-200)",
      borderColor: "rgba(34, 211, 238, 0.40)",
    },
  }[variant] || {};

  return (
    <button onClick={disabled ? undefined : onClick}
      style={{ ...base, ...variantStyle, ...style }}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// ExitPill — the only warm element on screen.
// ─────────────────────────────────────────────────────────────
function ExitPill({ children = "Back", onClick, withArrow = true, style }) {
  return (
    <button onClick={onClick} style={{
      background: "linear-gradient(to right, #a93d3a, #c8573e, #e9784e)",
      border: "1px solid #1c2b3a", color: "#fff7ea",
      borderRadius: 9999, minHeight: 44, padding: "0 18px",
      display: "inline-flex", alignItems: "center", gap: 10,
      fontFamily: "var(--ht-font-body)", fontWeight: 700, fontSize: 14,
      whiteSpace: "nowrap",
      cursor: "pointer", transition: "all .15s ease",
      boxShadow: "0 1px 3px rgba(28, 43, 58, 0.35)",
      ...style,
    }}>
      {withArrow ? (
        <span aria-hidden style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 24, height: 24, borderRadius: "50%",
          background: "rgba(255, 247, 234, 0.20)", fontSize: 12,
        }}>←</span>
      ) : null}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// StatusBadge — Live · Next Up · You · Closed etc.
// ─────────────────────────────────────────────────────────────
function StatusBadge({ accent = "cyan", dot = false, children, style }) {
  const palettes = {
    rose: { c: "#fda4af", bg: "rgba(244,63,94,.15)", br: "rgba(253,164,175,.6)", dot: "#f43f5e" },
    amber: { c: "#fde68a", bg: "rgba(245,158,11,.15)", br: "rgba(252,211,77,.6)", dot: "#fbbf24" },
    emerald: { c: "#a7f3d0", bg: "rgba(16,185,129,.18)", br: "rgba(110,231,183,.6)", dot: "#34d399" },
    cyan: { c: "#bae6fd", bg: "rgba(14,165,233,.15)", br: "rgba(125,211,252,.6)", dot: "#22d3ee" },
    muted: { c: "#cbd5e1", bg: "rgba(255,255,255,.04)", br: "rgba(255,255,255,.18)", dot: "#94a3b8" },
  };
  const p = palettes[accent] || palettes.cyan;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "6px 12px", borderRadius: 9999,
      fontFamily: "var(--ht-font-body)", fontWeight: 900,
      fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
      color: p.c, background: p.bg, border: `1px solid ${p.br}`, ...style,
    }}>
      {dot ? (
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: p.dot,
          animation: "ht-pulse 1.6s ease-in-out infinite",
        }} />
      ) : null}
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// FeedbackBanner — RIGHT / WRONG / CLOSEST GUESS / SKIPPED.
// ─────────────────────────────────────────────────────────────
function FeedbackBanner({ state, sub }) {
  const palette = {
    right:   { c: "#a7f3d0", bg: "rgba(16,185,129,.22)", br: "rgba(110,231,183,.7)", label: "RIGHT" },
    wrong:   { c: "#fda4af", bg: "rgba(244,63,94,.22)", br: "rgba(253,164,175,.7)", label: "WRONG" },
    closest: { c: "#bae6fd", bg: "rgba(14,165,233,.20)", br: "rgba(125,211,252,.7)", label: "CLOSEST GUESS SCORING" },
    skipped: { c: "#bae6fd", bg: "rgba(14,165,233,.20)", br: "rgba(125,211,252,.7)", label: "SKIPPED" },
  }[state] || {};
  return (
    <div style={{
      borderRadius: 14, padding: "14px 16px", textAlign: "center",
      border: `1px solid ${palette.br}`, background: palette.bg, color: palette.c,
    }}>
      <div style={{ fontWeight: 900, fontSize: state === "closest" ? 20 : 28, letterSpacing: "0.04em", lineHeight: 1 }}>
        {palette.label}
      </div>
      {sub ? <div style={{ fontWeight: 800, fontSize: 14, marginTop: 6, opacity: 0.9 }}>{sub}</div> : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Countdown — tabular numerals; auto formats hh:mm:ss / mm:ss / s.
// ─────────────────────────────────────────────────────────────
function formatCountdown(s, mode) {
  s = Math.max(0, Math.floor(s));
  if (mode === "long" || s >= 3600) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  }
  if (mode === "short" || s >= 60) {
    return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(s % 60).padStart(2,"0")}`;
  }
  return `${s}s`;
}

// ─────────────────────────────────────────────────────────────
// GameTile — venue hub card. Continuous gradient identity.
// ─────────────────────────────────────────────────────────────
const GAME_META = {
  trivia:      { title: "Hightop Speed Trivia", grad: "linear-gradient(132deg,#0ea5e9 0%,#2563eb 42%,#7c3aed 100%)", icon: "trivia_icon.png" },
  live_trivia: { title: "Hightop Live Trivia",  grad: "linear-gradient(132deg,#0ea5e9 0%,#2563eb 42%,#7c3aed 100%)", icon: "live_trivia_icon.png" },
  bingo:       { title: "Hightop Sports Bingo™", grad: "linear-gradient(128deg,#f97316 0%,#ef4444 48%,#ec4899 100%)", icon: "bingo_icon.png" },
  pickem:      { title: "Hightop Pick 'Em™",    grad: "linear-gradient(134deg,#2563eb 0%,#7c3aed 56%,#ec4899 100%)", icon: "pickem_icon.png" },
  fantasy:     { title: "Hightop Fantasy™",     grad: "linear-gradient(134deg,#7c3aed 0%,#2563eb 48%,#06b6d4 100%)", icon: "fantasy_icon.png" },
};
function GameTile({ gameKey, subtitle, onClick, status, compact }) {
  const meta = GAME_META[gameKey];
  return (
    <button onClick={onClick} style={{
      position: "relative", border: "3px solid rgba(255,255,255,0.65)",
      borderRadius: 24, padding: compact ? "12px 14px" : "16px 18px", color: "#fff",
      background: meta.grad, boxShadow: "0 12px 26px rgba(15,23,42,0.5)",
      textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column",
      gap: compact ? 8 : 12, minHeight: compact ? 132 : 200, width: "100%",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{
          fontFamily: "var(--ht-font-display)",
          fontSize: compact ? 22 : 28, lineHeight: 1.02, letterSpacing: "0.045em",
          textTransform: "uppercase", color: "#fff",
          textShadow: "0 1px 0 rgba(12,18,28,.8), 0 3px 0 rgba(12,18,28,.58), 0 0 12px rgba(255,255,255,.5)",
        }}>{meta.title}</div>
        {status ? <StatusBadge accent={status.accent} dot={status.dot}>{status.label}</StatusBadge> : null}
      </div>
      {subtitle ? (
        <div style={{
          fontWeight: 700, fontSize: 13, lineHeight: 1.35,
          color: "rgba(255,255,255,0.95)",
          background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 12, padding: "8px 10px",
        }}>{subtitle}</div>
      ) : null}
      <img src={`../../assets/brand/${meta.icon}`} alt="" style={{
        width: compact ? 56 : 84, height: compact ? 56 : 84, objectFit: "contain",
        alignSelf: "flex-end", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.45))",
        marginTop: "auto",
      }}/>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// AppShell — phone-viewport with top bar + bottom nav docks.
// Each screen is a child; chrome decides what to show.
// ─────────────────────────────────────────────────────────────
function TopBar({ accent = "cyan", title, onMenu, onBell }) {
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 30,
      background: "rgba(2,6,23,0.92)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 14px",
    }}>
      <button aria-label="Menu" onClick={onMenu} style={{
        width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
        background: "var(--ht-surface)", color: "var(--ht-fg-primary)", cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
      <div style={{
        fontFamily: "var(--ht-font-display)", fontSize: 18, lineHeight: 1,
        letterSpacing: "0.04em", textTransform: "uppercase",
        color: { cyan: "var(--ht-cyan-300)", emerald: "var(--ht-emerald-300)",
                 amber: "var(--ht-amber-300)", fuchsia: "var(--ht-fuchsia-300)",
                 violet: "var(--ht-violet-400)" }[accent] || "var(--ht-cyan-300)",
      }}>{title}</div>
      <button aria-label="Notifications" onClick={onBell} style={{
        position: "relative", width: 36, height: 36, borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.08)", background: "var(--ht-surface)",
        color: "var(--ht-fg-primary)", cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 9H3c0-1 3-2 3-9zM10 21a2 2 0 0 0 4 0"/></svg>
        <span style={{
          position: "absolute", top: 7, right: 7, width: 8, height: 8, borderRadius: "50%",
          background: "var(--ht-rose-500)", boxShadow: "0 0 0 2px var(--ht-surface)",
        }}/>
      </button>
    </header>
  );
}

function BottomNav({ active, onNavigate }) {
  const items = [
    { key: "trivia",  label: "Trivia",  d: "M9 9h.01M15 9h.01M9 13a3 3 0 0 0 6 0" },
    { key: "pickem",  label: "Pick'Em", d: "m9 12 2 2 4-4" },
    { key: "fantasy", label: "Fantasy", d: "M12 3v18M5 8h14M5 16h14" },
    { key: "bingo",   label: "Bingo",   d: "M3 9h18M3 15h18M9 3v18M15 3v18" },
    { key: "activity",label: "Activity",d: "m22 12-4-4-6 6-4-4-6 6" },
    { key: "leaders", label: "Leaders", d: "M7 4h10v5a5 5 0 0 1-10 0V4zM12 14v4M8 21h8" },
  ];
  return (
    <nav style={{
      position: "sticky", bottom: 0, zIndex: 30,
      background: "rgba(2,6,23,0.88)", backdropFilter: "blur(12px)",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      padding: "8px 6px max(8px, env(safe-area-inset-bottom)) 6px",
    }}>
      <ul style={{
        margin: 0, padding: 0, listStyle: "none",
        display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4,
      }}>
        {items.map(it => {
          const isActive = active === it.key;
          return (
            <li key={it.key}>
              <button onClick={() => onNavigate?.(it.key)} style={{
                width: "100%", display: "flex", flexDirection: "column", alignItems: "center",
                gap: 3, padding: "8px 2px", borderRadius: 10, border: "none",
                background: isActive ? "var(--ht-surface)" : "transparent",
                boxShadow: isActive ? "0 0 0 1px rgba(34,211,238,0.35)" : "none",
                color: isActive ? "var(--ht-cyan-300)" : "var(--ht-fg-muted)",
                fontFamily: "var(--ht-font-body)", fontWeight: 700, fontSize: 10.5,
                cursor: "pointer", lineHeight: 1.1,
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d={it.d}/></svg>
                {it.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────
// VenueSwitcher — 3-tab segmented pill (Games · Leaderboard · Challenges).
// The ONLY persistent nav inside a venue. Pairs with <VenueCarousel/>.
// ─────────────────────────────────────────────────────────────
const VENUE_TABS = [
  { key: "games",      label: "Games",       short: "Games",
    icon: <path d="M4 7h16v10H4zM9 12h.01M15 12h.01"/> },
  { key: "leaders",    label: "Leaderboard", short: "Leaders",
    icon: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/> },
  { key: "challenges", label: "Challenges",  short: "Chall.",
    icon: <path d="M5 12l5 5 9-11"/>, badge: 3 },
];

function VenueSwitcher({ active, onSelect }) {
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 20,
      background: "rgba(2,6,23,0.92)", backdropFilter: "blur(12px)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      padding: "10px 12px 10px",
    }}>
      <div role="tablist" style={{
        display: "flex", background: "var(--ht-surface)",
        border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9999,
        padding: 4, gap: 2, boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
      }}>
        {VENUE_TABS.map(t => {
          const isActive = active === t.key;
          return (
            <button key={t.key} role="tab" aria-selected={isActive}
              onClick={() => onSelect(t.key)}
              style={{
                flex: 1, justifyContent: "center", display: "inline-flex",
                alignItems: "center", gap: 5, lineHeight: 1,
                padding: "9px 6px", borderRadius: 9999, border: "none",
                background: isActive ? "rgba(34,211,238,0.12)" : "transparent",
                boxShadow: isActive ? "inset 0 0 0 1px rgba(34,211,238,0.45)" : "none",
                color: isActive ? "var(--ht-cyan-300)" : "var(--ht-fg-muted)",
                fontFamily: "var(--ht-font-body)", fontWeight: 800,
                fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase",
                cursor: "pointer", transition: "color 150ms ease, background 150ms ease",
              }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              {t.short}
              {t.badge ? (
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 16, height: 14, padding: "0 5px", borderRadius: 9999,
                  background: "var(--ht-rose-500)", color: "#fff",
                  fontSize: 9, fontWeight: 900, letterSpacing: "0.04em",
                }}>{t.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VenueCarousel — swipe-and-snap horizontal pager. Three full-width
// panels, smooth iOS-style transitions, drag-to-page with pointer events.
// Children must be an array of 3 elements, in tab order.
// ─────────────────────────────────────────────────────────────
function VenueCarousel({ activeIndex, onIndexChange, children }) {
  const trackRef = React.useRef(null);
  const [drag, setDrag] = React.useState({ on: false, startX: 0, dx: 0, w: 0 });
  const childArr = React.Children.toArray(children);

  const onDown = (e) => {
    if (!trackRef.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const w = trackRef.current.clientWidth;
    try { trackRef.current.setPointerCapture(e.pointerId); } catch (err) {}
    setDrag({ on: true, startX: e.clientX, dx: 0, w });
  };
  const onMove = (e) => {
    if (!drag.on) return;
    let dx = e.clientX - drag.startX;
    // Rubber-band at edges so you can feel the boundary instead of dragging into nothing.
    if (activeIndex === 0 && dx > 0) dx = dx * 0.35;
    if (activeIndex === childArr.length - 1 && dx < 0) dx = dx * 0.35;
    setDrag(d => ({ ...d, dx }));
  };
  const settle = (e) => {
    if (!drag.on) return;
    const { dx, w } = drag;
    const threshold = w * 0.22; // 22% swipe commits to next page
    let next = activeIndex;
    if (dx < -threshold && activeIndex < childArr.length - 1) next = activeIndex + 1;
    else if (dx > threshold && activeIndex > 0) next = activeIndex - 1;
    setDrag({ on: false, startX: 0, dx: 0, w });
    if (next !== activeIndex) onIndexChange(next);
    try { trackRef.current?.releasePointerCapture(e.pointerId); } catch (err) {}
  };

  const transform = `translateX(calc(${-activeIndex * 100}% + ${drag.dx}px))`;

  return (
    <div ref={trackRef}
         onPointerDown={onDown} onPointerMove={onMove}
         onPointerUp={settle}   onPointerCancel={settle}
         style={{
           position: "relative", flex: 1, minHeight: 0, overflow: "hidden",
           touchAction: "pan-y", cursor: drag.on ? "grabbing" : "grab",
         }}>
      <div style={{
        display: "flex", height: "100%",
        transform,
        transition: drag.on ? "none" : "transform 360ms cubic-bezier(0.22, 1, 0.36, 1)",
        willChange: "transform",
      }}>
        {childArr.map((c, i) => (
          <div key={i} style={{
            flex: "0 0 100%", minWidth: "100%", overflowY: "auto",
            // Disable interaction on off-screen pages while dragging so links don't fire.
            pointerEvents: drag.on && i !== activeIndex ? "none" : "auto",
          }}>{c}</div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  Eyebrow, AccentCard, Button, ExitPill, StatusBadge, FeedbackBanner,
  formatCountdown, GameTile, GAME_META, TopBar, BottomNav,
  VenueSwitcher, VenueCarousel, VENUE_TABS,
  HamburgerDrawer,
});

// ─────────────────────────────────────────────────────────────
// HamburgerDrawer — sliding left panel. Items match
// components/ui/LeftHamburgerMenu.tsx in the live codebase, reskinned
// from the legacy comic look to dark-native.
// ─────────────────────────────────────────────────────────────
const DRAWER_ITEMS = [
  { key: "active-games", title: "Career Stats",      desc: "Track your lifetime performance across every game." },
  { key: "faqs",         title: "FAQs",              desc: "Get quick answers about gameplay and prizes." },
  { key: "advertise",    title: "Advertise With Us", desc: "Submit the advertiser intake form." },
  { key: "redeem-prizes",title: "Redeem Prizes",     desc: "See earned rewards and prize redemptions." },
];

function HamburgerDrawer({ open, onClose, current, points = 312, username = "you_are_here", venue = "The Local Tavern", onNavigate }) {
  return (
    <>
      {/* Scrim */}
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, zIndex: 50,
        background: "rgba(2,6,23,0.78)", backdropFilter: "blur(4px)",
        opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none",
        transition: "opacity 280ms ease",
      }}/>
      {/* Panel */}
      <aside style={{
        position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 51,
        width: "88%", maxWidth: 320,
        background: "var(--ht-surface)",
        borderRight: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "8px 0 32px rgba(0,0,0,0.45)",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
        display: "flex", flexDirection: "column",
        padding: "16px 16px 18px", gap: 14,
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{
            margin: 0, fontFamily: "var(--ht-font-display)", fontSize: 24,
            letterSpacing: "0.05em", textTransform: "uppercase", color: "#fff",
          }}>Menu</h3>
          <button onClick={onClose} style={{
            padding: "7px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.18)",
            color: "var(--ht-fg-secondary)", cursor: "pointer",
            fontFamily: "var(--ht-font-body)", fontWeight: 800, fontSize: 12.5,
            letterSpacing: "0.04em",
          }}>Close</button>
        </div>

        {/* Identity tile */}
        <div style={{
          background: "rgba(30,41,59,0.7)", border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14, padding: 12,
          display: "flex", gap: 10, alignItems: "center",
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(132deg,#0ea5e9,#2563eb,#7c3aed)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontFamily: "var(--ht-font-display)", fontSize: 16,
          }}>{username.slice(0, 2).toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: "block", color: "#fff", fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>{username}</b>
            <span style={{ display: "block", color: "var(--ht-cyan-300)", fontSize: 11, fontWeight: 700, marginTop: 2 }}>{venue}</span>
          </div>
          <div style={{
            color: "var(--ht-amber-300)", fontWeight: 900, fontSize: 14,
            fontVariantNumeric: "tabular-nums", lineHeight: 1, textAlign: "right",
          }}>
            {points}
            <small style={{
              display: "block", fontWeight: 700, fontSize: 9, color: "var(--ht-fg-muted)",
              letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 3,
            }}>pts</small>
          </div>
        </div>

        {/* Items */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          {DRAWER_ITEMS.map(item => {
            const active = current === item.key;
            return (
              <button key={item.key} onClick={() => onNavigate?.(item.key)} style={{
                textAlign: "left", cursor: "pointer", border: "none", width: "100%",
                background: active ? "rgba(34,211,238,0.10)" : "rgba(30,41,59,0.5)",
                borderRadius: 14, padding: "12px 14px",
                boxShadow: active
                  ? "inset 0 0 0 1px rgba(34,211,238,0.45)"
                  : "inset 0 0 0 1px rgba(255,255,255,0.06)",
                transition: "all 150ms ease",
              }}>
                <div style={{
                  color: active ? "var(--ht-cyan-300)" : "var(--ht-fg-primary)",
                  fontWeight: 900, fontSize: 14, lineHeight: 1.2, letterSpacing: "0.01em",
                }}>{item.title}</div>
                <div style={{
                  color: active ? "var(--ht-cyan-200)" : "var(--ht-fg-muted)",
                  fontWeight: 600, fontSize: 11.5, lineHeight: 1.35, marginTop: 3,
                  opacity: active ? 0.85 : 1,
                }}>{item.desc}</div>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
