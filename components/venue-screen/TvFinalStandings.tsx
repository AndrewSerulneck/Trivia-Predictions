"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SCREEN_COLORS, SCREEN_EASE as EASE, getPodiumAccent } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvFinalStandings />
 * End-of-game winner reveal for the Live Trivia TV feed.
 *
 * The whole screen is one reveal, keyed on gameId + champion. It plays
 * once, settles, and holds — nothing loops except a very slow ambient
 * drift on the background wash (deliberate burn-in mitigation, see below).
 *
 * Authored via Claude Web UI (Prompt C), integrated into the venue screen.
 * ------------------------------------------------------------------ */

export type StandingsEntry = {
  id: string;
  name: string;
  score: number;
};

export type TvFinalStandingsProps = {
  leaderboard: StandingsEntry[];
  venueName: string;
  /** Stable id for the finished game. Falls back to the champion's id. */
  gameId?: string | number;
  /** Ranks 4+ shown in the runner-up strip. */
  maxRunnersUp?: number;
};

const GRADIENT = `linear-gradient(160deg, ${SCREEN_COLORS.cyan500} 0%, ${SCREEN_COLORS.blue600} 55%, ${SCREEN_COLORS.violet600} 100%)`;
const CONFETTI_COLORS = [
  SCREEN_COLORS.cyan400,
  SCREEN_COLORS.amber400,
  SCREEN_COLORS.violet600,
  SCREEN_COLORS.cyan500,
  SCREEN_COLORS.amber500,
];

/* Deterministic randomness so a remount reproduces the same burst
   rather than reshuffling the screen in front of the room. */
