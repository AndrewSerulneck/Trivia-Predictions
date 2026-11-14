import { TvIdleAttract } from "@/components/venue-screen/TvIdleAttract";
import type { VenueScreenState } from "@/lib/venueScreen";

type IdleVenueState = Extract<VenueScreenState, { mode: "idle" }>;

type IdleVenueScreenProps = {
  state: IdleVenueState;
  nowMs: number;
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

// Idle screen: an app-download attract (QR to hightopchallenge.com/app) with one small line for the next
// scheduled Live Trivia game. Andrew 2026-11-14: no Category Blitz card and no "Next up" carousel; the display shows
// Category Blitz only while someone is playing it. Venue sponsor slots are not drawn here (they never were).
export function IdleVenueScreen({ state, nowMs }: IdleVenueScreenProps) {
  const venueName = state.venue.displayName ?? state.venue.name;
  return (
    <TvIdleAttract
      venueName={venueName}
      nextLiveTriviaStartsAt={state.idle.nextLiveTrivia?.startsAt ?? null}
      nowMs={nowMs}
    />
  );
}
