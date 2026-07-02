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
  const formatter = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
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

type NextGameTileProps = {
  venueName: string;
  label: string;
  accentClass: string;
  startsAt: string | null;
  recurringDays?: string[];
  nowMs: number;
};

function NextGameTile({ venueName, label, accentClass, startsAt, recurringDays, nowMs }: NextGameTileProps) {
  const display = getIdleGameDisplay(startsAt, nowMs, recurringDays);
  if (!display) return null;

  return (
    <article className="flex min-h-[14rem] flex-col items-center justify-center gap-5 text-center">
      <p className="max-w-[22ch] text-balance text-[clamp(2.8rem,5.4vw,6.8rem)] font-black leading-[0.98] text-white">
        {venueName} <span className={accentClass}>{label}</span>{" "}
        {display.kind === "countdown" ? "starts in" : "is scheduled on"}
      </p>
      {display.kind === "countdown" ? (
        <p className="font-mono text-[clamp(4.5rem,10vw,11rem)] font-black leading-none text-white tabular-nums">
          {display.value}
        </p>
      ) : (
        <p className="max-w-[20ch] text-balance text-[clamp(3.4rem,7vw,8rem)] font-black leading-none text-white">
          {display.value}
        </p>
      )}
    </article>
  );
}

export function IdleVenueScreen({ state, nowMs }: IdleVenueScreenProps) {
  const venueName = state.venue.displayName ?? state.venue.name;
  const hasLiveTrivia = Boolean(state.idle.nextLiveTrivia?.startsAt);
  const hasCategoryBlitz = Boolean(state.idle.nextCategoryBlitz?.startsAt);
  const hasScheduledGames = hasLiveTrivia || hasCategoryBlitz;

  return (
    <section className="flex min-h-[100svh] flex-1 flex-col px-6 py-8 sm:px-10">
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-12 pb-12"
      >
        {hasScheduledGames ? (
          <div className="flex w-full max-w-[92rem] flex-col items-center justify-center gap-12">
            <NextGameTile
              venueName={venueName}
              label="Live Trivia"
              accentClass="text-cyan-200"
              startsAt={state.idle.nextLiveTrivia?.startsAt ?? null}
              recurringDays={state.idle.nextLiveTrivia?.recurringDays}
              nowMs={nowMs}
            />
            <NextGameTile
              venueName={venueName}
              label="Category Blitz"
              accentClass="text-amber-200"
              startsAt={state.idle.nextCategoryBlitz?.startsAt ?? null}
              recurringDays={state.idle.nextCategoryBlitz?.recurringDays}
              nowMs={nowMs}
            />
          </div>
        ) : (
          <p className="max-w-[18ch] text-center text-balance text-[clamp(3.4rem,7vw,8rem)] font-black leading-[0.96] text-white">
            {venueName} Live Games will appear here.
          </p>
        )}
      </div>

      <footer className="shrink-0 pb-1 text-center text-[clamp(1.4rem,2.2vw,2.4rem)] font-black text-white/72">
        Brought to you by Hightop Challenge™
      </footer>
    </section>
  );
}
