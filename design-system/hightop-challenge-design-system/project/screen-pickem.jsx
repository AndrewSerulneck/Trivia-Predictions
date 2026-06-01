// ─────────────────────────────────────────────────────────────────────────────
// screen-pickem.jsx  ·  Hightop Pick 'Em™  (elevated "sportsbook ticket" theme)
//
// MAPS TO REAL APP:
//   app/pickem/page.tsx                         → page wrapper + GameLandingExperience
//   components/pickem/PickEmGameList.tsx         → everything below (header, pick
//                                                  tracker, date stepper, sport row,
//                                                  league-grouped game cards, collect)
//   components/pickem/PickEmSportSelect.tsx      → the horizontal sport pill row
//   components/pickem/PointsBank.tsx             → "Collect Points" / pending bank
//   components/ui/InlineSlotAdClient.tsx         → the inline SPONSOR slot every 5 cards
//
// Data shapes below mirror PickEmSportSlug / PickEmSport / PickEmGame exactly so the
// markup lifts cleanly onto the live API payloads.
// ─────────────────────────────────────────────────────────────────────────────

// type PickEmSportSlug = "nba"|"mlb"|"nhl"|"soccer"|"nfl"|"mma"|"tennis"
const PICKEM_SPORTS = [
  { slug: "nba",    label: "NBA",    icon: "🏀", isInSeason: true,  isClickable: true  },
  { slug: "mlb",    label: "MLB",    icon: "⚾", isInSeason: true,  isClickable: true  },
  { slug: "nhl",    label: "NHL",    icon: "🏒", isInSeason: true,  isClickable: true  },
  { slug: "soccer", label: "Soccer", icon: "⚽", isInSeason: true,  isClickable: true  },
  { slug: "nfl",    label: "NFL",    icon: "🏈", isInSeason: false, isClickable: false },
  { slug: "mma",    label: "MMA",    icon: "🥊", isInSeason: true,  isClickable: true  },
  { slug: "tennis", label: "Tennis", icon: "🎾", isInSeason: false, isClickable: false },
];

// PickEmGame[] grouped by league (grouped = useMemo over games in the real file)
const PICKEM_GAMES = [
  { id: "g1", league: "NBA", sportSlug: "nba", awayTeam: "Celtics",   awayRec: "48–18", homeTeam: "Knicks",   homeRec: "45–22", startsAt: "7:00 PM", status: "scheduled", isLocked: false, userPickTeam: "Celtics" },
  { id: "g2", league: "NBA", sportSlug: "nba", awayTeam: "Mavericks", awayRec: "40–28", homeTeam: "Heat",     homeRec: "35–32", startsAt: "7:30 PM", status: "scheduled", isLocked: false, userPickTeam: "Heat" },
  { id: "g3", league: "NBA", sportSlug: "nba", awayTeam: "Nuggets",   awayRec: "44–22", homeTeam: "Lakers",   homeRec: "39–28", startsAt: "Live · Q3", status: "live", isLocked: true, homeScore: 78, awayScore: 81, userPickTeam: "Nuggets" },
  { id: "g4", league: "NBA", sportSlug: "nba", awayTeam: "Bucks",     awayRec: "47–20", homeTeam: "Bulls",    homeRec: "30–37", startsAt: "Final", status: "final", isLocked: true, homeScore: 104, awayScore: 119, winnerTeam: "Bucks", userPickTeam: "Bucks", userPickStatus: "won" },
];

function PickEmTracker({ count = 3, limit = 10 }) {
  const atLimit = count >= limit;
  return (
    <div style={{
      overflow: "hidden", borderRadius: 12, marginTop: 12,
      border: atLimit ? "1px solid rgba(251,113,133,0.6)" : "1px solid rgba(253,230,138,0.30)",
      background: atLimit ? "rgba(159,18,57,0.14)" : "rgba(2,6,23,0.55)",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "5px 12px", borderBottom: "1px solid rgba(253,230,138,0.18)",
        background: "rgba(0,0,0,0.25)",
      }}>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#94a3b8" }}>Pick Tracker</span>
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: atLimit ? "#fb7185" : "#fde68a" }}>
          {atLimit ? "Limit Reached" : "Daily Picks"}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px" }}>
        <div style={{ display: "flex", flex: 1, gap: 3 }}>
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} style={{
              height: 7, flex: 1, borderRadius: 9999,
              background: i < count ? (atLimit ? "#f43f5e" : "#fde68a") : "rgba(255,255,255,0.10)",
            }}/>
          ))}
        </div>
        <span style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 17, lineHeight: 1, color: atLimit ? "#f43f5e" : "#fde68a" }}>
          {count}<span style={{ fontSize: 11, color: "#94a3b8" }}>/{limit}</span>
        </span>
      </div>
    </div>
  );
}

