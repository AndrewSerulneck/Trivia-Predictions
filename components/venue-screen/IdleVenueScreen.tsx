import { TvIdleAttract, type NextGame } from "@/components/venue-screen/TvIdleAttract";
import type { VenueScreenState } from "@/lib/venueScreen";

type IdleVenueState = Extract<VenueScreenState, { mode: "idle" }>;

type IdleVenueScreenProps = {
  state: IdleVenueState;
  nowMs: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_LABELS: Record<string, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

export function formatIdleCountdown(seconds: number | null): string {
  if (seconds === null) return "Schedule coming soon";

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safeSeconds / 86_400);
  const hours = Math.floor((safeSeconds % 86_400) / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainingSeconds = safeSeconds % 60;

  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h`;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatScheduleDays(days: string[] | null | undefined, startsAt: string, nowMs: number): string {
  const normalizedDays = Array.from(
    new Set(
      (days ?? [])
        .map((day) => String(day ?? "").trim().toLowerCase().slice(0, 3))
        .filter((day) => day in WEEKDAY_LABELS),
    ),
  );

  if (normalizedDays.length > 0) {
    const labels = normalizedDays.map((day) => WEEKDAY_LABELS[day]);
    if (labels.length === 1) return labels[0] ?? "";
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  }

  const startMs = Date.parse(startsAt);
  if (!Number.isFinite(startMs)) return "";
  const formatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });
  const date = formatter.format(new Date(startMs));
  const now = new Date(nowMs);
  const sameYear = new Date(startMs).getFullYear() === now.getFullYear();
  return sameYear ? date : `${date}, ${new Date(startMs).getFullYear()}`;
}

export function getIdleGameDisplay(
  startsAt: string | null | undefined,
  nowMs: number,
  recurringDays?: string[],
): { kind: "countdown"; value: string } | { kind: "schedule"; value: string } | null {
  if (!startsAt) return null;
  const targetMs = Date.parse(startsAt);
  if (!Number.isFinite(targetMs)) return null;
  const remainingMs = Math.max(0, targetMs - nowMs);
  if (remainingMs <= DAY_MS) {
    return { kind: "countdown", value: formatIdleCountdown(Math.ceil(remainingMs / 1_000)) };
  }
  return { kind: "schedule", value: formatScheduleDays(recurringDays, startsAt, nowMs) };
}

// Idle / attract-mode screen (Prompt F, authored via Claude Web UI + wired
// in). Replaces the previous side-by-side game tiles with a rotating
// "Next up" carousel — all timing (drift, breathing wash, card rotation)
// derives from the wall clock, so it survives being restarted or run on a
// second TV in the same room without visibly resetting. Countdown/schedule
// text is still computed by getIdleGameDisplay above, reused unchanged.
export function IdleVenueScreen({ state, nowMs }: IdleVenueScreenProps) {
  const venueName = state.venue.displayName ?? state.venue.name;

  const nextGames: NextGame[] = [];
  const liveTrivia = state.idle.nextLiveTrivia;
  if (liveTrivia?.startsAt) {
    const display = getIdleGameDisplay(liveTrivia.startsAt, nowMs, liveTrivia.recurringDays);
    nextGames.push({
      label: liveTrivia.title || "Live Trivia",
      startsAt: liveTrivia.startsAt,
      countdownText: display?.value,
    });
  }
  const categoryBlitz = state.idle.nextCategoryBlitz;
  if (categoryBlitz?.startsAt) {
    const display = getIdleGameDisplay(categoryBlitz.startsAt, nowMs, categoryBlitz.recurringDays);
    nextGames.push({
      label: "Category Blitz",
      startsAt: categoryBlitz.startsAt,
      countdownText: display?.value,
    });
  }

  return <TvIdleAttract venueName={venueName} nextGames={nextGames} nowMs={nowMs} />;
}
