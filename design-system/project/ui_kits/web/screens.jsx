// HightopScreens.jsx — five core screens of the Hightop Challenge web app.
// Each screen takes a `navigate` callback that the App shell wires to its router.

// ─────────────────────────────────────────────────────────────
// 1. JoinScreen — anonymous auth, venue-locked username
// ─────────────────────────────────────────────────────────────
function JoinScreen({ navigate }) {
  const [name, setName] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  return (
    <main style={{ padding: "24px 18px 32px", display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
        <img src="../../assets/brand/hightop-logo.svg" alt="Hightop Challenge"
             style={{ height: 112, objectFit: "contain" }}/>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--ht-font-display)", fontSize: 28, lineHeight: 1.05,
          letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--ht-fg-primary)",
        }}>The Local Tavern</div>
        <div style={{ color: "var(--ht-fg-muted)", fontWeight: 700, fontSize: 13,
                      letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 4 }}>
          You're 38m from this venue · in range
        </div>
      </div>
      <AccentCard accent="cyan" padding={18}>
        <Eyebrow accent="cyan">Pick a username for tonight</Eyebrow>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="e.g. corner_booth_42"
          style={{
            marginTop: 12, width: "100%", boxSizing: "border-box",
            background: "var(--ht-elevated)",
            border: `1px solid ${focused ? "#22d3ee" : "#334155"}`,
            boxShadow: focused ? "0 0 0 2px rgba(34,211,238,0.36)" : "none",
            borderRadius: 12, padding: "14px 16px",
            font: "600 16px/1.25 var(--ht-font-body)", color: "var(--ht-fg-primary)",
            outline: "none",
          }}
        />
        <div style={{ color: "var(--ht-fg-muted)", fontWeight: 600, fontSize: 12,
                      marginTop: 8, lineHeight: 1.4 }}>
          Your username is locked to The Local Tavern for tonight. Anyone in the venue can see it on the leaderboard.
        </div>
      </AccentCard>
      <Button variant="primary" accent="cyan" full
              onClick={() => navigate("hub")} disabled={name.trim().length < 3}>
        Join the venue
      </Button>
      <div style={{ color: "var(--ht-fg-muted)", fontSize: 11, fontWeight: 600,
                    textAlign: "center", lineHeight: 1.5, marginTop: -6 }}>
        By joining you agree to play fair. No closing your browser mid-round.
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. VenueHub — gradient cards rail
// ─────────────────────────────────────────────────────────────
function VenueHub({ navigate, onGame }) {
  return (
    <main style={{ padding: "18px 14px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Eyebrow accent="muted">Tonight at</Eyebrow>
          <div style={{ fontFamily: "var(--ht-font-display)", fontSize: 22,
                        color: "var(--ht-fg-primary)", marginTop: 2,
                        textTransform: "uppercase", letterSpacing: "0.04em" }}>
            The Local Tavern
          </div>
        </div>
        <StatusBadge accent="rose" dot>Live Now</StatusBadge>
      </div>

      <AccentCard accent="amber" padding={14} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Eyebrow accent="amber">Next Live Trivia Showdown in</Eyebrow>
          <div style={{
            fontFamily: "var(--ht-font-body)", fontWeight: 900,
            fontVariantNumeric: "tabular-nums",
            color: "var(--ht-amber-200)", fontSize: 32, lineHeight: 1, marginTop: 4,
          }}>00:14:32</div>
        </div>
        <Button variant="ghost" onClick={() => onGame("live_trivia")}>Enter lobby</Button>
      </AccentCard>

      <GameTile gameKey="live_trivia"
                subtitle="Synchronized live venue play · 30s answers"
                status={{ accent: "rose", dot: true, label: "Live · 14m" }}
                onClick={() => onGame("live_trivia")}/>
      <GameTile gameKey="trivia"
                subtitle="15 questions · 15s each · 3 rounds an hour"
                onClick={() => onGame("trivia")}/>
      <GameTile gameKey="bingo"
                subtitle="Player-stat squares fill in real time"
                onClick={() => onGame("bingo")}/>
      <GameTile gameKey="pickem"
                subtitle="Pick winners across 5 leagues"
                onClick={() => onGame("pickem")}/>
      <GameTile gameKey="fantasy"
                subtitle="Build one NBA lineup against the room"
                onClick={() => onGame("fantasy")}/>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. GameLanding — full-bleed gradient rules card
// ─────────────────────────────────────────────────────────────
function GameLanding({ gameKey, navigate, onPlay, rules }) {
  const meta = GAME_META[gameKey];
  // Decorative question-mark scatter inside the card.
  const scatter = React.useMemo(() => (
    Array.from({ length: 12 }, (_, i) => {
      const row = Math.floor(i / 4), col = i % 4;
      return {
        i, left: 8 + col * 23 + (row % 2 ? -4 : 4) + "%",
        top: 4 + row * 28 + (i * 7) % 12 + "%",
        size: 0.7 + (i % 3) * 0.3,
        rot: (i % 2 === 0 ? 1 : -1) * (8 + (i % 5) * 4),
        tint: i % 3 === 0 ? "rgba(207,250,254,0.32)" : i % 3 === 1 ? "rgba(167,243,208,0.28)" : "rgba(254,240,138,0.28)",
      };
    })
  ), []);
  return (
    <main style={{ padding: "18px 14px 24px", display: "flex", flexDirection: "column", gap: 14, minHeight: "100%" }}>
      {/* Subtle full-bleed tint so the page feels like the game's identity. */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: meta.grad, opacity: 0.18,
      }}/>
      <div style={{
        position: "relative", flex: 1, minHeight: 460,
        borderRadius: 28, border: "3px solid rgba(255,255,255,0.6)",
        padding: 20, color: "#fff", background: meta.grad,
        boxShadow: "0 12px 26px rgba(15,23,42,0.5)", overflow: "hidden",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.55, pointerEvents: "none" }}>
          {scatter.map(s => (
            <span key={s.i} style={{
              position: "absolute", left: s.left, top: s.top,
              fontFamily: "var(--ht-font-display)", fontWeight: 900,
              fontSize: `${s.size}rem`, color: s.tint,
              transform: `rotate(${s.rot}deg)`, lineHeight: 1, userSelect: "none",
            }}>?</span>
          ))}
        </div>
        <div style={{
          position: "relative", fontFamily: "var(--ht-font-display)",
          fontSize: "clamp(2rem, 6.2vw, 3rem)", lineHeight: 1.02,
          letterSpacing: "0.045em", textTransform: "uppercase", color: "#fff",
          textShadow: "0 1px 0 rgba(12,18,28,.8), 0 3px 0 rgba(12,18,28,.58), 0 0 12px rgba(255,255,255,.5)",
        }}>{meta.title}</div>
        <div style={{
          position: "relative", flex: 1, borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.4)", background: "rgba(0,0,0,0.28)",
          padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{
            fontFamily: "var(--ht-font-body)", fontWeight: 900,
            fontSize: 14, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "var(--ht-cyan-100, #cffafe)",
          }}>Rules</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10,
                        color: "rgba(255,255,255,0.95)", fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>
            {rules.map((r, i) => <p key={i} style={{ margin: 0 }}>• {r}</p>)}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, position: "relative" }}>
        <Button variant="primary" accent="emerald" full onClick={() => navigate("hub")}
                style={{ borderRadius: 9999, minHeight: 52 }}>Close</Button>
        <Button variant="primary" full onClick={onPlay}
                style={{ borderRadius: 9999, minHeight: 52,
                         background: "var(--ht-violet-600)", color: "#fff" }}>Play</Button>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. LiveShowdown — the NORTH STAR screen
// ─────────────────────────────────────────────────────────────
function LiveShowdown({ navigate }) {
  const [phase, setPhase] = React.useState("answering"); // answering · reveal · intermission
  const [answer, setAnswer] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [secondsLeft, setSecondsLeft] = React.useState(18);

  // Phase cycling: lets the prototype walk all states. Real product ticks every 1s.
  React.useEffect(() => {
    const id = setInterval(() => setSecondsLeft(s => (s <= 1 ? 30 : s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const progressPct = Math.max(0, Math.min(100, (secondsLeft / 30) * 100));

  const cycle = () => {
    if (phase === "answering") setPhase("reveal");
    else if (phase === "reveal") setPhase("intermission");
    else { setPhase("answering"); setSubmitted(false); setAnswer(""); }
  };

  return (
    <main style={{
      padding: "16px 14px 18px", display: "flex", flexDirection: "column", gap: 12,
      flex: 1, minHeight: 0, overflowY: "auto",
    }}>
      <AccentCard accent="cyan" padding={16} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{
          fontFamily: "var(--ht-font-display)", fontSize: 26,
          color: "var(--ht-cyan-300)", lineHeight: 1, letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}>Live Showdown</div>
        <StatusBadge accent="rose" dot>Live</StatusBadge>
      </AccentCard>

      {phase === "answering" ? (
        <AccentCard accent="emerald" padding={16}>
          <Eyebrow accent="emerald">Round 2 · Question 7</Eyebrow>
          <div style={{ marginTop: 4, fontFamily: "var(--ht-font-body)", fontWeight: 800,
                        fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase",
                        color: "var(--ht-emerald-200)" }}>
            Category: Sports History
          </div>
          <div style={{
            marginTop: 12, fontFamily: "var(--ht-font-body)", fontWeight: 800,
            fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.01em",
            color: "var(--ht-fg-primary)",
          }}>
            Which city hosted the first modern Olympic Games?
          </div>
          <div style={{ marginTop: 14, height: 10, borderRadius: 9999,
                        background: "var(--ht-elevated)", overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${progressPct}%`,
              background: "var(--ht-emerald-400)", transition: "width 700ms linear",
            }}/>
          </div>
          <div style={{ marginTop: 6, fontFamily: "var(--ht-font-body)", fontWeight: 900,
                        color: "var(--ht-emerald-300)", fontSize: 22,
                        fontVariantNumeric: "tabular-nums" }}>{secondsLeft}s</div>
          <input
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Type your answer…"
            disabled={submitted}
            style={{
              marginTop: 12, width: "100%", boxSizing: "border-box",
              background: "var(--ht-elevated)",
              border: `1px solid ${focused ? "#22d3ee" : "#475569"}`,
              boxShadow: focused ? "0 0 0 2px rgba(34,211,238,0.36)" : "none",
              borderRadius: 12, padding: "14px 16px",
              font: "800 22px/1.2 var(--ht-font-body)", color: "var(--ht-fg-primary)",
              outline: "none", opacity: submitted ? 0.6 : 1,
            }}/>
          <Button variant="primary" accent="emerald" full
                  onClick={() => { setSubmitted(true); setTimeout(() => setPhase("reveal"), 700); }}
                  disabled={submitted || answer.trim().length === 0}
                  style={{ marginTop: 12, borderRadius: 14, fontSize: 22 }}>
            {submitted ? "Answer Locked!" : "Submit"}
          </Button>
        </AccentCard>
      ) : null}

      {phase === "reveal" ? (
        <AccentCard accent="fuchsia" padding={16} style={{ textAlign: "center" }}>
          <Eyebrow accent="fuchsia">Answer Reveal</Eyebrow>
          <div style={{
            fontFamily: "var(--ht-font-body)", fontWeight: 900,
            color: "var(--ht-fuchsia-200)", fontSize: 48, lineHeight: 1,
            fontVariantNumeric: "tabular-nums", marginTop: 8,
          }}>5s</div>
          <div style={{ marginTop: 14 }}>
            <FeedbackBanner state="right" sub="+10 points"/>
          </div>
          <div style={{
            marginTop: 12, border: "1px solid rgba(240,171,252,0.5)",
            background: "rgba(112,26,117,0.4)", borderRadius: 14,
            padding: "12px 14px", color: "var(--ht-fuchsia-200)",
            fontWeight: 900, fontSize: 22, lineHeight: 1.2,
          }}>Correct Answer: Athens</div>
          <div style={{
            marginTop: 10, border: "1px solid rgba(252,211,77,0.65)",
            background: "rgba(120,53,15,0.5)", borderRadius: 14,
            padding: "10px 12px", color: "var(--ht-amber-200)",
            fontWeight: 800, fontSize: 14, lineHeight: 1.35,
          }}>Emcee: Three correct in a row — you're heating up.</div>
        </AccentCard>
      ) : null}

      {phase === "intermission" ? (
        <LiveRoundBreakPanel secondsRemaining={42}/>
      ) : null}

      <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
        <Button variant="ghost" full onClick={cycle}>Step phase →</Button>
        <Button variant="secondary" onClick={() => navigate("postgame")}>End game</Button>
        <ExitPill onClick={() => navigate("hub")}>Home</ExitPill>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. Leaderboard — dark rebuild
// ─────────────────────────────────────────────────────────────
const LB_ENTRIES = [
  { rank: 1, name: "karaoke_kraken", pts: 428 },
  { rank: 2, name: "nine_ball_neil", pts: 391 },
  { rank: 3, name: "last_call_lucy", pts: 347 },
  { rank: 4, name: "you_are_here", pts: 312, you: true },
  { rank: 5, name: "frosty_mug_42", pts: 298 },
  { rank: 6, name: "jukebox_jerry", pts: 273 },
  { rank: 7, name: "trivia_trish", pts: 251 },
  { rank: 8, name: "ipa_iggy", pts: 234 },
];
function Leaderboard({ navigate }) {
  const rankStyle = (rank) => {
    if (rank === 1) return { color: "#fde68a", bg: "rgba(252,211,77,.18)", br: "rgba(252,211,77,.6)" };
    if (rank === 2) return { color: "#e2e8f0", bg: "rgba(226,232,240,.12)", br: "rgba(226,232,240,.5)" };
    if (rank === 3) return { color: "#fdba74", bg: "rgba(253,186,116,.15)", br: "rgba(253,186,116,.55)" };
    return { color: "var(--ht-fg-secondary)", bg: "rgba(255,255,255,.06)", br: "rgba(255,255,255,.22)" };
  };
  const label = (r) => r === 1 ? "1st" : r === 2 ? "2nd" : r === 3 ? "3rd" : `#${r}`;
  return (
    <main style={{ padding: "18px 14px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Eyebrow accent="muted">The Local Tavern</Eyebrow>
        <StatusBadge accent="cyan">You · #4</StatusBadge>
      </div>
      <AccentCard accent="hairline" padding={0} radius={18} style={{ overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.40)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse",
                        fontFamily: "var(--ht-font-body)", fontWeight: 700,
                        color: "var(--ht-fg-primary)" }}>
          <thead>
            <tr style={{ background: "rgba(34,211,238,0.08)",
                         borderBottom: "1px solid rgba(34,211,238,0.20)" }}>
              <th style={{ textAlign: "left", padding: "12px 14px", width: 90,
                           font: "900 11px/1 var(--ht-font-body)",
                           letterSpacing: "0.14em", textTransform: "uppercase",
                           color: "var(--ht-cyan-300)" }}>Rank</th>
              <th style={{ textAlign: "left", padding: "12px 14px",
                           font: "900 11px/1 var(--ht-font-body)",
                           letterSpacing: "0.14em", textTransform: "uppercase",
                           color: "var(--ht-cyan-300)" }}>Username</th>
              <th style={{ textAlign: "right", padding: "12px 14px", width: 70,
                           font: "900 11px/1 var(--ht-font-body)",
                           letterSpacing: "0.14em", textTransform: "uppercase",
                           color: "var(--ht-cyan-300)" }}>Pts</th>
            </tr>
          </thead>
          <tbody>
            {LB_ENTRIES.map(e => {
              const s = rankStyle(e.rank);
              return (
                <tr key={e.name} style={{
                  background: e.you ? "rgba(34,211,238,0.06)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minWidth: 34, height: 24, padding: "0 8px", borderRadius: 9999,
                      fontWeight: 900, fontSize: 11, letterSpacing: "0.06em",
                      color: s.color, background: s.bg, border: `1px solid ${s.br}`,
                    }}>{label(e.rank)}</span>
                  </td>
                  <td style={{ padding: "10px 14px", fontSize: 14 }}>
                    {e.name}
                    {e.you ? (
                      <span style={{
                        display: "inline-block", marginLeft: 8, padding: "1px 8px",
                        borderRadius: 9999, fontSize: 10, fontWeight: 900,
                        letterSpacing: "0.08em", textTransform: "uppercase",
                        color: "var(--ht-cyan-300)", background: "rgba(34,211,238,0.12)",
                        border: "1px solid rgba(34,211,238,0.45)",
                      }}>you</span>
                    ) : null}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right",
                               fontVariantNumeric: "tabular-nums",
                               fontWeight: 900, fontSize: 16,
                               color: "var(--ht-fg-primary)" }}>{e.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AccentCard>
      <ExitPill onClick={() => navigate("hub")}>Back to Venue</ExitPill>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// 6. Challenges — head-to-head invitations & active matches
// ─────────────────────────────────────────────────────────────
const CHALLENGES_DATA = [
  { kind: "pending",  from: "nine_ball_neil", game: "fantasy", stakes: "100 pts", ago: "8m" },
  { kind: "pending",  from: "frosty_mug_42",  game: "pickem",  stakes: "50 pts",  ago: "23m" },
  { kind: "pending",  from: "trivia_trish",   game: "trivia",  stakes: "25 pts",  ago: "1h" },
  { kind: "active",   vs: "karaoke_kraken",   game: "fantasy", stakes: "200 pts", progress: "Q3 · 84-71" },
  { kind: "active",   vs: "jukebox_jerry",    game: "bingo",   stakes: "75 pts",  progress: "Board 2/4" },
  { kind: "won",      vs: "ipa_iggy",         game: "trivia",  stakes: "50 pts",  result: "+50 pts" },
];
function ChallengesScreen({ navigate }) {
  const meta = (k) => GAME_META[k] || GAME_META.trivia;
  return (
    <main style={{ padding: "16px 14px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <AccentCard accent="amber" padding={14} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Eyebrow accent="amber">Pending invites</Eyebrow>
          <div style={{ fontFamily: "var(--ht-font-display)", fontSize: 24, marginTop: 2,
                        color: "var(--ht-amber-200)", letterSpacing: "0.02em" }}>3 challenges waiting</div>
        </div>
        <StatusBadge accent="amber" dot>New</StatusBadge>
      </AccentCard>

      <div>
        <Eyebrow accent="muted" style={{ marginBottom: 8 }}>Pending</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {CHALLENGES_DATA.filter(c => c.kind === "pending").map((c, i) => (
            <AccentCard key={i} accent="hairline" padding={12}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: meta(c.game).grad, border: "1.5px solid rgba(255,255,255,0.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--ht-font-display)", color: "#fff", fontSize: 18,
                  textShadow: "0 1px 0 rgba(0,0,0,0.6)",
                }}>{c.game[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--ht-fg-primary)" }}>
                    {c.from} challenged you
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "var(--ht-fg-muted)", marginTop: 2 }}>
                    {meta(c.game).title.replace("Hightop ", "")} · {c.stakes} · {c.ago} ago
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{
                    width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(244,63,94,0.4)",
                    background: "rgba(244,63,94,0.10)", color: "var(--ht-rose-300)",
                    cursor: "pointer", fontWeight: 900, fontSize: 16,
                  }}>✕</button>
                  <button style={{
                    width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(52,211,153,0.5)",
                    background: "var(--ht-emerald-500)", color: "#0f172a",
                    cursor: "pointer", fontWeight: 900, fontSize: 16,
                  }}>✓</button>
                </div>
              </div>
            </AccentCard>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow accent="muted" style={{ marginBottom: 8 }}>In play</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {CHALLENGES_DATA.filter(c => c.kind === "active").map((c, i) => (
            <AccentCard key={i} accent="cyan" padding={12}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: meta(c.game).grad, border: "1.5px solid rgba(255,255,255,0.5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--ht-font-display)", color: "#fff", fontSize: 18,
                  textShadow: "0 1px 0 rgba(0,0,0,0.6)",
                }}>{c.game[0].toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--ht-fg-primary)" }}>
                    vs {c.vs}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 12, color: "var(--ht-cyan-300)", marginTop: 2,
                                fontVariantNumeric: "tabular-nums" }}>{c.progress}</div>
                </div>
                <StatusBadge accent="emerald" dot>Live</StatusBadge>
              </div>
            </AccentCard>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow accent="muted" style={{ marginBottom: 8 }}>Finished</Eyebrow>
        {CHALLENGES_DATA.filter(c => c.kind === "won").map((c, i) => (
          <AccentCard key={i} accent="hairline" padding={12}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: "rgba(52,211,153,0.18)", border: "1px solid rgba(52,211,153,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--ht-emerald-300)", fontWeight: 900, fontSize: 16,
              }}>★</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "var(--ht-fg-primary)" }}>
                  Beat {c.vs} at {meta(c.game).title.replace("Hightop ", "")}
                </div>
                <div style={{ fontWeight: 800, fontSize: 12, color: "var(--ht-emerald-300)", marginTop: 2 }}>
                  {c.result}
                </div>
              </div>
            </div>
          </AccentCard>
        ))}
      </div>
    </main>
  );
}

Object.assign(window, { JoinScreen, VenueHub, GameLanding, LiveShowdown, Leaderboard, ChallengesScreen });
