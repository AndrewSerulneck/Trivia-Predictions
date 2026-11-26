// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TvCarousel } from "@/components/venue-screen/TvCarousel";
import { appDockClearArea } from "@/components/venue-screen/TvAppDock";
import { usePickEmScoreFlash } from "@/components/venue-screen/usePickEmScoreFlash";
import { TV_SCORE_FLASH_KEEP_MS } from "@/lib/tvPickEmBoard";
import type { TvPickEmGame } from "@/lib/tvSportsRelevance";
import type { VenueScreenState } from "@/lib/venueScreen";

// docs/fire-tv-app-plan.md Phase CR2.1 (F46, F47, F49, F51, F52): the parts that need a DOM and a clock.

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("usePickEmScoreFlash", () => {
  const a = (awayScore: number) => game({ key: "a", awayScore });
  const b = (homeScore: number) => game({ key: "b", homeScore });

  it("F46: two games scoring in one poll both come out, one after the other; an identical poll adds nothing", () => {
    const { result, rerender } = renderHook(({ games }) => usePickEmScoreFlash(games), {
      initialProps: { games: [a(14), b(10)] as readonly TvPickEmGame[] | undefined },
    });
    expect(result.current.flash).toBeNull(); // first look
    rerender({ games: [a(21), b(17)] });
    const first = result.current.flash;
    expect(first?.gameKey).toBe("a");
    rerender({ games: [a(21), b(17)].map((g) => ({ ...g })) }); // same scores, new poll
    expect(result.current.flash?.token).toBe(first?.token);
    act(() => result.current.done(first!.token));
    expect(result.current.flash?.gameKey).toBe("b");
    act(() => result.current.done(result.current.flash!.token));
    expect(result.current.flash).toBeNull();
  });

  it("holds an unwatched flash for the keep window, then lets it go", () => {
    const { result, rerender } = renderHook(({ games }) => usePickEmScoreFlash(games), {
      initialProps: { games: [a(14)] as readonly TvPickEmGame[] | undefined },
    });
    rerender({ games: [a(21)] });
    expect(result.current.flash).not.toBeNull();
    act(() => void vi.advanceTimersByTime(TV_SCORE_FLASH_KEEP_MS - 1));
    expect(result.current.flash).not.toBeNull();
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current.flash).toBeNull();
  });

  it("F47: the first poll after a gap with no Pick 'Em data flashes nothing (stale news)", () => {
    const { result, rerender } = renderHook(({ games }) => usePickEmScoreFlash(games), {
      initialProps: { games: [game({ awayScore: 14 })] as readonly TvPickEmGame[] | undefined },
    });
    rerender({ games: undefined });
    rerender({ games: [game({ awayScore: 28 })] });
    expect(result.current.flash).toBeNull();
  });
});

describe("appDockClearArea (F52)", () => {
  it("ends where the dock begins, and is the whole viewport without a dock", () => {
    expect(appDockClearArea()).toEqual({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });
    const dock = document.createElement("div");
    dock.setAttribute("data-testid", "tv-app-dock");
    dock.getBoundingClientRect = () => ({ top: 500, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 500, toJSON: () => ({}) });
    document.body.appendChild(dock);
    expect(appDockClearArea().h).toBe(500);
    dock.remove();
  });
});

type IdleState = Extract<VenueScreenState, { mode: "idle" }>;

const idle = (prizes: boolean, allTime: boolean): IdleState => ({
  ok: true,
  mode: "idle",
  venue: { id: "v1", name: "The Rusty Anchor", displayName: null, screenBrandImageUrl: null, screenBrandPrimary: null, screenBrandSecondary: null },
  liveTrivia: null,
  categoryBlitz: null,
  idle: {
    nextLiveTrivia: null,
    sponsorSlots: [],
    pickEm: null,
    allTimeLeaderboard: allTime ? [{ rank: 1, username: "Maya R.", points: 100 }] : null,
    prizes: prizes ? [{ id: "p", prize: "Free Pint", name: "Fall Challenge", pointsRequired: 500 }] : null,
  },
  updatedAt: NOW,
});

const qrCount = () => document.querySelectorAll('[data-testid="app-download-qr"]').length;
const slide = () => document.querySelector('[data-testid="tv-carousel"]')?.getAttribute("data-slide");

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe("TvCarousel", () => {
  it("F51: never shows two QRs, even through the cross-fade out of Get the app (slide 5 -> 1)", async () => {
    vi.useRealTimers(); // framer's cross-fade runs on the real frame loop; the TV's clock is the nowMs prop
    const state = idle(true, false); // prizes, app
    const view = render(React.createElement(TvCarousel, { state, nowMs: NOW }));
    expect(slide()).toBe("prizes");
    expect(qrCount()).toBe(1); // the corner QR

    view.rerender(React.createElement(TvCarousel, { state, nowMs: NOW + 15_000 }));
    expect(slide()).toBe("app");
    for (let step = 0; step < 14; step += 1) {
      await wait(50);
      expect(qrCount(), `app, +${step * 50} ms`).toBeLessThanOrEqual(1);
    }

    // 5 -> 1: the big QR is still fading out while slide 1 is up.
    view.rerender(React.createElement(TvCarousel, { state, nowMs: NOW + 30_000 }));
    expect(slide()).toBe("prizes");
    const counts: number[] = [];
    for (let step = 0; step < 30; step += 1) {
      counts.push(qrCount());
      expect(qrCount(), `prizes, +${step * 50} ms`).toBeLessThanOrEqual(1);
      await wait(50);
    }
    expect(counts[0]).toBe(1); // the leaving slide's QR is still there at the first frame
    expect(document.querySelector('[data-testid="tv-app-dock"]')).not.toBeNull(); // and the corner QR is back after it
  });

  it("F49: a slide on screen is not cut short when another slide appears or goes between polls", () => {
    let state = idle(true, false); // prizes, app
    const view = render(React.createElement(TvCarousel, { state, nowMs: NOW }));
    expect(slide()).toBe("prizes");
    // All-Time arrives at 10 s: it sits before Prizes in the order, so the old count would have moved the slide.
    state = idle(true, true);
    for (let s = 1; s <= 14; s += 1) {
      view.rerender(React.createElement(TvCarousel, { state, nowMs: NOW + s * 1000 }));
      expect(slide(), `t=${s}s`).toBe("prizes");
    }
    view.rerender(React.createElement(TvCarousel, { state, nowMs: NOW + 15_000 }));
    expect(slide()).toBe("app");
    // The slide on screen disappears: the next present one comes up at once.
    state = idle(false, true);
    view.rerender(React.createElement(TvCarousel, { state, nowMs: NOW + 16_000 }));
    view.rerender(React.createElement(TvCarousel, { state: idle(true, true), nowMs: NOW + 31_000 }));
    expect(slide()).toBe("all-time");
    view.rerender(React.createElement(TvCarousel, { state: idle(true, false), nowMs: NOW + 32_000 }));
    expect(slide()).toBe("prizes");
  });
});
