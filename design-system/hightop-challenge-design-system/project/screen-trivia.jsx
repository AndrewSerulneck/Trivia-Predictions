// ─────────────────────────────────────────────────────────────────────────────
// screen-trivia.jsx  ·  Hightop Speed Trivia  (elevated "racing electric" theme)
//
// MAPS TO REAL APP:
//   app/trivia/page.tsx + components/trivia/TriviaGame.tsx → the whole game loop
//   components/trivia/ReadyPrompt.tsx                       → pre-round "GET READY" overlay
//   components/trivia/TriviaAppFrame.tsx                    → frame wrapper
//
// SPEED TRIVIA = MULTIPLE CHOICE ONLY.  (No streak, no closest-guess, no write-in —
// those belong to LIVE TRIVIA / Showdown, a separate game not in this screen.)
// Real constants mirrored: 15s/question · 15 questions/round · 3 rounds/window · +2 pts/correct.
// TriviaQuestion shape: { id, question, options[], correctAnswer, category?, difficulty? }.
// Real AnswerButton renders option text only; the A/B/C/D chips here are a theme flourish.
// ─────────────────────────────────────────────────────────────────────────────

const TRIVIA_Q = {
  id: "q3",
  question: "Which NBA franchise has won the most championships all-time?",
  options: ["Boston Celtics", "LA Lakers", "Chicago Bulls", "Golden State Warriors"],
  correctAnswer: 0,            // index into options
  category: "Sports History",
  difficulty: "medium",
};

