// ─────────────────────────────────────────────────────────────────────────────
// screen-fantasy.jsx  ·  Hightop Fantasy™  (elevated "coach's chalkboard" theme)
//
// MAPS TO REAL APP:
//   app/fantasy/page.tsx, app/fantasy/wnba/page.tsx → page wrappers (defaultSport)
//   components/fantasy/FantasyHome.tsx               → the whole draft + live screen
//   components/fantasy/PointsLedger.tsx              → live "Collect points" ledger
//   components/venue/VenueEntryRulesPanel.tsx        → geofence / entry-rules banner
//   lib/fantasy (FantasyGame, FantasyPlayerPoolItem, FantasyEntry, FantasyLeaderboardEntry)
//
// Two states match the live component: DRAFT (pre-entry) and LIVE (post-tipoff).
// FP scoring mirrors lib: pts*1 + reb*1.2 + ast*1.5 + stl*3 + blk*3 - tov*1.
// ─────────────────────────────────────────────────────────────────────────────

const FAN_CHALK = "#fef3c7";
const FAN_DIM = "rgba(254,243,199,0.55)";
const FAN_LINEUP_SIZE = 5;

// FANTASY_SPORTS — exact set + availability from FantasyHome.tsx
const FAN_SPORTS = [
  { key: "nba",      label: "NBA",      icon: "🏀", available: true },
  { key: "wnba",     label: "WNBA",     icon: "🏀", available: true },
  { key: "baseball", label: "Baseball", icon: "⚾", available: true },
  { key: "football", label: "Football", icon: "🏈", available: false },
];

// FantasyPlayerPoolItem[] — projectedPoints drives default sort; headshotUrl → silhouette
const FAN_POOL = [
  { playerId: 1, name: "Nikola Jokić",      pos: "C",  team: "DEN", opp: "vs MIN", proj: 58.9, top: true,  pts: 0, reb: 0, ast: 0 },
  { playerId: 2, name: "Giannis A.",        pos: "PF", team: "MIL", opp: "vs CHI", proj: 55.1, top: false, pts: 0, reb: 0, ast: 0 },
  { playerId: 3, name: "Jayson Tatum",      pos: "SF", team: "BOS", opp: "@ NYK",  proj: 51.4, top: false, pts: 0, reb: 0, ast: 0 },
  { playerId: 4, name: "Anthony Davis",     pos: "C",  team: "LAL", opp: "vs PHX", proj: 49.0, top: false, pts: 0, reb: 0, ast: 0 },
  { playerId: 5, name: "Tyrese Haliburton", pos: "PG", team: "IND", opp: "vs MIA", proj: 48.2, top: false, pts: 0, reb: 0, ast: 0 },
  { playerId: 6, name: "Anthony Edwards",   pos: "SG", team: "MIN", opp: "@ DEN",  proj: 46.7, top: false, pts: 0, reb: 0, ast: 0 },
  { playerId: 7, name: "Jalen Brunson",     pos: "PG", team: "NYK", opp: "vs BOS", proj: 44.0, top: false, pts: 0, reb: 0, ast: 0 },
];

// Live roster snapshot (FantasyEntry.lineup + scoreBreakdown projected onto box scores)
const FAN_LIVE = [
  { playerId: 5, name: "Tyrese Haliburton", pos: "PG", team: "IND", status: "Q3 4:12", live: true,  pts: 22, reb: 5, ast: 11, stl: 2, blk: 0, tov: 1 },
  { playerId: 6, name: "Anthony Edwards",   pos: "SG", team: "MIN", status: "Q3 7:48", live: true,  pts: 19, reb: 4, ast: 3,  stl: 1, blk: 0, tov: 2 },
  { playerId: 3, name: "Jayson Tatum",      pos: "SF", team: "BOS", status: "Q2 1:30", live: true,  pts: 14, reb: 6, ast: 2,  stl: 0, blk: 1, tov: 0 },
  { playerId: 2, name: "Giannis A.",        pos: "PF", team: "MIL", status: "Q3 2:05", live: true,  pts: 26, reb: 9, ast: 4,  stl: 1, blk: 2, tov: 3 },
  { playerId: 1, name: "Nikola Jokić",      pos: "C",  team: "DEN", status: "Tip 7:30", live: false, pts: 0,  reb: 0, ast: 0,  stl: 0, blk: 0, tov: 0 },
];

const FAN_LEADERBOARD = [
  { rank: 1, name: "you",            pts: 142.8, me: true },
  { rank: 2, name: "crab_rangoon42", pts: 131.4, me: false },
  { rank: 3, name: "court_vision",   pts: 119.0, me: false },
  { rank: 4, name: "venue avg",      pts: 96.4,  me: false, avg: true },
];

