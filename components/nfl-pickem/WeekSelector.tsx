"use client";

import { formatCalendarDate } from "@/lib/formatCalendarDate";

type WeekOption = {
  id: string;
  weekNumber: number;
  label?: string;
  weekStartDate: string;
  weekEndDate: string;
  status: string;
  isLocked: boolean;
  isCurrent: boolean;
  gamesCount: number;
  /** True only for the single preseason preview week — see lib/nflPickEm.ts. */
  isUpcomingPreview?: boolean;
};

export function WeekSelector({
  weeks,
  selectedWeekId,
  onSelect,
}: {
  weeks: WeekOption[];
  selectedWeekId: string;
  onSelect: (weekId: string) => void;
}) {
  return (
    <select
      value={selectedWeekId}
      onChange={(event) => onSelect(event.target.value)}
      className="w-full rounded-xl border border-[#fde68a]/30 bg-slate-900 px-3 py-2.5 text-[13px] font-bold text-[#fde68a] focus:outline-none focus:ring-2 focus:ring-[#fde68a]/40"
      aria-label="Select week"
    >
      {weeks.map((week) => (
        <option key={week.id} value={week.id} className="bg-slate-900 text-[#fde68a]">
          {(week.label || `Week ${week.weekNumber}`)} · {formatCalendarDate(week.weekStartDate)} –{" "}
          {formatCalendarDate(week.weekEndDate)}
          {week.isUpcomingPreview
            ? ` (opens ${formatCalendarDate(week.weekStartDate)})`
            : week.isCurrent
              ? " (Now)"
              : ""}
        </option>
      ))}
    </select>
  );
}
