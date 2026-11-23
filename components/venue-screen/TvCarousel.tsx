"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TvAllTimeLeaderboard } from "@/components/venue-screen/TvAllTimeLeaderboard";
import { TvAppDock } from "@/components/venue-screen/TvAppDock";
import { TvIdleAttract } from "@/components/venue-screen/TvIdleAttract";
import { TvNextLiveTriviaSlide } from "@/components/venue-screen/TvNextLiveTriviaSlide";
import { TvPickEmBoard } from "@/components/venue-screen/TvPickEmBoard";
import { TvPrizesSlide } from "@/components/venue-screen/TvPrizesSlide";
import { TvDesignFrame } from "@/components/venue-screen/TvSlideCanvas";
import { TvTicker } from "@/components/venue-screen/TvTicker";
import { useHydrated } from "@/components/venue-screen/fx/useHydrated";
import { usePickEmScoreFlash } from "@/components/venue-screen/usePickEmScoreFlash";
import {
  carouselShowsCornerQr,
  carouselSlideAt,
  carouselSlidesOf,
  tickerSegmentsOf,
  type TvCarouselSlideId,
} from "@/lib/tvCarousel";
import { formatNextLiveTriviaWhen } from "@/lib/venueScreenIdleLine";
import type { VenueScreenState } from "@/lib/venueScreen";

/* ------------------------------------------------------------------ *
 * <TvCarousel /> — the idle screen (docs/fire-tv-app-plan.md D20, Phase 11).
 *
 * Five slides, 15 s each, from the one idle response the TV already polls: 1 Next Live Trivia, 2 Pick 'Em board,
 * 3 All-Time Leaderboard, 4 Prizes, 5 Get the app. A slide with nothing to show is skipped. Which slide is up is
 * counted from the moment this component mounts (a game ending remounts it, so it restarts at slide 1) in whole 15 s
 * steps off the parent's ticking clock: no timer of its own and no request per slide.
 *
 * It stays mounted across slides, so it owns what must outlive one: the Pick 'Em score flash (usePickEmScoreFlash, played
 * by the board through useFxMoment, so a poll tick that repeats a score never replays it), the dots, the ticker (D15) and
 * the corner "Get the app" QR (D16, not on slide 5, which has a big one).
 *
 * Server render and the first client render both show slide 1 (the clock is the device's, which the server can't know),
 * and the Live Trivia slide is skipped only once the TV's own clock says the game has passed.
 * ------------------------------------------------------------------ */

type IdleVenueState = Extract<VenueScreenState, { mode: "idle" }>;

type TvCarouselProps = {
  state: IdleVenueState;
  nowMs: number;
  /** Pin one slide (`?mode=carousel&slide=`, Try demo). Ignored when that slide has nothing to show. */
  pinnedSlide?: TvCarouselSlideId | null;
};

const DOT_PX = 18;

const Dots = ({ count, active }: { count: number; active: number }) => (
  <div
    data-testid="tv-carousel-dots"
    className="absolute flex justify-center"
    style={{ left: 0, right: 0, bottom: 120, gap: DOT_PX, zIndex: 2 }}
  >
    {Array.from({ length: count }, (_, index) => (
      <i
        key={index}
        data-active={index === active ? "true" : "false"}
        style={{
          width: DOT_PX,
          height: DOT_PX,
          borderRadius: 999,
          background: index === active ? "#67e8f9" : "rgba(255,255,255,0.25)",
          boxShadow: index === active ? "0 0 16px rgba(34,211,238,0.8)" : undefined,
        }}
      />
    ))}
  </div>
);

export const TvCarousel = ({ state, nowMs, pinnedSlide = null }: TvCarouselProps) => {
  const reduceMotion = Boolean(useReducedMotion());
  const hydrated = useHydrated();
  const [mountedAtMs] = useState(nowMs);
  const venueName = state.venue.displayName ?? state.venue.name;
  const { pickEm, allTimeLeaderboard, prizes, nextLiveTrivia } = state.idle;

  // Kept here, not in the board: this stays mounted while idle, so a score change is seen even when the board isn't up.
  const scoreFlash = usePickEmScoreFlash(pickEm?.games);

  const next = nextLiveTrivia
    ? { startsAt: nextLiveTrivia.startsAt, recurringDays: nextLiveTrivia.recurringDays ?? [] }
    : null;
  const hasNext = Boolean(next && Number.isFinite(Date.parse(next.startsAt))) && (!hydrated || formatNextLiveTriviaWhen(next, nowMs) !== null);
  const slides = carouselSlidesOf({ pickEm, allTimeLeaderboard, prizes }, hasNext);
  const active: TvCarouselSlideId =
    pinnedSlide && slides.includes(pinnedSlide) ? pinnedSlide : carouselSlideAt(slides, nowMs - mountedAtMs);

  const ticker = tickerSegmentsOf(pickEm, active === "pick-em");
  const chrome = slides.length > 1 || ticker.length > 0;

  return (
    <div data-testid="tv-carousel" data-slide={active} className="relative h-full w-full overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={active}
          className="absolute inset-0"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.6, ease: "easeInOut" }}
        >
          {active === "next" ? <TvNextLiveTriviaSlide venueName={venueName} next={next} nowMs={nowMs} /> : null}
          {active === "pick-em" && pickEm ? (
            <TvPickEmBoard
              venueName={venueName}
              games={pickEm.games}
              leaders={pickEm.leaders}
              nowMs={nowMs}
              flash={scoreFlash}
            />
          ) : null}
          {active === "all-time" && allTimeLeaderboard ? (
            <TvAllTimeLeaderboard venueName={venueName} entries={allTimeLeaderboard} />
          ) : null}
          {active === "prizes" && prizes ? <TvPrizesSlide prizes={prizes} /> : null}
          {active === "app" ? (
            <TvIdleAttract venueName={venueName} nextLiveTrivia={next} tickerVisible={chrome} nowMs={nowMs} />
          ) : null}
        </motion.div>
      </AnimatePresence>

      {chrome ? (
        <TvDesignFrame className="pointer-events-none">
          {slides.length > 1 ? <Dots count={slides.length} active={Math.max(0, slides.indexOf(active))} /> : null}
          {carouselShowsCornerQr(active) ? <TvAppDock /> : null}
          <TvTicker segments={ticker} nextLiveTriviaStartsAt={next?.startsAt ?? null} nowMs={nowMs} />
        </TvDesignFrame>
      ) : null}
    </div>
  );
};
