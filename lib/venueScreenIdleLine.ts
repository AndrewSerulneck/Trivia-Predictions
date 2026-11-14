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
