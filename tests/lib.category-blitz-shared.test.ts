import { afterEach, describe, expect, it } from "vitest";
import {
  ROUND_START_DRIVE_SLACK_MS,
  anotherRoundFollows,
  categoryBlitzChannelName,
  isGlobalRoomEnabled,
  nextRoundStartAtMs,
  roundDurationSeconds,
  roundFitsWindow,
  sessionWindowEndMs,
} from "@/lib/categoryBlitzShared";
import { CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID, resolveCategoryBlitzRoomId } from "@/lib/categoryBlitzRoom";

// Regression coverage for the Phase 7 collapse (4 near-duplicate branches → 2):
// resolve { roundDurationSeconds, intermissionSeconds } once, then apply a
// single scored/unscored formula. These cases enumerate the original 4
// branches (continuous × scored/unscored, scheduled × scored/unscored) and
// pin their expected output so a future edit can't silently change the math.
describe("nextRoundStartAtMs", () => {
  const startedAt = "2026-07-02T20:00:00.000Z";
  const scoredAt = "2026-07-02T20:03:05.000Z";

  it("continuous timing, scored round: scoredAt + continuous intermissionSeconds", () => {
    const result = nextRoundStartAtMs({ scoredAt, startedAt }, false, {
      roundDurationSeconds: 150,
      intermissionSeconds: 200,
    });
    expect(result).toBe(Date.parse(scoredAt) + 200 * 1000);
  });

  it("continuous timing, unscored round: startedAt + (round + intermission)", () => {
    const result = nextRoundStartAtMs({ scoredAt: null, startedAt }, false, {
      roundDurationSeconds: 150,
      intermissionSeconds: 200,
    });
    expect(result).toBe(Date.parse(startedAt) + (150 + 200) * 1000);
  });

  it("scheduled timing (no continuousTiming), scored round: scoredAt + shared intermissionSeconds", () => {
    const result = nextRoundStartAtMs({ scoredAt, startedAt }, false, null);
    // Shared constants: ROUND_DURATION_SECONDS=180, ROUND_INTERVAL_SECONDS=360 → intermission=180.
    expect(result).toBe(Date.parse(scoredAt) + 180 * 1000);
  });

  it("scheduled timing (no continuousTiming), unscored round: startedAt + shared roundIntervalSeconds", () => {
    const result = nextRoundStartAtMs({ scoredAt: null, startedAt }, false, null);
    expect(result).toBe(Date.parse(startedAt) + 360 * 1000);
  });

  it("scheduled timing, test mode, unscored round: startedAt + test-mode interval", () => {
    const result = nextRoundStartAtMs({ scoredAt: null, startedAt }, true, undefined);
    // TEST_MODE_ROUND_DURATION_SECONDS=30 + TEST_MODE_SECONDS=10 = 40.
    expect(result).toBe(Date.parse(startedAt) + 40 * 1000);
  });

  it("scheduled timing, test mode, scored round: scoredAt + test-mode intermission", () => {
    const result = nextRoundStartAtMs({ scoredAt, startedAt }, true, undefined);
    // Test-mode intermission = roundIntervalSeconds(40) - roundDurationSeconds(30) = 10.
    expect(result).toBe(Date.parse(scoredAt) + 10 * 1000);
  });
});

// Reversibility contract for the global-room feature: the flag alone flips
// pooling on/off, and OFF must be the exact identity (today's per-venue
// isolation). See docs/category-blitz-global-room-plan.md.
describe("resolveCategoryBlitzRoomId (global-room flag)", () => {
  const original = process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM;
    else process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM = original;
  });

  it("flag off (unset): identity — every venue is its own room", () => {
    delete process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM;
    expect(isGlobalRoomEnabled()).toBe(false);
    expect(resolveCategoryBlitzRoomId("venue-1")).toBe("venue-1");
    expect(resolveCategoryBlitzRoomId("some-other-venue")).toBe("some-other-venue");
  });

  it("flag explicitly falsy: still identity", () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM = "0";
    expect(isGlobalRoomEnabled()).toBe(false);
    expect(resolveCategoryBlitzRoomId("venue-1")).toBe("venue-1");
  });

  it("flag on: every venue collapses onto the one shared hidden room", () => {
    process.env.NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM = "true";
    expect(isGlobalRoomEnabled()).toBe(true);
    expect(resolveCategoryBlitzRoomId("venue-1")).toBe(CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID);
    expect(resolveCategoryBlitzRoomId("some-other-venue")).toBe(CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID);
  });
});

