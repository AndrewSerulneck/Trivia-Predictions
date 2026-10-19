import { OWNER_COMPETITION_TEMPLATES } from "@/lib/ownerCompetitionTemplates";
import { getRewardDefinition } from "@/lib/rewardDefinitions";
import { describeRankedTerms } from "@/lib/rankedPlaceRewards";
import { SQUARES_PRIZE_DEFINITION_ID, describeSquaresPrizeTerms } from "@/lib/squaresPrizes";
import { describeCampaignGameWinnerTerms } from "@/lib/rewardGameSlots";
import { periodForCadence, renderTermsSentence } from "@/lib/rewardTerms";
import type { ChallengeCampaign } from "@/types";

// Display helpers for owner rewards ("competitions"), shared by the dashboard's
// Rewards section and the Rewards page / sheet. Pure: no React, no DOM.

export type OwnerCompetition = ChallengeCampaign & { progressPoints: number };

const TEMPLATE_GLYPH: Record<string, string> = {
  pickem_race: "🏈",
  prop_bingo_night: "🎯",
  fantasy_night: "🏆",
  trivia_gauntlet: "🧠",
  house_party: "🎉",
};

// Rewards (Phase 4+) stamp rewardDefinitionId directly — glyph comes straight
// from the registry. Pre-Rewards owner Competitions never set that column
// (templates were expanded at creation, not kept as a FK), so those fall back to
// matching gameTypes + challengeMode against the retired OWNER_COMPETITION_TEMPLATES
// registry, and anything unmatched gets a generic trophy.
export const glyphForCompetition = (competition: OwnerCompetition): string => {
  if (competition.rewardDefinitionId) {
    return getRewardDefinition(competition.rewardDefinitionId)?.glyph ?? "🏆";
  }
  const sortedTypes = [...competition.gameTypes].sort().join(",");
  const match = OWNER_COMPETITION_TEMPLATES.find(
    (t) => [...t.gameTypes].sort().join(",") === sortedTypes && t.challengeMode === competition.challengeMode,
  );
  return match ? (TEMPLATE_GLYPH[match.id] ?? "🏆") : "🏆";
};

export const formatDateLabel = (isoDate: string | undefined, timeZone: string): string => {
  if (!isoDate) return "—";
  try {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
  } catch {
    return isoDate;
  }
};

export const formatTimeLabel = (time: string | undefined): string => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")}${period}`;
};

/**
 * The exact terms the partner agreed to at creation. Only Rewards (with a
 * rewardDefinitionId) restate terms; a slot-pinned game-winner reward restates
 * the games it is pinned to instead of a period. Older competitions return null.
 */
export const rewardTermsText = (competition: OwnerCompetition): string | null => {
  if (!competition.rewardDefinitionId) return null;
  // A weekly places reward has no "N rewards a week" quota sentence: its terms ARE the prize ladder.
  if (competition.winCondition === "ranked_places") {
    return describeRankedTerms(competition.placePrizes, competition.minPlayers);
  }
  // Super Bowl Squares: one prize per chosen moment, never a period or a minimum.
  if (competition.rewardDefinitionId === SQUARES_PRIZE_DEFINITION_ID) {
    return describeSquaresPrizeTerms(competition.squaresMoments, competition.winnerQuota);
  }
  // The partner's optional "at least N players" minimum is part of a game-winner reward's terms too
  // (NFL most picks included, docs/reward-minimum-players-plan.md A2 — there, playing = making picks).
  const playVerb =
    getRewardDefinition(competition.rewardDefinitionId)?.description.calendar === "nfl_season" ? "make picks" : "play";
  const minimum = competition.minPlayers
    ? ` At least ${competition.minPlayers} players need to ${playVerb} for a winner to be named.`
    : "";
  if (competition.winCondition === "game_winner" && competition.gameWinnerSlots) {
    return `${describeCampaignGameWinnerTerms(competition)}${minimum}`;
  }
  return `${renderTermsSentence(
    competition.winnerQuota,
    periodForCadence(competition.recurringType),
    competition.winCondition,
  )}${minimum}`;
};

export const splitCompetitions = (
  competitions: OwnerCompetition[],
): { active: OwnerCompetition[]; ended: OwnerCompetition[] } => ({
  active: competitions.filter((c) => c.isActive && !c.winnerUserId),
  ended: competitions.filter((c) => !c.isActive || c.winnerUserId),
});
