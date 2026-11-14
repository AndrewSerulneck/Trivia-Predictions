import { describe, expect, it } from "vitest";
import { formatNextLiveTriviaLine } from "@/lib/venueScreenIdleLine";

// Local-time constructors so the expectations hold in any time zone the tests run in.
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const time = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

describe("formatNextLiveTriviaLine", () => {
  const now = at(2026, 11, 12, 15); // a Thursday afternoon

  it("says Today for a game later the same day", () => {
    const start = at(2026, 11, 12, 20);
    expect(formatNextLiveTriviaLine(new Date(start).toISOString(), now)).toBe(`Live Trivia · Today ${time(start)}`);
  });

  it("says Tomorrow past midnight, even when it is under 24 hours away", () => {
    const start = at(2026, 11, 13, 9);
    expect(formatNextLiveTriviaLine(new Date(start).toISOString(), now)).toBe(`Live Trivia · Tomorrow ${time(start)}`);
  });

  it("names the weekday after that", () => {
    const start = at(2026, 11, 17, 20); // Tuesday
    const line = formatNextLiveTriviaLine(new Date(start).toISOString(), now) ?? "";
    expect(line.startsWith("Live Trivia · ")).toBe(true);
    expect(line).toContain(new Date(start).toLocaleDateString(undefined, { weekday: "long" }));
    expect(line.endsWith(time(start))).toBe(true);
  });

  it("returns nothing when no game is scheduled, the time is bad, or it has started", () => {
    expect(formatNextLiveTriviaLine(null, now)).toBeNull();
    expect(formatNextLiveTriviaLine(undefined, now)).toBeNull();
    expect(formatNextLiveTriviaLine("not a date", now)).toBeNull();
    expect(formatNextLiveTriviaLine(new Date(now - 1_000).toISOString(), now)).toBeNull();
  });
});
