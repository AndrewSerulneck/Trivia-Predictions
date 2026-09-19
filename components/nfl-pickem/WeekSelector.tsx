"use client";

import { formatCalendarDate } from "@/lib/formatCalendarDate";
import { Dropdown, type DropdownOption } from "@/components/ui/Dropdown";

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
  const options: DropdownOption<string>[] = weeks.map((week) => ({
    value: week.id,
    label: `${week.label || `Week ${week.weekNumber}`} · ${formatCalendarDate(week.weekStartDate)} – ${formatCalendarDate(week.weekEndDate)}${week.isCurrent ? " (Now)" : ""}`,
  }));

  return (
    <Dropdown
      value={selectedWeekId}
      options={options}
      onChange={onSelect}
      className="w-full rounded-xl border border-[#fde68a]/30 bg-slate-900 px-3 py-2.5 text-[13px] font-bold text-[#fde68a] focus:outline-none focus:ring-2 focus:ring-[#fde68a]/40"
      ariaLabel="Select week"
      size="sm"
    />
  );
}
