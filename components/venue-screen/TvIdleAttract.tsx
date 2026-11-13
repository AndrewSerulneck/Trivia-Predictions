"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GAME_TILE_THEMES } from "@/components/game-themes/gameTileThemes";
import { ShineSweep } from "@/components/venue-screen/fx/ShineSweep";
import { useFx } from "@/components/venue-screen/fx/useFx";
import type { VenueGameKey } from "@/lib/venueGameCards";
import { SCREEN_COLORS, SCREEN_EASE as EASE } from "@/lib/venueScreenBrand";

/* ------------------------------------------------------------------ *
 * <TvIdleAttract />  — the screen that runs for hours.
 *
 * Every piece of timing here is derived from the wall clock rather than
 * from an incrementing counter, so a remount (or a second TV in the same
 * room) lands on the same card, the same drift offset, and the same
 * phase of the breath. Nothing restarts from zero.
 *
 * Authored via Claude Web UI (Prompt F), integrated into the venue screen.
 * One change from the original: `now` is a prop (VenueScreenClient's
 * already-ticking `nowMs`, 1s resolution) rather than a second independent
 * `Date.now()` interval — a screen meant to run for hours shouldn't spin up
 * its own timer when the parent already has one; the drift/breath periods
 * here (149–227s) don't need sub-second resolution to read as smooth.
 * ------------------------------------------------------------------ */

export type NextGame = {
  label: string;
  /** Scheduled games: shown as a time above the label. */
  startsAt?: string | number | Date;
  /** Replaces the time line for a game with no start time (e.g. "Play anytime"). */
  kicker?: string;
  countdownText?: string;
  /** Seconds to the start when `countdownText` is a live countdown (drives the flip and heartbeat). */
  remainingSeconds?: number;
  /** Takes the game's colours and vector art from GAME_TILE_THEMES. */
  gameKey?: VenueGameKey;
};

/** The idle "moment" (logo shine + burst) fires on every wall-clock slot of this length. */
export const IDLE_MOMENT_MS = 75_000;
/** Digits flip under an hour; the pill beats under five minutes. */
export const IDLE_FLIP_UNDER_S = 3_600;
export const IDLE_HEARTBEAT_UNDER_S = 300;

const GAME_ACCENT: Partial<Record<VenueGameKey, string>> = {
  live_trivia: "#22d3ee",
  "category-blitz": "#4ade80",
};

