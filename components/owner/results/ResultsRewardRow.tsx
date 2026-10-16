import { Chevron, ROW_CLASS } from "@/components/owner/results/resultsUi";
import { rewardWinnersLine } from "@/lib/results/resultsDisplay";
import type { ResultsRewardItem } from "@/lib/results/types";

// A reward on its own row of the timeline (a week's places reward, a daily reward, a reward whose game
// isn't on the page). Tapping it opens the reward screen. A reward won AT a game is a line on that
// game's card instead (ResultsGameCard).

export const ResultsRewardRow = ({ reward, onOpen }: { reward: ResultsRewardItem; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className={ROW_CLASS}>
    <div className="min-w-0 flex-1">
      <div className="truncate font-black text-ht-primary">🎁 {reward.name}</div>
      <div className="mt-0.5 text-footnote font-semibold text-ht-muted">{reward.cycleLabel}</div>
      <div className={`mt-1 text-footnote font-bold ${reward.winners.length > 0 ? "text-ht-emerald-300" : "text-ht-muted"}`}>
        {rewardWinnersLine(reward)}
      </div>
    </div>
    <Chevron />
  </button>
);