function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Bar height/background stay local layout choices (per-rank gradient
// treatment, not a flat accent color); accent + border colors come from the
// shared getPodiumAccent() (lib/venueScreenBrand.ts) instead of a hand-rolled
// gold/silver/bronze copy.
const PODIUM_BAR_STYLE = [
  { height: 380, bar: GRADIENT },
  { height: 268, bar: "linear-gradient(160deg,#334155 0%,#1e293b 100%)" },
  { height: 214, bar: "linear-gradient(160deg,#3f2d16 0%,#1c1917 100%)" },
];

export function TvFinalStandings({ leaderboard, venueName, gameId, maxRunnersUp = 5 }: TvFinalStandingsProps) {
  const reduceMotion = useReducedMotion();

  const ranked = useMemo(() => [...leaderboard].sort((a, b) => b.score - a.score), [leaderboard]);
  const champion = ranked[0];
  const podium = ranked.slice(0, 3);
  const runnersUp = ranked.slice(3, 3 + maxRunnersUp);

  /* One reveal identity for the whole screen. A 3s poll that returns the
     same final board changes nothing; a genuine new game replays it. */
  const revealKey = `${gameId ?? champion?.id ?? "final"}`;

  const confetti = useMemo(() => {
    if (reduceMotion) return [];
    const rnd = mulberry32(hash(revealKey));
    return Array.from({ length: 72 }).map((_, i) => {
      const angle = (rnd() - 0.5) * Math.PI * 1.5;
      const power = 340 + rnd() * 620;
      return {
        id: i,
        color: CONFETTI_COLORS[Math.floor(rnd() * CONFETTI_COLORS.length)],
        w: 10 + rnd() * 16,
        h: 14 + rnd() * 22,
        xMid: Math.sin(angle) * power * 0.55,
        xEnd: Math.sin(angle) * power,
        peak: -(300 + rnd() * 360),
        fall: 420 + rnd() * 520,
        rot: (rnd() - 0.5) * 900,
        delay: 0.42 + rnd() * 0.5,
        duration: 2.4 + rnd() * 1.5,
        round: rnd() > 0.72,
      };
    });
  }, [revealKey, reduceMotion]);

  /* Podium bars settle before the runner-up strip arrives. */
  const t = { crown: 0.9, bars: [0.62, 0.28, 0.44], strip: 1.55 };

  return (
    <div key={revealKey} className="relative h-full w-full overflow-hidden" style={{ color: "#f8fafc" }}>
      {/* Ambient wash. Slow, low-amplitude drift — the one looping element,
          deliberate: this screen can sit for 20 minutes while tabs settle,
          and a fully static bright frame is the real burn-in risk here. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 760px at 50% 116%, rgba(37,99,235,0.26), transparent 62%)," +
            "radial-gradient(900px 620px at 6% -12%, rgba(6,182,212,0.14), transparent 60%)," +
            "radial-gradient(900px 620px at 96% -8%, rgba(124,58,237,0.18), transparent 60%)",
        }}
        animate={reduceMotion ? undefined : { opacity: [0.86, 1, 0.86] }}
        transition={reduceMotion ? undefined : { duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: 10,
          background: `linear-gradient(90deg, ${SCREEN_COLORS.cyan500}, ${SCREEN_COLORS.blue600} 52%, ${SCREEN_COLORS.violet600})`,
        }}
      />

      {/* ---- Header ---- */}
      <div className="relative flex items-start justify-between" style={{ padding: "28px 96px 0" }}>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: EASE }}
        >
          <div className="flex items-center" style={{ gap: 16 }}>
            <span style={{ width: 14, height: 14, borderRadius: 999, background: GRADIENT }} />
            <span
              style={{
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "0.34em",
                textTransform: "uppercase",
                color: SCREEN_COLORS.cyan300,
              }}
            >
              Final standings
            </span>
          </div>
          <h1 style={{ fontSize: 84, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.035em", marginTop: 12 }}>
            Champion
          </h1>
        </motion.div>

        <motion.div
          className="text-right"
          initial={reduceMotion ? false : { opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.08 }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.32em",
              textTransform: "uppercase",
              color: "#94a3b8",
            }}
          >
            Tonight at
          </div>
          <div style={{ fontSize: 46, fontWeight: 800, marginTop: 6 }}>{venueName}</div>
        </motion.div>
      </div>

      {/* ---- Podium ---- */}
      <div className="relative flex items-end justify-center" style={{ gap: 40, marginTop: 24, height: 520 }}>
        {/* Spotlight cone behind first place */}
        {!reduceMotion && (
          <motion.div
            className="pointer-events-none absolute"
            style={{
              bottom: 0,
              width: 640,
              height: 620,
              background:
                "linear-gradient(to bottom, rgba(34,211,238,0) 0%, rgba(34,211,238,0.10) 45%, rgba(251,191,36,0.16) 100%)",
              clipPath: "polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)",
              filter: "blur(2px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.1, ease: EASE, delay: t.crown - 0.2 }}
          />
        )}

        {[1, 0, 2].map((rankIdx) => {
          const entry = podium[rankIdx];
          if (!entry) return <div key={rankIdx} style={{ width: 420 }} />;
          const s = PODIUM_BAR_STYLE[rankIdx];
          // rankIdx is always 0-2 here (podium.slice(0, 3)), so rank 1-3 always resolves.
          const accent = getPodiumAccent(rankIdx + 1)!;
          const first = rankIdx === 0;
          const delay = t.bars[rankIdx];

          return (
            <div key={entry.id} className="relative flex flex-col items-center" style={{ width: first ? 520 : 420 }}>
              {/* Crown */}
              {first && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: -50, scale: 0.6, rotate: -12 }}
                  animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                  transition={{ duration: 0.7, ease: EASE, delay: t.crown }}
                  style={{ marginBottom: 10 }}
                >
                  <Crown />
                </motion.div>
              )}

              {/* Name + score */}
              <motion.div
                className="text-center"
                style={{ marginBottom: 18, padding: "0 12px" }}
                initial={reduceMotion ? false : { opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE, delay: delay + 0.3 }}
              >
                <div
                  className="truncate"
                  style={{
                    fontSize: first ? 62 : 42,
                    fontWeight: 900,
                    letterSpacing: "-0.02em",
                    color: first ? "#ffffff" : "#e2e8f0",
                    textShadow: first ? `0 0 60px ${SCREEN_COLORS.amber400}44` : "none",
                  }}
                >
                  {entry.name}
                </div>
                <div
                  style={{
                    fontSize: first ? 46 : 34,
                    fontWeight: 800,
                    color: accent.text,
                    fontVariantNumeric: "tabular-nums",
                    marginTop: 4,
                  }}
                >
                  {entry.score.toLocaleString()}
                </div>
              </motion.div>

              {/* Bar */}
              <motion.div
                className="flex w-full items-start justify-center"
                style={{
                  height: s.height,
                  borderRadius: "24px 24px 0 0",
                  background: s.bar,
                  border: `1px solid ${accent.ring}`,
                  borderBottom: "none",
                  boxShadow: first ? "0 -20px 90px rgba(37,99,235,0.45)" : "none",
                  transformOrigin: "bottom",
                }}
                initial={reduceMotion ? false : { scaleY: 0, opacity: 0.4 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ duration: 0.72, ease: EASE, delay }}
              >
                <span
                  style={{
                    fontSize: first ? 168 : 120,
                    fontWeight: 900,
                    lineHeight: 1,
                    marginTop: first ? 26 : 18,
                    color: first ? "#ffffff" : accent.text,
                    opacity: first ? 0.95 : 0.75,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {rankIdx + 1}
                </span>
              </motion.div>
            </div>
          );
        })}

        {/* Confetti: one burst from above the podium, then it settles out. */}
        {confetti.length > 0 && (
          <div className="pointer-events-none absolute" style={{ left: "50%", top: 120, width: 0, height: 0 }}>
            {confetti.map((p) => (
              <motion.div
                key={p.id}
                className="absolute"
                style={{
                  width: p.w,
                  height: p.round ? p.w : p.h,
                  borderRadius: p.round ? 999 : 3,
                  background: p.color,
                  boxShadow: `0 0 14px ${p.color}66`,
                }}
                initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                animate={{
                  x: [0, p.xMid, p.xEnd],
                  y: [0, p.peak, p.fall],
                  rotate: [0, p.rot],
                  opacity: [0, 1, 1, 0],
                }}
                transition={{
                  duration: p.duration,
                  delay: p.delay,
                  ease: [0.2, 0.7, 0.4, 1],
                  times: [0, 0.34, 1],
                  opacity: { duration: p.duration, delay: p.delay, times: [0, 0.06, 0.72, 1] },
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* ---- Runner-up strip (ranks 4+) ---- */}
      <motion.div
        className="relative flex items-stretch justify-center"
        style={{ gap: 18, padding: "0 96px 28px", marginTop: 12 }}
        initial={reduceMotion ? false : "hidden"}
        animate={reduceMotion ? undefined : "show"}
        variants={{ hidden: {}, show: { transition: { delayChildren: t.strip, staggerChildren: 0.08 } } }}
      >
        {runnersUp.map((entry, i) => (
          <motion.div
            key={entry.id}
            className="flex flex-1 items-center"
            style={{
              gap: 20,
              padding: "20px 28px",
              borderRadius: 18,
              background: "rgba(15,23,42,0.62)",
              border: "1px solid rgba(148,163,184,0.16)",
              maxWidth: 340,
            }}
            variants={
              reduceMotion
                ? undefined
                : { hidden: { opacity: 0, y: 40 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }
            }
          >
            <span style={{ fontSize: 40, fontWeight: 900, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
              {i + 4}
            </span>
            <span className="flex-1 truncate" style={{ fontSize: 30, fontWeight: 700 }}>
              {entry.name}
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 900,
                color: SCREEN_COLORS.cyan400,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {entry.score.toLocaleString()}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

/* ------------------------------ crown ------------------------------ */

function Crown() {
  return (
    <svg width={132} height={96} viewBox="0 0 132 96" fill="none">
      <defs>
        <linearGradient id="crownFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="55%" stopColor={SCREEN_COLORS.amber400} />
          <stop offset="100%" stopColor={SCREEN_COLORS.amber500} />
        </linearGradient>
      </defs>
      <path
        d="M10 78 L2 20 L34 44 L66 6 L98 44 L130 20 L122 78 Z"
        fill="url(#crownFill)"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 26px ${SCREEN_COLORS.amber400}88)` }}
      />
      <rect x={10} y={80} width={112} height={12} rx={5} fill="url(#crownFill)" />
    </svg>
  );
}