// Answer states: "idle" | "selected" | "correct" (revealed) | "wrong" (selected wrong)
function SpeedAnswer({ letter, text, state }) {
  const map = {
    idle:     { bg: "#0a0a0f",          bd: "2px solid rgba(250,204,21,0.30)", fg: "#f8fafc", chipBg: "#facc15", chipFg: "#0a0a0f" },
    selected: { bg: "#facc15",          bd: "2px solid #facc15",               fg: "#0a0a0f", chipBg: "rgba(10,10,15,0.85)", chipFg: "#facc15" },
    correct:  { bg: "rgba(16,185,129,0.2)", bd: "2px solid #34d399",           fg: "#a7f3d0", chipBg: "#34d399", chipFg: "#052e16" },
    wrong:    { bg: "rgba(244,63,94,0.18)", bd: "2px solid #fb7185",           fg: "#fecdd3", chipBg: "#fb7185", chipFg: "#4c0519" },
  }[state];
  return (
    <button style={{
      background: map.bg, color: map.fg, border: map.bd, borderRadius: 14, padding: "12px 12px 12px 14px",
      display: "grid", gridTemplateColumns: "26px 1fr auto", gap: 10, alignItems: "center", textAlign: "left",
      cursor: "pointer", fontWeight: 800, fontSize: 13, lineHeight: 1.2, letterSpacing: "0.01em",
      boxShadow: state === "selected" ? "0 0 0 4px rgba(250,204,21,0.2), 0 6px 14px rgba(0,0,0,0.5)" : "0 4px 10px rgba(0,0,0,0.4)",
    }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, background: map.chipBg, color: map.chipFg, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bree Serif',serif", fontWeight: 900, fontSize: 14 }}>{letter}</span>
      <span>{text}</span>
      {state === "correct" ? <span style={{ fontSize: 14, color: "#34d399", fontWeight: 900 }}>✓</span> : null}
    </button>
  );
}

function SpeedTriviaScreen() {
  const selected = 0; // chosen option index (correct in this snapshot)
  const letters = ["A", "B", "C", "D"];
  return (
    <div style={{
      position: "absolute", inset: 0, background: "#0a0a0f", color: "#f8fafc",
      fontFamily: "Nunito, system-ui, sans-serif", paddingTop: STATUS_BAR_INSET, paddingBottom: HOME_INDICATOR_INSET,
      display: "flex", flexDirection: "column", overflow: "auto",
    }}>
      {/* racing stripe backdrop */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 300,
        background: "repeating-linear-gradient(115deg, transparent 0 26px, rgba(250,204,21,0.85) 26px 34px, transparent 34px 42px, rgba(132,204,22,0.8) 42px 48px, transparent 48px 70px)",
        opacity: 0.25, maskImage: "linear-gradient(180deg,#000 0%,transparent 100%)", WebkitMaskImage: "linear-gradient(180deg,#000 0%,transparent 100%)",
        pointerEvents: "none", zIndex: 0,
      }}/>

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* Top bar: exit pill + title + quota window */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px 12px", gap: 8, flexShrink: 0 }}>
          <ExitChip label="Venue"/>
          <div style={{ fontFamily: "'Bree Serif',serif", fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", color: "#facc15", textShadow: "0 1px 0 #000, 0 0 14px rgba(250,204,21,0.5)" }}>Speed Trivia</div>
          <div style={{ background: "#0a0a0f", border: "1px solid rgba(250,204,21,0.4)", borderRadius: 10, padding: "5px 9px", fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 10, color: "#facc15", letterSpacing: "0.04em", lineHeight: 1, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 8, color: "rgba(250,204,21,0.7)" }}>WINDOW</span>12:40
          </div>
        </div>

        {/* Round + question counter + pip strip */}
        <div style={{ padding: "0 14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 8, fontWeight: 900, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase" }}>
            <span style={{ color: "#84cc16" }}>Round 1 / 3</span>
            <span style={{ color: "rgba(255,255,255,0.18)" }}>·</span>
            <span style={{ color: "#facc15" }}>Q 3 / 15</span>
          </div>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: 15 }).map((_, i) => (
              <span key={i} style={{ width: 8, height: 4, borderRadius: 2, background: i < 2 ? "#84cc16" : i === 2 ? "#facc15" : "rgba(255,255,255,0.12)" }}/>
            ))}
          </div>
        </div>

        {/* Timer ring + question card */}
        <div style={{ padding: "14px 14px 0", flexShrink: 0 }}>
          <div style={{ background: "#0f0f17", border: "2px solid rgba(250,204,21,0.55)", borderRadius: 18, padding: "16px 14px", position: "relative", overflow: "hidden", boxShadow: "0 0 0 4px rgba(250,204,21,0.1), 0 12px 30px rgba(0,0,0,0.6)" }}>
            <div style={{ position: "absolute", right: -28, top: -28, width: 110, height: 110, borderRadius: "50%", border: "5px solid rgba(250,204,21,0.18)" }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 2 }}>
              <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
                <svg viewBox="0 0 64 64" style={{ position: "absolute", inset: 0 }}>
                  <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(250,204,21,0.18)" strokeWidth="5"/>
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#facc15" strokeWidth="5" strokeDasharray="176" strokeDashoffset="44" strokeLinecap="round" transform="rotate(-90 32 32)"/>
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 20, color: "#facc15", textShadow: "0 0 12px rgba(250,204,21,0.7)" }}>12<small style={{ fontSize: 9, fontWeight: 700, color: "rgba(250,204,21,0.7)" }}>s</small></div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* category + difficulty eyebrow */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <Eyebrow color="#84cc16">{TRIVIA_Q.category}</Eyebrow>
                  <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#facc15", border: "1px solid rgba(250,204,21,0.4)", borderRadius: 9999, padding: "1px 6px" }}>{TRIVIA_Q.difficulty}</span>
                </div>
                <div style={{ fontFamily: "'Bree Serif',serif", fontSize: 17, lineHeight: 1.15, color: "#fff", textShadow: "0 1px 0 #000" }}>{TRIVIA_Q.question}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Answers (multiple choice) */}
        <div style={{ padding: "14px 14px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, flexShrink: 0 }}>
          {TRIVIA_Q.options.map((opt, i) => (
            <SpeedAnswer key={i} letter={letters[i]} text={opt} state={i === selected ? "correct" : "idle"}/>
          ))}
        </div>

        {/* Feedback + reward pulse (Correct! +2) */}
        <div style={{ padding: "14px 14px 0", display: "flex", gap: 8, alignItems: "stretch", flexShrink: 0 }}>
          <div style={{ flex: 1, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(52,211,153,0.4)", borderRadius: 12, padding: "9px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 12.5, color: "#6ee7b7" }}>Correct! +2 points</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#94a3b8", marginTop: 2 }}>added to your profile</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#fde68a", whiteSpace: "nowrap" }}>🔥 +2 pts</span>
          </div>
        </div>

        {/* Mini scoreboard (correct / attempted + accuracy) */}
        <div style={{ padding: "8px 14px 0", display: "flex", gap: 8, flexShrink: 0 }}>
          <div style={{ flex: 1, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: 12, padding: "8px 12px" }}>
            <Eyebrow color="#84cc16">Correct</Eyebrow>
            <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 14, color: "#facc15", marginTop: 2 }}>2 / 2</div>
          </div>
          <div style={{ flex: 1, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.3)", borderRadius: 12, padding: "8px 12px" }}>
            <Eyebrow color="#84cc16">Accuracy</Eyebrow>
            <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: 900, fontSize: 14, color: "#facc15", marginTop: 2 }}>100%</div>
          </div>
        </div>

        {/* Next question */}
        <div style={{ padding: "12px 14px 0" }}>
          <button style={{ width: "100%", background: "#facc15", color: "#0a0a0f", border: "none", borderRadius: 14, padding: "13px 18px", fontWeight: 900, fontSize: 14, letterSpacing: "0.04em", cursor: "pointer", textTransform: "uppercase", boxShadow: "0 0 0 1px rgba(250,204,21,0.3), 0 10px 24px rgba(250,204,21,0.3)" }}>
            Next question →
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SpeedTriviaScreen });
