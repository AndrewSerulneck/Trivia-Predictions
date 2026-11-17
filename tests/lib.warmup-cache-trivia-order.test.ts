// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { readWarmTriviaCache } from "@/lib/warmupCache";

// Phase 4c.8 (post-4c.4 review #1, docs/speed-trivia-backlog-and-quality-plan.md): the player POST refuses a pick
// without `order: 1`, so Speed questions warmed by a pre-D31 Venue Home (stored order, no `order`) are treated as no
// cache, and the game screen runs the GET instead.

const KEY = "tp:warm:trivia:venue-1:user-1";
const MARKED = { id: "q-1", question: "Which planet is red?", options: ["Venus", "Mars"], order: 1 };

const save = (questions: unknown[], fetchedAt = Date.now()) =>
  window.sessionStorage.setItem(KEY, JSON.stringify({ fetchedAt, userId: "user-1", venueId: "venue-1", questions }));

beforeEach(() => window.sessionStorage.clear());

describe("readWarmTriviaCache", () => {
  it("returns questions that are all marked order 1", () => {
    save([MARKED, { ...MARKED, id: "q-2" }]);
    expect(readWarmTriviaCache("user-1", "venue-1")?.questions).toHaveLength(2);
  });

  it("treats a cache with any unmarked question as empty", () => {
    save([MARKED, { id: "q-2", question: "Old?", options: ["A", "B"], correctAnswer: 0 }]);
    expect(readWarmTriviaCache("user-1", "venue-1")).toBeNull();
  });

  it("treats a cache with no questions array as empty", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ fetchedAt: Date.now(), userId: "user-1", venueId: "venue-1" }));
    expect(readWarmTriviaCache("user-1", "venue-1")).toBeNull();
  });

  it("still expires after five minutes", () => {
    save([MARKED], Date.now() - 6 * 60 * 1000);
    expect(readWarmTriviaCache("user-1", "venue-1")).toBeNull();
  });
});
