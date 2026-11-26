"use client";

import { useEffect, useState } from "react";
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
  carouselSlidesOf,
  nextCarouselSlide,
  tickerSegmentsOf,
  type TvCarouselSlideId,
} from "@/lib/tvCarousel";
import { formatNextLiveTriviaWhen } from "@/lib/venueScreenIdleLine";
import type { VenueScreenState } from "@/lib/venueScreen";

/* ------------------------------------------------------------------ *
 * <TvCarousel /> — the idle screen (docs/fire-tv-app-plan.md D20, Phase 11).
 *
 * Five slides, 15 s each, from the one idle response the TV already polls: 1 Next Live Trivia, 2 Pick 'Em board,
 * 3 All-Time Leaderboard, 4 Prizes, 5 Get the app. A slide with nothing to show is skipped. The rotation starts when
 * this component mounts (a game ending remounts it, so it restarts at slide 1) and steps off the parent's ticking
 * clock: no timer of its own and no request per slide. The slide on screen keeps its whole 15 s when the set of slides
 * changes between polls (`nextCarouselSlide`); one that disappears goes at once.
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
const CROSSFADE_S = 0.6;
/** Backstop for the corner QR's wait (a throttled frame loop can delay the exit's end); normally `onExitComplete` ends it. */
const APP_EXIT_BACKSTOP_MS = 2_000;

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
  const [shown, setShown] = useState<{ slide: TvCarouselSlideId | null; atMs: number }>({ slide: null, atMs: nowMs });
  const venueName = state.venue.displayName ?? state.venue.name;
  const { pickEm, allTimeLeaderboard, prizes, nextLiveTrivia } = state.idle;

  // Kept here, not in the board: this stays mounted while idle, so a score change is seen even when the board isn't up.
  const { flash: scoreFlash, done: scoreFlashDone } = usePickEmScoreFlash(pickEm?.games);

  const next = nextLiveTrivia
    ? { startsAt: nextLiveTrivia.startsAt, recurringDays: nextLiveTrivia.recurringDays ?? [] }
    : null;
  const hasNext = Boolean(next && Number.isFinite(Date.parse(next.startsAt))) && (!hydrated || formatNextLiveTriviaWhen(next, nowMs) !== null);
  const slides = carouselSlidesOf({ pickEm, allTimeLeaderboard, prizes }, hasNext);
  const position = nextCarouselSlide(slides, shown.slide, shown.atMs, nowMs);
  if (position.slide !== shown.slide || position.shownAtMs !== shown.atMs) {
    setShown({ slide: position.slide, atMs: position.shownAtMs });
  }
  const active: TvCarouselSlideId = pinnedSlide && slides.includes(pinnedSlide) ? pinnedSlide : position.slide;

  // While "Get the app" fades out its big QR is still on screen, so the corner QR waits for it to leave (D16: one QR).
  const [lastActive, setLastActive] = useState(active);
  const [appLeaving, setAppLeaving] = useState(false);
  if (active !== lastActive) {
    setLastActive(active);
    if (lastActive === "app") setAppLeaving(true);
  }
  useEffect(() => {
    if (!appLeaving) return undefined;
    const id = window.setTimeout(() => setAppLeaving(false), APP_EXIT_BACKSTOP_MS);
    return () => window.clearTimeout(id);
  }, [appLeaving]);

  // The ticker bar stays up for the whole rotation once there is anything for it to say (D15), even on the Pick 'Em
  // slide, where the board takes its games and the track is empty.
  const ticker = tickerSegmentsOf(pickEm, active === "pick-em");
  const tickerBar = tickerSegmentsOf(pickEm, false).length > 0;
  const chrome = slides.length > 1 || tickerBar;

  return (
    <div data-testid="tv-carousel" data-slide={active} className="relative h-full w-full overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout" onExitComplete={() => setAppLeaving(false)}>
        <motion.div
          key={active}
          className="absolute inset-0"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : CROSSFADE_S, ease: "easeInOut" }}
        >
          {active === "next" ? <TvNextLiveTriviaSlide venueName={venueName} next={next} nowMs={nowMs} /> : null}
          {active === "pick-em" && pickEm ? (
            <TvPickEmBoard
              venueName={venueName}
              games={pickEm.games}
              leaders={pickEm.leaders}
              nowMs={nowMs}
              flash={scoreFlash}
              onFlashEnd={scoreFlashDone}
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
          {carouselShowsCornerQr(active) && !appLeaving ? <TvAppDock /> : null}
          {tickerBar ? <TvTicker segments={ticker} nextLiveTriviaStartsAt={next?.startsAt ?? null} nowMs={nowMs} /> : null}
        </TvDesignFrame>
      ) : null}
    </div>
  );
};
