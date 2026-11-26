"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useHydrated } from "@/components/venue-screen/fx/useHydrated";
import { formatGameTime } from "@/lib/tvPickEmBoard";
import { tickerLoopSeconds, tickerRepeatsFor, type TvTickerSegment } from "@/lib/tvCarousel";
import { formatNextLiveTriviaShort } from "@/lib/venueScreenIdleLine";

/* ------------------------------------------------------------------ *
 * <TvTicker /> — the score ticker along the bottom of the idle carousel (docs/fire-tv-app-plan.md D15, Phase 11).
 * Drawn in the mockups' 1920×1080 design pixels, 96 px tall (the slides keep the bottom 150 free). Only the carousel
 * mounts it: never on a Live Trivia or Category Blitz screen. The track keeps scrolling across polls (it is keyed on
 * which segments it carries, not on their scores). When that list changes (the Pick 'Em board takes its games for one
 * slide) the new track cross-fades in rather than jumping; the bar itself stays up, empty if there is nothing to say.
 * Under reduced motion it holds still.
 * Fixed right segment: the next Live Trivia in its short form, in the TV's own time after hydration.
 * ------------------------------------------------------------------ */

export const TV_TICKER_HEIGHT_PX = 96;

type TvTickerProps = {
  segments: readonly TvTickerSegment[];
  nextLiveTriviaStartsAt: string | null;
  nowMs: number;
};

const COLORS = { league: "#67e8f9", gold: "#fcd34d", muted: "#94a3b8", text: "#e2e8f0" };

const Segment = ({ segment, hydrated }: { segment: TvTickerSegment; hydrated: boolean }) => {
  if (segment.kind === "leader") {
    return (
      <span style={{ marginRight: 70, color: COLORS.text }}>
        Pick &apos;Em leader: {segment.username}
        <b style={{ color: COLORS.gold, fontWeight: 900, margin: "0 8px" }}>{segment.record}</b>
      </span>
    );
  }
  const status = segment.statusText ?? (hydrated ? formatGameTime(segment.startsAt) : "");
  return (
    <span data-testid="tv-ticker-game" style={{ marginRight: 70, color: COLORS.text }}>
      <i
        style={{
          fontStyle: "normal",
          fontSize: 26,
          fontWeight: 900,
          color: COLORS.league,
          letterSpacing: "0.08em",
          marginRight: 14,
        }}
      >
        {segment.league}
      </i>
      {segment.away.label}
      {segment.scored ? <b style={{ color: COLORS.gold, fontWeight: 900, margin: "0 8px" }}>{segment.away.score}</b> : null}{" "}
      {segment.home.label}
      {segment.scored ? <b style={{ color: COLORS.gold, fontWeight: 900, margin: "0 8px" }}>{segment.home.score}</b> : null}
      {status ? <em style={{ fontStyle: "normal", color: COLORS.muted, fontSize: 30, marginLeft: 6 }}>{status}</em> : null}
    </span>
  );
};

export const TvTicker = ({ segments, nextLiveTriviaStartsAt, nowMs }: TvTickerProps) => {
  const reduceMotion = Boolean(useReducedMotion());
  const hydrated = useHydrated();

  const repeats = tickerRepeatsFor(segments.length);
  const half = Array.from({ length: repeats }, (_, repeat) => segments.map((segment) => ({ segment, repeat })));
  const trackKey = segments.map((segment) => segment.key).join("|");
  const anyLive = segments.some((segment) => segment.kind === "game" && segment.live);
  const next = hydrated ? formatNextLiveTriviaShort(nextLiveTriviaStartsAt, nowMs) : null;

  return (
    <div
      data-testid="tv-ticker"
      className="absolute flex items-center overflow-hidden"
      style={{
        left: 0,
        right: 0,
        bottom: 0,
        height: TV_TICKER_HEIGHT_PX,
        background: "rgba(2,6,23,0.92)",
        borderTop: "2px solid rgba(103,232,249,0.28)",
        fontSize: 36,
        fontWeight: 800,
        zIndex: 2,
      }}
    >
      <div
        className="flex items-center"
        style={{
          flex: "none",
          height: "100%",
          padding: "0 34px",
          background: "#0e7490",
          color: "#fff",
          fontSize: 30,
          fontWeight: 900,
          letterSpacing: "0.14em",
        }}
      >
        {anyLive ? "LIVE" : "TODAY"}
      </div>
      <div style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap", minWidth: 0 }}>
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={trackKey}
            data-testid="tv-ticker-track"
            className="will-change-transform"
            style={{ display: "inline-block" }}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: ["0%", "-50%"] }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    opacity: { duration: 0.4 },
                    x: { duration: tickerLoopSeconds(segments.length), repeat: Infinity, ease: "linear" },
                  }
            }
          >
            {[0, 1].map((copy) =>
              half.flat().map(({ segment, repeat }) => (
                <Segment key={`${copy}:${repeat}:${segment.key}`} segment={segment} hydrated={hydrated} />
              )),
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {next ? (
        <div
          data-testid="tv-ticker-next"
          className="flex items-center"
          style={{
            flex: "none",
            padding: "0 40px",
            height: "100%",
            borderLeft: "2px solid rgba(255,255,255,0.12)",
            color: COLORS.gold,
            fontWeight: 900,
          }}
        >
          {next}
        </div>
      ) : null}
    </div>
  );
};
