import { describe, expect, it } from "vitest";

// The slot model behind the game picker: which scheduled games a "winner of the
// game" reward is pinned to, and what cadence/quota that selection implies. Two
// things carry real money here — a null selection must keep meaning "award at
// every game" (every reward created before this column existed), and a
// client-sent selection must never widen past the venue's real schedule. See
// docs/rewards-game-winner-picker-plan.md Phase 2.

import {
  deriveGameWinnerTerms,
  describeCampaignGameWinnerTerms,
  describeGameWinnerSlots,
  enumerateGameSlots,
  normalizeGameWinnerSlots,
  occurrenceMatchesSlots,
  selectAllRecurringSlots,
  serializeGameWinnerSlots,
  scheduleRunWeekdays,
  slotKey,
  validateGameWinnerSlots,
  weekdayForOccurrenceDate,
  weekdaysForSlots,
  type RewardGameScheduleShape,
} from "@/lib/rewardGameSlots";

const TZ = "America/New_York";

// 2026-08-04T22:00Z = Tuesday 6:00 PM in New York.
const tuesday6pm: RewardGameScheduleShape = {
  scheduleId: "sched-tue-6",
  title: "Trivia Night",
  recurringType: "weekly",
  weekdays: ["tue"],
  startTime: "2026-08-04T22:00:00.000Z",
  timezone: TZ,
};
// Same weekday, later slot — the case that forces {scheduleId, weekday} pairs.
const tuesday9pm: RewardGameScheduleShape = {
  ...tuesday6pm,
  scheduleId: "sched-tue-9",
  title: "Late Trivia",
  startTime: "2026-08-05T01:00:00.000Z",
};
const tueThu: RewardGameScheduleShape = {
  ...tuesday6pm,
  scheduleId: "sched-tue-thu",
  weekdays: ["tue", "thu"],
};
const everyDay: RewardGameScheduleShape = {
  ...tuesday6pm,
  scheduleId: "sched-daily",
  recurringType: "daily",
  weekdays: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
};
const oneOff: RewardGameScheduleShape = {
  ...tuesday6pm,
  scheduleId: "sched-one-off",
  title: "Trivia Fundraiser",
  recurringType: "none",
};

describe("enumerateGameSlots", () => {
  it("expands a weekly schedule into one slot per weekday it runs on", () => {
    const slots = enumerateGameSlots([tueThu]);
    expect(slots.map((slot) => slot.weekday)).toEqual(["tue", "thu"]);
    expect(slots.every((slot) => slot.recurring)).toBe(true);
    expect(slots[0].timeLabel).toBe("6:00 PM");
    expect(slots[0].label).toBe("Tuesday 6:00 PM — Trivia Night");
  });

  it("keeps two schedules on the same weekday independently selectable", () => {
    const slots = enumerateGameSlots([tuesday6pm, tuesday9pm]);
    expect(slots).toHaveLength(2);
    expect(slots.map(slotKey)).toEqual(["sched-tue-6:tue", "sched-tue-9:tue"]);
    expect(slots[1].timeLabel).toBe("9:00 PM");
  });

  it("expands a daily schedule into all seven weekdays", () => {
    expect(enumerateGameSlots([everyDay])).toHaveLength(7);
  });

  it("gives a one-off game a single dated slot", () => {
    const [slot] = enumerateGameSlots([oneOff]);
    expect(slot.recurring).toBe(false);
    expect(slot.weekday).toBe("tue");
    expect(slot.dateLabel).toBe("Tue, Aug 4");
    expect(slot.label).toBe("Tue, Aug 4 6:00 PM — Trivia Fundraiser");
  });

  it("labels times in the schedule's own timezone, not the runtime's", () => {
    const [slot] = enumerateGameSlots([{ ...tuesday6pm, timezone: "America/Los_Angeles" }]);
    expect(slot.timeLabel).toBe("3:00 PM");
  });

  it("skips schedules with no resolvable weekday rather than offering an unpinnable slot", () => {
    expect(enumerateGameSlots([{ ...tuesday6pm, weekdays: [] }])).toEqual([]);
    expect(enumerateGameSlots([{ ...tuesday6pm, weekdays: ["someday"] }])).toEqual([]);
    expect(enumerateGameSlots([{ ...tuesday6pm, scheduleId: "  " }])).toEqual([]);
  });

  // A monthly/yearly schedule is pinnable, as the ONE dated game the engine will
  // actually run. lib/rewards.ts collapses its recurrence to "none" before it
  // gets here; enumerateGameSlots re-checks the raw values so a monthly row can
  // never be presented as a game that repeats every week.
  it("offers a monthly schedule as a single dated slot, not a recurring one", () => {
    const monthly: RewardGameScheduleShape = {
      ...tuesday6pm,
      scheduleId: "sched-monthly",
      title: "Monthly Trivia",
      recurringType: "monthly",
    };
    const slots = enumerateGameSlots([monthly]);
    expect(slots).toHaveLength(1);
    expect(slots[0].recurring).toBe(false);
    expect(slots[0].weekday).toBe("tue");
    expect(slots[0].dateLabel).toBe("Tue, Aug 4");
    expect(slots[0].label).toBe("Tue, Aug 4 6:00 PM — Monthly Trivia");
  });

  it("offers a yearly schedule as a single dated slot too", () => {
    const slots = enumerateGameSlots([
      { ...tuesday6pm, scheduleId: "sched-yearly", recurringType: "yearly" },
    ]);
    expect(slots).toHaveLength(1);
    expect(slots[0].recurring).toBe(false);
  });
});

