// HightopMoreScreens.jsx — additional surfaces accessed via the hamburger
// drawer or as game-end states. Lives next to screens.jsx for separation
// of concerns: screens.jsx is the venue carousel + game flow; this file is
// everything else.

// ─────────────────────────────────────────────────────────────
// ActivityScreen — career stats + recent activity timeline.
// Blue accent per the design brief §9.
// ─────────────────────────────────────────────────────────────
function ActivityScreen({ navigate }) {
  return (
    <main style={{ padding: "16px 14px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
      <ExitPill onClick={() => navigate("venue")} style={{ alignSelf: "flex-start" }}>Back to venue</ExitPill>

      <section style={{
        background: "var(--ht-surface)", border: "1px solid rgba(96,165,250,0.3)",
        borderRadius: 18, padding: 14,
      }}>
        <div style={{
          fontWeight: 900, fontSize: 11, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "#93c5fd", marginBottom: 10,
        }}>Career stats</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <StatTile val="428" lab="Top points · single game" gold/>
          <StatTile val="3,184" lab="All-time points"/>
          <StatTile val="71%" lab="Live Trivia correct rate"/>
          <StatTile val="12" lab="Boards bingo'd"/>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{
            display: "flex", justifyContent: "space-between",
            color: "var(--ht-fg-muted)", fontSize: 10.5, fontWeight: 800,
            letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4,
          }}>
            <span>Win rate · last 50</span>
            <span style={{ color: "#bfdbfe", fontVariantNumeric: "tabular-nums" }}>64%</span>
          </div>
          <div style={{ height: 8, borderRadius: 9999, background: "#334155", overflow: "hidden" }}>
            <div style={{ height: "100%", width: "64%", background: "#60a5fa", borderRadius: 9999 }}/>
          </div>
        </div>
      </section>

      <section style={{
        background: "var(--ht-surface)", border: "1px solid rgba(96,165,250,0.3)",
        borderRadius: 18, padding: 14,
      }}>
        <div style={{
          fontWeight: 900, fontSize: 11, letterSpacing: "0.14em",
          textTransform: "uppercase", color: "#93c5fd", marginBottom: 10,
        }}>Recent activity</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <TimelineEvent kind="win"  title="Won Hightop Fantasy™ vs ipa_iggy" ts="14 MIN AGO" pts="+50"/>
          <TimelineEvent kind=""     title="Joined Live Trivia · Round 2" ts="28 MIN AGO" pts="—"/>
          <TimelineEvent kind="win"  title="Correct streak ×4 · Sports History" ts="31 MIN AGO" pts="+40"/>
          <TimelineEvent kind="loss" title="Wrong · Geography Q12" ts="33 MIN AGO" pts="0"/>
          <TimelineEvent kind=""     title="Bingo board started · NBA" ts="1 HR AGO" pts="—"/>
        </div>
      </section>
    </main>
  );
}
function StatTile({ val, lab, gold }) {
  return (
    <div style={{
      background: "rgba(30,41,59,0.6)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "10px 12px",
    }}>
      <div style={{
        fontFamily: "var(--ht-font-body)", fontWeight: 900, fontSize: 24,
        color: gold ? "var(--ht-amber-300)" : "#bfdbfe",
        lineHeight: 1, fontVariantNumeric: "tabular-nums",
      }}>{val}</div>
      <div style={{
        fontSize: 9.5, fontWeight: 800, letterSpacing: "0.10em",
        textTransform: "uppercase", color: "var(--ht-fg-muted)", marginTop: 4,
      }}>{lab}</div>
    </div>
  );
}
function TimelineEvent({ kind, title, ts, pts }) {
  const colors = {
    win:  { border: "rgba(52,211,153,0.55)", dot: "var(--ht-emerald-400)", pts: "var(--ht-emerald-300)" },
    loss: { border: "rgba(251,113,133,0.55)", dot: "var(--ht-rose-400)", pts: "var(--ht-rose-300)" },
    "":   { border: "rgba(96,165,250,0.4)", dot: "#60a5fa", pts: "#bfdbfe" },
  }[kind || ""];
  return (
    <div style={{
      borderLeft: `2px solid ${colors.border}`, background: "rgba(30,41,59,0.4)",
      borderRadius: "0 12px 12px 0", padding: "8px 12px", position: "relative",
    }}>
      <span style={{
        position: "absolute", left: -7, top: 14, width: 10, height: 10, borderRadius: "50%",
        background: colors.dot, boxShadow: "0 0 0 2px var(--ht-surface)",
      }}/>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ color: "var(--ht-fg-primary)", fontWeight: 800, fontSize: 12.5, lineHeight: 1.3, flex: 1 }}>{title}</div>
        <div style={{ fontWeight: 900, fontSize: 13, fontVariantNumeric: "tabular-nums", color: colors.pts }}>{pts}</div>
      </div>
      <div style={{ color: "var(--ht-fg-muted)", fontWeight: 700, fontSize: 10, marginTop: 2, letterSpacing: "0.04em" }}>{ts}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LiveRoundBreakPanel — sub-screen of Live Showdown shown during
// the intermission between rounds. Drop in place of the standard
// "Intermission" card in screens.jsx::LiveShowdown.
// ─────────────────────────────────────────────────────────────
function LiveRoundBreakPanel({ secondsRemaining = 42 }) {
  const yourRow = { rank: 4, name: "you_are_here", you: true, r1: 50, r2: 70 };
  const rows = [
    { rank: 1, name: "karaoke_kraken",   r1: 80, r2: 90, delta: "—" },
    { rank: 2, name: "nine_ball_neil",   r1: 70, r2: 80, delta: "▲ 1" },
    { rank: 3, name: "last_call_lucy",   r1: 80, r2: 50, delta: "—" },
    { ...yourRow, r1: 50, r2: 70, delta: "▲ 2" },
    { rank: 5, name: "frosty_mug_42",    r1: 60, r2: 50, delta: "—" },
    { rank: 6, name: "jukebox_jerry",    r1: 50, r2: 40, delta: "—" },
  ];
  const rankStyle = (rank) => {
    if (rank === 1) return { color: "#fde68a", bg: "rgba(252,211,77,.18)", br: "rgba(252,211,77,.6)" };
    if (rank === 2) return { color: "#e2e8f0", bg: "rgba(226,232,240,.12)", br: "rgba(226,232,240,.5)" };
    if (rank === 3) return { color: "#fdba74", bg: "rgba(253,186,116,.15)", br: "rgba(253,186,116,.55)" };
    return { color: "var(--ht-fg-secondary)", bg: "rgba(255,255,255,.06)", br: "rgba(255,255,255,.22)" };
  };
  const label = (r) => r === 1 ? "1st" : r === 2 ? "2nd" : r === 3 ? "3rd" : `#${r}`;

  return (
    <>
      <AccentCard accent="fuchsia" padding={12}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Eyebrow accent="fuchsia">Round 2 of 3 · Intermission</Eyebrow>
          <div style={{ fontFamily: "var(--ht-font-display)", fontSize: 18, marginTop: 2, color: "var(--ht-fg-primary)" }}>
            Next round begins in
          </div>
        </div>
        <div style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900, fontSize: 24, color: "var(--ht-fuchsia-200)", lineHeight: 1 }}>
          {formatCountdown(secondsRemaining, "short")}
        </div>
      </AccentCard>

      <div style={{
        display: "flex", gap: 6, padding: "8px 10px",
        background: "rgba(15,23,42,0.55)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 12,
      }}>
        <RoundChip kind="done">R1 · Sports History</RoundChip>
        <RoundChip kind="done">R2 · Geography</RoundChip>
        <RoundChip kind="now">R3 · Pop Culture · ↑</RoundChip>
      </div>

      <AccentCard accent="hairline" padding={0} radius={16} style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse",
                        fontFamily: "var(--ht-font-body)", fontWeight: 700,
                        color: "var(--ht-fg-primary)" }}>
          <thead>
            <tr style={{ background: "rgba(245,158,11,0.08)",
                         borderBottom: "1px solid rgba(252,211,77,0.20)" }}>
              <Th width={50}>Rank</Th>
              <Th>Player</Th>
              <Th width={36}>R1</Th>
              <Th width={36}>R2</Th>
              <Th width={60} right>Total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const s = rankStyle(row.rank);
              const total = row.r1 + row.r2;
              return (
                <tr key={row.name} style={{
                  background: row.you ? "rgba(34,211,238,0.06)" : "transparent",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}>
                  <td style={{ padding: "9px 10px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minWidth: 30, height: 22, padding: "0 7px", borderRadius: 9999,
                      fontWeight: 900, fontSize: 10.5, letterSpacing: "0.06em",
                      color: s.color, background: s.bg, border: `1px solid ${s.br}`,
                    }}>{label(row.rank)}</span>
                  </td>
                  <td style={{ padding: "9px 10px", fontSize: 12.5 }}>
                    {row.name}
                    {row.you ? (
                      <span style={{
                        display: "inline-block", marginLeft: 6, padding: "1px 7px", borderRadius: 9999,
                        fontSize: 9, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase",
                        color: "var(--ht-cyan-300)", background: "rgba(34,211,238,0.10)",
                        border: "1px solid rgba(34,211,238,0.45)",
                      }}>you</span>
                    ) : null}
                    <span style={{
                      marginLeft: 6, fontSize: 10.5, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                      color: row.delta === "—" ? "var(--ht-fg-muted)" : "var(--ht-emerald-300)",
                    }}>{row.delta}</span>
                  </td>
                  <td style={{ padding: "9px 10px", fontSize: 12.5, color: "var(--ht-fg-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.r1}</td>
                  <td style={{ padding: "9px 10px", fontSize: 12.5, color: "var(--ht-fg-secondary)", fontVariantNumeric: "tabular-nums" }}>{row.r2}</td>
                  <td style={{ padding: "9px 10px", textAlign: "right",
                               fontVariantNumeric: "tabular-nums", fontWeight: 900,
                               fontSize: 14, color: "var(--ht-fg-primary)" }}>{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AccentCard>
    </>
  );
}
function RoundChip({ kind, children }) {
  const sty = {
    done: { color: "var(--ht-emerald-300)", bg: "rgba(16,185,129,.18)", br: "rgba(110,231,183,.4)" },
    now:  { color: "var(--ht-fuchsia-300)", bg: "rgba(217,70,239,.18)", br: "rgba(240,171,252,.6)" },
    next: { color: "var(--ht-fg-muted)", bg: "rgba(255,255,255,.04)", br: "transparent" },
  }[kind || "next"];
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "6px 4px", borderRadius: 8,
      fontWeight: 900, fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase",
      color: sty.color, background: sty.bg,
      boxShadow: sty.br === "transparent" ? "none" : `inset 0 0 0 1px ${sty.br}`,
    }}>{children}</div>
  );
}
function Th({ children, right, width }) {
  return (
    <th style={{
      textAlign: right ? "right" : "left", padding: "10px",
      fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase",
      color: "var(--ht-amber-300)", width,
    }}>{children}</th>
  );
}

