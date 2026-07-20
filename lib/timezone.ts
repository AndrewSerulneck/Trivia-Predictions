import "server-only";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** Extract a date's calendar/clock fields as they read in `timeZone`. */
export function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/** `YYYY-MM-DD` for `date` as it reads in `timeZone`. */
export function getLocalDateKey(date: Date, timeZone: string): string {
  const parts = getTimeZoneParts(date, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone);
  const localAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return localAsUtcMs - date.getTime();
}

/** UTC instant of local midnight on `year-month-day` in `timeZone`. */
export function zonedStartOfDayToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const localMidnightUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let utcMs = localMidnightUtcMs - getTimeZoneOffsetMs(new Date(localMidnightUtcMs), timeZone);
  utcMs = localMidnightUtcMs - getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  return new Date(utcMs);
}

/** A venue's IANA timezone, defaulting to America/New_York when unset. */
export async function getVenueTimezone(venueId: string): Promise<string> {
  if (!venueId || !supabaseAdmin) {
    return "America/New_York";
  }
  const { data } = await supabaseAdmin
    .from("venues")
    .select("timezone")
    .eq("id", venueId)
    .maybeSingle<{ timezone: string | null }>();
  return String(data?.timezone ?? "America/New_York").trim() || "America/New_York";
}