// Concealment contract: the realtime channel name is the one string derived
// from a (possibly pooled) room id that reaches the client, so it must never
// embed the raw id — least of all the hidden room id `hc-cbz-live`.
describe("categoryBlitzChannelName", () => {
  it("never embeds the raw venue/room id verbatim", () => {
    expect(categoryBlitzChannelName("venue-1")).not.toContain("venue-1");
    expect(categoryBlitzChannelName(CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID)).not.toContain("hc-cbz-live");
    expect(categoryBlitzChannelName(CATEGORY_BLITZ_GLOBAL_ROOM_VENUE_ID)).not.toContain("global");
  });

  it("is deterministic and collision-distinct per id (so broadcaster and subscriber meet)", () => {
    expect(categoryBlitzChannelName("venue-1")).toBe(categoryBlitzChannelName("venue-1"));
    expect(categoryBlitzChannelName("venue-1")).not.toBe(categoryBlitzChannelName("venue-2"));
    expect(categoryBlitzChannelName("venue-1").startsWith("category-blitz-session:")).toBe(true);
  });
});

// docs/category-blitz-letter-die-plan.md Phase 11.1c: the engine's canFitAnother
// (lib/categoryBlitz.ts) and the client share this one function.
describe("roundFitsWindow", () => {
  const start = Date.parse("2026-07-02T20:00:00.000Z");
  const end = start + roundDurationSeconds(false) * 1000;
  it("fits with room to spare, and exactly at the end (<=)", () => {
    expect(roundFitsWindow(start - 60_000, end, false)).toBe(true);
    expect(roundFitsWindow(start, end, false)).toBe(true);
  });
  it("one millisecond over does not fit", () => {
    expect(roundFitsWindow(start + 1, end, false)).toBe(false);
  });
  it("test mode uses the shortened round", () => {
    expect(roundFitsWindow(start, start + roundDurationSeconds(true) * 1000, true)).toBe(true);
    expect(roundFitsWindow(start, start + roundDurationSeconds(true) * 1000, false)).toBe(false);
  });
});

// docs/category-blitz-letter-die-plan.md Phase 13.4: the one "earlier of the live
// window end and the frozen scheduledEndAt" rule, shared by both engines and
// anotherRoundFollows.
describe("sessionWindowEndMs", () => {
  const live = Date.parse("2026-07-02T21:30:00.000Z");
  it("an extended window: the frozen end wins", () => {
    expect(sessionWindowEndMs(live, "2026-07-02T21:00:00.000Z")).toBe(Date.parse("2026-07-02T21:00:00.000Z"));
  });
  it("a shortened window: the live end wins", () => {
    expect(sessionWindowEndMs(live, "2026-07-02T22:00:00.000Z")).toBe(live);
  });
  it("no or unparsable frozen end: the live end only", () => {
    expect(sessionWindowEndMs(live, null)).toBe(live);
    expect(sessionWindowEndMs(live, "not a date")).toBe(live);
  });
});

