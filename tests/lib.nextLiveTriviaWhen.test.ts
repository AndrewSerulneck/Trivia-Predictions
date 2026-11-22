// The Next Live Trivia slide's wording (docs/fire-tv-app-plan.md D12, Phase 9 step 3). The TV formats in its own
// zone, so these run in New York, the venues' zone, including both 2026 daylight-saving switches.
process.env.TZ = "America/New_York";

import { describe, expect, it } from "vitest";
import { formatNextLiveTriviaShort, formatNextLiveTriviaWhen } from "@/lib/venueScreenIdleLine";

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const when = (startMs: number, nowMs: number, recurringDays?: string[]) =>
  formatNextLiveTriviaWhen({ startsAt: iso(startMs), recurringDays }, nowMs);

// Tuesday 2026-11-17, 3:00 PM. The weekly game is Thursday 2026-11-19, 8:00 PM.
const tuesday = at(2026, 11, 17, 15);
const thursday8pm = at(2026, 11, 19, 20);

describe("formatNextLiveTriviaWhen", () => {
  it("runs in New York", () => {
    expect(new Date(tuesday).getTimezoneOffset()).toBe(300);
  });

  it("weekly, 1–6 days away: Every Thursday", () => {
    expect(when(thursday8pm, tuesday, ["thu"])).toEqual({ line: "Every Thursday · 8:00 PM", showCountdown: false });
    // Tomorrow, but weekly: still "Every".
    expect(when(at(2026, 11, 18, 20), tuesday, ["wed"])?.line).toBe("Every Wednesday · 8:00 PM");
    // Six days away.
    expect(when(at(2026, 11, 23, 20), tuesday, ["mon"])?.line).toBe("Every Monday · 8:00 PM");
  });

  it("weekly on several days lists them Monday first", () => {
    expect(when(thursday8pm, tuesday, ["thu", "tue"])?.line).toBe("Every Tue & Thu · 8:00 PM");
    expect(when(thursday8pm, tuesday, ["fri", "mon", "wed"])?.line).toBe("Every Mon, Wed & Fri · 8:00 PM");
    expect(when(thursday8pm, tuesday, ["sun", "sat"])?.line).toBe("Every Sat & Sun · 8:00 PM");
  });

  it("one-off: Tomorrow, then the weekday", () => {
    expect(when(at(2026, 11, 18, 20), tuesday)?.line).toBe("Tomorrow · 8:00 PM");
    expect(when(thursday8pm, tuesday)?.line).toBe("Thursday · 8:00 PM");
    expect(when(thursday8pm, tuesday, [])?.line).toBe("Thursday · 8:00 PM");
    expect(when(at(2026, 11, 23, 19, 30), tuesday)?.line).toBe("Monday · 7:30 PM");
  });

  it("7 or more days away shows the date, weekly or not (a skipped week)", () => {
    expect(when(at(2026, 11, 24, 20), tuesday)?.line).toBe("Nov 24 · 8:00 PM");
    expect(when(at(2026, 12, 3, 20), tuesday, ["thu"])?.line).toBe("Dec 3 · 8:00 PM");
  });

  it("today: Tonight from 5 PM, otherwise Today, both with a countdown", () => {
    expect(when(at(2026, 11, 17, 20), at(2026, 11, 17, 10))).toEqual({ line: "Tonight · 8:00 PM", showCountdown: true });
    expect(when(at(2026, 11, 17, 17), at(2026, 11, 17, 10))?.line).toBe("Tonight · 5:00 PM");
    expect(when(at(2026, 11, 17, 16, 59), at(2026, 11, 17, 10))?.line).toBe("Today · 4:59 PM");
    expect(when(at(2026, 11, 17, 15), at(2026, 11, 17, 10), ["tue"])).toEqual({ line: "Today · 3:00 PM", showCountdown: true });
  });

  it("midnight: a 12:30 AM game is tomorrow until midnight, then today", () => {
    const start = at(2026, 11, 20, 0, 30);
    expect(when(start, at(2026, 11, 19, 23, 59))?.line).toBe("Tomorrow · 12:30 AM");
    expect(when(start, at(2026, 11, 20, 0, 1))).toEqual({ line: "Today · 12:30 AM", showCountdown: true });
  });

  it("counts calendar days across daylight-saving changes", () => {
    // Fall back: Sun 2026-11-01. Saturday 10 PM → Sunday 8 PM is 23 h of wall time but 1 calendar day.
    expect(when(at(2026, 11, 1, 20), at(2026, 10, 31, 22))?.line).toBe("Tomorrow · 8:00 PM");
    expect(when(at(2026, 11, 6, 20), at(2026, 10, 31, 22))?.line).toBe("Friday · 8:00 PM");
    expect(when(at(2026, 11, 6, 20), at(2026, 10, 31, 22), ["fri"])?.line).toBe("Every Friday · 8:00 PM");
    expect(when(at(2026, 11, 7, 20), at(2026, 10, 31, 22), ["sat"])?.line).toBe("Nov 7 · 8:00 PM");
    // Spring forward: Sun 2026-03-08.
    expect(when(at(2026, 3, 8, 20), at(2026, 3, 7, 23, 30))?.line).toBe("Tomorrow · 8:00 PM");
    expect(when(at(2026, 3, 13, 20), at(2026, 3, 7, 23, 30))?.line).toBe("Friday · 8:00 PM");
    expect(when(at(2026, 3, 14, 20), at(2026, 3, 7, 23, 30))?.line).toBe("Mar 14 · 8:00 PM");
    expect(when(at(2026, 3, 15, 20), at(2026, 3, 8, 1))?.line).toBe("Mar 15 · 8:00 PM");
  });

  it("returns null for a past, started, missing or bad time (the slide is skipped)", () => {
    expect(formatNextLiveTriviaWhen(null, tuesday)).toBeNull();
    expect(formatNextLiveTriviaWhen({ startsAt: null }, tuesday)).toBeNull();
    expect(formatNextLiveTriviaWhen({ startsAt: "nope" }, tuesday)).toBeNull();
    expect(when(tuesday, tuesday)).toBeNull();
    expect(when(tuesday - 1, tuesday, ["tue"])).toBeNull();
  });
});

describe("formatNextLiveTriviaShort (the ticker's segment)", () => {
  it("uses a short day", () => {
    expect(formatNextLiveTriviaShort(iso(thursday8pm), tuesday)).toBe("Live Trivia · Thu 8:00 PM");
    expect(formatNextLiveTriviaShort(iso(at(2026, 11, 17, 20)), tuesday)).toBe("Live Trivia · Tonight 8:00 PM");
    expect(formatNextLiveTriviaShort(iso(at(2026, 11, 26, 20)), tuesday)).toBe("Live Trivia · Nov 26 8:00 PM");
    expect(formatNextLiveTriviaShort(null, tuesday)).toBeNull();
  });
});
