import { BARE_BUTTON_CLASS, Chevron } from "@/components/owner/results/resultsUi";
import { playerCountLabel, winnersLabel } from "@/lib/ownerHistoryDisplay";
import { getResultsCompetition } from "@/lib/results/competitions";
import { rewardWinnerInline, scoreLabel } from "@/lib/results/resultsDisplay";
import type { ResultsGameRow, ResultsRewardItem } from "@/lib/results/types";

// One game on the timeline: "<competition> · <game>", the player count, the winner, and any reward won
// at this game as a line of its own. The competition label and score unit come from the registry
// (lib/results/competitions.ts); the card never branches on which competition it is.
//
// Two taps, never nested buttons: the game body opens the game screen, each reward line opens that reward.

const resultLine = (game: ResultsGameRow, unit: string): string => {
  if (game.inProgress) return "Playing now";
  if (game.winners.length === 0) return "Nobody scored";
  return `🏆 ${winnersLabel(game.winners)} · ${scoreLabel(game.topScore, unit)}`;
};

const rewardLine = (reward: ResultsRewardItem): string =>
  `🎁 ${reward.name} → ${reward.winners.length > 0 ? reward.winners.map(rewardWinnerInline).join(", ") : "No winner"}`;

export const ResultsGameCard = ({
  game,
  rewards,
  onOpenGame,
  onOpenReward,
}: {
  game: ResultsGameRow;
  rewards: ReadonlyArray<ResultsRewardItem>;
  onOpenGame: () => void;
  onOpenReward: (reward: ResultsRewardItem) => void;
}) => {
  const competition = getResultsCompetition(game.competitionId);
  return (
    <div className="overflow-hidden rounded-[14px] border border-ht-hairline bg-ht-elevated/40">
      <button type="button" onClick={onOpenGame} className={BARE_BUTTON_CLASS}>
        <div className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-black text-ht-primary">{competition ? `${competition.label} · ${game.title}` : game.title}</div>
            <div className="mt-0.5 text-footnote font-semibold text-ht-muted">{playerCountLabel(game.playerCount)}</div>
            <div className={`mt-1 text-footnote font-bold ${game.winners.length > 0 ? "text-ht-emerald-300" : "text-ht-muted"}`}>
              {resultLine(game, competition?.scoreUnit ?? "")}
            </div>
          </div>
          <Chevron />
        </div>
      </button>
      {rewards.map((reward) => (
        <div key={`${reward.rewardId}:${reward.cycleStart}`} className="border-t border-ht-hairline">
          <button type="button" onClick={() => onOpenReward(reward)} className={BARE_BUTTON_CLASS}>
            <div className="flex min-h-11 items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-footnote font-bold text-ht-emerald-300">{rewardLine(reward)}</span>
              <Chevron />
            </div>
          </button>
        </div>
      ))}
    </div>
  );
};
