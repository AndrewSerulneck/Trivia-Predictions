import type { CategoryBlitzRecurringType, CategoryBlitzSchedule } from "@/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_BY_SHORT: Record<string, (typeof WEEKDAY_KEYS)[number]> = {
  sun: "sun",
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
};

type CategoryBlitzWeekday = (typeof WEEKDAY_KEYS)[number];

export type CategoryBlitzWindowOccurrence = {
  windowStart: Date;
  windowEnd: Date;
  occurrenceDate: string;
};

type ScheduleTimingFields = Pick<
  CategoryBlitzSchedule,
  "startTime" | "endTime" | "timezone" | "recurringType" | "recurringDays" | "windowMinutes"
>;

function normalizeRecurringType(value: string | null | undefined): CategoryBlitzRecurringType {
  return value === "daily" || value === "weekly" ? value : "none";
}

function normalizeRecurringDays(value: unknown): CategoryBlitzWeekday[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((entry) => String(entry ?? "").trim().toLowerCase())
    .filter((entry): entry is CategoryBlitzWeekday =>
      WEEKDAY_KEYS.includes(entry as CategoryBlitzWeekday)
    );
  return Array.from(new Set(normalized));
}

export function getTimeZoneParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: CategoryBlitzWeekday;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = WEEKDAY_BY_SHORT[String(values.weekday ?? "").slice(0, 3).toLowerCase()] ?? "sun";
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    weekday,
  };
}

export function formatZonedDate(ms: number, timeZone: string): string {
  const parts = getTimeZoneParts(new Date(ms), timeZone);
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function zonedDateTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): number {
  const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guessMs = localUtcMs;
  for (let i = 0; i < 3; i += 1) {
    const offset = getTimeZoneOffsetMs(new Date(guessMs), timeZone);
    guessMs = localUtcMs - offset;
  }
  return guessMs;
}

export function datetimeLocalValueToUtcIso(inputValue: string, timeZone: string): string {
  const match = String(inputValue ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error("A valid start date and time are required.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  return new Date(zonedDateTimeToUtcMs(year, month, day, hour, minute, 0, timeZone)).toISOString();
}

export function utcIsoToDatetimeLocalValue(iso: string, timeZone: string): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "";

  const parts = getTimeZoneParts(new Date(ms), timeZone);
  const yyyy = String(parts.year).padStart(4, "0");
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  const hh = String(parts.hour).padStart(2, "0");
  const min = String(parts.minute).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export function computeWindowMinutesFromRange(startIso: string, endIso: string): number {
  const startMs = Date.parse(String(startIso ?? ""));
  const endMs = Date.parse(String(endIso ?? ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error("A valid start and end date/time are required.");
  }
  if (endMs <= startMs) {
    throw new Error("End date/time must be after the start date/time.");
  }
  return Math.ceil((endMs - startMs) / 60_000);
}

export function deriveEndTimeIso(startIso: string, windowMinutes: number): string {
  const startMs = Date.parse(String(startIso ?? ""));
  if (!Number.isFinite(startMs)) return "";
  return new Date(startMs + Math.max(1, Number(windowMinutes) || 0) * 60_000).toISOString();
}

export function listScheduleWindowOccurrences(
  schedule: ScheduleTimingFields,
  now: Date = new Date(),
): CategoryBlitzWindowOccurrence[] {
  const baseStartMs = Date.parse(String(schedule.startTime ?? ""));
  if (!Number.isFinite(baseStartMs)) return [];

  const timeZone = String(schedule.timezone ?? "America/New_York").trim() || "America/New_York";
  const recurringType = normalizeRecurringType(schedule.recurringType);
  const windowMinutes = Math.max(1, Number(schedule.windowMinutes) || 0);
  const scheduleEndMs = Date.parse(String(schedule.endTime ?? ""));

  const toOccurrence = (windowStartMs: number): CategoryBlitzWindowOccurrence => ({
    windowStart: new Date(windowStartMs),
    windowEnd: new Date(
      recurringType === "none" && Number.isFinite(scheduleEndMs)
        ? scheduleEndMs
        : windowStartMs + windowMinutes * 60_000
    ),
    occurrenceDate: formatZonedDate(windowStartMs, timeZone),
  });

  if (recurringType === "none") {
    return [toOccurrence(baseStartMs)];
  }

  const baseStartParts = getTimeZoneParts(new Date(baseStartMs), timeZone);
  const recurringDays = normalizeRecurringDays(schedule.recurringDays);
  const effectiveDays =
    recurringType === "daily"
      ? WEEKDAY_KEYS
      : recurringDays.length > 0
      ? recurringDays
      : [baseStartParts.weekday];

  const nowMs = now.getTime();
  const occurrences: CategoryBlitzWindowOccurrence[] = [];
  for (let offset = -7; offset <= 14; offset += 1) {
    const dayProbe = getTimeZoneParts(new Date(nowMs + offset * DAY_MS), timeZone);
    if (!effectiveDays.includes(dayProbe.weekday)) continue;

    const occurrenceMs = zonedDateTimeToUtcMs(
      dayProbe.year,
      dayProbe.month,
      dayProbe.day,
      baseStartParts.hour,
      baseStartParts.minute,
      baseStartParts.second,
      timeZone,
    );
    if (occurrenceMs < baseStartMs) continue;
    occurrences.push(toOccurrence(occurrenceMs));
  }

  occurrences.sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime());
  return occurrences;
}

export function getCurrentOrNextScheduleWindow(
  schedule: ScheduleTimingFields,
  now: Date = new Date(),
): CategoryBlitzWindowOccurrence | null {
  const nowMs = now.getTime();
  const occurrences = listScheduleWindowOccurrences(schedule, now);

  let active: CategoryBlitzWindowOccurrence | null = null;
  let upcoming: CategoryBlitzWindowOccurrence | null = null;

  for (const occurrence of occurrences) {
    const startMs = occurrence.windowStart.getTime();
    const endMs = occurrence.windowEnd.getTime();

    if (nowMs >= startMs && nowMs < endMs) {
      if (!active || startMs > active.windowStart.getTime()) {
        active = occurrence;
      }
      continue;
    }

    if (startMs > nowMs && !upcoming) {
      upcoming = occurrence;
    }
  }

  return active ?? upcoming;
}

export function isScheduleWindowOpen(schedule: ScheduleTimingFields, now: Date = new Date()): boolean {
  const occurrence = getCurrentOrNextScheduleWindow(schedule, now);
  if (!occurrence) return false;
  return occurrence.windowStart <= now && now < occurrence.windowEnd;
}
