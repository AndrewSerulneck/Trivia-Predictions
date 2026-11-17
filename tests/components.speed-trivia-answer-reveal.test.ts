// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// D31 (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c.6): the game screen reveals the answer only from the
// POST's reply. The round is entered through the interrupted-question recovery (a saved snapshot), which also shows
// that a saved question without `correctAnswer` isn't dropped. createElement, not JSX (the test glob is *.test.ts).
// Phase 4c.8: a saved round or warm cache without `order: 1` is dropped and the GET runs instead.

const mocks = vi.hoisted(() => ({
  triggerAnimation: vi.fn(() => 1),
  updateAnimationPayload: vi.fn(),
  dismissAnimation: vi.fn(),
  presence: { capturePresenceFailure: () => null },
  router: { replace: vi.fn(), push: vi.fn(), back: vi.fn() },
}));

// Stable hook values, as in the app: a new object per render would re-run the round bootstrap effect.
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/lib/storage", () => ({ getUserId: () => "user-1", getVenueId: () => "venue-1" }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/components/venue/VenuePresenceBoundary", () => ({
  useVenuePresence: () => mocks.presence,
}));
vi.mock("@/components/animations/AnimationTriggerProvider", () => ({
  useAnimationTrigger: () => mocks,
}));
vi.mock("@/components/navigation/ExitBackButton", () => ({ ExitBackButton: () => null }));
vi.mock("@/components/trivia/QuestionImage", () => ({ QuestionImage: () => null }));

import { TriviaGame } from "@/components/trivia/TriviaGame";

// jsdom has no scrollIntoView. The game scrolls the Next button into view on a timer, which can fire after a test
// ends (it failed CI on PR #20), so the stub stays for the whole file.
Element.prototype.scrollIntoView = () => {};

const SNAPSHOT_KEY = "tp:trivia:live-preview:v1";
const Q1 = { id: "q-1", question: "First question?", options: ["A1", "B1", "C1", "D1"], order: 1 };
const Q2 = { id: "q-2", question: "Which planet is red?", options: ["Venus", "Mars", "Jupiter", "Mercury"], order: 1 };

type Posted = { questionId: string; answer: number; order?: number };

let posts: Posted[] = [];
let gets = 0;
let releaseAnswer: (result: Record<string, unknown>) => void = () => undefined;
let failAnswer: (error: string) => void = () => undefined;

const json = (body: unknown) => ({ json: async () => body }) as Response;

const saveSnapshot = (questions: Record<string, unknown>[]) => {
  window.localStorage.setItem(
    SNAPSHOT_KEY,
    JSON.stringify({
      updatedAt: Date.now(),
      isRoundStarted: true,
      questionId: "q-1",
      questionIndex: 1,
      totalQuestions: questions.length,
      secondsRemaining: 10,
      correctAnswers: 0,
      attempted: 0,
      questionText: "First question?",
      questions,
      userId: "user-1",
      venueId: "venue-1",
    })
  );
};