describe("scheduleRunWeekdays", () => {
  // One derivation shared by the picker, a reward's activeDays, and the
  // schedule-change cascade — two copies would eventually disagree about which
  // games a reward covers.
  const schedule = {
    recurringType: "weekly",
    recurringDays: ["tue", "thu"],
    startTime: "2026-08-04T22:00:00.000Z",
    timezone: TZ,
  };

  it("uses the schedule's explicit days when it has them", () => {
    expect(scheduleRunWeekdays(schedule)).toEqual(["tue", "thu"]);
  });

  it("falls back to the start_time weekday, in the schedule's timezone", () => {
    expect(scheduleRunWeekdays({ ...schedule, recurringDays: [] })).toEqual(["tue"]);
    // 6pm Tuesday in New York is already Wednesday UTC — the zone has to win.
    expect(
      scheduleRunWeekdays({ ...schedule, recurringDays: [], startTime: "2026-08-05T01:00:00.000Z" }),
    ).toEqual(["tue"]);
  });

  it("treats a daily schedule as every weekday", () => {
    expect(scheduleRunWeekdays({ ...schedule, recurringType: "daily", recurringDays: [] })).toEqual([
      "sun", "mon", "tue", "wed", "thu", "fri", "sat",
    ]);
  });

  // The engine (enumerateScheduleOccurrences) runs a monthly/yearly schedule
  // exactly ONCE, at start_time — nothing advances it forward — so for reward
  // purposes it is a single dated game on its own start weekday. Returning []
  // here used to drop these schedules out of the picker entirely, leaving the
  // partner on a "no games scheduled" step with a dead Next button even though
  // the creation context reported the venue as scheduled.
  it("treats monthly and yearly schedules as a single game on their start weekday", () => {
    expect(scheduleRunWeekdays({ ...schedule, recurringType: "monthly" })).toEqual(["tue"]);
    expect(scheduleRunWeekdays({ ...schedule, recurringType: "yearly" })).toEqual(["tue"]);
  });

  it("ignores recurringDays on a monthly/yearly schedule, exactly as the engine does", () => {
    // A stray recurring_days on a monthly row must not read as a weekly game:
    // enumerateScheduleOccurrences never consults recurring_days for these.
    expect(
      scheduleRunWeekdays({ ...schedule, recurringType: "monthly", recurringDays: ["fri", "sat"] }),
    ).toEqual(["tue"]);
  });

  it("still returns nothing for a monthly schedule whose start time is unparseable", () => {
    expect(
      scheduleRunWeekdays({ ...schedule, recurringType: "monthly", startTime: "nope" }),
    ).toEqual([]);
  });

  it("returns nothing for an unparseable start time", () => {
    expect(scheduleRunWeekdays({ ...schedule, recurringDays: [], startTime: "nope" })).toEqual([]);
  });
});

