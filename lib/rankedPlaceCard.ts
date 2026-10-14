// What the venue Rewards card shows for a weekly places ("ranked_places") reward: its live
// standing this week, or how the week ended
// (docs/live-trivia-weekly-places-reward-plan.md §5e, Phase 4).
//
// Two halves, one shape:
//   - the SERVER builds a RankedPlaceCardState (lib/rankedPlaceCardData.ts) and the Rewards
//     route attaches it to the card as `rankedPlaces`;
//   - the CLIENT turns it into words with composeRankedCard below.
//
// Pure and client-safe: no Supabase, no "server-only". Nothing here carries a player id —
// the state holds the viewer's own rank and winners' USERNAMES only, so the standings of
// other players never reach a browser.

import { placeOrdinal } from "@/lib/rankedPlaceRewards";

export type RankedPlaceCardPhase =
  /** Games this week; the week isn't settled yet. */
  | "live"
  /** The resolver settled the week: `outcome` says how. */
  | "settled"
  /** The reward doesn't count this week (created after its last game ended — D8). Starts next week. */
  | "not_live"
  /** The venue has no Live Trivia game this week. Nothing to say beyond the reward's description. */
  | "no_games";

export type RankedPlaceCardState = {
  /** ISO start of the week (the settlement / ledger key). */
  weekStart: string;
  phase: RankedPlaceCardPhase;
  /** Places the reward pays (1-3). */
  placeCount: number;
  /** The partner's "at least N players" minimum, or null for none. */
  minPlayers: number | null;
  /** Players who answered at least one question this week (at settlement, once settled). */
  participantCount: number;
  /** Games not finished yet, including one in progress. Live only. */
  gamesLeft: number;
  /** Weekday name of the week's LAST game ("Friday"), venue-local; null when unknown. Live only. */
  lastGameDay: string | null;
  /** The signed-in viewer's standing; null when signed out. `rank` is null until they score. Live only. */
  viewer: { rank: number | null; points: number } | null;
  /** How a settled week ended. Null unless `phase` is "settled". */
  outcome: "awarded" | "no_scorers" | "below_minimum" | null;
  /** The minimum in force when the week settled (it may differ from today's). */
  settledMinPlayers: number | null;
  /** The week's winners, 1st first. Settled + awarded only. Usernames, never ids. */
  winners: Array<{ place: number; username: string | null }>;
  /** The place the viewer won this week, if any. */
  viewerPlace: number | null;
};

export type RankedCardStatus = "in_progress" | "week_complete" | "upcoming" | "idle";

export type RankedCardCopy = {
  /** Which chip the card wears (a viewer who won gets "You Won" from the caller). */
  status: RankedCardStatus;
  /** Sentences, in reading order. Empty = nothing to add to the reward's description. */
  lines: string[];
};

const FALLBACK_NAME = "Champion";

const gamesLeftLine = (gamesLeft: number, lastGameDay: string | null): string => {
  if (gamesLeft <= 0) return "That was the week's last game. Winners are named shortly.";
  if (gamesLeft === 1) return lastGameDay ? `${lastGameDay}'s game decides it.` : "One game left this week.";
  return lastGameDay
    ? `${gamesLeft} games left this week. The last one is ${lastGameDay}.`
    : `${gamesLeft} games left this week.`;
};

const liveCopy = (state: RankedPlaceCardState): string[] => {
  const lines: string[] = [];
  const viewer = state.viewer;
  if (state.participantCount === 0) {
    lines.push("No scores yet this week. Play Live Trivia to get on the board.");
  } else if (viewer && viewer.rank !== null) {
    lines.push(`You're ${placeOrdinal(viewer.rank)} with ${viewer.points} pts this week.`);
    if (viewer.rank > state.placeCount) {
      lines.push(state.placeCount === 1 ? "Only 1st place wins a prize." : `Only the top ${state.placeCount} win a prize.`);
    }
  } else if (viewer) {
    lines.push("You haven't scored yet this week.");
  }
  lines.push(gamesLeftLine(state.gamesLeft, state.lastGameDay));
  if (state.minPlayers !== null) {
    lines.push(
      state.participantCount >= state.minPlayers
        ? `Minimum of ${state.minPlayers} players reached.`
        : `Needs at least ${state.minPlayers} players this week — ${state.participantCount} so far.`,
    );
  }
  return lines;
};

const winnersLine = (winners: RankedPlaceCardState["winners"]): string =>
  `This week's winners: ${winners
    .map((winner) => `${placeOrdinal(winner.place)} ${winner.username?.trim() || FALLBACK_NAME}`)
    .join(", ")}.`;

const settledCopy = (state: RankedPlaceCardState): string[] => {
  if (state.outcome === "no_scorers") return ["Nobody scored this week, so no prizes were awarded."];
  if (state.outcome === "below_minimum") {
    const needed = state.settledMinPlayers ?? state.minPlayers;
    return [
      needed !== null
        ? `Not enough players this week — ${state.participantCount} played, ${needed} needed. No prizes were awarded.`
        : "Not enough players this week. No prizes were awarded.",
    ];
  }
  const lines: string[] = [];
  if (state.viewerPlace !== null) {
    lines.push(`You finished ${placeOrdinal(state.viewerPlace)}. Your prize is in Redeem Prizes.`);
  }
  if (state.winners.length > 0) lines.push(winnersLine(state.winners));
  return lines;
};

/** The words and the chip for a ranked reward's card. Pure; the panel only lays them out. */
export const composeRankedCard = (state: RankedPlaceCardState): RankedCardCopy => {
  switch (state.phase) {
    case "live":
      return { status: "in_progress", lines: liveCopy(state) };
    case "settled":
      return { status: "week_complete", lines: settledCopy(state) };
    case "not_live":
      return { status: "upcoming", lines: ["Starts with next week's games."] };
    default:
      return { status: "idle", lines: [] };
  }
};
