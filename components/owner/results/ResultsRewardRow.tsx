import { BARE_BUTTON_CLASS, Chevron } from "@/components/owner/results/resultsUi";
import { dayMs, DAY, isoOf } from "@/lib/ownerHistoryDisplay";
import { RESULTS_THEME } from "@/lib/themeTokens";
import type { ResultsRewardItem } from "@/lib/results/types";

const shortDate = (date: string): string => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

// Standalone prize cycles keep their own date/range and open the full prize history.
export const ResultsRewardRow = ({ reward, onOpen }: { reward: ResultsRewardItem; onOpen: () => void }) => {
  const weekStart = reward.attach.kind === "week" ? reward.attach.weekStart : null;
  const weekEnd = weekStart ? isoOf(dayMs(weekStart) + 6 * DAY) : null;
  const range = weekStart && weekEnd
    ? `${shortDate(weekStart)}–${weekStart.slice(0, 7) === weekEnd.slice(0, 7) ? Number(weekEnd.slice(8)) : shortDate(weekEnd)}`
    : reward.cycleLabel;
  return (
    <button type="button" onClick={onOpen} className={BARE_BUTTON_CLASS}>
      <div className="flex min-h-11 items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <div className="break-words font-extrabold text-ht-primary">{reward.name}</div>
          <div className="mt-1 text-footnote font-semibold text-ht-muted">{range}</div>
          <div className={`mt-0.5 text-footnote font-semibold ${reward.winners.length > 0 ? RESULTS_THEME.winner : RESULTS_THEME.secondary}`}>
            {reward.winners.length > 0 ? `${reward.winners.length} winner${reward.winners.length === 1 ? "" : "s"}` : "No winner"}
          </div>
        </div>
        <Chevron />
      </div>
    </button>
  );
};
