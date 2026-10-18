import { describe, expect, it } from "vitest";

// The week-scope model behind the NFL Pick 'Em Challenge reward. Three things
// carry real consequences here — activeDays must lead with Thursday (or every
// NFL week splits across two reward cycles and accrual is gated off on the days
// games actually settle), a week-winner reward must be worth exactly 1 prize,
// and a season-long reward without date bounds would never close. See
// docs/nfl-pickem-reward-plan.md findings #7 and #8.

import {
  NFL_REWARD_ACTIVE_DAYS,
  NFL_REWARD_WEEK_SCOPE_KINDS,
  NFL_SEASON_DATES_REQUIRED_MESSAGE,
  NFL_WEEK_SCOPE_INVALID_MESSAGE,
  NFL_WEEK_WINNER_QUANTITY_MESSAGE,
  nflSingleWeekThresholdTooHighMessage,
  buildNFLSelectableWeeks,
  formatNFLSelectableWeekLabel,
  deriveNFLWeekScopeTerms,
  describeNFLWeekScope,
  resolveNFLRewardStartDate,
  nflRewardUpcomingStartDate,
  isNFLRewardWeekScopeKind,
  normalizeNFLWeekScope,
  serializeNFLWeekScope,
  type NFLRewardWeekScope,
  type NFLSelectableWeekSource,
} from "@/lib/nflPickEmRewardWeeks";
import { REWARD_MAX_QUANTITY, quantityOutOfRangeMessage } from "@/lib/rewardTerms";

const WEEKLY: NFLRewardWeekScope = { kind: "weekly", season: 2026 };
const SEASON: NFLRewardWeekScope = { kind: "season", season: 2026, fromWeek: 7 };

const SINGLE: NFLRewardWeekScope = { kind: "single_week", season: 2026, week: 9 };
const SINGLE_DATES = { startDate: "2026-11-05", endDate: "2026-11-11" };

const SEASON_DATES = { startDate: "2026-10-15", endDate: "2027-01-06" };

describe("normalizeNFLWeekScope", () => {
  it("accepts exactly the three supported shapes", () => {
    expect(normalizeNFLWeekScope(WEEKLY)).toEqual(WEEKLY);
    expect(normalizeNFLWeekScope(SEASON)).toEqual(SEASON);
    expect([...NFL_REWARD_WEEK_SCOPE_KINDS]).toEqual(["weekly", "season", "single_week"]);
    expect(normalizeNFLWeekScope(SINGLE)).toEqual(SINGLE);
    expect(isNFLRewardWeekScopeKind("weekly")).toBe(true);
    expect(isNFLRewardWeekScopeKind("range")).toBe(false);
  });

  it("fails closed on anything malformed — null means 'not an NFL reward'", () => {
    expect(normalizeNFLWeekScope(null)).toBeNull();
    expect(normalizeNFLWeekScope(undefined)).toBeNull();
    expect(normalizeNFLWeekScope([{ kind: "weekly", season: 2026 }])).toBeNull();
    expect(normalizeNFLWeekScope("weekly")).toBeNull();
    expect(normalizeNFLWeekScope(2026)).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "playoffs", season: 2026 })).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "weekly", season: "twenty twenty six" })).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "weekly", season: 2026.5 })).toBeNull();
    // A season scope is meaningless without a real starting week.
    expect(normalizeNFLWeekScope({ kind: "season", season: 2026 })).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "season", season: 2026, fromWeek: 0 })).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "season", season: 2026, fromWeek: 99 })).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "single_week", season: 2026 })).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "single_week", season: 2026, week: 0 })).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "single_week", season: 2026, week: 31 })).toBeNull();
    expect(normalizeNFLWeekScope({ kind: "single_week", season: 2026, week: 9.5 })).toBeNull();
  });

  it("round-trips both valid shapes through serialize(normalize(x))", () => {
    expect(serializeNFLWeekScope(normalizeNFLWeekScope(WEEKLY))).toEqual(WEEKLY);
    expect(serializeNFLWeekScope(normalizeNFLWeekScope(SEASON))).toEqual(SEASON);
    expect(serializeNFLWeekScope(normalizeNFLWeekScope(SINGLE))).toEqual(SINGLE);
    expect(serializeNFLWeekScope(null)).toBeNull();
  });

  it("never produces a week list or a week range", () => {
    // The rejected third shape (docs/nfl-pickem-reward-plan.md): a scope must
    // carry no enumerated weeks and no end week, however it is fed in.
    const inputs: unknown[] = [
      { kind: "weekly", season: 2026, weekNumbers: [12, 13, 14] },
      { kind: "season", season: 2026, fromWeek: 7, toWeek: 12 },
      { kind: "range", season: 2026, fromWeek: 12, toWeek: 16 },
      WEEKLY,
      SEASON,
      SINGLE,
      { kind: "single_week", season: 2026, week: 9, toWeek: 12 },
    ];
    for (const input of inputs) {
      const scope = normalizeNFLWeekScope(input);
      if (!scope) continue;
      const keys = Object.keys(scope).sort();
      expect(keys).toEqual(
        scope.kind === "weekly"
          ? ["kind", "season"]
          : scope.kind === "season"
            ? ["fromWeek", "kind", "season"]
            : ["kind", "season", "week"],
      );
    }
  });
});

