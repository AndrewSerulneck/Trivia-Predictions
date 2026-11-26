import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IdleVenueScreen } from "@/components/venue-screen/IdleVenueScreen";
import { TvAppCorner } from "@/components/venue-screen/TvAppDock";
import { TvNextLiveTriviaSlide } from "@/components/venue-screen/TvNextLiveTriviaSlide";
import { TvPrizesSlide } from "@/components/venue-screen/TvPrizesSlide";
import { TvTicker } from "@/components/venue-screen/TvTicker";
import {
  TV_CAROUSEL_ORDER,
  TV_CAROUSEL_SLIDE_MS,
  carouselShowsCornerQr,
  carouselSlidesOf,
  nextCarouselSlide,
  tickerLoopSeconds,
  tickerRepeatsFor,
  tickerSegmentsOf,
  type TvCarouselSlideId,
} from "@/lib/tvCarousel";
import type { VenueScreenState } from "@/lib/venueScreen";
import { debugCarousel, EMPTY_CAROUSEL } from "@/lib/venueScreenCarouselShared";
import {
  formatNextLiveTriviaSentence,
  formatNextLiveTriviaWhen,
  formatPregameCountdown,
  splitNextLiveTriviaLine,
} from "@/lib/venueScreenIdleLine";

// docs/fire-tv-app-plan.md Phase 11: the idle carousel, ticker, "Get the app" QR and their rules (D15, D16, D20, D21).

type IdleState = Extract<VenueScreenState, { mode: "idle" }>;

const NOW = Date.parse("2026-11-22T18:00:00.000Z");
const sunday = debugCarousel("sunday", NOW);
const NEXT = { startsAt: "2026-11-26T20:00:00.000Z", title: "Live Trivia", firstRoundCategory: null, recurringDays: ["thu"] };

const idleState = (carousel = sunday, nextLiveTrivia: IdleState["idle"]["nextLiveTrivia"] = NEXT): IdleState => ({
  ok: true,
  mode: "idle",
  venue: { id: "v1", name: "The Rusty Anchor", displayName: null, screenBrandImageUrl: null, screenBrandPrimary: null, screenBrandSecondary: null },
  liveTrivia: null,
  categoryBlitz: null,
  idle: { nextLiveTrivia, sponsorSlots: [], ...carousel },
  updatedAt: NOW,
});

const render = (previewSlide: TvCarouselSlideId | null, state = idleState()) =>
  renderToStaticMarkup(React.createElement(IdleVenueScreen, { state, nowMs: NOW, previewSlide }));

describe("carousel order and skipping (D20)", () => {
  it("runs Next Live Trivia, Pick 'Em, All-Time, Prizes, Get the app: 15 s each, a 75 s loop", () => {
    expect([...TV_CAROUSEL_ORDER]).toEqual(["next", "pick-em", "all-time", "prizes", "app"]);
    expect(TV_CAROUSEL_SLIDE_MS * TV_CAROUSEL_ORDER.length).toBe(75_000);
  });

  it("skips a slide with nothing to show; Get the app is always there", () => {
    expect(carouselSlidesOf(sunday, true)).toEqual(["next", "pick-em", "all-time", "prizes", "app"]);
    expect(carouselSlidesOf(sunday, false)).toEqual(["pick-em", "all-time", "prizes", "app"]);
    expect(carouselSlidesOf(EMPTY_CAROUSEL, false)).toEqual(["app"]);
    expect(carouselSlidesOf({ ...sunday, prizes: [] }, true)).not.toContain("prizes");
    expect(carouselSlidesOf({ ...sunday, allTimeLeaderboard: null }, true)).not.toContain("all-time");
    expect(carouselSlidesOf({ ...sunday, pickEm: { games: [], leaders: null } }, true)).not.toContain("pick-em");
  });

  it("changes slide in whole 15 s steps from the mount, so a poll tick never moves it", () => {
    const slides = carouselSlidesOf(sunday, true);
    // Walks the clock the way the carousel does: one tick a second from slide 1.
    const at = (elapsedMs: number): TvCarouselSlideId => {
      let position = nextCarouselSlide(slides, null, 0, 0);
      for (let ms = 1_000; ms <= elapsedMs; ms += 1_000) position = nextCarouselSlide(slides, position.slide, position.shownAtMs, ms);
      return position.slide;
    };
    expect(at(0)).toBe("next");
    expect(at(14_000)).toBe("next");
    expect(at(15_000)).toBe("pick-em");
    expect(at(74_000)).toBe("app");
    expect(at(75_000)).toBe("next");
    expect(nextCarouselSlide(slides, "next", 0, -5).slide).toBe("next");
    expect(nextCarouselSlide([], null, 0, 1_000).slide).toBe("app");
  });

  it("puts the corner QR on every slide but Get the app (D16: one QR per screen)", () => {
    for (const slide of TV_CAROUSEL_ORDER) expect(carouselShowsCornerQr(slide)).toBe(slide !== "app");
  });
});

