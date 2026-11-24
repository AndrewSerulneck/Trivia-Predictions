"use client";

import { TvSlideCanvas } from "@/components/venue-screen/TvSlideCanvas";
import { useHydrated } from "@/components/venue-screen/fx/useHydrated";
import {
  formatIdleCountdown,
  formatNextLiveTriviaWhen,
  splitNextLiveTriviaLine,
} from "@/lib/venueScreenIdleLine";

/* ------------------------------------------------------------------ *
 * <TvNextLiveTriviaSlide /> — carousel slide 1 (docs/fire-tv-app-plan.md D12, Phase 11; mockups v2 section C).
 * "LIVE TRIVIA" is the largest text; the line under it follows `formatNextLiveTriviaWhen` ("Every Thursday · 8:00 PM")
 * in the TV's own time after hydration. On the game's own day a "Starts in" countdown joins it. Static apart from
 * that countdown. The bottom 150 px and the bottom-right corner stay empty (ticker, dots, QR).
 * ------------------------------------------------------------------ */

type TvNextLiveTriviaSlideProps = {
  venueName: string;
  next: { startsAt: string; recurringDays: readonly string[] } | null;
  nowMs: number;
};

export const TvNextLiveTriviaSlide = ({ venueName, next, nowMs }: TvNextLiveTriviaSlideProps) => {
  const hydrated = useHydrated();
  const when = hydrated ? formatNextLiveTriviaWhen(next, nowMs) : null;
  const parts = when ? splitNextLiveTriviaLine(when.line) : null;
  const seconds = next && when?.showCountdown ? Math.max(0, Math.ceil((Date.parse(next.startsAt) - nowMs) / 1_000)) : null;

  return (
    <TvSlideCanvas background="transparent" testId="tv-next-live-trivia">
      <div
        className="absolute flex flex-col items-center justify-center text-center"
        style={{ inset: "0 0 96px", gap: 26 }}
      >
        <div
          style={{
            fontSize: 250,
            fontWeight: 900,
            letterSpacing: "-0.045em",
            lineHeight: 0.94,
            // Gradient text paints only inside its own box: pad it so descenders keep their tails.
            paddingBottom: "0.22em",
            marginBottom: "-0.22em",
            backgroundImage: "linear-gradient(100deg, #ffffff 0%, #22d3ee 46%, #fbbf24 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            whiteSpace: "nowrap",
          }}
        >
          LIVE TRIVIA
        </div>
        {parts ? (
          <div
            data-testid="next-live-trivia-when"
            style={{ fontSize: 100, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1 }}
          >
            {parts.lead}
            <b style={{ color: "#fcd34d", fontWeight: 900 }}>{parts.accent}</b>
            {parts.time ? ` · ${parts.time}` : ""}
          </div>
        ) : (
          <div style={{ fontSize: 100, lineHeight: 1 }}>&nbsp;</div>
        )}
        {seconds !== null ? (
          <div
            data-testid="next-live-trivia-countdown"
            style={{ fontSize: 64, fontWeight: 800, color: "#cbd5e1", fontVariantNumeric: "tabular-nums" }}
          >
            Starts in {formatIdleCountdown(seconds)}
          </div>
        ) : null}
        <div style={{ fontSize: 50, fontWeight: 800, color: "#94a3b8" }}>{venueName}</div>
      </div>
    </TvSlideCanvas>
  );
};
