// Pick 'Em pick windows (docs/cancelled-prizes-pick-windows-away-mode-plan.md Phase B1, D2).
// A leaf: no I/O, no "server-only", so the server gate (lib/pickemPickWindowGate.ts), the games
// list (B2) and Game Settings (B4) read ONE set of rules.
//
// A window is weekly, per sport, in the bar's time zone: "open Mon 12:00 AM, close Wed 11:59 PM".
// One window INSTANCE covers every game that starts at or after it opens and before the next one
// opens (the latest opening at or before kickoff). A pick for a game is allowed only while that
// game's instance is open; the kickoff lock is separate and unchanged. A sport with no window is
// always open (today's behaviour). Close is exclusive: "close 11:59 PM" refuses from 11:59:00.
//
// Stored in venue_game_settings.pickem_pick_windows (jsonb, keyed by sport slug, snake_case
// fields); `parseStoredPickWindows` drops anything malformed, which reads as "always open".

import { getTimeZoneParts, zonedDateTimeToUtcMs } from "@/lib/categoryBlitzScheduleTime";
import { PICKEM_SPORT_CATALOG, type PickEmSportSlug } from "@/lib/pickemSports";

export const PICK_WINDOW_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type PickWindowDay = (typeof PICK_WINDOW_DAYS)[number];

export const PICK_WINDOW_DAY_LABELS: Record<PickWindowDay, string> = {
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
};

export type PickEmPickWindow = {
  openDay: PickWindowDay;
  /** "HH:MM", 24-hour, the bar's local time. */
  openTime: string;
  closeDay: PickWindowDay;
  closeTime: string;
};

export type PickEmPickWindows = Partial<Record<PickEmSportSlug, PickEmPickWindow>>;

/** Per sport: a window to set, or null to clear it ("Always open"). */
export type PickEmPickWindowChanges = Partial<Record<PickEmSportSlug, PickEmPickWindow | null>>;

export type PickEmPickWindowInstance = { opensAtMs: number; closesAtMs: number };

export type PickEmPickWindowStatus = PickEmPickWindowInstance & { isOpen: boolean };

type StoredPickWindow = { open_day: string; open_time: string; close_day: string; close_time: string };

const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;
const SPORT_SLUGS = new Set<string>(PICKEM_SPORT_CATALOG.map((sport) => sport.slug));
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const dayIndex = (day: PickWindowDay): number => PICK_WINDOW_DAYS.indexOf(day);

const isPickWindowDay = (value: unknown): value is PickWindowDay =>
  typeof value === "string" && (PICK_WINDOW_DAYS as readonly string[]).includes(value);

const isPickEmSportSlug = (value: string): value is PickEmSportSlug => SPORT_SLUGS.has(value);

/** Minutes after midnight for "HH:MM", or null. */
export const pickWindowMinutes = (time: string): number | null => {
  const match = TIME_PATTERN.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/** Minutes from opening to closing, 1 to 10,079 (always under a week); 0 = not a window. */
export const pickWindowLengthMinutes = (window: PickEmPickWindow): number => {
  const open = pickWindowMinutes(window.openTime);
  const close = pickWindowMinutes(window.closeTime);
  if (open === null || close === null) return 0;
  const openAt = dayIndex(window.openDay) * DAY_MINUTES + open;
  const closeAt = dayIndex(window.closeDay) * DAY_MINUTES + close;
  return (((closeAt - openAt) % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
};

/**
 * The weekdays a window is open on at some minute, on the week's clock. A close at exactly 12:00 AM leaves its day
 * out; a window that wraps round to its own opening day (Mon 12 PM to Mon 8 AM) covers all seven.
 */
export const pickWindowOpenWeekdays = (window: PickEmPickWindow): Set<PickWindowDay> => {
  const days = new Set<PickWindowDay>();
  const open = pickWindowMinutes(window.openTime);
  const length = pickWindowLengthMinutes(window);
  if (open === null || length === 0) return days;
  const openAt = dayIndex(window.openDay) * DAY_MINUTES + open;
  const wrap = (minutes: number): number => ((minutes % WEEK_MINUTES) + WEEK_MINUTES) % WEEK_MINUTES;
  PICK_WINDOW_DAYS.forEach((day, index) => {
    const dayStart = index * DAY_MINUTES;
    // The day has an open minute if it starts inside the window, or the window opens inside the day.
    if (wrap(dayStart - openAt) < length || wrap(openAt - dayStart) < DAY_MINUTES) days.add(day);
  });
  return days;
};

/** A window from untrusted input (camelCase, the API's shape), or null if any field is wrong. */
export const readPickEmPickWindow = (raw: unknown): PickEmPickWindow | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const { openDay, openTime, closeDay, closeTime } = value;
  if (!isPickWindowDay(openDay) || !isPickWindowDay(closeDay)) return null;
  if (typeof openTime !== "string" || typeof closeTime !== "string") return null;
  const window: PickEmPickWindow = { openDay, openTime, closeDay, closeTime };
  return pickWindowLengthMinutes(window) > 0 ? window : null;
};

/**
 * A save body's `pickWindows` (owner + admin Game Settings): `{ ncaaf: {openDay, openTime, closeDay,
 * closeTime} | null, … }`. Every entry must be a known sport with a valid window or null (clear); at
 * least one is needed. Null = refuse with 400.
 */
export const readPickEmPickWindowChanges = (raw: unknown): PickEmPickWindowChanges | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const changes: PickEmPickWindowChanges = {};
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isPickEmSportSlug(slug)) return null;
    if (value === null) {
      changes[slug] = null;
      continue;
    }
    const window = readPickEmPickWindow(value);
    if (!window) return null;
    changes[slug] = window;
  }
  return Object.keys(changes).length > 0 ? changes : null;
};

