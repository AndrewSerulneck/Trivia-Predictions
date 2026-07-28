/**
 * "2026-09-10" → "Sept 10". Parsed as a plain calendar date, NOT via
 * `new Date("2026-09-10")` — that string form reads as UTC midnight and
 * renders as Sept 9 for every viewer west of Greenwich, which is most of them.
 */
export function formatCalendarDate(
  calendarDate: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string {
  const [year, month, day] = calendarDate.split("-").map(Number);
  if (!year || !month || !day) return "";
  return new Date(year, month - 1, day).toLocaleDateString(undefined, options);
}