describe("normalizeGameWinnerSlots", () => {
  it("preserves null — the legacy 'award at every game' value", () => {
    expect(normalizeGameWinnerSlots(null)).toBeNull();
    expect(normalizeGameWinnerSlots(undefined)).toBeNull();
  });

  it("falls back to null (every game) rather than to 'no game' on garbage", () => {
    // Failing closed would silently stop a reward the partner is still advertising.
    expect(normalizeGameWinnerSlots([])).toBeNull();
    expect(normalizeGameWinnerSlots("nope")).toBeNull();
    expect(normalizeGameWinnerSlots([{ scheduleId: "", weekday: "tue" }])).toBeNull();
    expect(normalizeGameWinnerSlots([{ scheduleId: "a", weekday: "someday" }])).toBeNull();
  });

  it("parses well-formed slots and drops duplicates", () => {
    expect(
      normalizeGameWinnerSlots([
        { scheduleId: "a", weekday: "TUE" },
        { scheduleId: "a", weekday: "tue" },
        { scheduleId: "b", weekday: "thu" },
        { scheduleId: "c", weekday: 4 },
      ]),
    ).toEqual([
      { scheduleId: "a", weekday: "tue" },
      { scheduleId: "b", weekday: "thu" },
    ]);
  });

  it("round-trips through the column value", () => {
    const slots = [{ scheduleId: "a", weekday: "tue" }];
    expect(serializeGameWinnerSlots(slots)).toEqual(slots);
    expect(serializeGameWinnerSlots(null)).toBeNull();
    expect(serializeGameWinnerSlots([])).toBeNull();
  });
});

describe("weekdayForOccurrenceDate", () => {
  it("reads the weekday straight off the occurrence date", () => {
    // findEndedOccurrences already formatted this in the schedule's timezone, so
    // re-applying a zone here is what would slide a 9pm game onto the wrong day.
    expect(weekdayForOccurrenceDate("2026-07-20")).toBe("mon");
    expect(weekdayForOccurrenceDate("2026-08-04")).toBe("tue");
  });

  it("returns null for anything that isn't a real YYYY-MM-DD date", () => {
    expect(weekdayForOccurrenceDate("2026-02-31")).toBeNull();
    expect(weekdayForOccurrenceDate("2026-7-4")).toBeNull();
    expect(weekdayForOccurrenceDate("")).toBeNull();
  });
});

describe("occurrenceMatchesSlots", () => {
  const occurrence = { scheduleId: "sched-tue-6", weekday: "tue" };

  it("matches every occurrence when the reward isn't pinned", () => {
    expect(occurrenceMatchesSlots(null, occurrence)).toBe(true);
    expect(occurrenceMatchesSlots(undefined, occurrence)).toBe(true);
  });

  it("matches only the pinned {scheduleId, weekday} pairs", () => {
    const pinned = [{ scheduleId: "sched-tue-6", weekday: "tue" }];
    expect(occurrenceMatchesSlots(pinned, occurrence)).toBe(true);
    // Same weekday, the OTHER Tuesday game — must not award.
    expect(occurrenceMatchesSlots(pinned, { scheduleId: "sched-tue-9", weekday: "tue" })).toBe(false);
    // Same schedule, a weekday the partner didn't pick.
    expect(occurrenceMatchesSlots(pinned, { scheduleId: "sched-tue-6", weekday: "thu" })).toBe(false);
  });

  it("refuses an unidentifiable occurrence against a pinned reward", () => {
    const pinned = [{ scheduleId: "sched-tue-6", weekday: "tue" }];
    expect(occurrenceMatchesSlots(pinned, { scheduleId: "", weekday: "tue" })).toBe(false);
    expect(occurrenceMatchesSlots(pinned, { scheduleId: "sched-tue-6", weekday: "" })).toBe(false);
  });
});

