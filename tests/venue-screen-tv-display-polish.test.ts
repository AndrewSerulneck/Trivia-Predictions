import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TvCarousel } from "@/components/venue-screen/TvCarousel";
import { TvPickEmBoard } from "@/components/venue-screen/TvPickEmBoard";
import { TvPrizesSlide } from "@/components/venue-screen/TvPrizesSlide";
import { TvTicker } from "@/components/venue-screen/TvTicker";
import {
  TV_CAROUSEL_SLIDE_MS,
  carouselSlidesOf,
  nextCarouselSlide,
  tickerSegmentsOf,
  type TvCarouselSlideId,
} from "@/lib/tvCarousel";
import {
  TV_SCORE_FLASH_MAX_QUEUE,
  detectScoreFlashes,
  enqueueScoreFlashes,
  scoreSnapshotOf,
  tileViewOf,
} from "@/lib/tvPickEmBoard";
import type { TvPickEmGame } from "@/lib/tvSportsRelevance";
import type { VenueScreenState } from "@/lib/venueScreen";
import { debugCarousel } from "@/lib/venueScreenCarouselShared";

// docs/fire-tv-app-plan.md Phase CR2.1 (F45–F47, F49–F53): TV display polish. Each test below failed on `main` before the fix.

const NOW = Date.parse("2026-11-22T18:00:00.000Z");

const game = (overrides: Partial<TvPickEmGame> = {}): TvPickEmGame => ({
  key: "g1",
  league: "NFL",
  homeTeam: "Seattle Seahawks",
  awayTeam: "Kansas City Chiefs",
  homeAbbr: "SEA",
  awayAbbr: "KC",
  startsAt: "2026-11-22T17:00:00.000Z",
  status: "live",
  homeScore: 17,
  awayScore: 21,
  periodLabel: "Q3 4:12",
  picks: 41,
  homePickPct: 39,
  ...overrides,
});

const board = (games: TvPickEmGame[]) =>
  renderToStaticMarkup(
    React.createElement(TvPickEmBoard, { venueName: "The Rusty Anchor", games, leaders: null, nowMs: NOW }),
  );

describe("F45: an unknown pick count is not 'No picks yet'", () => {
  it("says nothing when the count is unknown, and 'No picks yet' only for a real 0", () => {
    expect(board([game({ picks: null, homePickPct: null })])).not.toContain("No picks yet");
    expect(board([game({ picks: 0, homePickPct: null })])).toContain("No picks yet");
    expect(tileViewOf(game({ picks: null })).picks).toBeNull();
    expect(tileViewOf(game({ picks: 0 })).picks).toBe(0);
  });
});

describe("F46: every score change flashes once", () => {
  const before = [game({ key: "a" }), game({ key: "b", awayAbbr: "DAL", homeAbbr: "PHI" })];
  const after = [game({ key: "a", awayScore: 28 }), game({ key: "b", awayAbbr: "DAL", homeAbbr: "PHI", homeScore: 20 })];

  it("returns one flash per changed game, in board order, each with its own token", () => {
    const flashes = detectScoreFlashes(scoreSnapshotOf(before), after);
    expect(flashes.map((f) => f.gameKey)).toEqual(["a", "b"]);
    expect(new Set(flashes.map((f) => f.token)).size).toBe(2);
    expect(detectScoreFlashes(null, after)).toEqual([]);
    expect(detectScoreFlashes(scoreSnapshotOf(after), after)).toEqual([]);
  });

  it("queues them behind each other, never twice, and caps the wait", () => {
    const flashes = detectScoreFlashes(scoreSnapshotOf(before), after);
    const queue = enqueueScoreFlashes([], flashes, 1_000);
    expect(queue.map((entry) => entry.flash.gameKey)).toEqual(["a", "b"]);
    expect(enqueueScoreFlashes(queue, flashes, 2_000)).toEqual(queue);
    const many = Array.from({ length: TV_SCORE_FLASH_MAX_QUEUE + 3 }, (_, index) => ({ ...flashes[0], token: `t${index}` }));
    expect(enqueueScoreFlashes([], many, 0)).toHaveLength(TV_SCORE_FLASH_MAX_QUEUE);
  });
});

