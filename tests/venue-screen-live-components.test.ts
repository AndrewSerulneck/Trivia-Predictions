import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveTriviaIntermissionScreen } from "@/components/venue-screen/LiveTriviaIntermissionScreen";
import { LiveTriviaRevealScreen } from "@/components/venue-screen/LiveTriviaRevealScreen";
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
      gameId: "schedule-1:2026-07-02",
      roundNumber: 2,
      totalRounds: 4,
      category: "Sports",
      question: "Which city hosted the 1996 Summer Olympics?",
      correctAnswer: null,
      secondsRemaining: 42,
      revealEndsAt: null,
      leaderboard: null,
      ...overrides,
    },
    categoryBlitz: null,
    idle: null,
    updatedAt: Date.parse("2026-07-02T20:00:00.000Z"),
  };
}

describe("Live Trivia venue screen components", () => {
  it("renders the active question with round, category, and countdown", () => {
    const state = makeLiveTriviaState();
    // Venue name is no longer rendered inside LiveTriviaScreen — it's shown
    // once by VenueScreenClient's shared header (avoids duplicating it per
    // panel). nowMs === state.updatedAt so no time has "elapsed" locally.
    const html = renderToStaticMarkup(
      React.createElement(LiveTriviaScreen, { state, nowMs: state.updatedAt })
    );

    expect(html).toContain("Round");
    expect(html).toContain("Sports");
    // The question renders as one <span> per word (staggered reveal), so it's
    // no longer one contiguous string in the markup — check each word instead.
    for (const word of "Which city hosted the 1996 Summer Olympics?".split(" ")) {
      expect(html).toContain(word);
    }
    expect(html).toContain("42");
  });

  it("does not render answer options on the public question screen", () => {
    const state = makeLiveTriviaState();
    const html = renderToStaticMarkup(
      React.createElement(LiveTriviaScreen, { state, nowMs: state.updatedAt })
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
    // nowMs === state.updatedAt so no time has "elapsed" locally; the
    // countdown renders the raw server value.
    const html = renderToStaticMarkup(
      React.createElement(LiveTriviaIntermissionScreen, { state, nowMs: state.updatedAt })
    );

    expect(html).toContain("Round break");
    expect(html).toContain("Round 2");
    expect(html).toContain("complete");
    expect(html).toContain("casey");
    expect(html).toContain("90");
    expect(html).toContain("morgan");
    expect(html).toContain("70");
    expect(html).toContain("195");
  });

  it("renders the answer-reveal beat with the correct answer and question", () => {
    const state = makeLiveTriviaState({
      phase: "reveal",
      secondsRemaining: 12,
      correctAnswer: "Atlanta",
      revealEndsAt: "2026-07-02T20:00:12.000Z",
    });
    const html = renderToStaticMarkup(
      React.createElement(LiveTriviaRevealScreen, { state, nowMs: state.updatedAt })
    );

    expect(html).toContain("Correct answer");
    expect(html).toContain("Atlanta");
    expect(html).toContain("Answers locked");
    // The question still renders (demoted), one span per... actually one <p> here.
    expect(html).toContain("Which city hosted the 1996 Summer Olympics?");
    expect(html).toContain("12");
  });

  it("formats countdown values for TV display", () => {
    expect(formatScreenCountdown(0)).toBe("0:00");
    expect(formatScreenCountdown(7)).toBe("0:07");
    expect(formatScreenCountdown(125)).toBe("2:05");
  });
});
