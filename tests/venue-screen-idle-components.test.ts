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

const nowMs = Date.parse("2026-07-02T20:00:00.000Z");

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

  it("never shows a Category Blitz card (Andrew 2026-11-14)", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, { state: makeIdleState(), nowMs: nowMs + 8_000 }),
    );

    // The rotation has one card now: 8 s later it is still Live Trivia.
    // (The wordmark tagline still names both games; Phase 3's idle redesign replaces it.)
    expect(html).toContain("Thursday Live Trivia");
    expect(html).not.toContain("Play anytime");
    expect(html).not.toContain("Start it on your phone");
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

  it("renders the calm attract screen (wordmark + venue name) when no games are scheduled", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, {
        state: makeIdleState({
          nextLiveTrivia: null,
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
