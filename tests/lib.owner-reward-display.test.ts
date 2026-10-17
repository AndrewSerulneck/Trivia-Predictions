import { describe, expect, it, vi } from "vitest";
import {
  formatDateLabel,
  formatTimeLabel,
  glyphForCompetition,
  rewardTermsText,
  splitCompetitions,
  type OwnerCompetition,
} from "@/lib/ownerRewardDisplay";

const competition = (overrides: Partial<OwnerCompetition> = {}): OwnerCompetition =>
  ({
    id: "c1",
    name: "Trivia Night Prize",
    gameTypes: ["trivia"],
    challengeMode: "progress",
    isActive: true,
    winnerUserId: null,
    winnerQuota: 3,
    winCondition: "points_threshold",
    recurringType: "weekly",
    progressPoints: 0,
    ...overrides,
  }) as unknown as OwnerCompetition;

describe("formatTimeLabel", () => {
  it("formats 24-hour times as 12-hour", () => {
    expect(formatTimeLabel("00:00")).toBe("12:00AM");
    expect(formatTimeLabel("12:05")).toBe("12:05PM");
    expect(formatTimeLabel("20:30")).toBe("8:30PM");
  });
  it("handles empty and unparseable input", () => {
    expect(formatTimeLabel(undefined)).toBe("");
    expect(formatTimeLabel("soon")).toBe("soon");
  });
});

describe("formatDateLabel", () => {
  it("formats an ISO date with the host in the requested timezone", () => {
    // The legacy helper parses midnight in the host timezone. Make the original
    // New York-host fixture explicit instead of depending on the runner's zone.
    vi.stubEnv("TZ", "America/New_York");
    try { expect(formatDateLabel("2026-10-03", "America/New_York")).toBe("Oct 3"); }
    finally { vi.unstubAllEnvs(); }
  });
  it("shows a dash for a missing date", () => {
    expect(formatDateLabel(undefined, "America/New_York")).toBe("—");
  });
});

describe("glyphForCompetition", () => {
  it("uses the registry glyph when a reward definition is stamped", () => {
    expect(glyphForCompetition(competition({ rewardDefinitionId: "live_trivia_challenge" }))).not.toBe("");
  });
  it("falls back to a trophy for an unknown legacy competition", () => {
    expect(glyphForCompetition(competition({ gameTypes: [] }))).toBe("🏆");
  });
});

describe("rewardTermsText", () => {
  it("is null for a pre-Rewards competition with no definition", () => {
    expect(rewardTermsText(competition())).toBeNull();
  });
  it("restates the terms sentence for a stamped reward", () => {
    expect(rewardTermsText(competition({ rewardDefinitionId: "live_trivia_challenge" }))).toMatch(
      /3 of these rewards/,
    );
  });
  it("states an NFL most-picks reward's own minimum as making picks, and nothing without one", () => {
    const nfl = competition({
      rewardDefinitionId: "nfl_pickem_challenge",
      winCondition: "game_winner",
      winnerQuota: 1,
      recurringType: "weekly",
    });
    const without = rewardTermsText({ ...nfl, minPlayers: null });
    expect(without).not.toMatch(/players need to/);
    expect(rewardTermsText({ ...nfl, minPlayers: 3 })).toBe(
      `${without} At least 3 players need to make picks for a winner to be named.`,
    );
  });
});

describe("splitCompetitions", () => {
  it("treats inactive or already-won competitions as ended", () => {
    const active = competition({ id: "a" });
    const archived = competition({ id: "b", isActive: false });
    const won = competition({ id: "c", winnerUserId: "u1" });
    const { active: act, ended } = splitCompetitions([active, archived, won]);
    expect(act.map((c) => c.id)).toEqual(["a"]);
    expect(ended.map((c) => c.id)).toEqual(["b", "c"]);
  });
});