/** The stored jsonb → windows. Malformed entries and unknown sports are dropped (= always open). */
export const parseStoredPickWindows = (raw: unknown): PickEmPickWindows => {
  const windows: PickEmPickWindows = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return windows;
  for (const [slug, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isPickEmSportSlug(slug) || !value || typeof value !== "object") continue;
    const stored = value as Partial<StoredPickWindow>;
    const window = readPickEmPickWindow({
      openDay: stored.open_day,
      openTime: stored.open_time,
      closeDay: stored.close_day,
      closeTime: stored.close_time,
    });
    if (window) windows[slug] = window;
  }
  return windows;
};

/** Windows → the stored jsonb. */
export const toStoredPickWindows = (windows: PickEmPickWindows): Record<string, StoredPickWindow> => {
  const stored: Record<string, StoredPickWindow> = {};
  for (const [slug, window] of Object.entries(windows)) {
    if (!window) continue;
    stored[slug] = {
      open_day: window.openDay,
      open_time: window.openTime,
      close_day: window.closeDay,
      close_time: window.closeTime,
    };
  }
  return stored;
};

/** Current windows with a save's changes applied (null clears a sport). */
export const applyPickWindowChanges = (
  current: PickEmPickWindows,
  changes: PickEmPickWindowChanges,
): PickEmPickWindows => {
  const next: PickEmPickWindows = { ...current };
  for (const [slug, window] of Object.entries(changes) as Array<[PickEmSportSlug, PickEmPickWindow | null]>) {
    if (window) next[slug] = window;
    else delete next[slug];
  }
  return next;
};

type LocalDate = { year: number; month: number; day: number };

const shiftLocalDate = (date: LocalDate, days: number): LocalDate => {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
};

// Local wall-clock → instant, through the shared DST-safe conversion.
const localInstantMs = (date: LocalDate, minutes: number, timeZone: string): number =>
  zonedDateTimeToUtcMs(date.year, date.month, date.day, Math.floor(minutes / 60), minutes % 60, 0, timeZone);

/**
 * The window instance that covers `atMs`: the latest opening at or before it, and that opening's
 * close. Dates are stepped in local calendar days, so a DST change inside the window keeps the
 * partner's wall-clock times.
 */
export const pickWindowInstanceAt = (
  window: PickEmPickWindow,
  atMs: number,
  timeZone: string,
): PickEmPickWindowInstance => {
  const openMinutes = pickWindowMinutes(window.openTime) ?? 0;
  const closeMinutes = pickWindowMinutes(window.closeTime) ?? 0;
  const length = pickWindowLengthMinutes(window);
  const local = getTimeZoneParts(new Date(atMs), timeZone);
  const daysBack = (dayIndex(local.weekday) - dayIndex(window.openDay) + 7) % 7;
  let openDate = shiftLocalDate(local, -daysBack);
  let opensAtMs = localInstantMs(openDate, openMinutes, timeZone);
  if (opensAtMs > atMs) {
    openDate = shiftLocalDate(openDate, -7);
    opensAtMs = localInstantMs(openDate, openMinutes, timeZone);
  }
  const closeDate = shiftLocalDate(openDate, Math.floor((openMinutes + length) / DAY_MINUTES));
  return { opensAtMs, closesAtMs: localInstantMs(closeDate, closeMinutes, timeZone) };
};