beforeEach(() => {
  posts = [];
  gets = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/trivia/quota")) return json({ ok: true, quota: null });
      if (url.startsWith("/api/trivia") && init?.method === "GET") {
        gets += 1;
        return json({ ok: true, questions: [Q1, Q2] });
      }
      if (url.startsWith("/api/leaderboard")) return json({ ok: true, entries: [{ userId: "user-1", points: 10 }] });
      if (url === "/api/trivia" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as Posted;
        posts.push(body);
        if (body.answer === -1) return json({ ok: true, result: { isCorrect: false, correctAnswer: 0, saved: true } });
        return new Promise<Response>((resolve) => {
          releaseAnswer = (result) => resolve(json({ ok: true, result }));
          failAnswer = (error) => resolve(json({ ok: false, error }));
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const enterQuestionTwo = async () => {
  render(createElement(TriviaGame, { selectedCategory: null }));
  await screen.findByText("Which planet is red?");
  expect(posts).toEqual([expect.objectContaining({ questionId: "q-1", answer: -1 })]);
};

const optionButton = (label: string) => screen.getByText(label).closest("button") as HTMLButtonElement;

describe("TriviaGame answer reveal", () => {
  it("keeps a saved question that has no correct answer", async () => {
    saveSnapshot([Q1, Q2]);
    await enterQuestionTwo();
    expect(screen.getByText("Mars")).toBeTruthy();
  });

  it("shows nothing until the reply, then reveals the reply's index", async () => {
    saveSnapshot([Q1, Q2]);
    await enterQuestionTwo();

    fireEvent.click(optionButton("Venus"));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toMatchObject({ questionId: "q-2", answer: 0, order: 1 });

    // In flight: the pick is selected and busy, nothing is revealed, nothing has played.
    expect(optionButton("Venus").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText("✓")).toBeNull();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(mocks.triggerAnimation).not.toHaveBeenCalled();
    // Report (D32, 4c.7) stays hidden until the reply reveals the answer.
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();

    await act(async () => {
      releaseAnswer({ isCorrect: false, correctAnswer: 1, saved: true });
    });

    await screen.findByText("Incorrect. Correct answer: Mars.");
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
    expect(optionButton("Mars").textContent).toContain("✓");
    expect(optionButton("Venus").textContent).not.toContain("✓");
    expect(mocks.triggerAnimation).toHaveBeenCalledWith("SPEED_TRIVIA_WRONG");
  });

  it("plays Correct only once the reply says so, with the server's points", async () => {
    saveSnapshot([Q1, Q2]);
    await enterQuestionTwo();

    fireEvent.click(optionButton("Mars"));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(mocks.triggerAnimation).not.toHaveBeenCalled();

    await act(async () => {
      releaseAnswer({ isCorrect: true, correctAnswer: 1, saved: true, pointsAwarded: 6, multiplierApplied: 3 });
    });

    await screen.findByText("Correct! +6 points (3x Challenge multiplier active).");
    expect(mocks.triggerAnimation).toHaveBeenCalledWith("SPEED_TRIVIA_CORRECT");
    expect(mocks.updateAnimationPayload).toHaveBeenCalledWith(1, { pointsAwarded: 6 });
    expect(optionButton("Mars").textContent).toContain("✓");
  });

  it("always marks a pick order 1", async () => {
    saveSnapshot([Q1, Q2]);
    await enterQuestionTwo();

    fireEvent.click(optionButton("Jupiter"));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]).toEqual({ userId: "user-1", questionId: "q-2", answer: 2, timeElapsed: 0, order: 1 });
  });

  // Phase 4c.8 (post-4c.4 review #1): the POST refuses an unmarked pick, so a round saved before D31 is dropped.
  it.each([
    ["no question marked", [{ ...Q1, order: undefined }, { ...Q2, order: undefined, correctAnswer: 1 }]],
    ["one question unmarked", [Q1, { ...Q2, order: undefined }]],
  ])("ignores a saved round with %s and loads fresh questions", async (_label, questions) => {
    saveSnapshot(questions);
    render(createElement(TriviaGame, { selectedCategory: null }));
    await waitFor(() => expect(gets).toBeGreaterThan(0));
    // No forfeit for the stale round, and nothing unmarked is ever posted.
    expect(posts).toEqual([]);
    expect(window.localStorage.getItem(SNAPSHOT_KEY)).toBeNull();
  });

  it("shows the error and no reveal when the POST fails", async () => {
    saveSnapshot([Q1, Q2]);
    await enterQuestionTwo();

    fireEvent.click(optionButton("Venus"));
    await waitFor(() => expect(posts).toHaveLength(2));
    await act(async () => {
      failAnswer("Failed to submit answer.");
    });

    await screen.findByText("Failed to submit answer.");
    expect(screen.queryByText("✓")).toBeNull();
    expect(screen.queryByRole("button", { name: "Report" })).toBeNull();
    expect(screen.queryByText(/Correct answer/)).toBeNull();
    expect(mocks.triggerAnimation).not.toHaveBeenCalled();
  });
});
