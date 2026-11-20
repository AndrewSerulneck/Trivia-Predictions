// Live Trivia Display URL: question media + honest "what's next" label + empty boards.
// Plan + standing rules: docs/live-trivia-display-media-and-standings-plan.md.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveTriviaIntermissionScreen } from "@/components/venue-screen/LiveTriviaIntermissionScreen";
import { LiveTriviaRevealScreen } from "@/components/venue-screen/LiveTriviaRevealScreen";
import { LiveTriviaScreen } from "@/components/venue-screen/LiveTriviaScreen";
import { revealNextLabel } from "@/lib/liveTriviaShared";
import { toQuestionMedia } from "@/lib/questionMedia";
import type { VenueScreenState } from "@/lib/venueScreen";

type LiveTriviaState = Extract<VenueScreenState, { mode: "live-trivia" }>;

const makeState = (overrides: Partial<LiveTriviaState["liveTrivia"]> = {}): LiveTriviaState => ({
  ok: true,
  mode: "live-trivia",
  venue: { id: "venue-1", name: "Hightop Pub" },
  liveTrivia: {
    phase: "question",
    gameId: "schedule-1:2026-11-20",
    roundNumber: 1,
    totalRounds: 3,
    category: "Geography",
    question: "Which U.S. state is shown on this map?",
    media: toQuestionMedia("/maps/geography-map-texas.png"),
    questionIndex: 4,
    questionsPerRound: 15,
    correctAnswer: null,
    secondsRemaining: 40,
    revealEndsAt: null,
    leaderboard: null,
    ...overrides,
  },
  categoryBlitz: null,
  idle: null,
  updatedAt: Date.parse("2026-11-20T20:00:00.000Z"),
});

const render = (el: React.ReactElement) => renderToStaticMarkup(el);

describe("revealNextLabel", () => {
  const base = { questionsPerRound: 15, roundNumber: 1, totalRounds: 3 };
  it("promises standings only after a round's last question", () => {
    expect(revealNextLabel({ ...base, questionIndex: 1 })).toBe("Next question");
    expect(revealNextLabel({ ...base, questionIndex: 14 })).toBe("Next question");
    expect(revealNextLabel({ ...base, questionIndex: 15 })).toBe("Standings next");
    expect(revealNextLabel({ ...base, questionIndex: 15, roundNumber: 3 })).toBe("Final standings next");
  });
  it("an unknown question number never promises standings", () => {
    expect(revealNextLabel({ ...base, questionIndex: null })).toBe("Next question");
  });
});

describe("Display URL question media", () => {
  it("shows the picture on the question view", () => {
    const html = render(React.createElement(LiveTriviaScreen, { state: makeState(), nowMs: makeState().updatedAt }));
    expect(html).toContain('data-question-media="image"');
    expect(html).toContain('src="/maps/geography-map-texas.png"');
    expect(html).toContain("Map: Natural Earth / U.S. Census");
  });

  it("keeps the picture beside the answer on the reveal (D2)", () => {
    const state = makeState({ phase: "reveal", correctAnswer: "Texas", revealEndsAt: "2026-11-20T20:00:12.000Z" });
    const html = render(React.createElement(LiveTriviaRevealScreen, { state, nowMs: state.updatedAt }));
    expect(html).toContain('src="/maps/geography-map-texas.png"');
    expect(html).toContain("Texas");
  });

  it("plays video muted and looping, with no controls (D3)", () => {
    const state = makeState({ media: toQuestionMedia("https://cdn.example.com/clip.mp4") });
    const html = render(React.createElement(LiveTriviaScreen, { state, nowMs: state.updatedAt }));
    expect(html).toContain('data-question-media="video"');
    expect(html).toMatch(/<video[^>]*\bloop\b/);
    expect(html).toMatch(/<video[^>]*\bplaysInline|<video[^>]*\bplaysinline/i);
    expect(html).not.toMatch(/<video[^>]*\bcontrols=""/);
  });

  it("renders no frame when the question has no media", () => {
    const state = makeState({ media: null });
    const html = render(React.createElement(LiveTriviaScreen, { state, nowMs: state.updatedAt }));
    expect(html).not.toContain("data-question-media");
  });

  it("question media is never clickable, draggable or long-pressable (D4)", () => {
    for (const file of ["components/venue-screen/TvQuestionMedia.tsx", "components/trivia/QuestionImage.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("pointer-events-none");
      expect(src, file).toContain("select-none");
      expect(src, file).toContain("draggable={false}");
      expect(src, file).toMatch(/WebkitTouchCallout: "none"|\[-webkit-touch-callout:none\]/);
      expect(src, file).not.toContain("<a ");
      expect(src, file).not.toContain("controls\n");
    }
  });

  it("a file that failed before hydration still hides the TV frame (onError is not replayed)", () => {
    // Browser-verified in Phase 5: a 404 map on the server-rendered Display URL showed a broken-image icon.
    const src = readFileSync("components/venue-screen/TvQuestionMedia.tsx", "utf8");
    expect(src).toContain("ref={checkImage}");
    expect(src).toMatch(/img\?\.complete && typeof img\.decode === "function"\) img\.decode\(\)\.catch\(fail\)/);
    expect(src).toMatch(/video\.error \|\| video\.networkState === HTMLMediaElement\.NETWORK_NO_SOURCE/);
  });

  it("media reaches the display payload only through toQuestionMedia", () => {
    const src = readFileSync("lib/venueScreen.ts", "utf8");
    expect(src).toMatch(/media: phase === "question" \|\| phase === "reveal" \? toQuestionMedia\(/);
  });
});

describe("Display URL standings", () => {
  it("the reveal after question 4 says Next question, not Standings next", () => {
    const state = makeState({ phase: "reveal", correctAnswer: "Texas", questionIndex: 4 });
    const html = render(React.createElement(LiveTriviaRevealScreen, { state, nowMs: state.updatedAt }));
    expect(html).toContain("Next question");
    expect(html).not.toContain("Standings next");
  });

  it("the reveal after question 15 says Standings next; the last round says Final standings next", () => {
    const mid = makeState({ phase: "reveal", correctAnswer: "Texas", questionIndex: 15, roundNumber: 1 });
    expect(render(React.createElement(LiveTriviaRevealScreen, { state: mid, nowMs: mid.updatedAt }))).toContain(
      "Standings next",
    );
    const last = makeState({ phase: "reveal", correctAnswer: "Texas", questionIndex: 15, roundNumber: 3 });
    expect(render(React.createElement(LiveTriviaRevealScreen, { state: last, nowMs: last.updatedAt }))).toContain(
      "Final standings next",
    );
  });

  it("an empty round break and an empty final say No scores yet.", () => {
    for (const phase of ["intermission", "final"] as const) {
      const state = makeState({ phase, media: null, leaderboard: [] });
      const html = render(React.createElement(LiveTriviaIntermissionScreen, { state, nowMs: state.updatedAt }));
      expect(html, phase).toContain("No scores yet.");
    }
  });

  it("a round break with scores shows them, not the empty line", () => {
    const state = makeState({
      phase: "intermission",
      media: null,
      leaderboard: [{ rank: 1, username: "casey", points: 90 }],
    });
    const html = render(React.createElement(LiveTriviaIntermissionScreen, { state, nowMs: state.updatedAt }));
    expect(html).toContain("casey");
    expect(html).not.toContain("No scores yet.");
  });
});