describe("deriveNFLWeekScopeTerms", () => {
  it("uses all seven weekdays with Thursday FIRST, for both kinds", () => {
    for (const scope of [WEEKLY, SEASON]) {
      const result = deriveNFLWeekScopeTerms(scope, {
        winCondition: "game_winner",
        quantity: 1,
        ...SEASON_DATES,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Index 0 is the weekly cycle anchor (computeCycleStart) — an NFL week runs
      // Thursday→Wednesday, so anchoring anywhere else splits it in two.
      expect(result.terms.activeDays[0]).toBe("thu");
      expect(result.terms.activeDays).toEqual(["thu", "fri", "sat", "sun", "mon", "tue", "wed"]);
    }
    expect([...NFL_REWARD_ACTIVE_DAYS]).toEqual(["thu", "fri", "sat", "sun", "mon", "tue", "wed"]);
  });

  it("forces a week-winner quota to 1 and refuses any other quantity", () => {
    const ok = deriveNFLWeekScopeTerms(WEEKLY, { winCondition: "game_winner", quantity: 1 });
    expect(ok.ok && ok.terms.quota).toBe(1);

    const refused = deriveNFLWeekScopeTerms(WEEKLY, { winCondition: "game_winner", quantity: 2 });
    expect(refused).toEqual({ ok: false, message: NFL_WEEK_WINNER_QUANTITY_MESSAGE });

    const refusedSeason = deriveNFLWeekScopeTerms(SEASON, {
      winCondition: "game_winner",
      quantity: 3,
      ...SEASON_DATES,
    });
    expect(refusedSeason).toEqual({ ok: false, message: NFL_WEEK_WINNER_QUANTITY_MESSAGE });
  });

  it("keeps the partner's quantity for a picks target, range-checked", () => {
    const ok = deriveNFLWeekScopeTerms(WEEKLY, { winCondition: "points_threshold", quantity: 5 });
    expect(ok.ok && ok.terms.quota).toBe(5);

    for (const quantity of [0, -1, REWARD_MAX_QUANTITY + 1, Number.NaN]) {
      expect(
        deriveNFLWeekScopeTerms(WEEKLY, { winCondition: "points_threshold", quantity }),
      ).toEqual({ ok: false, message: quantityOutOfRangeMessage() });
    }
  });

  it("makes a weekly scope a recurring weekly campaign with no date bounds", () => {
    const result = deriveNFLWeekScopeTerms(WEEKLY, {
      winCondition: "points_threshold",
      quantity: 3,
      // Supplied dates are dropped: the weekly cycle math owns the boundaries.
      ...SEASON_DATES,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.terms.cadence).toBe("weekly");
    expect(result.terms.startDate).toBeNull();
    expect(result.terms.endDate).toBeNull();
  });

  it("refuses a season scope without usable dates, and carries them through when supplied", () => {
    // No dates → recurringType "none" + no startDate makes computeCycleStart
    // return the epoch sentinel and the reward never closes.
    expect(deriveNFLWeekScopeTerms(SEASON, { winCondition: "game_winner", quantity: 1 })).toEqual({
      ok: false,
      message: NFL_SEASON_DATES_REQUIRED_MESSAGE,
    });
    expect(
      deriveNFLWeekScopeTerms(SEASON, {
        winCondition: "game_winner",
        quantity: 1,
        startDate: "2026-10-15",
        endDate: null,
      }),
    ).toEqual({ ok: false, message: NFL_SEASON_DATES_REQUIRED_MESSAGE });
    expect(
      deriveNFLWeekScopeTerms(SEASON, {
        winCondition: "game_winner",
        quantity: 1,
        startDate: "2026-10-15",
        endDate: "2026-02-31",
      }),
    ).toEqual({ ok: false, message: NFL_SEASON_DATES_REQUIRED_MESSAGE });
    expect(
      deriveNFLWeekScopeTerms(SEASON, {
        winCondition: "game_winner",
        quantity: 1,
        startDate: "2027-01-06",
        endDate: "2026-10-15",
      }),
    ).toEqual({ ok: false, message: NFL_SEASON_DATES_REQUIRED_MESSAGE });

    const result = deriveNFLWeekScopeTerms(SEASON, {
      winCondition: "game_winner",
      quantity: 1,
      ...SEASON_DATES,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.terms.cadence).toBe("none");
    expect(result.terms.startDate).toBe(SEASON_DATES.startDate);
    expect(result.terms.endDate).toBe(SEASON_DATES.endDate);
  });

  it("refuses a malformed scope outright", () => {
    expect(
      deriveNFLWeekScopeTerms({ kind: "range", season: 2026 }, {
        winCondition: "game_winner",
        quantity: 1,
      }),
    ).toEqual({ ok: false, message: NFL_WEEK_SCOPE_INVALID_MESSAGE });
  });
});

describe("deriveNFLWeekScopeTerms — single_week", () => {
  it("is a one-off cycle bounded by the week's own dates, Thursday first", () => {
    const result = deriveNFLWeekScopeTerms(SINGLE, { winCondition: "game_winner", quantity: 1, ...SINGLE_DATES });
    expect(result).toEqual({
      ok: true,
      terms: {
        cadence: "none",
        activeDays: [...NFL_REWARD_ACTIVE_DAYS],
        quota: 1,
        ...SINGLE_DATES,
      },
    });
    expect(NFL_REWARD_ACTIVE_DAYS[0]).toBe("thu");
  });

  it("refuses a most-picks quantity above 1 and missing/invalid dates", () => {
    expect(deriveNFLWeekScopeTerms(SINGLE, { winCondition: "game_winner", quantity: 2, ...SINGLE_DATES })).toEqual({
      ok: false,
      message: NFL_WEEK_WINNER_QUANTITY_MESSAGE,
    });
    expect(deriveNFLWeekScopeTerms(SINGLE, { winCondition: "game_winner", quantity: 1 })).toEqual({
      ok: false,
      message: NFL_SEASON_DATES_REQUIRED_MESSAGE,
    });
    expect(
      deriveNFLWeekScopeTerms(SINGLE, { winCondition: "game_winner", quantity: 1, startDate: "2026-11-11", endDate: "2026-11-05" }),
    ).toEqual({ ok: false, message: NFL_SEASON_DATES_REQUIRED_MESSAGE });
  });

  it("keeps a picks target's quantity and refuses a threshold above the week's game count (D3)", () => {
    const base = { winCondition: "points_threshold" as const, quantity: 3, ...SINGLE_DATES, gamesCount: 14 };
    const ok = deriveNFLWeekScopeTerms(SINGLE, { ...base, threshold: 14 });
    expect(ok.ok && ok.terms.quota).toBe(3);
    expect(deriveNFLWeekScopeTerms(SINGLE, { ...base, threshold: 15 })).toEqual({
      ok: false,
      message: nflSingleWeekThresholdTooHighMessage(9, 14),
    });
    expect(nflSingleWeekThresholdTooHighMessage(9, 14)).toBe(
      "Week 9 has 14 games, so pick a target of 14 or fewer.",
    );
    // The cap applies to single_week only: a season reward ignores gamesCount.
    expect(
      deriveNFLWeekScopeTerms(SEASON, { ...base, ...SEASON_DATES, threshold: 99 }).ok,
    ).toBe(true);
  });
});

describe("single_week start date and copy", () => {
  it("starts on the campaign's own startDate with NO season-first fallback", () => {
    const dates = { campaignStartDate: "2026-11-05", seasonFirstWeekStartDate: "2026-09-10" };
    expect(resolveNFLRewardStartDate(SINGLE, dates)).toBe("2026-11-05");
    expect(resolveNFLRewardStartDate(SINGLE, { seasonFirstWeekStartDate: "2026-09-10" })).toBeNull();
    expect(nflRewardUpcomingStartDate(SINGLE, dates, new Date("2026-11-02T15:00:00Z"))).toBe("2026-11-05");
    expect(nflRewardUpcomingStartDate(SINGLE, dates, new Date("2026-11-05T15:00:00Z"))).toBeNull();
  });

  it("reads back both win conditions and states the reward's minimum", () => {
    const most = describeNFLWeekScope(SINGLE, "game_winner", { quantity: 1, threshold: 1, minPlayers: 3 });
    expect(most).toContain("Week 9");
    expect(most).toContain("fewer than 3 players");
    expect(describeNFLWeekScope(SINGLE, "game_winner", { quantity: 1, threshold: 1, minPlayers: null })).toBe(
      "After Week 9, the guest with the most correct NFL picks that week at your venue wins this prize — 1 winner. Ties are broken by Week 9's tiebreaker question.",
    );
    expect(describeNFLWeekScope(SINGLE, "points_threshold", { quantity: 2, threshold: 8 })).toBe(
      "In Week 9, the first 2 guests to get 8 NFL picks right win this prize.",
    );
  });
});

describe("describeNFLWeekScope", () => {
  it("states the reward's own minimum on both winner-takes-it shapes", () => {
    const weekly = describeNFLWeekScope(WEEKLY, "game_winner", { quantity: 1, threshold: 1, minPlayers: 3 });
    expect(weekly).toContain("1 winner per week");
    expect(weekly).toContain("weekly tiebreaker question");
    expect(weekly).toContain("fewer than 3 players");

    const season = describeNFLWeekScope(SEASON, "game_winner", { quantity: 1, threshold: 1, minPlayers: 8 });
    expect(season).toContain("1 winner for the season");
    expect(season).toContain("fewer than 8 players");
  });

  it("says nothing about headcount when the reward has no minimum", () => {
    for (const minPlayers of [null, undefined]) {
      const weekly = describeNFLWeekScope(WEEKLY, "game_winner", { quantity: 1, threshold: 1, minPlayers });
      expect(weekly).toMatch(/tiebreaker question\.$/);
      expect(weekly).not.toContain("fewer than");
      const season = describeNFLWeekScope(SEASON, "game_winner", { quantity: 1, threshold: 1, minPlayers });
      expect(season).not.toContain("fewer than");
    }
  });

  it("reads back a picks target in the partner's own numbers", () => {
    expect(describeNFLWeekScope(WEEKLY, "points_threshold", { quantity: 3, threshold: 10 })).toBe(
      "Each week, the first 3 guests to get 10 NFL picks right win this prize.",
    );
    expect(describeNFLWeekScope(SEASON, "points_threshold", { quantity: 1, threshold: 25 })).toBe(
      "The first guest to get 25 NFL picks right this season wins this prize.",
    );
  });

  it("says nothing for a scope it can't read", () => {
    expect(describeNFLWeekScope(null, "game_winner", { quantity: 1, threshold: 1 })).toBe("");
  });
});

// A prize created before kickoff has REAL weekly cycles running immediately
// (deriveNFLWeekScopeTerms gives weekly scope cadence "weekly" + startDate
// null), so the venue Rewards panel needs an explicit signal that nothing can
// be earned yet — otherwise it renders "In Progress · 0 / N pts" for weeks.
// See docs/nfl-pickem-week1-early-access-plan.md.
describe("resolveNFLRewardStartDate", () => {
  it("uses the season's first week for a weekly reward", () => {
    expect(
      resolveNFLRewardStartDate(WEEKLY, {
        campaignStartDate: null,
        seasonFirstWeekStartDate: "2026-09-10",
      }),
    ).toBe("2026-09-10");
  });

  it("ignores a weekly reward's own startDate — the season calendar owns the boundary", () => {
    // deriveNFLWeekScopeTerms deliberately drops dates for weekly scope, so a
    // stray startDate must never win over the real season start.
    expect(
      resolveNFLRewardStartDate(WEEKLY, {
        campaignStartDate: "2026-08-01",
        seasonFirstWeekStartDate: "2026-09-10",
      }),
    ).toBe("2026-09-10");
  });

  it("uses the campaign's own startDate for a season-long reward", () => {
    expect(
      resolveNFLRewardStartDate(SEASON, {
        campaignStartDate: "2026-10-15",
        seasonFirstWeekStartDate: "2026-09-10",
      }),
    ).toBe("2026-10-15");
  });

  it("falls back to the season's first week when a season reward has no startDate", () => {
    expect(
      resolveNFLRewardStartDate(SEASON, {
        campaignStartDate: null,
        seasonFirstWeekStartDate: "2026-09-10",
      }),
    ).toBe("2026-09-10");
  });

  it("returns null for a scope it can't read, or with no dates to work from", () => {
    expect(
      resolveNFLRewardStartDate(null, { seasonFirstWeekStartDate: "2026-09-10" }),
    ).toBeNull();
    expect(
      resolveNFLRewardStartDate(WEEKLY, { seasonFirstWeekStartDate: null }),
    ).toBeNull();
  });

  it("rejects a malformed date rather than passing it through to the UI", () => {
    expect(
      resolveNFLRewardStartDate(WEEKLY, { seasonFirstWeekStartDate: "not-a-date" }),
    ).toBeNull();
    // 2026-02-31 rolls forward into March, so it is not a real calendar date.
    expect(
      resolveNFLRewardStartDate(SEASON, { campaignStartDate: "2026-02-31" }),
    ).toBeNull();
  });
});

// The one "Starts …" rule shared by the venue page (applyNFLRewardUpcomingState)
// and the Create Reward wizard's preview — review-fixes plan Phase 1, F1.
describe("nflRewardUpcomingStartDate", () => {
  const dates = { campaignStartDate: "2026-10-08", seasonFirstWeekStartDate: "2026-09-10" };
  // Tue Oct 6 2026, noon ET: between Week 4 (ended Mon) and Week 5 (starts Thu Oct 8).
  const TUESDAY_MID_SEASON = new Date("2026-10-06T16:00:00.000Z");

  it("weekly, mid-season: already running, even on the Tuesday before the next week", () => {
    expect(nflRewardUpcomingStartDate(WEEKLY, dates, TUESDAY_MID_SEASON)).toBeNull();
  });

  it("weekly, preseason: the season's first week", () => {
    expect(nflRewardUpcomingStartDate(WEEKLY, dates, new Date("2026-08-20T16:00:00.000Z"))).toBe("2026-09-10");
  });

  it("season scope: its own first week while that is still ahead", () => {
    expect(nflRewardUpcomingStartDate(SEASON, dates, TUESDAY_MID_SEASON)).toBe("2026-10-08");
  });

  it("a reward starting today is live, judged on the Eastern calendar", () => {
    // 11:30 PM Eastern on Oct 7 is already Oct 8 in UTC — still upcoming in ET.
    expect(nflRewardUpcomingStartDate(SEASON, dates, new Date("2026-10-08T03:30:00.000Z"))).toBe("2026-10-08");
    // Noon Eastern on Oct 8 — the start date itself is live.
    expect(nflRewardUpcomingStartDate(SEASON, dates, new Date("2026-10-08T16:00:00.000Z"))).toBeNull();
  });

  it("null for an unreadable scope, missing dates, or an invalid clock", () => {
    expect(nflRewardUpcomingStartDate(null, dates, TUESDAY_MID_SEASON)).toBeNull();
    expect(nflRewardUpcomingStartDate(WEEKLY, { seasonFirstWeekStartDate: null }, TUESDAY_MID_SEASON)).toBeNull();
    expect(nflRewardUpcomingStartDate(WEEKLY, dates, new Date("nope"))).toBeNull();
  });
});

// ── Single week: which weeks a partner may pick (Phase 2, decisions D1/D2) ──
// Fixtures copy production's real 2026 rows (read 2026-10-12): first kickoffs
// are stored as UTC instants, and Weeks 1 and 12 open on a WEDNESDAY evening
// Eastern, before their Thursday week_start_date.
const sourceWeek = (overrides: Partial<NFLSelectableWeekSource> = {}): NFLSelectableWeekSource => ({
  weekNumber: 6,
  weekType: "regular",
  displayLabel: null,
  weekStartDate: "2026-10-15",
  weekEndDate: "2026-10-19",
  thursdayKickoff: "2026-10-16T00:15:00+00:00",
  gamesCount: 14,
  ...overrides,
});

describe("buildNFLSelectableWeeks", () => {
  // Thu 2026-10-15, 8:14 PM Eastern — one minute before Week 6's first kickoff.
  const BEFORE_KICKOFF = new Date("2026-10-16T00:14:00.000Z");
  const AT_KICKOFF = new Date("2026-10-16T00:15:00.000Z");

  it("offers a week until its first game kicks off, and not a moment after (D1)", () => {
    const weeks = [sourceWeek()];
    expect(buildNFLSelectableWeeks(weeks, BEFORE_KICKOFF)).toEqual([
      {
        weekNumber: 6,
        weekStartDate: "2026-10-15",
        weekEndDate: "2026-10-19",
        label: "Week 6 · Oct 15 – Oct 19",
        gamesCount: 14,
      },
    ]);
    // A "most picks" prize created after kickoff would silently never pay
    // (campaignWasLiveForContest), so the week must disappear exactly then.
    expect(buildNFLSelectableWeeks(weeks, AT_KICKOFF)).toEqual([]);
  });

  it("closes a week whose stored kickoff is on a UTC Thursday at the start of its Tue 05:00 UTC span", () => {
    // Week 12 (real row): starts Thu Nov 26, stored kickoff Wed Nov 25 8 PM Eastern
    // = Thu 01:00 UTC. The sync stores the earliest UTC-THURSDAY game when there is
    // one, so an earlier Tue/Wed UTC game (a Wednesday-afternoon holiday game)
    // would be invisible here — while the resolver measures from the true first
    // game. Close at the week's span start instead: Tue Nov 24 05:00 UTC.
    const week12 = sourceWeek({
      weekNumber: 12,
      weekStartDate: "2026-11-26",
      weekEndDate: "2026-11-30",
      thursdayKickoff: "2026-11-26T01:00:00+00:00",
      gamesCount: 16,
    });
    expect(buildNFLSelectableWeeks([week12], new Date("2026-11-24T04:59:00.000Z"))).toHaveLength(1);
    expect(buildNFLSelectableWeeks([week12], new Date("2026-11-24T05:00:00.000Z"))).toEqual([]);
    expect(buildNFLSelectableWeeks([week12], new Date("2026-11-25T18:00:00.000Z"))).toEqual([]);
  });

  it("trusts a stored kickoff on any other UTC day as the week's true first game", () => {
    // No UTC-Thursday game → the sync stored the earliest game overall, e.g. a
    // Christmas-Wednesday afternoon game (Wed 18:00 UTC).
    const christmasWeek = sourceWeek({
      weekNumber: 17,
      weekStartDate: "2026-12-24",
      weekEndDate: "2026-12-28",
      thursdayKickoff: "2026-12-23T18:00:00+00:00",
    });
    expect(buildNFLSelectableWeeks([christmasWeek], new Date("2026-12-23T17:59:00.000Z"))).toHaveLength(1);
    expect(buildNFLSelectableWeeks([christmasWeek], new Date("2026-12-23T18:00:00.000Z"))).toEqual([]);
  });

  it("falls back to the Eastern calendar when the first kickoff is unknown", () => {
    const unknownKickoff = [sourceWeek({ thursdayKickoff: null })];
    // Wed Oct 14, 11:30 PM Eastern (already Thursday in UTC): still selectable.
    expect(buildNFLSelectableWeeks(unknownKickoff, new Date("2026-10-15T03:30:00.000Z"))).toHaveLength(1);
    // Thu Oct 15, 12:30 AM Eastern: the week has begun — fail closed.
    expect(buildNFLSelectableWeeks(unknownKickoff, new Date("2026-10-15T04:30:00.000Z"))).toEqual([]);
    // An unparseable kickoff is treated as unknown, not as "never kicks off".
    expect(
      buildNFLSelectableWeeks([sourceWeek({ thursdayKickoff: "soon" })], new Date("2026-10-15T04:30:00.000Z")),
    ).toEqual([]);
  });

  it("offers regular-season and postseason weeks only — never preseason, never an unknown type (D2)", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const weeks = [
      sourceWeek({ weekNumber: 1, weekType: "preseason", displayLabel: "Preseason Week 1" }),
      sourceWeek({ weekNumber: 6, weekType: "regular" }),
      sourceWeek({ weekNumber: 19, weekType: "postseason", displayLabel: "Wild Card" }),
      sourceWeek({ weekNumber: 20, weekType: "exhibition" }),
    ];
    expect(buildNFLSelectableWeeks(weeks, now).map((week) => week.weekNumber)).toEqual([6, 19]);
  });

  it("drops a week with no games synced or with unusable dates", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const weeks = [
      sourceWeek({ weekNumber: 6, gamesCount: 0 }),
      sourceWeek({ weekNumber: 7, weekStartDate: "2026-02-31" }),
      sourceWeek({ weekNumber: 8, weekStartDate: "2026-10-20", weekEndDate: "2026-10-19" }),
      sourceWeek({ weekNumber: 0 }),
      sourceWeek({ weekNumber: 9 }),
    ];
    expect(buildNFLSelectableWeeks(weeks, now).map((week) => week.weekNumber)).toEqual([9]);
  });

  it("returns weeks in week order, and nothing for an invalid clock", () => {
    const now = new Date("2026-08-01T12:00:00.000Z");
    const weeks = [sourceWeek({ weekNumber: 9 }), sourceWeek({ weekNumber: 7 }), sourceWeek({ weekNumber: 8 })];
    expect(buildNFLSelectableWeeks(weeks, now).map((week) => week.weekNumber)).toEqual([7, 8, 9]);
    expect(buildNFLSelectableWeeks(weeks, new Date("nope"))).toEqual([]);
  });
});

describe("formatNFLSelectableWeekLabel", () => {
  it("reads 'Week N · Mon D – Mon D', across a month boundary, without shifting the day", () => {
    expect(
      formatNFLSelectableWeekLabel({ weekNumber: 8, displayLabel: null, weekStartDate: "2026-10-29", weekEndDate: "2026-11-02" }),
    ).toBe("Week 8 · Oct 29 – Nov 2");
  });

  it("keeps a stored display label (postseason rounds)", () => {
    expect(
      formatNFLSelectableWeekLabel({ weekNumber: 19, displayLabel: "Wild Card", weekStartDate: "2027-01-14", weekEndDate: "2027-01-18" }),
    ).toBe("Wild Card · Jan 14 – Jan 18");
  });
});