describe("carousel markup", () => {
  it("starts at slide 1 on the server and on the first client render, so hydration agrees", () => {
    expect(render(null)).toContain('data-slide="next"');
    expect(render(null)).toBe(render(null));
  });

  it("draws one dot per slide, the active one marked", () => {
    const html = render("prizes");
    expect(html.match(/data-active="true"/g)).toHaveLength(1);
    expect(html.match(/data-active="(true|false)"/g)).toHaveLength(5);
    expect(render("app", idleState(EMPTY_CAROUSEL, null)).match(/data-active=/g)).toBeNull();
  });

  it("shows the corner QR on slides 1–4 and not on Get the app", () => {
    for (const slide of ["next", "pick-em", "all-time", "prizes"] as const) {
      const html = render(slide);
      expect(html.match(/data-testid="app-download-qr"/g), slide).toHaveLength(1);
      expect(html).toContain('data-testid="tv-app-dock"');
    }
    const app = render("app");
    expect(app.match(/data-testid="app-download-qr"/g)).toHaveLength(1);
    expect(app).not.toContain('data-testid="tv-app-dock"');
  });

  it("carries the ticker on every slide when there are games, and drops it when there are none (D15)", () => {
    for (const slide of TV_CAROUSEL_ORDER) expect(render(slide)).toContain('data-testid="tv-ticker"');
    expect(render("app", idleState(EMPTY_CAROUSEL))).not.toContain('data-testid="tv-ticker"');
  });

  it("is today's app-download screen when nothing else has anything to show", () => {
    const html = render(null, idleState(EMPTY_CAROUSEL, null));
    expect(html).toContain('data-slide="app"');
    expect(html).toContain("Brought to you by Hightop Challenge");
    expect(html).not.toContain('data-testid="tv-ticker"');
    expect(html).not.toContain('data-testid="tv-carousel-dots"');
  });

  it("drops the footer line under the ticker", () => {
    expect(render("app")).not.toContain("Brought to you by");
  });

  it("names the app in full: Hightop Challenge, never Hightop alone (D10)", () => {
    expect(render("app")).toContain("Hightop<br/>Challenge");
  });
});

describe("Next Live Trivia slide (D12)", () => {
  const slide = (nowMs = NOW) =>
    renderToStaticMarkup(
      React.createElement(TvNextLiveTriviaSlide, { venueName: "The Rusty Anchor", next: { startsAt: NEXT.startsAt, recurringDays: ["thu"] }, nowMs }),
    );

  it("makes LIVE TRIVIA the biggest text and names the venue", () => {
    const html = slide();
    expect(html).toContain("LIVE TRIVIA");
    expect(html).toContain("font-size:250px");
    expect(html).toContain("The Rusty Anchor");
  });

  it("leaves the TV's own time to after hydration (no line on the server)", () => {
    expect(slide()).not.toContain("next-live-trivia-when");
  });

  it("words the line per D12", () => {
    const sun = new Date(2026, 10, 22, 15).getTime(); // a Sunday afternoon, the TV's local time
    const thu = new Date(2026, 10, 26, 20).toISOString();
    expect(formatNextLiveTriviaWhen({ startsAt: thu, recurringDays: ["thu"] }, sun)?.line).toBe("Every Thursday · 8:00 PM");
    expect(splitNextLiveTriviaLine("Every Thursday · 8:00 PM")).toEqual({ lead: "Every ", accent: "Thursday", time: "8:00 PM" });
    expect(splitNextLiveTriviaLine("Tonight · 8:00 PM")).toEqual({ lead: "", accent: "Tonight", time: "8:00 PM" });
  });
});

describe("Get the app slide's line", () => {
  it("reads as a sentence", () => {
    expect(formatNextLiveTriviaSentence({ line: "Every Thursday · 8:00 PM", showCountdown: false })).toBe(
      "Live Trivia every Thursday · 8:00 PM",
    );
    expect(formatNextLiveTriviaSentence({ line: "Tomorrow · 8:00 PM", showCountdown: false })).toBe(
      "Live Trivia · Tomorrow 8:00 PM",
    );
    expect(formatNextLiveTriviaSentence(null)).toBeNull();
  });
});

describe("Prizes slide (D28)", () => {
  const html = renderToStaticMarkup(React.createElement(TvPrizesSlide, { prizes: sunday.prizes ?? [] }));

  it("shows each prize and its points target, with no progress bar", () => {
    expect(html.match(/data-testid="tv-prize"/g)).toHaveLength(3);
    expect(html).toContain("Free Appetizer");
    expect(html).toContain("500 pts");
    expect(html).toContain("Prizes up for grabs");
    expect(html).not.toMatch(/progress|Reward/i);
  });

  it("shows no points line for a prize without a target", () => {
    const one = renderToStaticMarkup(
      React.createElement(TvPrizesSlide, { prizes: [{ id: "p", prize: "$10 Gift Card", name: "Weekly", pointsRequired: null }] }),
    );
    expect(one).not.toContain("pts");
  });
});

