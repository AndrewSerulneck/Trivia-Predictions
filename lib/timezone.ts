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

/** Day of week as read in `timeZone`, 0 = Sunday … 6 = Saturday (matching Date#getUTCDay's numbering). */
export function getEasternDayOfWeek(date: Date, timeZone: string = "America/New_York"): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days.indexOf(weekday);
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

const DEFAULT_VENUE_TIMEZONE = "America/New_York";

/**
 * How long a server instance trusts a venue's timezone it has already read. The
 * point-accrual and Rewards-snapshot paths ask for it on every award and every
 * 30-second poll, and a venue's timezone practically never changes — but it CAN,
 * so the entry expires rather than living for the life of the instance.
 */
export const VENUE_TIMEZONE_CACHE_TTL_MS = 10 * 60_000;

const venueTimezoneCache = new Map<string, { timezone: string; expiresAtMs: number }>();

/** Test hook: forget every cached venue timezone. */
export function clearVenueTimezoneCache(): void {
  venueTimezoneCache.clear();
}

/**
 * A venue's IANA timezone, defaulting to America/New_York when unset, blank, or
 * unreadable. The ONLY exported venue-timezone reader — don't add a second one.
 * Successful reads are cached per server instance for VENUE_TIMEZONE_CACHE_TTL_MS;
 * a failed read returns the default and is NOT cached, so the next call retries.
 */
export async function getVenueTimezone(venueId: string): Promise<string> {
  const id = String(venueId ?? "").trim();
  if (!id || !supabaseAdmin) {
    return DEFAULT_VENUE_TIMEZONE;
  }
  const nowMs = Date.now();
  const cached = venueTimezoneCache.get(id);
  if (cached && cached.expiresAtMs > nowMs) return cached.timezone;

  const { data, error } = await supabaseAdmin
    .from("venues")
    .select("timezone")
    .eq("id", id)
    .maybeSingle<{ timezone: string | null }>();
  const timezone = String(data?.timezone ?? "").trim() || DEFAULT_VENUE_TIMEZONE;
  if (error) {
    venueTimezoneCache.delete(id);
    return DEFAULT_VENUE_TIMEZONE;
  }
  venueTimezoneCache.set(id, { timezone, expiresAtMs: nowMs + VENUE_TIMEZONE_CACHE_TTL_MS });
  return timezone;
}
