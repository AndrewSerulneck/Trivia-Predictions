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
  it("renders venue branding and next-game countdowns", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, { state: makeIdleState(), nowMs }),
    );

    expect(html).toContain("Hightop Pub TV");
    expect(html).toContain("Live Trivia");
    expect(html).toContain("starts in");
    expect(html).toContain("1:00:00");
    expect(html).toContain("Category Blitz");
    expect(html).toContain("15:30");
    expect(html).toContain("Brought to you by Hightop Challenge™");
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

    expect(html).toContain("Live Trivia");
    expect(html).toContain("is scheduled on");
    expect(html).toContain("Saturday");
    expect(html).toContain("Sunday and Wednesday");
    expect(html).not.toContain("49:00:00");
  });

  it("renders the venue name once for each scheduled game line", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, { state: makeIdleState(), nowMs }),
    );

    expect(html.match(/Hightop Pub TV/g)?.length).toBe(2);
  });

  it("does not render sponsor slots on the minimal display page", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, {
        state: makeIdleState({
          sponsorSlots: [
            {
              title: "High Noon",
              imageUrl: "https://cdn.example.com/high-noon.png",
              linkUrl: "https://example.com/high-noon",
            },
          ],
        }),
        nowMs,
      }),
    );

    expect(html).not.toContain("Presented by");
    expect(html).not.toContain("High Noon");
    expect(html).toContain("Brought to you by Hightop Challenge™");
  });

  it("keeps the idle screen complete without sponsor slots", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, { state: makeIdleState(), nowMs }),
    );

    expect(html).toContain("starts in");
    expect(html).not.toContain("Presented by");
  });

  it("does not render a countdown tile for unscheduled Live Trivia", () => {
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

    expect(html).not.toContain("Live Trivia");
    expect(html).toContain("Category Blitz");
    expect(html).toContain("starts in");
    expect(html).toContain("15:30");
  });

  it("renders a short empty message when no Live Games are scheduled", () => {
    const html = renderToStaticMarkup(
      React.createElement(IdleVenueScreen, {
        state: makeIdleState({
          nextLiveTrivia: null,
          nextCategoryBlitz: null,
        }),
        nowMs,
      }),
    );

    expect(html).toContain("Hightop Pub TV Live Games will appear here.");
    expect(html.match(/Hightop Pub TV/g)?.length).toBe(1);
    expect(html).not.toContain("Schedule coming soon");
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