describe("ticker (D15)", () => {
  it("carries the games after the board while the board is up, and all of them otherwise", () => {
    const games = sunday.pickEm?.games ?? [];
    const withBoard = tickerSegmentsOf(sunday.pickEm, true).filter((s) => s.kind === "game");
    const without = tickerSegmentsOf(sunday.pickEm, false).filter((s) => s.kind === "game");
    expect(without).toHaveLength(games.length);
    expect(withBoard).toHaveLength(games.length - 4);
    expect(withBoard.map((s) => s.key)).not.toContain(games[0].key);
  });

  it("ends with the Pick 'Em leader, and is empty without data", () => {
    const segments = tickerSegmentsOf(sunday.pickEm, false);
    expect(segments[segments.length - 1]).toMatchObject({ kind: "leader", username: "Maya R.", record: "9–3" });
    expect(tickerSegmentsOf(null, false)).toEqual([]);
  });

  it("never shows an unknown score as 0", () => {
    const scheduled = tickerSegmentsOf(sunday.pickEm, false).find((s) => s.kind === "game" && s.statusText === null);
    expect(scheduled).toMatchObject({ scored: false });
    const html = renderToStaticMarkup(
      React.createElement(TvTicker, { segments: scheduled ? [scheduled] : [], nextLiveTriviaStartsAt: null, nowMs: NOW }),
    );
    expect(html).not.toMatch(/>0</);
  });

  it("repeats a short list to fill the band, at a steady pace", () => {
    expect(tickerRepeatsFor(0)).toBe(0);
    expect(tickerRepeatsFor(1)).toBe(8);
    expect(tickerRepeatsFor(8)).toBe(1);
    expect(tickerRepeatsFor(12)).toBe(1);
    expect(tickerLoopSeconds(1)).toBeGreaterThanOrEqual(30);
  });

  it("says LIVE only while a game is live, and keeps its loop out of the data's identity", () => {
    const segments = tickerSegmentsOf(sunday.pickEm, false);
    const html = renderToStaticMarkup(React.createElement(TvTicker, { segments, nextLiveTriviaStartsAt: null, nowMs: NOW }));
    expect(html).toContain(">LIVE<");
    const final = segments.filter((s) => s.kind === "game" && !s.live);
    const quiet = renderToStaticMarkup(React.createElement(TvTicker, { segments: final, nextLiveTriviaStartsAt: null, nowMs: NOW }));
    expect(quiet).toContain(">TODAY<");
    const src = readFileSync("components/venue-screen/TvTicker.tsx", "utf8");
    expect(src).toContain("tickerLoopSeconds(segments.length)");
    expect(src).not.toMatch(/key=\{[^}]*updatedAt/);
  });
});

describe("the corner QR everywhere (D16)", () => {
  const client = readFileSync("components/venue-screen/VenueScreenClient.tsx", "utf8");

  it("is one still QR with no motion", () => {
    const html = renderToStaticMarkup(React.createElement(TvAppCorner, { low: true }));
    expect(html.match(/data-testid="app-download-qr"/g)).toHaveLength(1);
    expect(html).toContain("Get the app");
    const src = readFileSync("components/venue-screen/TvAppDock.tsx", "utf8");
    expect(src).not.toMatch(/framer-motion|motion\.|animate=|transition=/);
  });

  it("is on the Live Trivia round break and final standings only", () => {
    expect(client).toContain('state.liveTrivia.phase === "intermission" || state.liveTrivia.phase === "final"');
    expect(client).toContain("{showsCornerQr ? <TvAppCorner low /> : null}");
    // The twinkles stay off every screen with the QR (never covered).
    expect(client).toMatch(/state\.mode === "live-trivia-pregame" \|\| showsCornerQr/);
    expect(client.match(/<TvAppCorner/g)).toHaveLength(1);
    for (const file of ["LiveTriviaScreen", "LiveTriviaRevealScreen", "TvQuestionReveal", "TvAnswerReveal", "TvConnectScreen"]) {
      expect(readFileSync(`components/venue-screen/${file}.tsx`, "utf8"), file).not.toMatch(/AppDownloadQr|TvAppCorner|TvAppDock/);
    }
  });

  it("keeps the round break's list above the corner QR", () => {
    const src = readFileSync("components/venue-screen/LiveTriviaIntermissionScreen.tsx", "utf8");
    expect(src).toContain("ROUND_BREAK_MAX_ROWS = 7");
    expect(src).toContain("maxRows={ROUND_BREAK_MAX_ROWS}");
  });

  it("is not on the reserved screens until R2 (D21)", () => {
    for (const file of ["CategoryBlitzScreen", "CategoryBlitzIntermissionScreen", "SquaresTvScreen", "BracketTvScreen", "TvBlitzResults"]) {
      expect(readFileSync(`components/venue-screen/${file}.tsx`, "utf8"), file).not.toMatch(/TvAppCorner|TvAppDock/);
    }
  });
});

describe("pre-game countdown (D13)", () => {
  it("counts in minutes from 60:00", () => {
    expect(formatPregameCountdown(3_600)).toBe("60:00");
    expect(formatPregameCountdown(3_599)).toBe("59:59");
    expect(formatPregameCountdown(65)).toBe("1:05");
    expect(formatPregameCountdown(0)).toBe("0:00");
    expect(formatPregameCountdown(-3)).toBe("0:00");
  });
});
