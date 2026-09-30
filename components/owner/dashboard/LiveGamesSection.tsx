import {
  DashboardSectionCard,
  SectionAddRow,
  SectionEmpty,
  SectionError,
  SectionSeeAll,
  SectionSkeleton,
} from "@/components/owner/dashboard/DashboardSectionCard";
import {
  dateChip,
  displayWindow,
  formatScheduleTime,
  GAME_LABELS,
  GAME_PILL_STYLES,
  recurrenceLabel,
  splitSchedules,
} from "@/lib/ownerScheduleDisplay";
import type { OwnerSchedule } from "@/types";

/** Home screen shows this many upcoming games, then "See all (N)". */
export const DASHBOARD_LIST_LIMIT = 3;

export type SectionLoad<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: T[] };

export const LiveGamesSection = ({
  load,
  nowMs,
  onAdd,
  onOpen,
  onRetry,
}: {
  load: SectionLoad<OwnerSchedule>;
  nowMs: number;
  /** Opens the (Phase 4) schedule sheet on a new game. */
  onAdd: () => void;
  /** Opens the schedule sheet on an existing game, or on the full list when omitted. */
  onOpen: (schedule?: OwnerSchedule) => void;
  onRetry: () => void;
}) => {
  const upcoming = load.status === "ready" ? splitSchedules(load.items, nowMs).upcoming : [];
  const shown = upcoming.slice(0, DASHBOARD_LIST_LIMIT);
  const ready = load.status === "ready";

  return (
    <DashboardSectionCard
      glyph="🎮"
      accentClassName="bg-ht-game-live"
      title="Live Games"
      addLabel={ready && upcoming.length > 0 ? "Schedule a live game" : undefined}
      onAdd={onAdd}
    >
      {load.status === "loading" ? <SectionSkeleton label="Loading live games" /> : null}
      {load.status === "error" ? <SectionError message={load.message} onRetry={onRetry} /> : null}
      {ready && upcoming.length === 0 ? (
        <SectionEmpty
          title="Schedule a live game"
          hint="Pick a game and a time. Your whole room plays together."
          onAdd={onAdd}
        />
      ) : null}
      {ready && upcoming.length > 0 ? (
        <>
          <ul className="space-y-2">
            {shown.map((schedule) => {
              const window = displayWindow(schedule);
              const chip = dateChip(window.startTime, schedule.timezone);
              const recurrence = recurrenceLabel(schedule);
              return (
                <li key={schedule.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(schedule)}
                    className="flex w-full items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-elevated/40 p-3 text-left transition active:translate-y-px"
                  >
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-ht-elevated">
                      <span className="text-[10px] font-black uppercase tracking-wider text-ht-cyan-300">
                        {chip.month}
                      </span>
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
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider ${GAME_PILL_STYLES[schedule.gameType]}`}
                        >
                          {GAME_LABELS[schedule.gameType]}
                        </span>
                        {recurrence ? (
                          <span className="inline-flex rounded-full bg-ht-elevated px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider text-ht-muted">
                            🔁 {recurrence}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="shrink-0 text-lg text-slate-500" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {upcoming.length > DASHBOARD_LIST_LIMIT ? (
            <SectionSeeAll count={upcoming.length} onClick={() => onOpen()} />
          ) : null}
          <SectionAddRow label="+ Schedule another game" onAdd={onAdd} />
        </>
      ) : null}
    </DashboardSectionCard>
  );
};