// ─────────────────────────────────────────────────────────────
// LivePostGameScreen — full game-end celebration & breakdown.
// ─────────────────────────────────────────────────────────────
function LivePostGameScreen({ navigate, yourRank = 4 }) {
  return (
    <main style={{ padding: "16px 14px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Champion banner */}
      <section style={{
        position: "relative", borderRadius: 18,
        background: "radial-gradient(60% 80% at 50% 0%, rgba(252,211,77,0.30), transparent 70%), var(--ht-surface)",
        border: "1px solid rgba(252,211,77,0.6)",
        padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, overflow: "hidden",
      }}>
        <div style={{
          width: 54, height: 54, borderRadius: 14, flexShrink: 0,
          background: "linear-gradient(180deg, #fde68a, #d97706)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#1a0f04", fontWeight: 900, fontSize: 22,
          boxShadow: "0 4px 0 #5a3919, inset 0 1px 0 rgba(255,255,255,0.5)",
        }}>★</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow accent="amber" style={{ fontSize: 10.5, letterSpacing: "0.18em" }}>Game over · Champion</Eyebrow>
          <div style={{
            fontFamily: "var(--ht-font-display)", fontSize: 18, lineHeight: 1.1,
            marginTop: 4, letterSpacing: "0.04em", color: "#fff", textTransform: "uppercase",
            wordBreak: "break-word",
          }}>karaoke_kraken</div>
          <div style={{ color: "var(--ht-amber-200)", fontWeight: 700, fontSize: 12, marginTop: 3 }}>
            The Local Tavern · 45 questions · 3 rounds
          </div>
        </div>
        <div style={{
          fontFamily: "var(--ht-font-body)", fontWeight: 900, fontSize: 28,
          color: "var(--ht-amber-200)", fontVariantNumeric: "tabular-nums",
          lineHeight: 1, textAlign: "right", flexShrink: 0,
        }}>
          428
          <small style={{
            display: "block", fontSize: 9, color: "var(--ht-amber-300)", fontWeight: 800,
            letterSpacing: "0.14em", textTransform: "uppercase", marginTop: 4,
          }}>points</small>
        </div>
      </section>

      {/* Podium */}
      <AccentCard accent="amber" padding={14}>
        <Eyebrow accent="amber">Final standings</Eyebrow>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", justifyContent: "center", minHeight: 140, marginTop: 10 }}>
          <PodiumCol place={2} name="nine_ball_neil" pts={391}/>
          <PodiumCol place={1} name="karaoke_kraken" pts={428}/>
          <PodiumCol place={3} name="last_call_lucy" pts={347}/>
        </div>
      </AccentCard>

      {/* Round-by-round breakdown */}
      <section style={{
        background: "var(--ht-surface)", border: "1px solid rgba(96,165,250,0.30)",
        borderRadius: 18, padding: 14,
      }}>
        <Eyebrow accent="cyan" style={{ color: "#93c5fd" }}>Your round-by-round · #{yourRank}</Eyebrow>
        <RoundBar label="Round 1" sub="Sports History" pct={50} pts={50} sub2="5 of 15"/>
        <RoundBar label="Round 2" sub="Geography"       pct={70} pts={70} sub2="7 of 15"/>
        <RoundBar label="Round 3" sub="Pop Culture · best" pct={92} pts={90} sub2="9 of 15" gradient="linear-gradient(to right,#10b981,#34d399)"/>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        <SmallStat val="▲ 2" lab="Rank gained" tone="amber"/>
        <SmallStat val="71%" lab="Correct rate" tone="emerald"/>
        <SmallStat val="×4"  lab="Best streak" tone="cyan"/>
      </div>

      <ExitPill onClick={() => navigate("venue")} style={{ alignSelf: "stretch", justifyContent: "center" }}>
        Back to venue
      </ExitPill>
    </main>
  );
}
function PodiumCol({ place, name, pts }) {
  const palette = {
    1: { color: "#fde68a", bg: "rgba(252,211,77,.18)", br: "rgba(252,211,77,.6)", h: 130, fill: "rgba(252,211,77,.13)" },
    2: { color: "#e2e8f0", bg: "rgba(226,232,240,.12)", br: "rgba(226,232,240,.5)", h: 108, fill: "rgba(30,41,59,.6)" },
    3: { color: "#fdba74", bg: "rgba(253,186,116,.15)", br: "rgba(253,186,116,.55)", h: 92, fill: "rgba(30,41,59,.6)" },
  }[place];
  return (
    <div style={{
      flex: 1, background: palette.fill, border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: "12px 12px 8px 8px", padding: "10px 6px", textAlign: "center",
      display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 4,
      height: palette.h,
    }}>
      <span style={{
        display: "inline-block", margin: "0 auto 6px", fontWeight: 900, fontSize: 9.5,
        letterSpacing: "0.14em", textTransform: "uppercase", padding: "3px 8px",
        borderRadius: 9999, border: `1px solid ${palette.br}`,
        color: palette.color, background: palette.bg,
      }}>{place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"}</span>
      <div style={{ fontWeight: 800, fontSize: 11.5, color: "var(--ht-fg-primary)", lineHeight: 1.1 }}>{name}</div>
      <div style={{ fontWeight: 900, fontSize: 18, fontVariantNumeric: "tabular-nums", color: "var(--ht-amber-200)", lineHeight: 1 }}>{pts}</div>
    </div>
  );
}
function RoundBar({ label, sub, pct, pts, sub2, gradient }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "90px 1fr 60px", gap: 12, alignItems: "center",
      padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)", fontWeight: 700,
    }}>
      <div style={{ color: "var(--ht-fg-primary)", fontSize: 13, fontWeight: 800 }}>
        {label}
        <small style={{ display: "block", color: "var(--ht-fg-muted)", fontWeight: 600, fontSize: 10.5, letterSpacing: "0.04em", marginTop: 1 }}>{sub}</small>
      </div>
      <div style={{ height: 10, borderRadius: 9999, background: "#1e293b", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: gradient || "linear-gradient(to right,#60a5fa,#2563eb)", borderRadius: 9999 }}/>
      </div>
      <div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 900, color: "#bfdbfe", fontSize: 15 }}>
        {pts}
        <small style={{ display: "block", fontSize: 9.5, color: "var(--ht-fg-muted)", fontWeight: 700, letterSpacing: "0.04em", marginTop: 1, textTransform: "uppercase" }}>{sub2}</small>
      </div>
    </div>
  );
}
function SmallStat({ val, lab, tone }) {
  const color = { amber: "var(--ht-amber-300)", emerald: "var(--ht-emerald-300)", cyan: "var(--ht-cyan-300)" }[tone];
  return (
    <div style={{
      background: "var(--ht-surface)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14, padding: "10px 12px",
    }}>
      <div style={{ fontWeight: 900, fontSize: 20, color, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{val}</div>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ht-fg-muted)", marginTop: 4 }}>{lab}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BingoBoardScreen — 5x5 grid w/ hit-glow squares + progress.
// ─────────────────────────────────────────────────────────────
const BINGO_BOARD = [
  ["LeBron PTS / 25+", 1], ["3PM / 8+", 0], ["Tatum REB / 10+", 0], ["Turnover / 15+", 1], ["Block / 6+", 0],
  ["AD PTS / 18+", 0], ["Pritchard 3 / 3+", 1], ["Brown AST / 7+", 0], ["FG% / 50%+", 0], ["Foul / 18+", 1],
  ["Reaves PTS / 12+", 0], ["Holiday STL / 2+", 1], ["FREE / ★", "free"], ["White 3PM / 4+", 0], ["FT% / 75%+", 1],
  ["Reb total / 95+", 0], ["Bench PTS / 25+", 0], ["Dunk / 5+", 1], ["Tatum 3PM / 3+", 0], ["Pace / 100+", 0],
  ["Lead change / 8+", 1], ["Steal / 10+", 0], ["Vincent FG / 3+", 0], ["FT made / 28+", 1], ["OT? / Y/N", 0],
];
function BingoBoardScreen({ navigate }) {
  const hits = BINGO_BOARD.filter(([_, s]) => s === 1).length;
  return (
    <main style={{ padding: "14px 12px 24px", display: "flex", flexDirection: "column", gap: 12, minHeight: "100%" }}>
      <ExitPill onClick={() => navigate("venue")} style={{ alignSelf: "flex-start" }}>Leave bingo</ExitPill>

      <AccentCard padding={12} style={{
        background: "var(--ht-surface)", border: "1px solid rgba(125,211,252,0.55)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <Eyebrow accent="cyan" style={{ color: "#7dd3fc" }}>Sports Bingo · Board 2 of 4</Eyebrow>
          <div style={{ fontFamily: "var(--ht-font-display)", fontSize: 18, marginTop: 3, color: "var(--ht-fg-primary)", letterSpacing: "0.02em" }}>
            Lakers @ Celtics · Q3
          </div>
        </div>
        <StatusBadge accent="cyan" dot>Live</StatusBadge>
      </AccentCard>

      {/* The board */}
      <div style={{
        background: "radial-gradient(circle at 20% 80%, rgba(0,0,0,0.45), transparent 60%), #0c3a2e",
        border: "2px solid #7dd3fc", borderRadius: 18, padding: 10,
        boxShadow: "0 0 0 1px rgba(125,211,252,.5) inset, 0 0 28px rgba(125,211,252,.18)",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
          {BINGO_BOARD.map(([label, state], i) => {
            const [name, val] = label.split(" / ");
            const isHit = state === 1;
            const isFree = state === "free";
            return (
              <div key={i} style={{
                aspectRatio: "1 / 1", borderRadius: 8, padding: 4,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                textAlign: "center", lineHeight: 1, position: "relative",
                background: isHit
                  ? "radial-gradient(circle at 50% 40%, rgba(249,115,22,.55), rgba(249,115,22,.15) 70%, transparent), rgba(249,115,22,.18)"
                  : isFree
                    ? "linear-gradient(135deg, rgba(252,211,77,.4), rgba(217,119,6,.3))"
                    : "rgba(255,255,255,0.04)",
                border: `1px solid ${isHit ? "rgba(251,146,60,.7)" : isFree ? "rgba(252,211,77,.65)" : "rgba(255,255,255,0.08)"}`,
                boxShadow: isHit ? "0 0 12px rgba(249,115,22,.45)" : "none",
              }}>
                <div style={{
                  fontFamily: "var(--ht-font-display)", fontSize: 12,
                  color: isFree ? "#fde68a" : isHit ? "#fed7aa" : "#fff",
                  fontWeight: 900,
                }}>{val}</div>
                <div style={{
                  fontSize: 7.5, fontWeight: 800, marginTop: 2,
                  color: isFree ? "#fcd34d" : isHit ? "#fdba74" : "rgba(255,255,255,0.55)",
                  letterSpacing: "0.04em", lineHeight: 1.05,
                }}>{name}</div>
                {isHit ? <span style={{
                  position: "absolute", top: 3, right: 4, color: "#fdba74",
                  fontWeight: 900, fontSize: 11, lineHeight: 1,
                }}>✓</span> : null}
              </div>
            );
          })}
        </div>
      </div>

      <AccentCard accent="hairline" padding={12} style={{ borderColor: "rgba(125,211,252,0.30)" }}>
        <Eyebrow accent="cyan" style={{ color: "#7dd3fc" }}>Board progress</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <div style={{
            width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
            background: `conic-gradient(#f97316 0 ${(hits/25)*100}%, rgba(255,255,255,.06) ${(hits/25)*100}% 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", background: "var(--ht-surface)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 900, color: "#fed7aa", fontSize: 12, fontVariantNumeric: "tabular-nums",
            }}>{hits}/25</div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 13, color: "var(--ht-fg-primary)" }}>
            Squares hit
            <small style={{ display: "block", color: "var(--ht-fg-muted)", fontWeight: 600, fontSize: 11, marginTop: 2 }}>
              {Math.round((hits/25)*100)}% filled · {Math.max(0, 25 - hits)} to bingo
            </small>
          </div>
        </div>
      </AccentCard>
    </main>
  );
}

Object.assign(window, { ActivityScreen, LiveRoundBreakPanel, LivePostGameScreen, BingoBoardScreen });