describe("deriveGameWinnerTerms", () => {
  const slotsOf = (...schedules: RewardGameScheduleShape[]) => enumerateGameSlots(schedules);

  it("derives weekly cadence with one prize per selected recurring game", () => {
    const result = deriveGameWinnerTerms(slotsOf(tueThu));
    expect(result).toEqual({
      ok: true,
      terms: { cadence: "weekly", quota: 2, weekdays: ["tue", "thu"] },
    });
  });

  it("counts two games on the same weekday as two prizes", () => {
    const result = deriveGameWinnerTerms(slotsOf(tuesday6pm, tuesday9pm));
    expect(result.ok && result.terms).toEqual({ cadence: "weekly", quota: 2, weekdays: ["tue"] });
  });

  it("stays weekly (not daily) for a seven-day selection", () => {
    const result = deriveGameWinnerTerms(slotsOf(everyDay));
    expect(result.ok && result.terms.cadence).toBe("weekly");
    expect(result.ok && result.terms.quota).toBe(7);
  });

  it("derives a one-time reward worth exactly 1 for a single one-off game", () => {
    const result = deriveGameWinnerTerms(slotsOf(oneOff));
    expect(result.ok && result.terms).toEqual({ cadence: "none", quota: 1, weekdays: ["tue"] });
  });

  it("refuses an empty selection", () => {
    expect(deriveGameWinnerTerms([]).ok).toBe(false);
  });

  it("refuses mixing recurring and one-off games", () => {
    // A one-time campaign is spent at its FIRST resolved game, so a mixed reward
    // would quietly award at one game and never the others.
    const result = deriveGameWinnerTerms([...slotsOf(tueThu), ...slotsOf(oneOff)]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/not both/i);
  });

  it("refuses more than one one-off game", () => {
    const other = { ...oneOff, scheduleId: "sched-one-off-2" };
    const result = deriveGameWinnerTerms([...slotsOf(oneOff), ...slotsOf(other)]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/one one-off game/i);
  });
});

describe("weekdaysForSlots", () => {
  it("returns distinct weekdays in week order", () => {
    expect(
      weekdaysForSlots([
        { scheduleId: "a", weekday: "thu" },
        { scheduleId: "b", weekday: "tue" },
        { scheduleId: "c", weekday: "tue" },
      ]),
    ).toEqual(["tue", "thu"]);
  });
});

