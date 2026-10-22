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
      className="w-full rounded-xl border border-ht-pickem-accent/30 bg-ht-surface px-3 py-2.5 text-footnote font-bold text-ht-pickem-accent focus:outline-none focus:ring-2 focus:ring-ht-pickem-accent/40"
      ariaLabel="Select week"
      size="sm"
    />
  );
}
