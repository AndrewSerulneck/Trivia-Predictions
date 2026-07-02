import { ScreenCountdown } from "@/components/venue-screen/ScreenCountdown";
import { ScreenLeaderboard } from "@/components/venue-screen/ScreenLeaderboard";
import type { VenueScreenState } from "@/lib/venueScreen";

type LiveTriviaState = Extract<VenueScreenState, { mode: "live-trivia" }>;

type LiveTriviaIntermissionScreenProps = {
  state: LiveTriviaState;
};

export function LiveTriviaIntermissionScreen({ state }: LiveTriviaIntermissionScreenProps) {
  const live = state.liveTrivia;
  const venueName = state.venue.displayName ?? state.venue.name;
  const isFinal = live.phase === "final";

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-8 px-10 pb-12 text-center">
      <div>
        <p className="text-2xl font-black uppercase tracking-[0.18em] text-white/52">{venueName}</p>
        <h2 className="mt-3 text-[clamp(4rem,7vw,8rem)] font-black leading-none text-white">
          {isFinal ? "Final Standings" : "Round Break"}
        </h2>
        <p className="mt-4 text-3xl font-black uppercase tracking-[0.14em] text-amber-200">
          {isFinal ? "Live Trivia Champion Board" : `Round ${live.roundNumber ?? "-"} Leaderboard`}
        </p>
      </div>

      <ScreenLeaderboard entries={live.leaderboard} emptyLabel="No scores yet" maxRows={9} />

      {!isFinal ? (
        <div className="mt-2">
          <ScreenCountdown seconds={live.secondsRemaining} label="Next Round" tone="amber" size="medium" />
        </div>
      ) : null}
    </section>
  );
}
