import { describe, expect, it } from "vitest";
import {
  DEFAULT_PICKEM_TERMS_DRAFT,
  EMPTY_PICKEM_SCOPE_DRAFT,
  describePickEmPrizeTermsForPartner,
  isPickEmScopeLeagueOn,
  nextPickEmTierDraft,
  pickemEngineTerms,
  pickemPickLimitNotice,
  pickemScopeFromDraft,
  pickemTermsFromDraft,
  pickemWindowDraftFor,
  pickemWindowFromDraft,
  togglePickEmScopeLeague,
  togglePickEmScopeSport,
} from "@/lib/pickemPrizeWizard";
import {
  PICKEM_PRIZE_MOST_RIGHT_SCORES_MESSAGE,
  PICKEM_PRIZE_TIER_ORDER_MESSAGE,
  PICKEM_PRIZE_WINDOW_MESSAGE,
  PICKEM_PRIZE_WINDOW_PAST_MESSAGE,
} from "@/lib/pickemPrizes";
import type { PickEmTermsDraft } from "@/lib/pickemPrizeWizard";

// docs/pickem-college-football-and-prize-plan.md Phase 5: the wizard's Games / When / How to win
// rules. They must reach the SAME answers createReward does (validatePickEmPrizeTerms).

const TODAY = "2026-11-04"; // a Wednesday
const COLLEGE = { sports: ["ncaaf" as const], leagues: [] };
const SAT_NOV_7 = { kind: "day" as const, date: "2026-11-07" };
/** 12 / 15 / 18 of 20, two of the lowest tier. */
const pickemTermsDraftFixture = (): PickEmTermsDraft => ({
  ...DEFAULT_PICKEM_TERMS_DRAFT,
  winKind: "tiers",
  pickLimit: "20",
  tiers: [
    { correct: "12", quantity: "2" },
    { correct: "15", quantity: "1" },
    { correct: "18", quantity: "1" },
  ],
});

describe("Games", () => {
  it("toggles a whole sport and drops its single leagues", () => {
    const withLeague = togglePickEmScopeLeague(EMPTY_PICKEM_SCOPE_DRAFT, "soccer_epl");
    expect(withLeague).toEqual({ sports: [], leagues: ["soccer_epl"] });
    const whole = togglePickEmScopeSport(withLeague, "soccer");
    expect(whole).toEqual({ sports: ["soccer"], leagues: [] });
    expect(isPickEmScopeLeagueOn(whole, "soccer_epl")).toBe(true);
    expect(togglePickEmScopeSport(whole, "soccer")).toEqual({ sports: [], leagues: [] });
  });

  it("tapping a league of a whole sport takes just that league out", () => {
    const next = togglePickEmScopeLeague({ sports: ["nba"], leagues: [] }, "basketball_wnba");
    expect(next).toEqual({ sports: [], leagues: ["basketball_nba"] });
  });

  it("choosing every league one by one becomes the whole sport", () => {
    const one = togglePickEmScopeLeague(EMPTY_PICKEM_SCOPE_DRAFT, "basketball_nba");
    expect(togglePickEmScopeLeague(one, "basketball_wnba")).toEqual({ sports: ["nba"], leagues: [] });
  });

  it("an empty choice is no scope; the NFL is never one", () => {
    expect(pickemScopeFromDraft(EMPTY_PICKEM_SCOPE_DRAFT)).toBeNull();
    expect(togglePickEmScopeLeague(EMPTY_PICKEM_SCOPE_DRAFT, "americanfootball_nfl")).toEqual(EMPTY_PICKEM_SCOPE_DRAFT);
    expect(pickemScopeFromDraft({ sports: ["ncaaf"], leagues: ["soccer_epl"] })).toEqual({ sports: ["ncaaf"], leagues: ["soccer_epl"] });
  });
});

describe("When", () => {
  it("needs a kind, and judges dates against the venue's today", () => {
    const draft = pickemWindowDraftFor(TODAY);
    expect(pickemWindowFromDraft(draft, TODAY)).toEqual({ ok: false, message: PICKEM_PRIZE_WINDOW_MESSAGE });
    expect(pickemWindowFromDraft({ ...draft, kind: "day", date: "2026-11-07" }, TODAY)).toEqual({ ok: true, window: SAT_NOV_7 });
    expect(pickemWindowFromDraft({ ...draft, kind: "day", date: "2026-11-03" }, TODAY)).toEqual({
      ok: false,
      message: PICKEM_PRIZE_WINDOW_PAST_MESSAGE,
    });
    expect(pickemWindowFromDraft({ ...draft, kind: "weekday", weekday: "sat" }, TODAY)).toEqual({
      ok: true,
      window: { kind: "weekday", weekday: "sat" },
    });
    expect(pickemWindowFromDraft({ ...draft, kind: "week" }, TODAY)).toEqual({ ok: true, window: { kind: "week" } });
    expect(pickemWindowFromDraft({ ...draft, kind: "range", from: "2026-11-10", to: "2026-11-05" }, TODAY).ok).toBe(false);
  });
});

