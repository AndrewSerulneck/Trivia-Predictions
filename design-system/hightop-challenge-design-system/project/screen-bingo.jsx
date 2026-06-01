// ─────────────────────────────────────────────────────────────────────────────
// screen-bingo.jsx  ·  Hightop Sports Bingo™  (elevated "casino felt" theme)
//
// MAPS TO REAL APP:
//   app/bingo/page.tsx + components/bingo/SportsBingoHome.tsx        → live play board
//   components/bingo/SportsBingoSelectSport.tsx                       → Step 1 (sport)
//   components/bingo/SportsBingoSelectGame.tsx                        → Step 2 (game)
//   components/bingo/SportsBingoSelectBoard.tsx                       → Step 3 (generate/lock)
//   components/bingo/BingoThemeScope.tsx (.tp-bingo-theme)            → orange felt scope
//   components/bingo/ActionPop.tsx                                    → daub pop FX
//
// Square labels mirror compactSquareLabel() output (Over/Under totals, "Team by N+",
// "Player over N pts", etc). FREE center + 5-in-a-row win match the real generator.
// BINGO header letters use the real per-letter colors (B/I/N/G/O = rose/amber/emerald/cyan/violet).
// ─────────────────────────────────────────────────────────────────────────────

const BINGO_LETTERS = [
  { l: "B", c: "#fda4af" }, { l: "I", c: "#fcd34d" }, { l: "N", c: "#6ee7b7" },
  { l: "G", c: "#7dd3fc" }, { l: "O", c: "#c4b5fd" },
];

// BingoBoardSquare[] — label/status. status: "open" | "hit" | "free"
const BINGO_SQUARES = [
  { l: "Over 224.5 total points", s: "hit" },  { l: "Celtics by 6+", s: "open" },     { l: "5+ lead changes", s: "hit" },     { l: "Tatum over 27.5 pts", s: "open" }, { l: "Tech foul called", s: "open" },
  { l: "Coach's challenge", s: "open" },       { l: "Dunk in transition", s: "hit" }, { l: "10-0 run", s: "open" },           { l: "Buzzer-beater 1H", s: "open" },    { l: "Tied at half", s: "open" },
  { l: "Knicks over 112.5 pts", s: "open" },   { l: "And-1 made", s: "open" },        { l: "FREE", s: "free" },               { l: "Bench over 30.5 pts", s: "open" }, { l: "Brunson over 6.5 ast", s: "hit" },
  { l: "Charge called", s: "open" },           { l: "Knicks by 4+", s: "open" },      { l: "Triple-double (any)", s: "open" },{ l: "5 fouls on starter", s: "open" },  { l: "Banked 3 made", s: "open" },
  { l: "Game-tying bucket", s: "open" },       { l: "'Defense' chant", s: "open" },   { l: "Under 6.5 made 3s Q1", s: "hit" },{ l: "Half-court heave", s: "open" },    { l: "Final over 220", s: "open" },
];

function BingoSquare({ label, status }) {
  const isFree = status === "free", isHit = status === "hit";
  return (
    <div style={{
      position: "relative", aspectRatio: "1/1", borderRadius: 7, padding: 2, textAlign: "center",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 6.6, fontWeight: 800, lineHeight: 1.04, letterSpacing: "0.01em", textTransform: "uppercase",
      background: isFree ? "linear-gradient(135deg,#c89b3a,#f59e0b)" : isHit ? "linear-gradient(135deg,#f97316,#fbbf24)" : "rgba(255,247,234,0.92)",
      border: isFree ? "1.5px solid #fef3c7" : isHit ? "1.5px solid #fde68a" : "1.5px solid rgba(154,115,32,0.7)",
      color: isFree || isHit ? "#0c3a2e" : "#1c1917",
      boxShadow: (isFree || isHit) ? "inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 0 rgba(0,0,0,0.35)" : "inset 0 -2px 0 rgba(0,0,0,0.2)",
    }}>
      {isFree ? <div style={{ fontFamily: "'Bree Serif',serif", fontSize: 13, letterSpacing: "0.04em" }}>FREE</div> : <span style={{ textWrap: "balance" }}>{label}</span>}
      {isHit ? <span style={{ position: "absolute", top: 1, right: 2, fontSize: 10, color: "#9a1c1c", fontWeight: 900 }}>✓</span> : null}
    </div>
  );
}