// docs/category-blitz-letter-die-plan.md Phases 7.2 + 11.1b/c + 12.1a: the letter
// die tumbles over a break only if another round follows it. Scheduled sessions
// end at the earlier of the LIVE window end and the session's frozen
// scheduledEndAt, and are judged when the engine would really start the round:
// the due time plus ROUND_START_DRIVE_SLACK_MS.
describe("anotherRoundFollows", () => {
  const round = { startedAt: "2026-07-02T20:00:00.000Z", scoredAt: "2026-07-02T20:03:05.000Z" };
  const nextStart = nextRoundStartAtMs(round, false);
  const fitsExactlyAt = nextStart + ROUND_START_DRIVE_SLACK_MS + roundDurationSeconds(false) * 1000;
  const scheduled = { sessionType: "scheduled" as const, testMode: false, scheduledEndAt: null };
  const iso = (ms: number) => new Date(ms).toISOString();

  it("continuous: always, with no window", () => {
    expect(anotherRoundFollows({ sessionType: "continuous", testMode: false, scheduledEndAt: null }, round, null)).toBe(true);
    expect(anotherRoundFollows({ sessionType: "continuous", testMode: false, scheduledEndAt: null }, round, undefined)).toBe(true);
  });

  it("scheduled, no open window (null) or an older server (missing): never", () => {
    expect(anotherRoundFollows(scheduled, round, null)).toBe(false);
    expect(anotherRoundFollows(scheduled, round, undefined)).toBe(false);
    expect(anotherRoundFollows(scheduled, round, "not a date")).toBe(false);
  });

  it("scheduled: fits with the slack, exactly at the end (<=, like the engine)", () => {
    expect(anotherRoundFollows(scheduled, round, iso(fitsExactlyAt))).toBe(true);
    expect(anotherRoundFollows(scheduled, round, iso(fitsExactlyAt + 3_600_000))).toBe(true);
  });

  it("scheduled: fits only without the slack → the last round (11.1c)", () => {
    const fitsOnlyAtDueTime = nextStart + roundDurationSeconds(false) * 1000;
    expect(anotherRoundFollows(scheduled, round, iso(fitsOnlyAtDueTime))).toBe(false);
    expect(anotherRoundFollows(scheduled, round, iso(fitsExactlyAt - 1))).toBe(false);
  });

  it("scheduled: an unscored round anchors on startedAt + interval", () => {
    const unscored = { startedAt: round.startedAt, scoredAt: null };
    const unscoredEnd = nextRoundStartAtMs(unscored, false) + ROUND_START_DRIVE_SLACK_MS + roundDurationSeconds(false) * 1000;
    expect(anotherRoundFollows(scheduled, unscored, iso(unscoredEnd))).toBe(true);
    expect(anotherRoundFollows(scheduled, unscored, iso(unscoredEnd - 1))).toBe(false);
  });

  it("scheduled test-mode sessions use the shortened round and intermission", () => {
    const testEnd = nextRoundStartAtMs(round, true) + ROUND_START_DRIVE_SLACK_MS + roundDurationSeconds(true) * 1000;
    expect(anotherRoundFollows({ sessionType: "scheduled", testMode: true, scheduledEndAt: null }, round, iso(testEnd))).toBe(true);
    expect(anotherRoundFollows({ sessionType: "scheduled", testMode: true, scheduledEndAt: null }, round, iso(testEnd - 1))).toBe(false);
    // The same end time judged at full length would not fit.
    expect(anotherRoundFollows(scheduled, round, iso(testEnd))).toBe(false);
  });

  // 12.1a: the engine still closes the session at its frozen scheduledEndAt
  // (isStaleAutoSession), so a window extended mid-session doesn't buy a round.
  it("12.1a live window later than scheduledEndAt: judged against scheduledEndAt", () => {
    const later = iso(fitsExactlyAt + 3_600_000);
    expect(anotherRoundFollows({ ...scheduled, scheduledEndAt: iso(fitsExactlyAt - 1) }, round, later)).toBe(false);
    expect(anotherRoundFollows({ ...scheduled, scheduledEndAt: iso(fitsExactlyAt) }, round, later)).toBe(true);
  });

  it("12.1a live window earlier than scheduledEndAt: judged against the live window", () => {
    const frozenLater = { ...scheduled, scheduledEndAt: iso(fitsExactlyAt + 3_600_000) };
    expect(anotherRoundFollows(frozenLater, round, iso(fitsExactlyAt - 1))).toBe(false);
    expect(anotherRoundFollows(frozenLater, round, iso(fitsExactlyAt))).toBe(true);
  });

  it("12.1a scheduledEndAt null or unreadable: the live window alone", () => {
    expect(anotherRoundFollows({ ...scheduled, scheduledEndAt: null }, round, iso(fitsExactlyAt))).toBe(true);
    expect(anotherRoundFollows({ ...scheduled, scheduledEndAt: "not a date" }, round, iso(fitsExactlyAt))).toBe(true);
    expect(anotherRoundFollows({ ...scheduled, scheduledEndAt: null }, round, iso(fitsExactlyAt - 1))).toBe(false);
  });

  it("12.1a a frozen end never stands in for a missing live window", () => {
    expect(anotherRoundFollows({ ...scheduled, scheduledEndAt: iso(fitsExactlyAt + 3_600_000) }, round, null)).toBe(false);
  });
});
