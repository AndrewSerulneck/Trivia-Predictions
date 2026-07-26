import { describe, expect, it, vi } from "vitest";

// Cycle boundaries decide when a reward's winner_quota resets — i.e. when the
// venue starts paying out a fresh batch of real coupons. Before the terms-sentence
// rebuild (docs/rewards-terms-sentence-plan.md Phase 1) computeCycleStart was
// weekly-anchored for EVERY recurring campaign, so a daily/monthly/yearly cadence
// silently behaved weekly. These tests pin the calendar-anchored behavior across
// the cases flat-millisecond arithmetic gets wrong: DST transitions, short and
// long months, and leap years.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));

import { computeCycleEnd, computeCycleStart } from "@/lib/challengeCampaigns";
import type { CampaignRecurringType, ChallengeCampaign } from "@/types";

const NY = "America/New_York";

/**
 * A campaign shaped like a wizard-created Reward: single-day recurring, no
 * explicit start/end time (so cycle boundaries land on local midnight), anchored
 * on the day its Live Trivia game runs.
 */
function makeReward(overrides: Partial<ChallengeCampaign> = {}): ChallengeCampaign {
  return {
    id: "camp-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    name: "Live Trivia Challenge",
    rules: "Earn 500 points in Live Trivia",
    venueIds: ["venue-1"],
    scheduleType: "recurring",
    activeDays: ["tue"],
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    leaderboardDisplayLimit: 10,
    leaderboardTiebreaker: "latest_activity",
    pointMultiplier: 1,
    pointsRequiredToWin: 500,
    recurringType: "weekly",
    winCondition: "points_threshold",
    winnerQuota: 1,
    isActive: true,
    ...overrides,
  };
}

const at = (iso: string): Date => new Date(iso);

