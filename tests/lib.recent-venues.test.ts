import { describe, expect, it } from "vitest";
import { awayRecentVenues, RECENT_VENUE_WINDOW_DAYS, selectRecentVenues } from "@/lib/recentVenues";

// "Your bars" (away-mode plan D6, Phase C1): a bar stays on the list for 90 days after the last check-in.
const NOW = Date.parse("2026-11-09T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

describe("selectRecentVenues", () => {
  it("is 90 days", () => {
    expect(RECENT_VENUE_WINDOW_DAYS).toBe(90);
  });

  it("keeps bars checked in at within 90 days, newest first, and drops older ones", () => {
    const result = selectRecentVenues(
      [
        { venueId: "old", lastVerifiedAt: daysAgo(91) },
        { venueId: "edge", lastVerifiedAt: daysAgo(90) },
        { venueId: "fresh", lastVerifiedAt: daysAgo(1) },
        { venueId: "mid", lastVerifiedAt: daysAgo(30) },
      ],
      NOW
    );
    expect(result.map((entry) => entry.venueId)).toEqual(["fresh", "mid", "edge"]);
    expect(result[0].lastCheckedInAt).toBe(daysAgo(1));
  });

  it("never lists a bar with no check-in, unless it is the bar a link asked for", () => {
    const rows = [
      { venueId: "never", lastVerifiedAt: null },
      { venueId: "linked", lastVerifiedAt: null },
      { venueId: "ancient", lastVerifiedAt: daysAgo(400) },
    ];
    expect(selectRecentVenues(rows, NOW)).toEqual([]);
    expect(selectRecentVenues(rows, NOW, "linked")).toEqual([{ venueId: "linked", lastCheckedInAt: null }]);
    expect(selectRecentVenues(rows, NOW, "ancient")).toEqual([{ venueId: "ancient", lastCheckedInAt: daysAgo(400) }]);
  });

  it("lists each bar once, with its latest check-in", () => {
    const result = selectRecentVenues(
      [
        { venueId: "bar", lastVerifiedAt: null },
        { venueId: "bar", lastVerifiedAt: daysAgo(100) },
        { venueId: "bar", lastVerifiedAt: daysAgo(5) },
        { venueId: "bar", lastVerifiedAt: "not a date" },
      ],
      NOW
    );
    expect(result).toEqual([{ venueId: "bar", lastCheckedInAt: daysAgo(5) }]);
  });
});

describe("awayRecentVenues", () => {
  const venues = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("lists only recent bars that are out of range, in check-in order", () => {
    const recent = [
      { venueId: "c", lastCheckedInAt: daysAgo(1) },
      { venueId: "a", lastCheckedInAt: daysAgo(2) },
      { venueId: "b", lastCheckedInAt: daysAgo(3) },
    ];
    expect(awayRecentVenues(recent, venues, [{ id: "a" }])).toEqual([{ id: "c" }, { id: "b" }]);
  });

  it("drops a bar that is hidden or gone (not in the visible venue list)", () => {
    expect(awayRecentVenues([{ venueId: "hidden", lastCheckedInAt: daysAgo(1) }], venues, [])).toEqual([]);
  });
});