/** Whether picks for a game starting at `kickoffMs` are open at `nowMs` (kickoff lock not included). */
export const pickWindowStatusForGame = (params: {
  window: PickEmPickWindow;
  kickoffMs: number;
  nowMs: number;
  timeZone: string;
}): PickEmPickWindowStatus => {
  const instance = pickWindowInstanceAt(params.window, params.kickoffMs, params.timeZone);
  return { ...instance, isOpen: params.nowMs >= instance.opensAtMs && params.nowMs < instance.closesAtMs };
};

/** "12:00 AM", "11:59 PM". */
export const formatPickWindowTime = (time: string): string => {
  const minutes = pickWindowMinutes(time) ?? 0;
  const hour = Math.floor(minutes / 60);
  const minute = String(minutes % 60).padStart(2, "0");
  return `${hour % 12 === 0 ? 12 : hour % 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
};

// ── Pick ahead (plan Phase B2) ──────────────────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/** A windowed sport's games list reaches at most this far past now. */
export const PICK_AHEAD_MAX_MS = WEEK_MS;

/** When the instance after the one opening at `opensAtMs` opens: a week later on the bar's wall clock. */
export const nextPickWindowOpeningMs = (window: PickEmPickWindow, opensAtMs: number, timeZone: string): number =>
  // A week plus 2 h is past the next opening even when DST makes that week 1 h longer or shorter.
  pickWindowInstanceAt(window, opensAtMs + WEEK_MS + 2 * HOUR_MS, timeZone).opensAtMs;

/**
 * The latest kickoff a windowed sport's list lets a player browse to: seven days at most, and while a
 * window is open, not past the last game it covers (its games run until the next opening). While shut,
 * the next window's games show with "Picks open …".
 */
export const pickAheadHorizonMs = (params: { window: PickEmPickWindow; nowMs: number; timeZone: string }): number => {
  const cap = params.nowMs + PICK_AHEAD_MAX_MS;
  const current = pickWindowInstanceAt(params.window, params.nowMs, params.timeZone);
  if (params.nowMs >= current.closesAtMs) return cap;
  return Math.min(cap, nextPickWindowOpeningMs(params.window, current.opensAtMs, params.timeZone) - 1);
};

/** "Wed 11:59 PM" on the bar's clock. */
export const formatPickWindowInstant = (atMs: number, timeZone: string): string => {
  const local = getTimeZoneParts(new Date(atMs), timeZone);
  const time = `${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`;
  return `${PICK_WINDOW_DAY_LABELS[local.weekday]} ${formatPickWindowTime(time)}`;
};

/** What a games list says about one game's window. `line` is the screen's one muted line. */
export type PickEmPickWindowView = { opensAt: string; closesAt: string; isOpen: boolean; line: string };

/** "Picks close Wed 11:59 PM" while open, "Picks open Mon 12:00 AM" before, "Picks closed" after. */
export const pickWindowViewForGame = (params: {
  window: PickEmPickWindow;
  kickoffMs: number;
  nowMs: number;
  timeZone: string;
}): PickEmPickWindowView => {
  const status = pickWindowStatusForGame(params);
  const line = status.isOpen
    ? `Picks close ${formatPickWindowInstant(status.closesAtMs, params.timeZone)}`
    : params.nowMs < status.opensAtMs
      ? `Picks open ${formatPickWindowInstant(status.opensAtMs, params.timeZone)}`
      : "Picks closed";
  return {
    opensAt: new Date(status.opensAtMs).toISOString(),
    closesAt: new Date(status.closesAtMs).toISOString(),
    isOpen: status.isOpen,
    line,
  };
};

/**
 * A games list's window facts (regular Pick 'Em day, NFL Pick 'Em week): `closedLines` = each game not
 * yet started whose window is shut → its words; `view` = the window of the first game still to start
 * (null when every game has started). Games that started are left out: the kickoff lock speaks for them.
 */
export const pickWindowViewForGames = (params: {
  window: PickEmPickWindow;
  games: ReadonlyArray<{ id: string; startsAt: string; isLocked: boolean }>;
  nowMs: number;
  timeZone: string;
}): { view: PickEmPickWindowView | null; closedLines: Map<string, string> } => {
  const closedLines = new Map<string, string>();
  let first: { kickoffMs: number; view: PickEmPickWindowView } | null = null;
  for (const game of params.games) {
    const kickoffMs = Date.parse(game.startsAt);
    if (game.isLocked || !Number.isFinite(kickoffMs)) continue;
    const view = pickWindowViewForGame({ window: params.window, kickoffMs, nowMs: params.nowMs, timeZone: params.timeZone });
    if (!view.isOpen) closedLines.set(game.id, view.line);
    if (!first || kickoffMs < first.kickoffMs) first = { kickoffMs, view };
  }
  return { view: first?.view ?? null, closedLines };
};