/** One countdown character; it flips in when its value changes (transform + opacity only). */
const FlipChar = ({ char, flip }: { char: string; flip: boolean }) => {
  return (
    <motion.span
      key={char}
      className="inline-block"
      initial={flip ? { opacity: 0, rotateX: -80, y: -10 } : false}
      animate={{ opacity: 1, rotateX: 0, y: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{ transformPerspective: 400 }}
    >
      {char}
    </motion.span>
  );
};

export type TvIdleAttractProps = {
  venueName: string;
  nextGames: NextGame[];
  /** The parent's ticking clock (VenueScreenClient's `nowMs`). */
  nowMs: number;
  /** Seconds each card holds before the cross-fade. */
  rotateSeconds?: number;
  /** Peak pixel-shift amplitude for burn-in mitigation. */
  driftPx?: number;
};

const BRAND = {
  canvas: SCREEN_COLORS.canvas,
  cyan: SCREEN_COLORS.cyan500,
  cyanLight: SCREEN_COLORS.cyan400,
  amber: SCREEN_COLORS.amber500,
  amberLight: SCREEN_COLORS.amber400,
  slate: "#94a3b8",
  slateDim: "#475569",
};


/* Drift periods are deliberately non-harmonic so the pair never settles
   into a short repeating path — the content walks a slow open curve. */
const DRIFT_X_MS = 227_000;
const DRIFT_Y_MS = 149_000;

function formatTime(value: string | number | Date) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function TvIdleAttract({
  venueName,
  nextGames,
  nowMs,
  rotateSeconds = 8,
  driftPx = 26,
}: TvIdleAttractProps) {
  const reduceMotion = useReducedMotion();
  const fx = useFx();
  const cardRef = useRef<HTMLDivElement>(null);

  // The 75 s moment: keyed on the wall-clock slot, so two TVs fire together and a reload doesn't add one.
  const momentKey = Math.floor(nowMs / IDLE_MOMENT_MS);
  const [firstMomentKey] = useState(momentKey);
  useEffect(() => {
    if (momentKey === firstMomentKey) return;
    fx.burst({ key: `idle:${momentKey}`, at: cardRef.current, coins: 10, sparks: 26 });
  }, [fx, momentKey, firstMomentKey]);

  const games = useMemo(() => nextGames.filter(Boolean), [nextGames]);

  const index = games.length ? Math.floor(nowMs / (rotateSeconds * 1000)) % games.length : 0;
  const game: NextGame | undefined = games[index];

  /* Burn-in: shift the whole composition along a slow open curve. */
  const drift = reduceMotion
    ? { x: 0, y: 0 }
    : {
        x: Math.sin((nowMs / DRIFT_X_MS) * Math.PI * 2) * driftPx,
        y: Math.cos((nowMs / DRIFT_Y_MS) * Math.PI * 2) * driftPx * 0.7,
      };

  const theme = game?.gameKey ? GAME_TILE_THEMES[game.gameKey] : undefined;
  const accent = game?.gameKey ? GAME_ACCENT[game.gameKey] : undefined;
  const remaining = game?.remainingSeconds;
  const flipDigits = remaining !== undefined && remaining < IDLE_FLIP_UNDER_S;
  const heartbeat = remaining !== undefined && remaining < IDLE_HEARTBEAT_UNDER_S;

  const clock = new Date(nowMs).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ color: "#f8fafc" }}>
      {/* Ambient wash, breathing slowly. Largest bright area on screen, so
          it never sits at a fixed luminance. */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 780px at 22% 12%, rgba(6,182,212,0.13), transparent 62%)," +
            "radial-gradient(1000px 700px at 88% 92%, rgba(245,158,11,0.10), transparent 62%)",
        }}
        animate={reduceMotion ? undefined : { opacity: [0.78, 1, 0.78] }}
        transition={reduceMotion ? undefined : { duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Everything inside drifts together. */}
      <div
        className="relative h-full w-full"
        style={{ transform: `translate3d(${drift.x}px, ${drift.y}px, 0)`, transition: "transform 900ms linear" }}
      >
        {/* Accent bar sits inside the drift and stays dim — a full-width
            bright rule pinned to row 0 for six hours is a burn line. */}
        <div
          className="absolute inset-x-0"
          style={{ top: 0, height: 6, opacity: 0.5, background: `linear-gradient(90deg, ${BRAND.cyan}, ${BRAND.amber} 85%)` }}
        />

        <div className="flex h-full" style={{ padding: "96px 110px" }}>
          {/* ---- Left: wordmark ---- */}
          <div className="flex flex-col justify-center" style={{ width: 860 }}>
            <motion.div
              className="relative -mx-4 -my-4 overflow-hidden px-4 py-4"
              animate={reduceMotion ? undefined : { scale: [1, 1.014, 1], opacity: [0.94, 1, 0.94] }}
              transition={reduceMotion ? undefined : { duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
              style={{ transformOrigin: "left center" }}
            >
              <ShineSweep periodMs={IDLE_MOMENT_MS} delayMs={0} durationMs={1_400} tint="rgba(255,255,255,0.35)" />
              <motion.div
                key={reduceMotion ? momentKey : "wordmark"}
                initial={reduceMotion && momentKey !== firstMomentKey ? { opacity: 0.6 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.2, ease: EASE }}
                style={{
                  fontSize: 168,
                  fontWeight: 900,
                  lineHeight: 0.94,
                  letterSpacing: "-0.055em",
                  backgroundImage: `linear-gradient(100deg, #ffffff 0%, ${BRAND.cyanLight} 46%, ${BRAND.amberLight} 100%)`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                Hightop
              </motion.div>
            </motion.div>

            <div
              style={{
                marginTop: 26,
                fontSize: 34,
                fontWeight: 800,
                letterSpacing: "0.36em",
                textTransform: "uppercase",
                color: BRAND.slate,
              }}
            >
              Live Trivia · Category Blitz
            </div>

            <div style={{ marginTop: 54, fontSize: 52, fontWeight: 800, letterSpacing: "-0.02em", color: "#e2e8f0" }}>
              {venueName}
            </div>

            <div style={{ marginTop: 14, fontSize: 30, fontWeight: 600, color: BRAND.slateDim, maxWidth: 620, lineHeight: 1.4 }}>
              Grab a table, gather a team, and play along on the big screen.
            </div>
          </div>

          {/* ---- Right: rotating "Next up" card ----
              Only rendered when there's something to show — an empty "Next
              up" header over a blank card read like a loading state rather
              than "nothing's scheduled". */}
          {game ? (
          <div className="flex flex-1 flex-col items-end justify-center" style={{ paddingLeft: 80 }}>
            <div className="flex w-full items-center justify-between" style={{ maxWidth: 720, marginBottom: 26 }}>
              <span
                style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.36em", textTransform: "uppercase", color: BRAND.cyanLight }}
              >
                Next up
              </span>
              <span style={{ fontSize: 30, fontWeight: 800, color: BRAND.slate, fontVariantNumeric: "tabular-nums" }}>{clock}</span>
            </div>

            <div ref={cardRef} className="relative w-full" style={{ maxWidth: 720, height: 400 }}>
              <AnimatePresence mode="wait" initial={false}>
                {game && (
                  <motion.div
                    key={`${index}-${game.label}`}
                    className={`absolute inset-0 flex flex-col justify-center overflow-hidden ${theme ? theme.surfaceClass : ""}`}
                    style={{
                      padding: "56px 56px",
                      paddingRight: theme ? 230 : 56,
                      borderRadius: 32,
                      background: theme ? undefined : "rgba(15,23,42,0.55)",
                      border: `1px solid ${accent ? `${accent}55` : "rgba(34,211,238,0.20)"}`,
                      boxShadow: "0 0 90px rgba(6,182,212,0.10)",
                    }}
                    initial={reduceMotion ? false : { opacity: 0, y: 26 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -26 }}
                    transition={{ duration: reduceMotion ? 0.15 : 0.85, ease: EASE }}
                  >
                    {theme?.backdrop}
                    {theme ? (
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center" style={{ width: 230, padding: "40px 28px 40px 0" }}>
                        {theme.art}
                      </div>
                    ) : null}

                    <div className="relative" style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.32em", textTransform: "uppercase", color: BRAND.slate }}>
                      {game.kicker ?? (game.startsAt !== undefined ? formatTime(game.startsAt) : "")}
                    </div>

                    <div
                      className="relative"
                      style={{ fontSize: game.label.length > 14 ? 54 : 72, fontWeight: 900, lineHeight: 1.04, letterSpacing: "-0.03em", marginTop: 12 }}
                    >
                      {game.label}
                    </div>

                    {game.countdownText && (
                      <motion.div
                        className="relative inline-flex items-center self-start"
                        style={{
                          marginTop: 30,
                          gap: 16,
                          padding: "16px 34px",
                          borderRadius: 999,
                          background: "rgba(245,158,11,0.10)",
                          border: `1px solid ${BRAND.amber}55`,
                        }}
                        animate={reduceMotion ? undefined : heartbeat ? { scale: [1, 1.07, 1, 1.04, 1] } : { opacity: [0.72, 1, 0.72], scale: [1, 1.012, 1] }}
                        transition={
                          reduceMotion
                            ? undefined
                            : heartbeat
                              ? { duration: 1.2, repeat: Infinity, ease: "easeOut", times: [0, 0.12, 0.3, 0.42, 1] }
                              : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }
                        }
                      >
                        {heartbeat ? (
                          <motion.span
                            aria-hidden
                            data-testid="idle-heartbeat"
                            className="pointer-events-none absolute inset-0 will-change-transform"
                            style={{ borderRadius: 999, border: `2px solid ${accent ?? BRAND.amberLight}`, opacity: 0 }}
                            animate={reduceMotion ? undefined : { scale: [1, 1.22], opacity: [0.7, 0] }}
                            transition={reduceMotion ? undefined : { duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                          />
                        ) : null}
                        <span style={{ width: 12, height: 12, borderRadius: 999, background: BRAND.amberLight }} />
                        <span style={{ fontSize: 36, fontWeight: 800, color: BRAND.amberLight, fontVariantNumeric: "tabular-nums" }}>
                          {flipDigits ? (
                            <>
                              <span className="sr-only">{game.countdownText}</span>
                              <span aria-hidden="true">
                                {[...game.countdownText].map((char, i, all) => (
                                  <FlipChar key={`${all.length - i}:${char}`} char={char} flip={!reduceMotion} />
                                ))}
                              </span>
                            </>
                          ) : (
                            game.countdownText
                          )}
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Rotation pips */}
            {games.length > 1 && (
              <div className="flex items-center" style={{ gap: 10, marginTop: 30 }}>
                {games.map((g, i) => (
                  <span
                    key={`${i}-${g.label}`}
                    style={{
                      height: 6,
                      width: i === index ? 64 : 26,
                      borderRadius: 999,
                      background: i === index ? BRAND.cyanLight : "rgba(148,163,184,0.22)",
                      transition: "width 500ms ease, background 500ms ease",
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          ) : null}
        </div>

        <footer
          className="absolute inset-x-0 bottom-0 text-center"
          style={{ paddingBottom: 24, fontSize: 22, fontWeight: 800, color: BRAND.slateDim }}
        >
          Brought to you by Hightop Challenge&trade;
        </footer>
      </div>
    </div>
  );
}