const fanFp = p => Math.round((p.pts * 1 + p.reb * 1.2 + p.ast * 1.5 + p.stl * 3 + p.blk * 3 - p.tov * 1) * 10) / 10;
const fan1 = n => n.toFixed(1);

function FanInitials({ name, live }) {
  const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("");
  return (
    <span style={{
      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
      background: "rgba(254,243,199,0.12)", border: "1.5px solid " + (live ? "rgba(110,231,183,0.6)" : "rgba(254,243,199,0.55)"),
      color: "#fde68a", display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontWeight: 900, fontSize: 11, letterSpacing: "0.02em",
    }}>{initials}</span>
  );
}

function FanSortChip({ label, active }) {
  return (
    <button style={{
      flexShrink: 0, padding: "6px 11px", borderRadius: 9999, cursor: "pointer", whiteSpace: "nowrap",
      background: active ? "rgba(254,243,199,0.14)" : "transparent",
      border: active ? "1px solid rgba(254,243,199,0.4)" : "1px solid rgba(255,255,255,0.12)",
      color: active ? "#fef3c7" : "#94a3b8", fontWeight: 800, fontSize: 10.5, letterSpacing: "0.04em",
    }}>{label}</button>
  );
}

function FantasyScreen() {
  const [view, setView] = React.useState("draft"); // "draft" | "live"
  const [sport, setSport] = React.useState("nba");
  const roster = [5, 6, 3]; // drafted playerIds (3 of 5)
  const total = Math.round(FAN_LIVE.reduce((s, p) => s + fanFp(p), 0) * 10) / 10;

  const Header = (
    <div style={{ position: "sticky", top: 0, zIndex: 30, background: "#020617", flexShrink: 0 }}>
      <MiniTopBar accent="#fef3c7" title="Fantasy" showHam={false}/>
      <div style={{ padding: "8px 14px 10px" }}>
        <div style={{ display: "flex", background: "rgba(254,243,199,0.05)", border: "1px solid rgba(254,243,199,0.18)", borderRadius: 9999, padding: 4, gap: 2 }}>
          {[{ id: "draft", l: "Draft" }, { id: "live", l: "Live Game" }].map(t => {
            const active = view === t.id;
            return (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "8px 4px", borderRadius: 9999, border: "none", cursor: "pointer",
                background: active ? (t.id === "live" ? "rgba(16,185,129,0.16)" : "rgba(254,243,199,0.14)") : "transparent",
                boxShadow: active ? (t.id === "live" ? "inset 0 0 0 1px rgba(110,231,183,0.5)" : "inset 0 0 0 1px rgba(254,243,199,0.4)") : "none",
                color: active ? (t.id === "live" ? "#6ee7b7" : "#fef3c7") : "#94a3b8",
                fontWeight: 900, fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase",
              }}>
                {t.id === "live" ? <span className={active ? "ht-live-dot" : ""} style={{ width: 6, height: 6, borderRadius: "50%", background: active ? "#34d399" : "#475569" }}/> : null}
                {t.l}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══════════════ DRAFT ═══════════════
  if (view === "draft") {
    return (
      <ScreenShell>
        {Header}

        {/* Date stepper (formatDateLabel: Yesterday/Today/Tomorrow) */}
        <div style={{ padding: "2px 14px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "#0a3128", border: "1px solid rgba(254,243,199,0.3)", borderRadius: 12, padding: "6px 8px" }}>
            <button style={{ width: 32, height: 32, borderRadius: 9999, border: "1px solid rgba(254,243,199,0.35)", background: "rgba(0,0,0,0.3)", color: "#fde68a", cursor: "pointer", fontSize: 12, fontWeight: 900 }}>◀</button>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#fef3c7" }}>Today <span style={{ color: FAN_DIM, fontWeight: 700 }}>· Fri May 31</span></span>
            <button style={{ width: 32, height: 32, borderRadius: 9999, border: "1px solid rgba(254,243,199,0.35)", background: "rgba(0,0,0,0.3)", color: "#fde68a", cursor: "pointer", fontSize: 12, fontWeight: 900 }}>▶</button>
          </div>
        </div>

        {/* Sport row — NBA / WNBA / Baseball / Football(coming soon) */}
        <div className="ht-noscroll" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "12px 14px 4px", flexShrink: 0 }}>
          {FAN_SPORTS.map(s => {
            const active = sport === s.key;
            return (
              <button key={s.key} onClick={() => s.available && setSport(s.key)} disabled={!s.available} style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 9999,
                cursor: s.available ? "pointer" : "not-allowed", whiteSpace: "nowrap",
                background: active ? "#fde68a" : "rgba(255,255,255,0.03)",
                border: active ? "1px solid #fde68a" : "1px solid rgba(255,255,255,0.12)",
                color: active ? "#0a3128" : s.available ? "#94a3b8" : "#475569", opacity: s.available ? 1 : 0.55,
                fontWeight: 900, fontSize: 12, letterSpacing: "0.03em",
              }}>
                <span style={{ fontSize: 14 }}>{s.icon}</span>{s.label}
                {!s.available ? <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#64748b" }}>Soon</span> : null}
              </button>
            );
          })}
        </div>

        {/* Slate banner (FantasyGame count + lock) */}
        <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(254,243,199,0.05)", border: "1px solid rgba(254,243,199,0.2)", borderRadius: 10 }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: "#cbd5e1" }}>Tonight's NBA slate · 6 games</span>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fde68a" }}>Locks at first tip</span>
          </div>
        </div>

        {/* Roster strip (chalkboard, 5 slots) */}
        <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
          <div style={{ position: "relative", overflow: "hidden", background: "#0a3128", border: "1px solid rgba(254,243,199,0.35)", borderRadius: 14, padding: "11px 12px" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(254,243,199,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(254,243,199,0.06) 1px, transparent 1px)", backgroundSize: "18px 18px" }}/>
            <div style={{ position: "relative", zIndex: 2 }}>
              <Eyebrow color="#fde68a" style={{ marginBottom: 9 }}>Your lineup · {roster.length}/{FAN_LINEUP_SIZE}</Eyebrow>
              <div style={{ display: "flex", gap: 6 }}>
                {Array.from({ length: FAN_LINEUP_SIZE }).map((_, i) => {
                  const p = FAN_POOL.find(x => x.playerId === roster[i]);
                  return (
                    <div key={i} style={{
                      flex: 1, aspectRatio: "1/1.15", borderRadius: 9, display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 3, padding: 3, textAlign: "center",
                      background: p ? "rgba(254,243,199,0.1)" : "rgba(0,0,0,0.25)",
                      border: p ? "1px solid rgba(254,243,199,0.4)" : "1px dashed rgba(254,243,199,0.25)",
                    }}>
                      {p ? <FanInitials name={p.name} live={false}/> : <span style={{ fontFamily: "'Bree Serif',serif", fontSize: 14, color: FAN_DIM }}>+</span>}
                      <span style={{ fontSize: 8, fontWeight: 800, color: p ? "#fef3c7" : "#64748b", lineHeight: 1 }}>{p ? p.pos : "—"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Pool controls: sort chips + position/team filters */}
        <div style={{ padding: "12px 14px 0", flexShrink: 0 }}>
          <div className="ht-noscroll" style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b", alignSelf: "center", flexShrink: 0 }}>Sort</span>
            <FanSortChip label="Proj" active={true}/>
            <FanSortChip label="A–Z" active={false}/>
            <FanSortChip label="Pos" active={false}/>
            <FanSortChip label="Team" active={false}/>
            <span style={{ width: 1, background: "rgba(255,255,255,0.1)", margin: "2px 2px", flexShrink: 0 }}/>
            <FanSortChip label="All positions ▾" active={false}/>
            <FanSortChip label="All teams ▾" active={false}/>
          </div>
        </div>

        {/* Player pool */}
        <div style={{ padding: "0 14px", flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {FAN_POOL.map(p => {
              const added = roster.includes(p.playerId);
              return (
                <div key={p.playerId} style={{
                  display: "grid", gridTemplateColumns: "30px 1fr auto", gap: 10, alignItems: "center", padding: "9px 10px",
                  background: added ? "rgba(254,243,199,0.06)" : "rgba(255,255,255,0.015)",
                  border: added ? "1px solid rgba(254,243,199,0.3)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 10,
                }}>
                  <FanInitials name={p.name} live={false}/>
                  <div style={{ minWidth: 0, lineHeight: 1.15 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 900, fontSize: 13, color: "#fef3c7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                      {p.top ? <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fcd34d", background: "rgba(252,211,77,0.14)", border: "1px solid rgba(252,211,77,0.4)", borderRadius: 9999, padding: "1px 5px" }}>★ Top</span> : null}
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: FAN_DIM, marginTop: 2 }}>
                      <span style={{ color: "#fde68a", fontFamily: "'Bree Serif',serif" }}>{p.pos}</span> · {p.team} {p.opp} · <span style={{ color: "#fde68a" }}>{p.proj} proj</span>
                    </div>
                  </div>
                  <button style={{
                    minWidth: 64, height: 32, borderRadius: 9999, cursor: "pointer",
                    border: added ? "1px solid rgba(110,231,183,0.55)" : "1px solid rgba(254,243,199,0.45)",
                    background: added ? "rgba(16,185,129,0.16)" : "rgba(254,243,199,0.1)",
                    color: added ? "#6ee7b7" : "#fde68a", fontWeight: 900, fontSize: 10.5, letterSpacing: "0.04em", textTransform: "uppercase",
                  }}>{added ? "✓ Drafted" : "Draft"}</button>
                </div>
              );
            })}
          </div>
          <button style={{ width: "100%", marginTop: 10, padding: "10px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", color: "#94a3b8", fontWeight: 800, fontSize: 11, letterSpacing: "0.04em", cursor: "pointer" }}>
            Load more players (25)
          </button>
          <div style={{ height: 8 }}/>
        </div>

        {/* Submit roster (sticky, violet primary) */}
        <div style={{ position: "sticky", bottom: 0, marginTop: "auto", flexShrink: 0, padding: "14px 14px 6px", background: "linear-gradient(180deg, rgba(2,6,23,0) 0%, #020617 34%)" }}>
          <button style={{
            width: "100%", border: "none", borderRadius: 14, padding: "14px 18px", fontWeight: 900, fontSize: 14.5,
            letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", display: "inline-flex",
            alignItems: "center", justifyContent: "center", gap: 9, background: "#8b5cf6", color: "#fff",
            boxShadow: "0 8px 24px rgba(139,92,246,0.35)",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
            Submit lineup · {roster.length}/{FAN_LINEUP_SIZE}
          </button>
        </div>
      </ScreenShell>
    );
  }

  // ═══════════════ LIVE SWEAT ═══════════════
  return (
    <ScreenShell>
      {Header}

      {/* Total FP scoreboard */}
      <div style={{ padding: "2px 14px 0", flexShrink: 0 }}>
        <div style={{ position: "relative", overflow: "hidden", background: "#0a3128", border: "2px solid rgba(254,243,199,0.55)", borderRadius: 18, padding: "14px 14px 15px" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(254,243,199,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(254,243,199,0.06) 1px, transparent 1px)", backgroundSize: "20px 20px" }}/>
          <div style={{ position: "relative", zIndex: 2 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Eyebrow color="#fde68a">Live Game · vs The Local Tavern</Eyebrow>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 9px", borderRadius: 9999, background: "rgba(16,185,129,0.16)", border: "1px solid rgba(110,231,183,0.45)", color: "#6ee7b7", fontWeight: 900, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                <span className="ht-live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399" }}/>Live
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 6 }}>
              <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 46, lineHeight: 0.95, color: "#fef3c7" }}>{fan1(total)}</div>
              <div style={{ fontSize: 11, fontWeight: 800, color: FAN_DIM, paddingBottom: 6, letterSpacing: "0.08em", textTransform: "uppercase" }}>fantasy<br/>points</div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {[{ l: "Venue rank", v: "1st", sub: "of 18", c: "#6ee7b7" }, { l: "Venue avg", v: "96.4", sub: "+" + fan1(total - 96.4), c: "#fde68a" }, { l: "Players live", v: FAN_LIVE.filter(p => p.live).length + "/5", sub: "scoring", c: "#67e8f9" }].map(s => (
                <div key={s.l} style={{ flex: 1, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(254,243,199,0.18)", borderRadius: 10, padding: "7px 9px" }}>
                  <div style={{ fontSize: 8, fontWeight: 900, color: FAN_DIM, letterSpacing: "0.12em", textTransform: "uppercase" }}>{s.l}</div>
                  <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 15, color: s.c, marginTop: 2 }}>{s.v}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "#64748b" }}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Geofence pause banner (VenueEntryRulesPanel) */}
      <div style={{ padding: "10px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#bfdbfe", lineHeight: 1.3 }}>At the venue — live scoring active. Leave and scoring pauses.</span>
        </div>
      </div>

      {/* Stat ticker (describeStatChange flash labels) */}
      <div style={{ padding: "10px 14px 0", flexShrink: 0 }}>
        <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(110,231,183,0.28)", borderRadius: 12, padding: "9px 11px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
            <span className="ht-live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399" }}/>
            <Eyebrow color="#6ee7b7">Points ticker</Eyebrow>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {[{ flash: "3-POINTER!", name: "Edwards", label: "drains a three", fp: 3 }, { flash: "REBOUND!", name: "Giannis", label: "grabs a board", fp: 1.2 }, { flash: "ASSIST!", name: "Haliburton", label: "dishes a dime", fp: 1.5 }, { flash: "BLOCK!", name: "Tatum", label: "swats it away", fp: 3 }].map((e, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, opacity: 1 - i * 0.16 }}>
                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: "0.08em", color: "#6ee7b7", background: "rgba(16,185,129,0.14)", border: "1px solid rgba(110,231,183,0.35)", borderRadius: 4, padding: "1px 5px", flexShrink: 0, minWidth: 72, textAlign: "center" }}>{e.flash}</span>
                <span style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 11, color: "#6ee7b7", flexShrink: 0, minWidth: 44 }}>+{fan1(e.fp)} FP</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span style={{ color: "#fde68a", fontWeight: 900 }}>{e.name}</span> {e.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Locked roster · live cards */}
      <div style={{ padding: "12px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Eyebrow color="#fde68a">Your roster · locked</Eyebrow>
          <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em" }}>Tipped off 7:02pm</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FAN_LIVE.map(p => {
            const fp = fanFp(p);
            const box = p.live ? p.pts + " PTS · " + p.reb + " REB · " + p.ast + " AST" : "Awaiting tip-off";
            return (
              <div key={p.playerId} style={{ display: "grid", gridTemplateColumns: "30px 1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 14, background: "rgba(254,243,199,0.045)", border: "1px solid rgba(254,243,199,0.22)" }}>
                <FanInitials name={p.name} live={p.live}/>
                <div style={{ minWidth: 0, lineHeight: 1.2 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontWeight: 900, fontSize: 13, color: "#fef3c7", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    <span style={{ flexShrink: 0, fontSize: 8.5, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 9999, color: p.live ? "#6ee7b7" : "#94a3b8", background: p.live ? "rgba(16,185,129,0.14)" : "rgba(255,255,255,0.05)", border: p.live ? "1px solid rgba(110,231,183,0.4)" : "1px solid rgba(255,255,255,0.1)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {p.live ? <span className="ht-live-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399" }}/> : null}{p.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: FAN_DIM, marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{p.team} · {box}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 8, fontWeight: 900, color: FAN_DIM, letterSpacing: "0.14em", textTransform: "uppercase" }}>FP</div>
                  <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 18, color: "#fde68a", lineHeight: 1.05 }}>{fan1(fp)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Venue leaderboard (FantasyLeaderboardEntry[]) */}
      <div style={{ padding: "14px 14px 0", flexShrink: 0 }}>
        <Eyebrow color="#fde68a" style={{ marginBottom: 8 }}>Venue leaderboard</Eyebrow>
        <div style={{ background: "#0f172a", border: "1px solid rgba(254,243,199,0.18)", borderRadius: 12, overflow: "hidden" }}>
          {FAN_LEADERBOARD.map((r, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px",
              borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none",
              background: r.me ? "rgba(254,243,199,0.06)" : "transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <span style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 12, color: r.rank <= 3 && !r.avg ? "#fde68a" : "#64748b", width: 16 }}>{r.avg ? "·" : r.rank}</span>
                <span style={{ fontWeight: r.me ? 900 : 700, fontSize: 12, color: r.me ? "#fef3c7" : r.avg ? "#94a3b8" : "#cbd5e1", fontStyle: r.avg ? "italic" : "normal" }}>{r.me ? "You" : r.name}</span>
              </div>
              <span style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 13, color: r.me ? "#6ee7b7" : "#e2e8f0" }}>{fan1(r.pts)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Collect live points (PointsLedger / collect-live) */}
      <div style={{ padding: "12px 14px 14px", marginTop: "auto" }}>
        <button style={{
          width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 46,
          borderRadius: 14, border: "1px solid rgba(110,231,183,0.6)", background: "rgba(16,185,129,0.16)",
          color: "#6ee7b7", fontWeight: 900, fontSize: 13.5, letterSpacing: "0.03em", cursor: "pointer",
        }}>
          <svg width="18" height="18" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="#fde047" stroke="#a16207" strokeWidth="3"/><circle cx="32" cy="32" r="16" fill="#fef9c3" stroke="#a16207" strokeWidth="2"/></svg>
          Collect Live Points (+43)
        </button>
      </div>
    </ScreenShell>
  );
}

Object.assign(window, { FantasyScreen });
