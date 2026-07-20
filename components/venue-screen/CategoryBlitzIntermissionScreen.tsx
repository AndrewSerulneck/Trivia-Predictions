import { TvBlitzResults } from "@/components/venue-screen/TvBlitzResults";
import type { VenueScreenState } from "@/lib/venueScreen";

type CategoryBlitzState = Extract<VenueScreenState, { mode: "category-blitz" }>;

type CategoryBlitzIntermissionScreenProps = {
  state: CategoryBlitzState;
  /** Parent's ticking clock (VenueScreenClient), for pure countdown interpolation. */
  nowMs: number;
};

// Category Blitz results / intermission (Prompt E, authored via Claude Web UI
// + wired in). This backend only emits two non-round states — "intermission"
// and "results" — so it maps intermission → the component's "next" phase
// (countdown to the next round) and never passes "scoring" (there's no
// distinct tallying state exposed here). Venue name is already shown by
// VenueScreenClient's shared header.
export function CategoryBlitzIntermissionScreen({ state, nowMs }: CategoryBlitzIntermissionScreenProps) {
  const blitz = state.categoryBlitz;

  return (
    <TvBlitzResults
      phase={blitz.phase === "results" ? "results" : "next"}
      letter={blitz.letter ?? "-"}
      leaderboard={(blitz.leaderboard ?? []).map((entry) => ({
        id: entry.username,
        name: entry.username,
        score: entry.points,
      }))}
      secondsRemaining={blitz.secondsRemaining}
      nowMs={nowMs}
      updatedAtMs={state.updatedAt}
    />
  );
}