// One matchup rendered as a perforated betting-ticket scoreboard.
// Replaces the real <li> scoreboard card; the two team rows ARE the pick action.
function PickEmTicketGame({ game }) {
  const statusColor = game.status === "live" ? "#6ee7b7" : game.status === "final" ? "#94a3b8" : "#cbd5e1";
  const TeamRow = ({ team, rec, score, picked, isWinner }) => (
    <div style={{
      position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "9px 12px",
      background: picked ? "rgba(253,230,138,0.14)" : "transparent",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <span style={{
          width: 20, height: 20, borderRadius: 5, flexShrink: 0,
          border: picked ? "none" : "1.5px solid rgba(253,230,138,0.4)",
          background: picked ? "#fde68a" : "transparent",
          color: "#1a2f72", display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontWeight: 900, fontSize: 12, transform: picked ? "rotate(-7deg)" : "none",
        }}>{picked ? "✓" : ""}</span>
        <span style={{ fontWeight: 900, fontSize: 13.5, color: "#fff", letterSpacing: "0.01em" }}>{team}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(253,230,138,0.65)", fontVariantNumeric: "tabular-nums" }}>{rec}</span>
      </div>
      <span style={{
        fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 14,
        color: isWinner ? "#6ee7b7" : "#e2e8f0", minWidth: 24, textAlign: "right",
      }}>{score != null ? score : ""}</span>
    </div>
  );
  return (
    <div style={{
      position: "relative", overflow: "hidden", borderRadius: 12,
      background: "linear-gradient(115deg, #1a2f72 0%, #1a2f72 46%, #6b1a4e 54%, #6b1a4e 100%)",
      border: "1px solid rgba(253,230,138,0.45)",
    }}>
      {/* ticket header: sport + time/status */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", borderBottom: "1px dashed rgba(253,230,138,0.4)" }}>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.16em", textTransform: "uppercase", color: "#fde68a" }}>{game.league}</span>
        <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", color: statusColor, display: "inline-flex", alignItems: "center", gap: 5 }}>
          {game.status === "live" ? <span className="ht-live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399" }}/> : null}
          {game.startsAt}
        </span>
      </div>
      <div style={{ background: "rgba(2,6,23,0.45)" }}>
        <TeamRow team={game.awayTeam} rec={game.awayRec} score={game.awayScore} picked={game.userPickTeam === game.awayTeam} isWinner={game.winnerTeam === game.awayTeam}/>
        <div style={{ height: 1, background: "rgba(253,230,138,0.18)" }}/>
        <TeamRow team={game.homeTeam} rec={game.homeRec} score={game.homeScore} picked={game.userPickTeam === game.homeTeam} isWinner={game.winnerTeam === game.homeTeam}/>
      </div>
      {/* settled result strip */}
      {game.userPickStatus === "won" || game.userPickStatus === "lost" ? (
        <div style={{
          padding: "5px 12px", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em",
          color: game.userPickStatus === "won" ? "#6ee7b7" : "#fda4af",
          background: game.userPickStatus === "won" ? "rgba(16,185,129,0.12)" : "rgba(159,18,57,0.18)",
        }}>{game.userPickStatus === "won" ? "✓ Correct pick · +10 points" : "Incorrect pick · 0 points"}</div>
      ) : null}
    </div>
  );
}

