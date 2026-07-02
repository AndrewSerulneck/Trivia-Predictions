import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VenueScreenStatus, formatVenueScreenHeartbeat } from "@/components/venue-screen/VenueScreenStatus";
import { applyVenueScreenDebugMode } from "@/lib/venueScreenDebug";
import {
  getVenueScreenBurnInTransform,
  getVenueScreenPollIntervalMs,
  getVenueScreenRetryDelayMs,
  parseVenueScreenDebugMode,
} from "@/lib/venueScreenTiming";
import type { VenueScreenState } from "@/lib/venueScreen";

const nowMs = Date.parse("2026-07-02T20:00:00.000Z");

function makeState(mode: VenueScreenState["mode"]): VenueScreenState {
  const venue = {
    id: "venue-1",
    name: "Hightop Pub",
    displayName: "Hightop Pub TV",
    screenBrandImageUrl: null,
    screenBrandPrimary: null,
    screenBrandSecondary: null,
  };

  if (mode === "live-trivia") {
    return {
      ok: true,
      mode,
      venue,
      liveTrivia: {
        phase: "question",
        roundNumber: 1,
        totalRounds: 4,
        category: "Sports",
        question: "Debug question?",
        secondsRemaining: 30,
        leaderboard: null,
      },
      categoryBlitz: null,
      idle: null,
      updatedAt: nowMs,
    };
  }

  if (mode === "category-blitz") {
    return {
      ok: true,
      mode,
      venue,
      liveTrivia: null,
      categoryBlitz: {
        phase: "round",
        roundId: "round-1",
        letter: "M",
        categories: ["Movies"],
        secondsRemaining: 45,
        leaderboard: null,
      },
      idle: null,
      updatedAt: nowMs,
    };
  }

  return {
    ok: true,
    mode,
    venue,
    liveTrivia: null,
    categoryBlitz: null,
    idle: {
      nextLiveTrivia: null,
      nextCategoryBlitz: null,
      sponsorSlots: [],
    },
    updatedAt: nowMs,
  };
}

describe("venue screen reliability helpers", () => {
  it("uses fast polling for active rounds and slower polling for idle/intermission states", () => {
    const liveQuestion = makeState("live-trivia") as Extract<VenueScreenState, { mode: "live-trivia" }>;
    const liveIntermission = {
      ...liveQuestion,
      liveTrivia: { ...liveQuestion.liveTrivia, phase: "intermission" as const },
    };
    const blitzRound = makeState("category-blitz") as Extract<VenueScreenState, { mode: "category-blitz" }>;
    const blitzResults = {
      ...blitzRound,
      categoryBlitz: { ...blitzRound.categoryBlitz, phase: "results" as const },
    };

    expect(getVenueScreenPollIntervalMs(liveQuestion)).toBe(1_000);
    expect(getVenueScreenPollIntervalMs(liveIntermission)).toBe(4_000);
    expect(getVenueScreenPollIntervalMs(blitzRound)).toBe(1_000);
    expect(getVenueScreenPollIntervalMs(blitzResults)).toBe(4_000);
    expect(getVenueScreenPollIntervalMs(makeState("idle"))).toBe(20_000);
  });

  it("caps transient failure retry backoff", () => {
    expect(getVenueScreenRetryDelayMs(1)).toBe(1_000);
    expect(getVenueScreenRetryDelayMs(2)).toBe(2_000);
    expect(getVenueScreenRetryDelayMs(3)).toBe(4_000);
    expect(getVenueScreenRetryDelayMs(8)).toBe(15_000);
  });

  it("parses optional debug modes and ignores unknown values", () => {
    expect(parseVenueScreenDebugMode("live-trivia")).toBe("live-trivia");
    expect(parseVenueScreenDebugMode(["idle"])).toBe("idle");
    expect(parseVenueScreenDebugMode("scoreboard")).toBeNull();
  });

  it("applies debug mode overrides without changing venue branding", () => {
    const state = applyVenueScreenDebugMode(makeState("idle"), "category-blitz", nowMs);

    expect(state.mode).toBe("category-blitz");
    expect(state.venue.displayName).toBe("Hightop Pub TV");
    expect(state.categoryBlitz?.letter).toBe("M");
    expect(state.categoryBlitz?.categories.length).toBeGreaterThan(1);
  });

  it("formats the heartbeat and reconnect status for long-running screens", () => {
    expect(formatVenueScreenHeartbeat(nowMs - 2_000, nowMs)).toBe("Updated just now");
    expect(formatVenueScreenHeartbeat(nowMs - 42_000, nowMs)).toBe("Updated 42s ago");
    expect(formatVenueScreenHeartbeat(nowMs - 5 * 60_000, nowMs)).toBe("Updated 5m ago");

    const html = renderToStaticMarkup(
      React.createElement(VenueScreenStatus, {
        updatedAt: nowMs - 42_000,
        nowMs,
        error: "Refresh timed out.",
        failureCount: 2,
        isRefreshing: false,
        debugMode: "idle",
      }),
    );

    expect(html).toContain("Reconnecting");
    expect(html).toContain("Updated 42s ago");
    expect(html).toContain("Retry 2");
    expect(html).toContain("Debug: idle");
  });

  it("moves idle content only on a slow burn-in mitigation cadence", () => {
    expect(getVenueScreenBurnInTransform(0)).toBe("translate3d(0px, 0px, 0)");
    expect(getVenueScreenBurnInTransform(300_000)).toBe("translate3d(6px, -4px, 0)");
    expect(getVenueScreenBurnInTransform(8 * 300_000)).toBe("translate3d(0px, 0px, 0)");
  });
});