/** Render an instant as local wall-clock in `timezone`, for readable assertions. */
function localOf(date: Date, timezone = NY): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}`;
}

const cycle = (recurringType: CampaignRecurringType, nowIso: string, timezone = NY) => {
  const campaign = makeReward({ recurringType });
  const start = computeCycleStart(campaign, at(nowIso), timezone);
  return {
    start: localOf(start, timezone),
    end: localOf(computeCycleEnd(campaign, start, timezone), timezone),
  };
};

describe("weekly cycles are unchanged", () => {
  it("anchors on activeDays[0] at local midnight", () => {
    // Wed 2026-07-15 14:30 ET → the cycle that began Tue 2026-07-14 00:00 ET.
    const campaign = makeReward({ recurringType: "weekly" });
    const start = computeCycleStart(campaign, at("2026-07-15T18:30:00.000Z"), NY);
    expect(localOf(start)).toBe("2026-07-14 00:00");
  });

  it("rolls back a full week when the anchor day is still ahead", () => {
    // Mon 2026-07-13 — Tuesday hasn't arrived, so the open cycle began the PRIOR Tuesday.
    const campaign = makeReward({ recurringType: "weekly" });
    const start = computeCycleStart(campaign, at("2026-07-13T18:30:00.000Z"), NY);
    expect(localOf(start)).toBe("2026-07-07 00:00");
  });
});

describe("daily cycles", () => {
  it("runs local midnight to local midnight", () => {
    expect(cycle("daily", "2026-07-15T18:30:00.000Z")).toEqual({
      start: "2026-07-15 00:00",
      end: "2026-07-16 00:00",
    });
  });

  it("uses the LOCAL day, not the UTC day", () => {
    // 2026-07-16T02:00Z is still 10pm on the 15th in New York.
    expect(cycle("daily", "2026-07-16T02:00:00.000Z")).toEqual({
      start: "2026-07-15 00:00",
      end: "2026-07-16 00:00",
    });
  });

  it("keeps a spring-forward day one calendar day long", () => {
    // 2026-03-08 is the US spring-forward date: the local day is only 23 hours.
    const boundaries = cycle("daily", "2026-03-08T17:00:00.000Z");
    expect(boundaries).toEqual({ start: "2026-03-08 00:00", end: "2026-03-09 00:00" });

    const campaign = makeReward({ recurringType: "daily" });
    const start = computeCycleStart(campaign, at("2026-03-08T17:00:00.000Z"), NY);
    const end = computeCycleEnd(campaign, start, NY);
    // 23 real hours — a flat +86400000ms step would overshoot into the 9th.
    expect(end.getTime() - start.getTime()).toBe(23 * 3600000);
  });

  it("keeps a fall-back day one calendar day long", () => {
    // 2026-11-01 is the US fall-back date: the local day is 25 hours.
    const campaign = makeReward({ recurringType: "daily" });
    const start = computeCycleStart(campaign, at("2026-11-01T16:00:00.000Z"), NY);
    const end = computeCycleEnd(campaign, start, NY);
    expect(localOf(start)).toBe("2026-11-01 00:00");
    expect(localOf(end)).toBe("2026-11-02 00:00");
    expect(end.getTime() - start.getTime()).toBe(25 * 3600000);
  });
});

describe("monthly cycles", () => {
  it("runs the 1st to the 1st", () => {
    expect(cycle("monthly", "2026-07-15T18:30:00.000Z")).toEqual({
      start: "2026-07-01 00:00",
      end: "2026-08-01 00:00",
    });
  });

  it("handles a 31-day month", () => {
    expect(cycle("monthly", "2026-01-20T18:30:00.000Z")).toEqual({
      start: "2026-01-01 00:00",
      end: "2026-02-01 00:00",
    });
  });

  it("handles a 28-day February", () => {
    expect(cycle("monthly", "2026-02-20T18:30:00.000Z")).toEqual({
      start: "2026-02-01 00:00",
      end: "2026-03-01 00:00",
    });
  });

  it("handles a 29-day leap February", () => {
    expect(cycle("monthly", "2028-02-20T18:30:00.000Z")).toEqual({
      start: "2028-02-01 00:00",
      end: "2028-03-01 00:00",
    });
  });

  it("rolls into the previous year from January", () => {
    const campaign = makeReward({ recurringType: "monthly" });
    const start = computeCycleStart(campaign, at("2026-01-01T10:00:00.000Z"), NY);
    // 2026-01-01T10:00Z is 05:00 ET on Jan 1 — inside January's cycle.
    expect(localOf(start)).toBe("2026-01-01 00:00");
    expect(localOf(computeCycleEnd(campaign, start, NY))).toBe("2026-02-01 00:00");
  });

  it("puts the last local minute of a month in that month's cycle", () => {
    // 2026-08-01T03:30Z is 23:30 ET on July 31.
    expect(cycle("monthly", "2026-08-01T03:30:00.000Z")).toEqual({
      start: "2026-07-01 00:00",
      end: "2026-08-01 00:00",
    });
  });
});

describe("yearly cycles", () => {
  it("runs Jan 1 to Jan 1", () => {
    expect(cycle("yearly", "2026-07-15T18:30:00.000Z")).toEqual({
      start: "2026-01-01 00:00",
      end: "2027-01-01 00:00",
    });
  });

  it("spans 366 days across a leap year", () => {
    const campaign = makeReward({ recurringType: "yearly" });
    const start = computeCycleStart(campaign, at("2028-06-01T12:00:00.000Z"), NY);
    const end = computeCycleEnd(campaign, start, NY);
    expect(localOf(start)).toBe("2028-01-01 00:00");
    expect(localOf(end)).toBe("2029-01-01 00:00");
    expect(Math.round((end.getTime() - start.getTime()) / 86400000)).toBe(366);
  });

  it("puts the last local minute of a year in that year's cycle", () => {
    // 2027-01-01T04:00Z is 23:00 ET on Dec 31, 2026.
    expect(cycle("yearly", "2027-01-01T04:00:00.000Z")).toEqual({
      start: "2026-01-01 00:00",
      end: "2027-01-01 00:00",
    });
  });
});

describe("non-midnight startTime", () => {
  it("rolls back a period when the boundary time hasn't been reached yet", () => {
    // A daily cycle anchored at 18:00 local: at 15:00 ET the OPEN cycle is
    // yesterday's 18:00 → today's 18:00.
    const campaign = makeReward({ recurringType: "daily", startTime: "18:00" });
    const start = computeCycleStart(campaign, at("2026-07-15T19:00:00.000Z"), NY);
    expect(localOf(start)).toBe("2026-07-14 18:00");
    expect(localOf(computeCycleEnd(campaign, start, NY))).toBe("2026-07-15 18:00");
  });

  it("uses the current period once the boundary time has passed", () => {
    const campaign = makeReward({ recurringType: "daily", startTime: "18:00" });
    const start = computeCycleStart(campaign, at("2026-07-15T23:00:00.000Z"), NY);
    expect(localOf(start)).toBe("2026-07-15 18:00");
  });
});

describe("other timezones", () => {
  it("anchors a monthly cycle on the venue's own calendar", () => {
    const campaign = makeReward({ recurringType: "monthly" });
    // 2026-07-01T02:00Z is already 12:00 on July 1 in Sydney but still June 30 in NY.
    const sydney = computeCycleStart(campaign, at("2026-07-01T02:00:00.000Z"), "Australia/Sydney");
    const newYork = computeCycleStart(campaign, at("2026-07-01T02:00:00.000Z"), NY);
    expect(localOf(sydney, "Australia/Sydney")).toBe("2026-07-01 00:00");
    expect(localOf(newYork, NY)).toBe("2026-06-01 00:00");
  });
});

describe("one-off campaigns", () => {
  it("still uses the epoch sentinel when there is no start date", () => {
    const campaign = makeReward({ recurringType: "none", activeDays: [] });
    expect(computeCycleStart(campaign, at("2026-07-15T18:30:00.000Z"), NY).getTime()).toBe(0);
  });
});
