import { TvAllTimeLeaderboard } from "@/components/venue-screen/TvAllTimeLeaderboard";
import { TvIdleAttract } from "@/components/venue-screen/TvIdleAttract";
import { TvPickEmBoard } from "@/components/venue-screen/TvPickEmBoard";
import { usePickEmScoreFlash } from "@/components/venue-screen/usePickEmScoreFlash";
import type { VenueScreenState } from "@/lib/venueScreen";
import type { VenueScreenPreviewSlide } from "@/lib/venueScreenTiming";

type IdleVenueState = Extract<VenueScreenState, { mode: "idle" }>;

type IdleVenueScreenProps = {
  state: IdleVenueState;
  nowMs: number;
  /** Debug only (`?mode=carousel*&slide=`): pin one slide until Phase 11's carousel rotates them. Null = today's screen. */
  previewSlide?: VenueScreenPreviewSlide | null;
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
export function IdleVenueScreen({ state, nowMs, previewSlide = null }: IdleVenueScreenProps) {
  const venueName = state.venue.displayName ?? state.venue.name;
  // Kept here, not in the board: this screen stays mounted while idle, so a score change is seen even when the slide
  // isn't up. Phase 11's carousel keeps the same hook above its slides.
  const scoreFlash = usePickEmScoreFlash(state.idle.pickEm?.games);

  // Phase 10 builds the Pick 'Em and All-Time slides; Phase 11 rotates them (D20) and turns the data on.
  if (previewSlide === "pick-em" && state.idle.pickEm) {
    return (
      <TvPickEmBoard
        venueName={venueName}
        games={state.idle.pickEm.games}
        leaders={state.idle.pickEm.leaders}
        nowMs={nowMs}
        flash={scoreFlash}
      />
    );
  }
  if (previewSlide === "all-time" && state.idle.allTimeLeaderboard) {
    return <TvAllTimeLeaderboard venueName={venueName} entries={state.idle.allTimeLeaderboard} />;
  }
  return (
    <TvIdleAttract
      venueName={venueName}
      nextLiveTriviaStartsAt={state.idle.nextLiveTrivia?.startsAt ?? null}
      nowMs={nowMs}
    />
  );
}