function BingoScreen() {
  const marked = BINGO_SQUARES.filter(s => s.s === "hit" || s.s === "free").length;
  return (
    <ScreenShell>
      <MiniTopBar accent="#fef3c7" title="Sports Bingo" showHam={false}/>

      {/* Game identity + card index (Step context lives in select-* flow) */}
      <div style={{ padding: "10px 14px 0", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Eyebrow color="#7dd3fc">NBA · Celtics @ Knicks · Q3 8:42</Eyebrow>
        <span style={{ fontSize: 9.5, fontWeight: 800, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" }}>Card 1 of 4</span>
      </div>

      {/* Live status row */}
      <div style={{ padding: "6px 14px 0", display: "flex", gap: 8 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 9999, background: "rgba(16,185,129,0.14)", border: "1px solid rgba(110,231,183,0.4)", color: "#6ee7b7", fontWeight: 900, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          <span className="ht-live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399" }}/>Live
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 9999, background: "rgba(125,211,252,0.1)", border: "1px solid rgba(125,211,252,0.3)", color: "#7dd3fc", fontWeight: 800, fontSize: 9.5, letterSpacing: "0.04em", fontFamily: "ui-monospace,monospace" }}>{marked}/25 marked</span>
      </div>

      {/* Bingo card — casino felt + cool ice border + gold trim */}
      <div style={{ padding: "10px 14px 0" }}>
        <div style={{
          position: "relative",
          background: "radial-gradient(120% 80% at 50% 0%, rgba(255,215,128,0.1), transparent 60%), radial-gradient(circle at 20% 80%, rgba(0,0,0,0.45), transparent 60%), #0c3a2e",
          border: "3px solid #7dd3fc", borderRadius: 18,
          boxShadow: "0 0 0 1px rgba(125,211,252,0.4) inset, 0 12px 26px rgba(0,0,0,0.55), 0 0 28px rgba(125,211,252,0.18)",
          padding: 12,
        }}>
          <div style={{ position: "absolute", inset: 4, border: "1.5px solid #c89b3a", borderRadius: 14, pointerEvents: "none", opacity: 0.55 }}/>
          {/* B-I-N-G-O multicolor header (real per-letter colors) */}
          <div style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6, marginBottom: 8 }}>
            {BINGO_LETTERS.map(x => (
              <div key={x.l} style={{ fontFamily: "'Bree Serif',serif", fontWeight: 900, fontSize: 22, textAlign: "center", color: x.c, textShadow: "0 1px 0 rgba(0,0,0,0.5), 0 0 12px " + x.c + "66", letterSpacing: "0.04em" }}>{x.l}</div>
            ))}
          </div>
          <div style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5 }}>
            {BINGO_SQUARES.map((sq, i) => <BingoSquare key={i} label={sq.l} status={sq.s}/>)}
          </div>
        </div>
      </div>

      {/* Closest line + prize */}
      <div style={{ padding: "12px 14px 0", display: "flex", gap: 8 }}>
        <div style={{ flex: 1, background: "#0f172a", border: "1px solid rgba(125,211,252,0.4)", borderRadius: 12, padding: "8px 12px" }}>
          <Eyebrow color="#7dd3fc">Closest line</Eyebrow>
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 13.5, fontWeight: 900, color: "#fbbf24", marginTop: 3 }}>2 more — diagonal ↘</div>
        </div>
        <div style={{ width: 120, background: "#0f172a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "8px 12px" }}>
          <Eyebrow color="#94a3b8">Prize</Eyebrow>
          <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 13.5, fontWeight: 900, color: "#f8fafc", marginTop: 3 }}>$25 tab</div>
        </div>
      </div>

      {/* Auto-mark note */}
      <div style={{ margin: "10px 14px 0", padding: "8px 12px", background: "rgba(125,211,252,0.06)", border: "1px solid rgba(125,211,252,0.25)", borderRadius: 10, fontSize: 10, fontWeight: 700, color: "#7dd3fc", letterSpacing: "0.03em", display: "flex", alignItems: "center", gap: 8, lineHeight: 1.3 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22d3ee", flexShrink: 0, boxShadow: "0 0 0 3px rgba(34,211,238,0.25)" }}/>
        Squares auto-mark as plays happen. Five-in-a-row — line, column or diagonal — wins the prize.
      </div>

      {/* Board actions (generate/change + expand) — from SportsBingoSelectBoard */}
      <div style={{ padding: "12px 14px 0", display: "flex", gap: 8 }}>
        <button style={{ flex: 1, minHeight: 42, borderRadius: 12, border: "1px solid rgba(251,146,60,0.6)", background: "rgba(249,115,22,0.18)", color: "#fdba74", fontWeight: 800, fontSize: 12, letterSpacing: "0.02em", cursor: "pointer" }}>Change board</button>
        <button style={{ flex: 1, minHeight: 42, borderRadius: 12, border: "1px solid rgba(125,211,252,0.5)", background: "rgba(125,211,252,0.12)", color: "#7dd3fc", fontWeight: 800, fontSize: 12, letterSpacing: "0.02em", cursor: "pointer" }}>Expand board</button>
      </div>

      {/* Back to venue */}
      <div style={{ padding: "12px 14px 6px", marginTop: "auto" }}>
        <ExitChip label="Back to Venue"/>
        <div style={{ marginTop: 8, fontSize: 9.5, fontWeight: 700, color: "#64748b", letterSpacing: "0.03em", textAlign: "center" }}>One card per game · up to four active cards · cards lock at game start</div>
      </div>
    </ScreenShell>
  );
}

Object.assign(window, { BingoScreen });
