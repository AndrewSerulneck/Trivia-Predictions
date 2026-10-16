import { StepHeading } from "@/components/owner/sheet/StepHeading";
import { EMPTY_CLASS, ListError } from "@/components/owner/results/resultsUi";
import { HightopLoader } from "@/components/ui/HightopLoader";
import type { Loaded } from "@/components/owner/results/resultsApi";
import { rewardWinnerLabel, type OwnerRewardDetail } from "@/lib/ownerHistoryDisplay";
import type { ResultsRewardItem } from "@/lib/results/types";

// One reward's history: every cycle it paid (or settled with nobody), winners by place, the prize and
// whether it was redeemed. The same detail as the old Rewards tab, reached from a game card, a game's
// screen or a reward row. Read-only.

export const RewardDetailScreen = ({
  reward,
  loaded,
  onRetry,
}: {
  /** The timeline's item for this reward, shown while the screen loads. */
  reward: ResultsRewardItem;
  loaded: Loaded<OwnerRewardDetail>;
  onRetry: () => void;
}) => {
  const detail = loaded.status === "ready" ? loaded.value : null;
  return (
    <div className="space-y-3">
      <StepHeading hint={`${detail?.howWon ?? reward.howWon}${detail && !detail.isActive ? " · Ended" : ""}`}>{reward.name}</StepHeading>
      {loaded.status === "loading" ? <HightopLoader size="md" className="py-8" /> : null}
      {loaded.status === "error" ? <ListError message={loaded.message} onRetry={onRetry} /> : null}
      {detail && detail.cycles.length === 0 ? <p className={EMPTY_CLASS}>No winners yet.</p> : null}
      {detail && detail.cycles.length > 0 ? (
        <ul className="space-y-2">
          {detail.cycles.map((cycle) => (
            <li key={cycle.cycleStart} className="rounded-xl border border-ht-hairline bg-ht-elevated/40 p-3">
              <p className="text-caption font-black uppercase tracking-wider text-ht-muted">{cycle.label}</p>
              {cycle.winners.length === 0 ? (
                <p className="mt-1 text-sm font-semibold text-ht-muted">{cycle.note ?? "No winner."}</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {cycle.winners.map((winner, index) => (
                    <li key={`${winner.place ?? "w"}-${index}`} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-bold text-ht-primary">{rewardWinnerLabel(winner)}</span>
                        <span className="shrink-0 font-black text-ht-primary">{winner.points.toLocaleString("en-US")} pts</span>
                      </div>
                      <div className="text-footnote font-semibold text-ht-muted">
                        {winner.prize}
                        {winner.redeemed === null ? "" : winner.redeemed ? " · Redeemed" : " · Not redeemed yet"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {detail?.truncated ? (
        <p className="text-center text-footnote font-semibold text-ht-muted">Showing the most recent {detail.cycles.length}.</p>
      ) : null}
    </div>
  );
};
