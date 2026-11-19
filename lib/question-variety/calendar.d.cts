export type CalendarDate = { on?: string; month?: number; weekday?: string; nth?: number; offset?: number; exact?: Record<string, string> };
export type CalendarTarget = { category: string; area: string };
export type CalendarEvent = { id: string; name: string; date: CalendarDate; speed: CalendarTarget; live: CalendarTarget };
export type Calendar = { version?: string; note?: string; events: CalendarEvent[] };
export type SeasonalEvent = { id: string; name: string; date: string; days: number; category: string; area: string };
export const CALENDAR: Calendar;
export const WINDOW_DAYS: number;
export const WEEKDAYS: readonly string[];
export function dateFor(rule: CalendarDate, year: number): string | null;
export function validateCalendar(
  calendar: unknown,
  categories: { speed: readonly string[]; live: readonly string[] },
  areas?: { game: string; category: string; name: string }[] | null,
): string[];
export function seasonalFor(input: {
  game: string;
  categories: readonly string[];
  today?: Date;
  calendar?: Calendar;
  windowDays?: number;
}): SeasonalEvent | null;
