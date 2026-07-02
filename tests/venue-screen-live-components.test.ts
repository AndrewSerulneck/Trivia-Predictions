import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveTriviaIntermissionScreen } from "@/components/venue-screen/LiveTriviaIntermissionScreen";
import { LiveTriviaScreen } from "@/components/venue-screen/LiveTriviaScreen";
import { formatScreenCountdown } from "@/components/venue-screen/ScreenCountdown";
import type { VenueScreenState } from "@/lib/venueScreen";

type LiveTriviaState = Extract<VenueScreenState, { mode: "live-trivia" }>;

function makeLiveTriviaState(overrides: Partial<LiveTriviaState["liveTrivia"]> = {}): LiveTriviaState {
  return {
    ok: true,
    mode: "live-trivia",
    venue: {
      id: "venue-1",
      name: "Hightop Pub",
      displayName: "Hightop Pub TV",
      screenBrandImageUrl: null,
      screenBrandPrimary: null,
      screenBrandSecondary: null,
    },
    liveTrivia: {
      phase: "question",
      roundNumber: 2,
      totalRounds: 4,
      category: "Sports",
      question: "Which city hosted the 1996 Summer Olympics?",
      secondsRemaining: 42,
      leaderboard: null,
      ...overrides,
    },
    categoryBlitz: null,
    idle: null,
    updatedAt: Date.parse("2026-07-02T20:00:00.000Z"),
  };
}

describe("Live Trivia venue screen components", () => {
  it("renders the active question with venue, round, category, and countdown", () => {
    const html = renderToStaticMarkup(
      React.createElement(LiveTriviaScreen, { state: makeLiveTriviaState() })
    );

    expect(html).toContain("Hightop Pub TV");
    expect(html).toContain("Round 2 of 4");
    expect(html).toContain("Sports");
    expect(html).toContain("Which city hosted the 1996 Summer Olympics?");
    expect(html).toContain("0:42");
  });

  it("does not render answer options on the public question screen", () => {
    const html = renderToStaticMarkup(
      React.createElement(LiveTriviaScreen, { state: makeLiveTriviaState() })
    );

    expect(html).not.toContain("Atlanta");
    expect(html).not.toContain("Sydney");
  });

  it("renders the intermission leaderboard with ranks, usernames, and points", () => {
    const state = makeLiveTriviaState({
      phase: "intermission",
      secondsRemaining: 195,
      leaderboard: [
        { rank: 1, username: "casey", points: 90 },
        { rank: 2, username: "morgan", points: 70 },
      ],
    });
    const html = renderToStaticMarkup(
      React.createElement(LiveTriviaIntermissionScreen, { state })
    );

    expect(html).toContain("Round Break");
    expect(html).toContain("Round 2 Leaderboard");
    expect(html).toContain("#1");
    expect(html).toContain("casey");
    expect(html).toContain("90");
    expect(html).toContain("#2");
    expect(html).toContain("morgan");
    expect(html).toContain("70");
    expect(html).toContain("3:15");
  });

  it("formats countdown values for TV display", () => {
    expect(formatScreenCountdown(0)).toBe("0:00");
    expect(formatScreenCountdown(7)).toBe("0:07");
    expect(formatScreenCountdown(125)).toBe("2:05");
  });
});