describe("How to win", () => {
  it("most right needs a sport with scores, like the server", () => {
    const draft = { ...DEFAULT_PICKEM_TERMS_DRAFT, winKind: "most_right" as const };
    expect(pickemTermsFromDraft(draft, { sports: ["mma"], leagues: [] }, SAT_NOV_7, TODAY)).toEqual({
      ok: false,
      message: PICKEM_PRIZE_MOST_RIGHT_SCORES_MESSAGE,
    });
    const ok = pickemTermsFromDraft(draft, COLLEGE, SAT_NOV_7, TODAY);
    expect(ok.ok && pickemEngineTerms(ok.terms)).toEqual({
      winCondition: "game_winner",
      threshold: 1,
      winnerQuota: 1,
      cadence: "none",
      activeDays: [],
    });
  });

  it("get N right sends N and its quantity", () => {
    const result = pickemTermsFromDraft(
      { ...DEFAULT_PICKEM_TERMS_DRAFT, winKind: "target", target: "15", quantity: "3" },
      COLLEGE,
      { kind: "weekday", weekday: "sat" },
      TODAY,
    );
    expect(result.ok && pickemEngineTerms(result.terms)).toEqual({
      winCondition: "points_threshold",
      threshold: 15,
      winnerQuota: 3,
      cadence: "weekly",
      activeDays: ["sat"],
    });
  });

  it("X out of N: tiers must rise and the quota is every tier's quantity", () => {
    const draft = pickemTermsDraftFixture();
    const result = pickemTermsFromDraft(draft, COLLEGE, SAT_NOV_7, TODAY);
    expect(result.ok && pickemEngineTerms(result.terms)).toMatchObject({ threshold: 12, winnerQuota: 4 });
    expect(
      pickemTermsFromDraft({ ...draft, tiers: [{ correct: "15", quantity: "1" }, { correct: "12", quantity: "1" }] }, COLLEGE, SAT_NOV_7, TODAY),
    ).toEqual({ ok: false, message: PICKEM_PRIZE_TIER_ORDER_MESSAGE });
    expect(pickemTermsFromDraft({ ...draft, pickLimit: "2x" }, COLLEGE, SAT_NOV_7, TODAY).ok).toBe(false);
  });

  it("suggests the next tier 3 higher, never above N, and at most 3 tiers", () => {
    expect(nextPickEmTierDraft({ ...DEFAULT_PICKEM_TERMS_DRAFT, pickLimit: "20" })).toEqual({ correct: "15", quantity: "1" });
    expect(nextPickEmTierDraft({ ...DEFAULT_PICKEM_TERMS_DRAFT, pickLimit: "13" })).toEqual({ correct: "13", quantity: "1" });
    expect(nextPickEmTierDraft(pickemTermsDraftFixture())).toBeNull();
  });
});

describe("the partner's words (from the registry's templates)", () => {
  it("tells the partner about the pick limit (D5)", () => {
    expect(pickemPickLimitNotice(20, COLLEGE, SAT_NOV_7)).toBe(
      "Players at your bar will be limited to 20 college football picks on Sat, Nov 7, so everyone plays the same 20.",
    );
    expect(pickemPickLimitNotice(Number.NaN, COLLEGE, SAT_NOV_7)).toBeNull();
  });

  it("restates who wins", () => {
    const most = pickemTermsFromDraft({ ...DEFAULT_PICKEM_TERMS_DRAFT, winKind: "most_right" }, COLLEGE, { kind: "week" }, TODAY);
    expect(most.ok && describePickEmPrizeTermsForPartner(most.terms)).toBe(
      "One winner each week (Monday to Sunday): the player with the most college football picks right.",
    );
    const target = pickemTermsFromDraft({ ...DEFAULT_PICKEM_TERMS_DRAFT, winKind: "target" }, COLLEGE, SAT_NOV_7, TODAY);
    expect(target.ok && describePickEmPrizeTermsForPartner(target.terms)).toBe(
      "Up to 1 winner on Sat, Nov 7: the first to get 10 college football picks right.",
    );
  });
});
