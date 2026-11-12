import { BARE_BUTTON_CLASS, Chevron } from "@/components/owner/results/resultsUi";
import { formatOccurrenceDate, winnersLabel } from "@/lib/ownerHistoryDisplay";
import { rewardWinnerInline } from "@/lib/results/resultsDisplay";
import { RESULTS_THEME } from "@/lib/themeTokens";
import type { ResultsGameRow, ResultsRewardItem } from "@/lib/results/types";

// One compact button per game. Scores, participants and all prize details live in its standings screen.
const resultLine = (game: ResultsGameRow): string => {
  if (game.inProgress) return "Playing now";
  if (game.winners.length === 0) return "Nobody scored";
  return `${game.winners.length === 1 ? "Winner" : "Winners"}: ${winnersLabel(game.winners)}`;
};

const prizeSummary = (rewards: ReadonlyArray<ResultsRewardItem>): string => {
  if (rewards.length !== 1) return `${rewards.length} prizes`;
  const reward = rewards[0];
  const winner = reward.winners.length === 1 ? rewardWinnerInline(reward.winners[0]) :
    reward.winners.length > 1 ? `${reward.winners.length} winners` : "No winner";
  return `${reward.name} · ${winner}`;
};

export const ResultsGameCard = ({ game, rewards, onOpenGame }: {
  game: ResultsGameRow;
  rewards: ReadonlyArray<ResultsRewardItem>;
  onOpenGame: () => void;
}) => (
  <button type="button" onClick={onOpenGame} className={BARE_BUTTON_CLASS}>
    <div className="flex min-h-11 items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="break-words font-extrabold text-ht-primary">
          <span className="font-semibold text-ht-muted">{formatOccurrenceDate(game.date, Number(game.date.slice(0, 4)))} · </span>
          {game.title}
        </div>
        <div className={`mt-1 break-words text-footnote font-semibold ${!game.inProgress && game.winners.length > 0 ? RESULTS_THEME.winner : RESULTS_THEME.secondary}`}>{resultLine(game)}</div>
        {rewards.length > 0 ? <div className="mt-0.5 break-words text-footnote font-semibold text-ht-muted">{prizeSummary(rewards)}</div> : null}
      </div>
      <Chevron />
    </div>
  </button>
);
