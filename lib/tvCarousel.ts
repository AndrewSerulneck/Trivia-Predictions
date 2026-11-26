// The idle carousel's rules (docs/fire-tv-app-plan.md D15, D16, D20, Phase 11). Pure: no reads, no clock of its own.
// The components in components/venue-screen/ draw these views; the server sends one idle payload (Phase 9) and the TV
// rotates it client-side, so a slide change costs no request.

import { tileViewOf } from "@/lib/tvPickEmBoard";
import { tvTickerGames, type TvPickEmGame, type TvPickEmLeader } from "@/lib/tvSportsRelevance";
import type { VenueScreenCarouselData } from "@/lib/venueScreenCarouselShared";

export type TvCarouselSlideId = "next" | "pick-em" | "all-time" | "prizes" | "app";

/** D20 order. */
export const TV_CAROUSEL_ORDER: readonly TvCarouselSlideId[] = ["next", "pick-em", "all-time", "prizes", "app"];

/** D23: every slide stays up 15 s; five slides make the 75 s loop (`IDLE_MOMENT_MS`). */
export const TV_CAROUSEL_SLIDE_MS = 15_000;

export const isTvCarouselSlideId = (value: unknown): value is TvCarouselSlideId =>
  typeof value === "string" && (TV_CAROUSEL_ORDER as readonly string[]).includes(value);

/**
 * The slides that have something to show, in D20 order. Slides with nothing to show are skipped; "Get the app" is
 * always there, so the carousel never goes empty. `hasNextLiveTrivia`: a game is scheduled and still ahead.
 */
export const carouselSlidesOf = (
  data: Pick<VenueScreenCarouselData, "pickEm" | "allTimeLeaderboard" | "prizes">,
  hasNextLiveTrivia: boolean,
): TvCarouselSlideId[] =>
  TV_CAROUSEL_ORDER.filter((id) => {
    if (id === "next") return hasNextLiveTrivia;
    if (id === "pick-em") return Boolean(data.pickEm && data.pickEm.games.length > 0);
    if (id === "all-time") return Boolean(data.allTimeLeaderboard && data.allTimeLeaderboard.length > 0);
    if (id === "prizes") return Boolean(data.prizes && data.prizes.length > 0);
    return true;
  });

export type TvCarouselPosition = { slide: TvCarouselSlideId; shownAtMs: number };

/**
 * Which slide is up now, and since when. The slide on screen stays for its whole 15 s even when the set of slides
 * changes between polls (a leaderboard that arrives late or a prize that expires must not cut it short or jump the
 * rotation). A slide that is no longer in the list goes at once, to the next slide in D20 order that is present. A
 * late clock tick advances whole steps, so a poll tick never moves a slide. `current` null: first look, slide 1.
 */
export const nextCarouselSlide = (
  slides: readonly TvCarouselSlideId[],
  current: TvCarouselSlideId | null,
  shownAtMs: number,
  nowMs: number,
): TvCarouselPosition => {
  if (slides.length === 0) return { slide: "app", shownAtMs: current === "app" ? shownAtMs : nowMs };
  if (current === null) return { slide: slides[0], shownAtMs: nowMs };
  const at = slides.indexOf(current);
  if (at === -1) {
    // Gone: the next present slide after it in D20 order, wrapping to the first.
    const order = TV_CAROUSEL_ORDER.indexOf(current);
    const after = TV_CAROUSEL_ORDER.slice(order + 1).find((id) => slides.includes(id));
    return { slide: after ?? slides[0], shownAtMs: nowMs };
  }
  const steps = Math.floor((nowMs - shownAtMs) / TV_CAROUSEL_SLIDE_MS);
  if (steps < 1) return { slide: current, shownAtMs };
  return { slide: slides[(at + steps) % slides.length], shownAtMs: shownAtMs + steps * TV_CAROUSEL_SLIDE_MS };
};

/** D16: the corner QR shows on every carousel slide but "Get the app", which carries a big one. */
export const carouselShowsCornerQr = (slide: TvCarouselSlideId): boolean => slide !== "app";

/* ------------------------------- the ticker ------------------------------- */

export type TvTickerSegment =
  | {
      kind: "game";
      key: string;
      league: string;
      away: { label: string; score: string };
      home: { label: string; score: string };
      /** Both scores are known and the game has started. */
      scored: boolean;
      /** "Q3 4:12", "Final"; null while scheduled (the ticker shows the start time). */
      statusText: string | null;
      startsAt: string;
      live: boolean;
    }
  | { kind: "leader"; key: string; username: string; record: string };

/**
 * What the ticker carries (D15): the games after the board's (all of them when the board isn't on screen), then
 * today's Pick 'Em leader. Empty when there is nothing to say; the ticker then isn't drawn.
 */
export const tickerSegmentsOf = (
  pickEm: { games: readonly TvPickEmGame[]; leaders: readonly TvPickEmLeader[] | null } | null,
  boardOnScreen: boolean,
): TvTickerSegment[] => {
  if (!pickEm) return [];
  const segments: TvTickerSegment[] = tvTickerGames(pickEm.games, boardOnScreen).map((game) => {
    const view = tileViewOf(game);
    return {
      kind: "game",
      key: view.key,
      league: view.league,
      away: { label: view.away.label, score: view.away.score },
      home: { label: view.home.label, score: view.home.score },
      scored: view.status !== "scheduled" && view.away.score !== "–" && view.home.score !== "–",
      statusText: view.statusText,
      startsAt: view.startsAt,
      live: view.status === "live",
    };
  });
  const leader = pickEm.leaders?.[0];
  if (leader) {
    segments.push({
      kind: "leader",
      key: `leader:${leader.username}`,
      username: leader.username,
      record: `${leader.wins}–${leader.losses}`,
    });
  }
  return segments;
};

/** How many times the ticker repeats its segments inside one half of the loop, so a short list still fills the band. */
export const tickerRepeatsFor = (segmentCount: number): number =>
  segmentCount <= 0 ? 0 : Math.max(1, Math.ceil(8 / segmentCount));

/** One loop of the ticker takes this long: a steady pace however many segments there are. */
export const tickerLoopSeconds = (segmentCount: number): number =>
  Math.max(30, Math.round(tickerRepeatsFor(segmentCount) * segmentCount * 6.5));