describe("F49: a slide keeps its 15 s when the set of slides changes", () => {
  const sunday = debugCarousel("sunday", NOW);
  const all = carouselSlidesOf(sunday, true); // next, pick-em, all-time, prizes, app

  it("starts on slide 1 and steps in whole 15 s", () => {
    expect(nextCarouselSlide(all, null, 0, 5_000)).toEqual({ slide: "next", shownAtMs: 5_000 });
    expect(nextCarouselSlide(all, "next", 0, TV_CAROUSEL_SLIDE_MS - 1)).toEqual({ slide: "next", shownAtMs: 0 });
    expect(nextCarouselSlide(all, "next", 0, TV_CAROUSEL_SLIDE_MS)).toEqual({ slide: "pick-em", shownAtMs: TV_CAROUSEL_SLIDE_MS });
    expect(nextCarouselSlide(all, "app", 0, TV_CAROUSEL_SLIDE_MS)).toEqual({ slide: "next", shownAtMs: TV_CAROUSEL_SLIDE_MS });
  });

  it("All-Time stays for its full 15 s when Pick 'Em drops out of the list", () => {
    // At 35 s the old count gave All-Time with five slides and Prizes with four (the slide jumped).
    const without = all.filter((id) => id !== "pick-em");
    expect(nextCarouselSlide(without, "all-time", 30_000, 35_000)).toEqual({ slide: "all-time", shownAtMs: 30_000 });
    expect(nextCarouselSlide(without, "all-time", 30_000, 45_000)).toEqual({ slide: "prizes", shownAtMs: 45_000 });
  });

  it("goes at once, to the next present slide in order, when its own slide is gone", () => {
    const without = all.filter((id) => id !== "all-time");
    expect(nextCarouselSlide(without, "all-time", 30_000, 35_000)).toEqual({ slide: "prizes", shownAtMs: 35_000 });
    const noTail = all.filter((id) => id !== "prizes" && id !== "app") as TvCarouselSlideId[];
    expect(nextCarouselSlide(noTail, "app", 30_000, 35_000)).toEqual({ slide: "next", shownAtMs: 35_000 });
  });
});

describe("F50: the ticker stays up and its track is keyed by what it carries", () => {
  it("draws an empty bar (not nothing) when there is nothing to scroll", () => {
    const html = renderToStaticMarkup(React.createElement(TvTicker, { segments: [], nextLiveTriviaStartsAt: null, nowMs: NOW }));
    expect(html).toContain('data-testid="tv-ticker"');
  });

  it("keys the track by the segment list, not by scores, and no longer claims it survives a slide change", () => {
    const src = readFileSync("components/venue-screen/TvTicker.tsx", "utf8");
    expect(src).toContain('segments.map((segment) => segment.key).join("|")');
    expect(src).toContain("key={trackKey}");
    expect(src).not.toMatch(/keeps scrolling across polls and slide/);
  });

  it("keeps the bar on the Pick 'Em slide when the board takes every game", () => {
    const four = ["a", "b", "c", "d"].map((key) => game({ key }));
    const state: Extract<VenueScreenState, { mode: "idle" }> = {
      ok: true,
      mode: "idle",
      venue: { id: "v1", name: "X", displayName: null, screenBrandImageUrl: null, screenBrandPrimary: null, screenBrandSecondary: null },
      liveTrivia: null,
      categoryBlitz: null,
      idle: { nextLiveTrivia: null, sponsorSlots: [], pickEm: { games: four, leaders: null }, allTimeLeaderboard: null, prizes: null },
      updatedAt: NOW,
    };
    expect(tickerSegmentsOf(state.idle.pickEm, true)).toEqual([]);
    const html = renderToStaticMarkup(React.createElement(TvCarousel, { state, nowMs: NOW, pinnedSlide: "pick-em" }));
    expect(html).toContain('data-slide="pick-em"');
    expect(html).toContain('data-testid="tv-ticker"');
  });
});

describe("F52: the finish confetti stays above the corner QR", () => {
  it("falls in the area above the dock", () => {
    const src = readFileSync("components/venue-screen/TvFinalStandings.tsx", "utf8");
    expect(src).toMatch(/fx\.shower\(\{.*area: appDockClearArea\(\)/);
  });
});

describe("F53: a prize with no separate name prints its headline once", () => {
  const prizes = [
    { id: "1", prize: "Free Pint", name: "Free Pint", pointsRequired: null },
    { id: "2", prize: "Free Wings", name: "  ", pointsRequired: null },
    { id: "3", prize: "$25 Gift Card", name: "Fall Challenge", pointsRequired: 500 },
  ];
  const html = renderToStaticMarkup(React.createElement(TvPrizesSlide, { prizes }));

  it("skips the second line when the name is blank or the same", () => {
    expect(html.match(/Free Pint/g)).toHaveLength(1);
    expect(html.match(/Free Wings/g)).toHaveLength(1);
    expect(html).toContain("Fall Challenge");
  });
});
