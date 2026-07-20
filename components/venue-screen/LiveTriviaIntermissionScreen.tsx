import { TvFinalStandings } from "@/components/venue-screen/TvFinalStandings";
import { TvRoundBreak } from "@/components/venue-screen/TvRoundBreak";
import type { VenueScreenState } from "@/lib/venueScreen";

type LiveTriviaState = Extract<VenueScreenState, { mode: "live-trivia" }>;

type LiveTriviaIntermissionScreenProps = {
  state: LiveTriviaState;
  /** Parent's ticking clock (VenueScreenClient), for pure countdown interpolation. */
  nowMs: number;
};

// Live Trivia round break (Prompt B) + final winners reveal (Prompt C),
// authored via Claude Web UI and wired in. Venue name is already shown by
// VenueScreenClient's shared header, so neither panel repeats it.
export function LiveTriviaIntermissionScreen({ state, nowMs }: LiveTriviaIntermissionScreenProps) {
  const live = state.liveTrivia;
  const venueName = state.venue.displayName ?? state.venue.name;

  if (live.phase === "final") {
    return (
      <TvFinalStandings
        leaderboard={(live.leaderboard ?? []).map((entry) => ({
          id: entry.username,
          name: entry.username,
          score: entry.points,
        }))}
        venueName={venueName}
        gameId={live.gameId}
      />
    );
  }

  return (
    <TvRoundBreak
      roundNumber={live.roundNumber ?? 1}
      totalRounds={live.totalRounds}
      leaderboard={(live.leaderboard ?? []).map((entry) => ({
        id: entry.username,
        name: entry.username,
        score: entry.points,
      }))}
      secondsRemaining={live.secondsRemaining}
      nowMs={nowMs}
      updatedAtMs={state.updatedAt}
    />
  );
}
