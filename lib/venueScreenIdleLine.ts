// The one small line on the idle display: "Live Trivia · Thursday 8:00 PM" (Andrew, 2026-11-14, Q5).
// Pure. Day and time are in the display device's own time zone (the TV sits in the venue), so callers render this
// only after hydration; the server's zone is not the venue's.

const DAY_MS = 24 * 60 * 60 * 1000;

const dayKey = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

export function formatNextLiveTriviaLine(startsAt: string | null | undefined, nowMs: number): string | null {
  if (!startsAt) return null;
  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs) || startMs <= nowMs) return null;

  const start = new Date(startMs);
  const daysAway = Math.round((dayKey(start) - dayKey(new Date(nowMs))) / DAY_MS);
  const day =
    daysAway <= 0
      ? "Today"
      : daysAway === 1
        ? "Tomorrow"
        : start.toLocaleDateString(undefined, { weekday: "long" });
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `Live Trivia · ${day} ${time}`;
}

// ---------------------------------------------------------------------------------------------------------------
// The Next Live Trivia carousel slide (docs/fire-tv-app-plan.md D12, Phase 9 step 3). "LIVE TRIVIA" is the slide's
// title; this is the line under it. Same rules as above: pure, the TV's own clock and zone, after hydration.
// `formatNextLiveTriviaLine` stays until its callers move (Phase 11).

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** "Every Tue & Thu" lists days Monday first, the way a bar's week reads. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
/** A game starting at or after 5 PM is "Tonight". */
const TONIGHT_FROM_HOUR = 17;

// Newer ICU puts a narrow no-break space before AM/PM; a plain space reads the same and keeps the text predictable.
const clockTime = (date: Date): string =>
  date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\u202f/g, " ");

const joinDays = (days: string[]): string =>
  days.length <= 1 ? (days[0] ?? "") : `${days.slice(0, -1).join(", ")} & ${days[days.length - 1]}`;

export type NextLiveTriviaWhen = {
  /** "Every Thursday · 8:00 PM", "Tomorrow · 8:00 PM", "Dec 4 · 8:00 PM", "Tonight · 8:00 PM". */
  line: string;
  /** True on the game's own day: the slide adds a live "Starts in h:mm:ss" line. */
  showCountdown: boolean;
};

/**
 * The line under "LIVE TRIVIA" (D12). Null when there is no upcoming game (the slide is skipped).
 * - today → "Tonight · 8:00 PM" (from 5 PM) or "Today · 3:00 PM", with a countdown
 * - weekly, 1–6 days away → "Every Thursday · 8:00 PM"; several days → "Every Tue & Thu · 8:00 PM"
 * - one-off: tomorrow → "Tomorrow · 8:00 PM"; 2–6 days → "Thursday · 8:00 PM"
 * - 7 or more days (a weekly game with a skipped week too) → "Dec 4 · 8:00 PM"
 */
export function formatNextLiveTriviaWhen(
  next: { startsAt: string | null | undefined; recurringDays?: readonly string[] | null } | null | undefined,
  nowMs: number,
): NextLiveTriviaWhen | null {
  const startMs = Date.parse(String(next?.startsAt ?? ""));
  if (!Number.isFinite(startMs) || startMs <= nowMs) return null;

  const start = new Date(startMs);
  const time = clockTime(start);
  const daysAway = Math.round((dayKey(start) - dayKey(new Date(nowMs))) / DAY_MS);

  if (daysAway <= 0) {
    return { line: `${start.getHours() >= TONIGHT_FROM_HOUR ? "Tonight" : "Today"} · ${time}`, showCountdown: true };
  }
  if (daysAway >= 7) {
    return { line: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${time}`, showCountdown: false };
  }

  const weekly = new Set(
    (next?.recurringDays ?? []).map((day) => String(day ?? "").trim().toLowerCase().slice(0, 3)),
  );
  const weekdays = WEEK_ORDER.filter((index) => weekly.has(WEEKDAY_KEYS[index]));
  if (weekdays.length === 1) return { line: `Every ${WEEKDAY_LONG[weekdays[0]]} · ${time}`, showCountdown: false };
  if (weekdays.length > 1) {
    return { line: `Every ${joinDays(weekdays.map((index) => WEEKDAY_SHORT[index]))} · ${time}`, showCountdown: false };
  }
  if (daysAway === 1) return { line: `Tomorrow · ${time}`, showCountdown: false };
  return { line: `${WEEKDAY_LONG[start.getDay()]} · ${time}`, showCountdown: false };
}

/** The ticker's fixed segment (Phase 11): "Live Trivia · Thu 8:00 PM", "Live Trivia · Tonight 8:00 PM". */
export function formatNextLiveTriviaShort(startsAt: string | null | undefined, nowMs: number): string | null {
  const startMs = Date.parse(String(startsAt ?? ""));
  if (!Number.isFinite(startMs) || startMs <= nowMs) return null;
  const start = new Date(startMs);
  const daysAway = Math.round((dayKey(start) - dayKey(new Date(nowMs))) / DAY_MS);
  const day =
    daysAway <= 0
      ? start.getHours() >= TONIGHT_FROM_HOUR
        ? "Tonight"
        : "Today"
      : daysAway >= 7
        ? start.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : WEEKDAY_SHORT[start.getDay()];
  return `Live Trivia · ${day} ${clockTime(start)}`;
}