describe("validateGameWinnerSlots", () => {
  const available = enumerateGameSlots([tuesday6pm, tuesday9pm, oneOff]);

  it("resolves a selection against the venue's real schedule", () => {
    const result = validateGameWinnerSlots(available, [
      { scheduleId: "sched-tue-6", weekday: "tue" },
      { scheduleId: "sched-tue-9", weekday: "tue" },
    ]);
    expect(result.ok && result.value.terms).toEqual({
      cadence: "weekly",
      quota: 2,
      weekdays: ["tue"],
    });
    expect(result.ok && result.value.slots).toEqual([
      { scheduleId: "sched-tue-6", weekday: "tue" },
      { scheduleId: "sched-tue-9", weekday: "tue" },
    ]);
  });

  it("rejects a slot the venue doesn't have", () => {
    // The whole point of server-side re-validation: an over-broad match spends
    // the partner's money at games they never agreed to.
    const result = validateGameWinnerSlots(available, [
      { scheduleId: "sched-tue-6", weekday: "wed" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("never takes recurrence from the client", () => {
    // The one-off game is pinned as one-off no matter what the client believed,
    // so its derived cadence is one-time — not weekly.
    const result = validateGameWinnerSlots(available, [
      { scheduleId: "sched-one-off", weekday: "tue" },
    ]);
    expect(result.ok && result.value.terms.cadence).toBe("none");
  });

  it("rejects an absent selection instead of silently meaning 'every game'", () => {
    // createReward must store a real selection; null is reserved for legacy rows.
    expect(validateGameWinnerSlots(available, null).ok).toBe(false);
    expect(validateGameWinnerSlots(available, []).ok).toBe(false);
  });
});

describe("selectAllRecurringSlots", () => {
  it("selects every recurring game — a snapshot of today's schedule", () => {
    const available = enumerateGameSlots([tueThu, oneOff]);
    expect(selectAllRecurringSlots(available).map(slotKey)).toEqual([
      "sched-tue-thu:tue",
      "sched-tue-thu:thu",
    ]);
  });

  it("falls back to the single upcoming game at a one-off-only venue", () => {
    const available = enumerateGameSlots([oneOff]);
    expect(selectAllRecurringSlots(available).map(slotKey)).toEqual(["sched-one-off:tue"]);
  });
});

describe("describeGameWinnerSlots", () => {
  it("reads back a multi-day recurring selection", () => {
    expect(describeGameWinnerSlots(enumerateGameSlots([tueThu]))).toBe(
      "Winners of your Tuesday and Thursday Live Trivia games get this reward — 2 per week.",
    );
  });

  it("reads back a single recurring game", () => {
    expect(describeGameWinnerSlots(enumerateGameSlots([tuesday6pm]))).toBe(
      "Winner of your Tuesday Live Trivia game gets this reward — 1 per week.",
    );
  });

  it("reads back a one-off game by its date", () => {
    expect(describeGameWinnerSlots(enumerateGameSlots([oneOff]))).toBe(
      "Winner of your Tue, Aug 4 6:00 PM — Trivia Fundraiser game gets this reward.",
    );
  });
});

describe("describeCampaignGameWinnerTerms", () => {
  // The owner Rewards list readback for an EXISTING campaign — built entirely
  // from what's persisted on it (gameWinnerSlots/winnerQuota/recurringType),
  // never a live-schedule fetch, so it stays correct even if this read races a
  // schedule change (the cascade keeps these fields in sync — see
  // lib/rewardGameSlotCascade.ts).
  it("reads back a multi-day recurring campaign from its stored slots", () => {
    expect(
      describeCampaignGameWinnerTerms({
        recurringType: "weekly",
        activeDays: ["tue", "thu"],
        winnerQuota: 2,
        gameWinnerSlots: [
          { scheduleId: "s1", weekday: "tue" },
          { scheduleId: "s2", weekday: "thu" },
        ],
      }),
    ).toBe("Winners of your Tuesday and Thursday Live Trivia games get this reward — 2 per week.");
  });

  it("reads back a single recurring day", () => {
    expect(
      describeCampaignGameWinnerTerms({
        recurringType: "weekly",
        activeDays: ["tue"],
        winnerQuota: 1,
        gameWinnerSlots: [{ scheduleId: "s1", weekday: "tue" }],
      }),
    ).toBe("Winner of your Tuesday Live Trivia game gets this reward — 1 per week.");
  });

  // Regression: createReward stores activeDays: [] for every one-off
  // (recurringType: "none") reward (lib/rewards.ts), so a one-off campaign in
  // production NEVER has activeDays to fall back on. Weekdays must come from
  // gameWinnerSlots, or this renders a blank terms line on the Partner
  // Dashboard.
  it("reads back a one-off campaign from gameWinnerSlots even though activeDays is empty", () => {
    expect(
      describeCampaignGameWinnerTerms({
        recurringType: "none",
        activeDays: [],
        winnerQuota: 1,
        gameWinnerSlots: [{ scheduleId: "s1", weekday: "tue" }],
      }),
    ).toBe("Winner of your Tuesday Live Trivia game gets this reward.");
  });

  it("orders days by the calendar week, not by however the slots happen to be stored", () => {
    expect(
      describeCampaignGameWinnerTerms({
        recurringType: "weekly",
        activeDays: ["thu", "tue"],
        winnerQuota: 2,
        gameWinnerSlots: [
          { scheduleId: "s1", weekday: "thu" }, // deliberately out of order
          { scheduleId: "s2", weekday: "tue" },
        ],
      }),
    ).toBe("Winners of your Tuesday and Thursday Live Trivia games get this reward — 2 per week.");
  });

  // Legacy "every game" reward: created before the picker existed, so
  // gameWinnerSlots is null and activeDays is the only signal available.
  it("falls back to activeDays for a legacy campaign with no gameWinnerSlots", () => {
    expect(
      describeCampaignGameWinnerTerms({
        recurringType: "weekly",
        activeDays: ["tue"],
        winnerQuota: 1,
        gameWinnerSlots: null,
      }),
    ).toBe("Winner of your Tuesday Live Trivia game gets this reward — 1 per week.");
  });

  it("returns empty for a campaign with no resolvable weekday in either field", () => {
    expect(
      describeCampaignGameWinnerTerms({
        recurringType: "weekly",
        activeDays: [],
        winnerQuota: 1,
        gameWinnerSlots: null,
      }),
    ).toBe("");
  });
});