function PickEmScreen() {
  const selectedSport = "nba";
  const groups = {};
  PICKEM_GAMES.forEach(g => { (groups[g.league] = groups[g.league] || []).push(g); });

  return (
    <ScreenShell>
      <MiniTopBar accent="#fde68a" title="Pick 'Em" showHam={false}/>

      {/* ── Header section (rounded-2xl border-indigo-400/40 in real app) ── */}
      <div style={{ padding: "10px 14px 0" }}>
        <div style={{ background: "#0f172a", border: "1px solid rgba(253,230,138,0.3)", borderRadius: 16, padding: "13px 14px" }}>
          <Eyebrow color="#fde68a">Pick 'Em</Eyebrow>
          <div style={{ fontFamily: "'Bree Serif',serif", fontSize: 19, color: "#fde68a", marginTop: 3, letterSpacing: "0.01em" }}>Hightop Pick 'Em™</div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "#94a3b8", marginTop: 5, lineHeight: 1.4, textWrap: "pretty" }}>
            Select winners by checking a team. Picks lock at scheduled start time and are final.
          </div>

          <PickEmTracker count={3} limit={10}/>

          {/* ── Date stepper (◀ Day · Mon D (Today) ▶) ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12,
            background: "rgba(253,230,138,0.08)", border: "1px solid rgba(253,230,138,0.35)", borderRadius: 12, padding: "6px 8px",
          }}>
            <button style={{ width: 32, height: 32, borderRadius: 9999, border: "1px solid rgba(253,230,138,0.4)", background: "rgba(2,6,23,0.6)", color: "#fde68a", cursor: "pointer", fontSize: 12, fontWeight: 900 }}>◀</button>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "#f8fafc", letterSpacing: "0.02em" }}>Fri · May 31 <span style={{ color: "#fde68a" }}>(Today)</span></span>
            <button style={{ width: 32, height: 32, borderRadius: 9999, border: "1px solid rgba(253,230,138,0.25)", background: "rgba(2,6,23,0.4)", color: "rgba(253,230,138,0.35)", cursor: "not-allowed", fontSize: 12, fontWeight: 900 }}>▶</button>
          </div>

          {/* ── Sport pill row (horizontal scroll; PickEmSportSelect) ── */}
          <div className="ht-noscroll" style={{ display: "flex", gap: 7, overflowX: "auto", marginTop: 12, paddingBottom: 2 }}>
            {PICKEM_SPORTS.map(s => {
              const active = s.slug === selectedSport;
              const disabled = !s.isClickable;
              return (
                <button key={s.slug} disabled={disabled} style={{
                  flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px",
                  borderRadius: 9999, cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                  background: active ? "#fde68a" : "rgba(255,255,255,0.03)",
                  border: active ? "1px solid #fde68a" : "1px solid rgba(255,255,255,0.12)",
                  color: active ? "#1a2f72" : disabled ? "#475569" : "#94a3b8",
                  opacity: disabled ? 0.55 : 1, fontWeight: 900, fontSize: 11.5, letterSpacing: "0.03em",
                }}>
                  <span style={{ fontSize: 15 }}>{s.icon}</span>{s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── League-grouped game tickets ── */}
      <div style={{ padding: "12px 14px 0", display: "flex", flexDirection: "column", gap: 14 }}>
        {Object.entries(groups).map(([league, gms]) => (
          <div key={league}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <Eyebrow color="#fde68a">{league}</Eyebrow>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.04em" }}>{gms.length} games</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {gms.map((g, i) => (
                <React.Fragment key={g.id}>
                  <PickEmTicketGame game={g}/>
                  {/* InlineSlotAdClient — real app injects an ad every 5 cards */}
                  {i === 1 ? (
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 12px",
                      background: "rgba(255,255,255,0.02)",
                    }}>
                      <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.18em", color: "#475569", textTransform: "uppercase" }}>Ad</span>
                      <span style={{ fontFamily: "ui-monospace,monospace", fontSize: 10, color: "#64748b" }}>sponsor slot · pickem-inline-cards-6-10</span>
                    </div>
                  ) : null}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sticky footer: Back to Venue + Collect Points (PointsBank) ── */}
      <div style={{ padding: "14px 14px 4px", marginTop: "auto", display: "flex", gap: 8, position: "sticky", bottom: 0, background: "linear-gradient(180deg, rgba(2,6,23,0) 0%, #020617 36%)" }}>
        <ExitChip label="Back to Venue"/>
        <button style={{
          flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44,
          borderRadius: 12, border: "1px solid rgba(253,230,138,0.6)", background: "rgba(253,230,138,0.16)",
          color: "#fde68a", fontWeight: 900, fontSize: 12.5, letterSpacing: "0.02em", cursor: "pointer",
        }}>
          <svg width="16" height="16" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="24" fill="#fde047" stroke="#a16207" strokeWidth="3"/><circle cx="32" cy="32" r="16" fill="#fef9c3" stroke="#a16207" strokeWidth="2"/></svg>
          Collect Points (250)
        </button>
      </div>
      <div style={{ padding: "0 14px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: "0.03em" }}>
        Think you can pick today's winners? Prove it.
      </div>
    </ScreenShell>
  );
}

Object.assign(window, { PickEmScreen });
