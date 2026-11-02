// What the Pick 'Em games list says about a Pick 'Em Prize (docs/pickem-college-football-and-prize-plan.md
// Phase 6): one slim line per prize covering the shown games, built from this small, id-free record.
// Pure and client-safe — the server fills `PickEmGamePrize` (lib/pickemGamePrizes.ts), the screen only
// prints it. Words say "Prize", never "Reward".

import type { PickEmPrizeWinKind } from "@/lib/pickemPrizes";

export type PickEmGamePrize = {
  campaignId: string;
  kind: PickEmPrizeWinKind;
  /** The period in a player's words: "today", "this week", "on Sat, Nov 7". */
  when: string;
  /** "Get N right": N. */
  target: number | null;
  /** "Most picks right": picks needed to be ranked. */
  minPicks: number | null;
  /** "X out of N": N, and the number right each tier asks for (lowest first). */
  limit: number | null;
  tierCorrects: number[];
  /** "X out of N": picks this player has left in the period (null = not known, e.g. signed out). */
  picksLeft: number | null;
  /** Set once picksLeft is 0: why a new pick is refused (the server's own words). */
  limitMessage: string | null;
  /** True when the "most picks right" tiebreaker question belongs on this screen (the prize runs today). */
  hasTiebreaker: boolean;
};

const listOr = (values: readonly number[]): string =>
  values.length <= 1 ? values.join("") : `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;

/** "Prize today: 12, 15 or 18 of 20 right · 14 picks left". */
export const pickemPrizeLineText = (prize: PickEmGamePrize): string => {
  const lead = `Prize ${prize.when}:`;
  if (prize.kind === "most_right") {
    return prize.minPicks && prize.minPicks > 1
      ? `${lead} most picks right · make ${prize.minPicks} or more to qualify`
      : `${lead} most picks right`;
  }
  if (prize.kind === "target") return `${lead} get ${prize.target ?? 0} picks right`;
  const left =
    prize.picksLeft === null ? "" : ` · ${prize.picksLeft} ${prize.picksLeft === 1 ? "pick" : "picks"} left`;
  return `${lead} ${listOr(prize.tierCorrects)} of ${prize.limit ?? 0} right${left}`;
};
