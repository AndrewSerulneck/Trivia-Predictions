import { describeRewardPrizeInSentence, getRewardDefinition, type RewardPrizeSummaryInput } from "@/lib/rewardDefinitions";
import { promoGameForPrizeGameType, type PromoGameId } from "@/lib/promo/promoTemplates";
import type { ChallengeCampaign } from "@/types";

// The prize panel's content (docs/partner-social-promo-plan.md §4.1, D13): a game's active prizes as
// "what you win" + "how to win". The wording is the prize system's own — describeRewardPrizeInSentence
// for the prize, the definition's requirement copy for how to win — so a new prize kind or menu item
// needs nothing here. Pure: no React, no fetch.

export type PromoPrize = {
  /** The campaign id. */
  id: string;
  /** "$50 gift card", "Free appetizer", "20% off your whole order". */
  headline: string;
  /** The prize inside a sentence, with its article: "a $50 gift card" (captions). */
  inSentence: string;
  /** "Win the Live Trivia game", "Earn 500 points in Live Trivia", "Get 8 of 10 picks right". */
  howToWin: string;
};

/** The campaign fields the panel reads. Owner competitions carry all of them. */
export type PromoPrizeSource = Pick<
  ChallengeCampaign,
  | "id"
  | "isActive"
  | "winnerUserId"
  | "rewardDefinitionId"
  | "winCondition"
  | "pointsRequiredToWin"
  | "placePrizes"
  | "pickemTiers"
  | "pickemPickLimit"
  | "gameWinnerSlots"
  | "prizeKind"
  | "prizeMenuItem"
  | "prizeMenuItemName"
  | "prizeDiscountKind"
  | "prizeDiscountValue"
  | "prizeGiftCertificateAmount"
>;

const capitalize = (text: string): string => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : text);

/** "a $50 gift card" → "$50 gift card"; "an appetizer" → "Appetizer". */
const headlineOf = (inSentence: string): string => capitalize(inSentence.replace(/^(a|an)\s+/i, ""));

/** Promo copy is about one bar already, so the definitions' "at this venue" is dropped. */
const tidyRequirement = (text: string): string => text.replace(/\s+at this venue$/i, "").trim();

/** The prize a promo leads with: the main prize, or 1st place, or the top Pick 'Em tier. */
const leadPrizeOf = (campaign: PromoPrizeSource): RewardPrizeSummaryInput => {
  const firstPlace = [...(campaign.placePrizes ?? [])].sort((a, b) => a.place - b.place)[0];
  if (campaign.winCondition === "ranked_places" && firstPlace) return firstPlace;
  const topTier = [...(campaign.pickemTiers ?? [])].sort((a, b) => b.correct - a.correct)[0];
  if (topTier && !campaign.prizeKind) return topTier;
  if (!campaign.prizeKind && firstPlace) return firstPlace;
  return campaign;
};

const howToWinOf = (campaign: PromoPrizeSource): string | null => {
  const definition = campaign.rewardDefinitionId ? getRewardDefinition(campaign.rewardDefinitionId) : null;
  if (!definition) return null;
  const topTier = [...(campaign.pickemTiers ?? [])].sort((a, b) => b.correct - a.correct)[0];
  if (topTier && campaign.pickemPickLimit) {
    return `Get ${topTier.correct} of ${campaign.pickemPickLimit} picks right`;
  }
  if (campaign.winCondition === "ranked_places" && definition.rankedPlacesRequirement) {
    const places = campaign.placePrizes?.length ?? 0;
    const tail = places > 1 ? ` · Top ${places} win` : "";
    return `${tidyRequirement(definition.rankedPlacesRequirement)}${tail}`;
  }
  if (campaign.winCondition === "game_winner") return tidyRequirement(definition.gameWinnerRequirement);
  return tidyRequirement(definition.requirementTemplate.replace("{threshold}", String(campaign.pointsRequiredToWin)));
};

/** The game a prize belongs to, by its definition. Pre-Rewards campaigns (no definition) are not promoted. */
export const promoGameOfPrize = (campaign: Pick<PromoPrizeSource, "rewardDefinitionId">): PromoGameId | null => {
  const definition = campaign.rewardDefinitionId ? getRewardDefinition(campaign.rewardDefinitionId) : null;
  return definition ? promoGameForPrizeGameType(definition.gameType) : null;
};

/** One prize as the panel shows it, or null when it can't be described (pre-Rewards campaign). */
export const promoPrizeOf = (campaign: PromoPrizeSource): PromoPrize | null => {
  const howToWin = howToWinOf(campaign);
  if (!howToWin) return null;
  const inSentence = describeRewardPrizeInSentence(leadPrizeOf(campaign));
  return { id: campaign.id, headline: headlineOf(inSentence), inSentence, howToWin };
};

/** Still running and not yet won outright (same rule as the dashboard's Active Prizes). */
const isActivePrize = (campaign: PromoPrizeSource): boolean => campaign.isActive && !campaign.winnerUserId;

/**
 * The active prizes a promo for `game` can show. `scheduleId` = the scheduled game being promoted:
 * a prize pinned to other games (gameWinnerSlots) is left out; an unpinned one (null slots) counts
 * for every game. Order is the input's (the dashboard's).
 */
export const prizesForGame = (
  campaigns: readonly PromoPrizeSource[],
  game: PromoGameId,
  scheduleId: string | null,
): PromoPrize[] =>
  campaigns
    .filter(isActivePrize)
    .filter((campaign) => promoGameOfPrize(campaign) === game)
    .filter((campaign) => {
      const slots = campaign.gameWinnerSlots;
      if (!scheduleId || !slots || slots.length === 0) return true;
      return slots.some((slot) => slot.scheduleId === scheduleId);
    })
    .map(promoPrizeOf)
    .filter((prize): prize is PromoPrize => prize !== null);
