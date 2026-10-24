import { highlightRingClass, useScrollWhenHighlighted } from "@/components/owner/dashboard/useHighlightRing";
import { dateChip, displayWindow, scheduleRowDetail } from "@/lib/ownerScheduleDisplay";
import type { OwnerSchedule } from "@/types";

// One game as a list row: date chip, title, and one muted line (time range ·
// repeats · game name when the title doesn't say it).
// Shared by the dashboard's Active Group Games card and the schedule sheet's upcoming /
// past lists. A button when `onClick` is given (chevron shown), otherwise a
// static row — past games are read-only.

const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-elevated/40 p-3 text-left";

export const ScheduleGameRow = ({
  schedule,
  onClick,
  ended = false,
  highlighted = false,
}: {
  schedule: OwnerSchedule;
  onClick?: () => void;
  /** Past game: dimmed (its list is already headed "Past games"). */
  ended?: boolean;
  /** Just saved: ringed and scrolled into view for a moment. */
  highlighted?: boolean;
}) => {
  const ref = useScrollWhenHighlighted<HTMLButtonElement & HTMLDivElement>(highlighted);
  const window = displayWindow(schedule);
  const chip = dateChip(window.startTime, schedule.timezone);

  const content = (
    <>
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-ht-elevated">
        <span className="text-caption font-black uppercase tracking-wider text-ht-cyan-300">{chip.month}</span>
        <span className="ht-h2 leading-none">{chip.day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black text-ht-primary">{schedule.title}</div>
        <div className="mt-0.5 text-sm font-semibold text-ht-muted">{scheduleRowDetail(schedule, window)}</div>
      </div>
      {onClick ? (
        <span className="shrink-0 text-lg text-slate-500" aria-hidden>
          ›
        </span>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={`${ROW_CLASS} ${highlightRingClass(highlighted)} transition active:translate-y-px`}
      >
        {content}
      </button>
    );
  }
  return (
    <div ref={ref} className={`${ROW_CLASS} ${ended ? "opacity-70" : ""}`}>
      {content}
    </div>
  );
};
