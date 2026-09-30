import {
  DashboardSectionCard,
  SectionAddRow,
  SectionEmpty,
  SectionError,
  SectionSeeAll,
  SectionSkeleton,
} from "@/components/owner/dashboard/DashboardSectionCard";
import { ScheduleGameRow } from "@/components/owner/schedule/ScheduleGameRow";
import { splitSchedules } from "@/lib/ownerScheduleDisplay";
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
  /** Opens the schedule sheet on a new game. */
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
            {shown.map((schedule) => (
              <li key={schedule.id}>
                <ScheduleGameRow schedule={schedule} onClick={() => onOpen(schedule)} />
              </li>
            ))}
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
