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
  deriveNFLWeekScopeTerms,
  describeNFLWeekScope,
  resolveNFLRewardStartDate,
  isNFLRewardWeekScopeKind,
  normalizeNFLWeekScope,
  serializeNFLWeekScope,
  type NFLRewardWeekScope,
} from "@/lib/nflPickEmRewardWeeks";
import { REWARD_MAX_QUANTITY, quantityOutOfRangeMessage } from "@/lib/rewardTerms";

const WEEKLY: NFLRewardWeekScope = { kind: "weekly", season: 2026 };
const SEASON: NFLRewardWeekScope = { kind: "season", season: 2026, fromWeek: 7 };

const SEASON_DATES = { startDate: "2026-10-15", endDate: "2027-01-06" };

describe("normalizeNFLWeekScope", () => {
  it("accepts exactly the two supported shapes", () => {
    expect(normalizeNFLWeekScope(WEEKLY)).toEqual(WEEKLY);
    expect(normalizeNFLWeekScope(SEASON)).toEqual(SEASON);
    expect([...NFL_REWARD_WEEK_SCOPE_KINDS]).toEqual(["weekly", "season"]);
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
  });

  it("round-trips both valid shapes through serialize(normalize(x))", () => {
    expect(serializeNFLWeekScope(normalizeNFLWeekScope(WEEKLY))).toEqual(WEEKLY);
    expect(serializeNFLWeekScope(normalizeNFLWeekScope(SEASON))).toEqual(SEASON);
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
    ];
    for (const input of inputs) {
      const scope = normalizeNFLWeekScope(input);
      if (!scope) continue;
      const keys = Object.keys(scope).sort();
      expect(keys).toEqual(
        scope.kind === "weekly" ? ["kind", "season"] : ["fromWeek", "kind", "season"],
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

describe("describeNFLWeekScope", () => {
  it("states the 3-picker rule on both winner-takes-it shapes", () => {
    const weekly = describeNFLWeekScope(WEEKLY, "game_winner", { quantity: 1, threshold: 1 });
    expect(weekly).toContain("1 winner per week");
    expect(weekly).toContain("weekly tiebreaker question");
    expect(weekly).toContain("fewer than 3 players");

    const season = describeNFLWeekScope(SEASON, "game_winner", { quantity: 1, threshold: 1 });
    expect(season).toContain("1 winner for the season");
    expect(season).toContain("fewer than 3 players");
  });

  it("reads back a picks target in the partner's own numbers", () => {
    expect(describeNFLWeekScope(WEEKLY, "points_threshold", { quantity: 3, threshold: 10 })).toBe(
      "Each week, the first 3 guests to get 10 NFL picks right win this reward.",
    );
    expect(describeNFLWeekScope(SEASON, "points_threshold", { quantity: 1, threshold: 25 })).toBe(
      "The first guest to get 25 NFL picks right this season wins this reward.",
    );
  });

  it("says nothing for a scope it can't read", () => {
    expect(describeNFLWeekScope(null, "game_winner", { quantity: 1, threshold: 1 })).toBe("");
  });
});

// A reward created before kickoff has REAL weekly cycles running immediately
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
