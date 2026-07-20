import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  formatIdleCountdown,
  getIdleGameDisplay,
  IdleVenueScreen,
} from "@/components/venue-screen/IdleVenueScreen";
import type { VenueScreenState } from "@/lib/venueScreen";

type IdleState = Extract<VenueScreenState, { mode: "idle" }>;

// TvIdleAttract rotates through games at a default 8s cadence, keyed off the
// wall clock (Math.floor(nowMs / 8000) % gameCount) — deterministic for a
// fixed nowMs, chosen here so the FIRST scheduled game (Live Trivia) shows.
const nowMs = Date.parse("2026-07-02T20:00:00.000Z");
// Same games, 8s later: rotation index flips to the SECOND game (Category Blitz).
const nowMsSecondCard = nowMs + 8_000;

function makeIdleState(overrides: Partial<IdleState["idle"]> = {}): IdleState {
  return {
    ok: true,
    mode: "idle",
    venue: {
      id: "venue-1",
      name: "Hightop Pub",
      displayName: "Hightop Pub TV",
      screenBrandImageUrl: "https://cdn.example.com/hightop-pub.png",
      screenBrandPrimary: "#14b8a6",
      screenBrandSecondary: "#f59e0b",
    },
    liveTrivia: null,
    categoryBlitz: null,
    idle: {
      nextLiveTrivia: {
        startsAt: "2026-07-02T21:00:00.000Z",
        title: "Thursday Live Trivia",
        firstRoundCategory: "History",
        recurringDays: ["thu"],
      },
      nextCategoryBlitz: {
        startsAt: "2026-07-02T20:15:30.000Z",
        recurringDays: ["thu"],
      },
      sponsorSlots: [],
      ...overrides,
    },
    updatedAt: nowMs,
  };
}

describe("Idle venue screen components", () => {
  it("renders venue branding and the first rotating game card", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, { state: makeIdleState(), nowMs }),
    );

    expect(html).toContain("Hightop Pub TV");
    expect(html).toContain("Thursday Live Trivia");
    expect(html).toContain("1:00:00");
    expect(html).toContain("Next up");
  });

  it("rotates to the second card 8 seconds later", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, { state: makeIdleState(), nowMs: nowMsSecondCard }),
    );

    expect(html).toContain("Category Blitz");
    expect(html).toContain("15:22"); // 15:30 minus the 8s advance to nowMsSecondCard
  });

  it("shows scheduled days instead of a countdown for games more than 24 hours away", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, {
        state: makeIdleState({
          nextLiveTrivia: {
            startsAt: "2026-07-04T21:00:00.000Z",
            title: "Saturday Live Trivia",
            firstRoundCategory: "History",
            recurringDays: ["sat"],
          },
          nextCategoryBlitz: {
            startsAt: "2026-07-05T20:15:30.000Z",
            recurringDays: ["sun", "wed"],
          },
        }),
        nowMs,
      }),
    );

    expect(html).toContain("Saturday Live Trivia");
    expect(html).not.toContain("49:00:00");
  });

  it("renders the venue name once (wordmark panel, not per-card)", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, { state: makeIdleState(), nowMs }),
    );

    expect(html.match(/Hightop Pub TV/g)?.length).toBe(1);
  });

  it("shows only the scheduled game when one game is unscheduled", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, {
        state: makeIdleState({
          nextLiveTrivia: null,
          nextCategoryBlitz: {
            startsAt: "2026-07-02T20:15:30.000Z",
          },
        }),
        nowMs,
      }),
    );

    expect(html).toContain("Category Blitz");
    expect(html).toContain("15:30");
  });

  it("renders the calm attract screen (wordmark + venue name) when no games are scheduled", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, {
        state: makeIdleState({
          nextLiveTrivia: null,
          nextCategoryBlitz: null,
        }),
        nowMs,
      }),
    );

    expect(html).toContain("Hightop");
    expect(html).toContain("Hightop Pub TV");
    expect(html).not.toContain("Next up");
  });

  it("formats longer idle countdowns for large TV display", () => {
    expect(formatIdleCountdown(null)).toBe("Schedule coming soon");
    expect(formatIdleCountdown(45)).toBe("0:45");
    expect(formatIdleCountdown(3_661)).toBe("1:01:01");
    expect(formatIdleCountdown(93_600)).toBe("1d 02h");
  });

  it("switches countdown display at the 24-hour threshold", () => {
    expect(getIdleGameDisplay("2026-07-03T19:59:59.000Z", nowMs, ["fri"])).toEqual({
      kind: "countdown",
      value: "23:59:59",
    });
    expect(getIdleGameDisplay("2026-07-03T20:00:01.000Z", nowMs, ["fri"])).toEqual({
      kind: "schedule",
      value: "Friday",
    });
  });
});
