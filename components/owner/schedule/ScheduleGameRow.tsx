import {
  dateChip,
  displayWindow,
  formatScheduleTime,
  GAME_LABELS,
  GAME_PILL_STYLES,
  recurrenceLabel,
} from "@/lib/ownerScheduleDisplay";
import type { OwnerSchedule } from "@/types";

// One game as a list row: date chip, title, time range, game pill, repeat pill.
// Shared by the dashboard's Live Games card and the schedule sheet's upcoming /
// past lists. A button when `onClick` is given (chevron shown), otherwise a
// static row — past games are read-only.

const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-elevated/40 p-3 text-left";

export const ScheduleGameRow = ({
  schedule,
  onClick,
  ended = false,
}: {
  schedule: OwnerSchedule;
  onClick?: () => void;
  /** Past game: dimmed, "Ended" instead of the game pill. */
  ended?: boolean;
}) => {
  const window = displayWindow(schedule);
  const chip = dateChip(window.startTime, schedule.timezone);
  const recurrence = recurrenceLabel(schedule);

  const content = (
    <>
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-ht-elevated">
        <span className="text-[10px] font-black uppercase tracking-wider text-ht-cyan-300">{chip.month}</span>
        <span className="ht-h2 leading-none">{chip.day}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black text-ht-primary">{schedule.title}</div>
        <div className="mt-0.5 text-sm font-bold text-ht-primary">
          {formatScheduleTime(window.startTime, schedule.timezone)} –{" "}
          {formatScheduleTime(window.endTime, schedule.timezone)}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider ${
              ended ? "bg-ht-elevated text-ht-muted" : GAME_PILL_STYLES[schedule.gameType]
            }`}
          >
            {ended ? "Ended" : GAME_LABELS[schedule.gameType]}
          </span>
          {recurrence ? (
            <span className="inline-flex rounded-full bg-ht-elevated px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider text-ht-muted">
              🔁 {recurrence}
            </span>
          ) : null}
        </div>
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
      <button type="button" onClick={onClick} className={`${ROW_CLASS} transition active:translate-y-px`}>
        {content}
      </button>
    );
  }
  return <div className={`${ROW_CLASS} ${ended ? "opacity-70" : ""}`}>{content}</div>;
};
