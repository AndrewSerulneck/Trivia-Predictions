import { TvQuestionReveal } from "@/components/venue-screen/TvQuestionReveal";
import type { VenueScreenState } from "@/lib/venueScreen";

type LiveTriviaState = Extract<VenueScreenState, { mode: "live-trivia" }>;

type LiveTriviaScreenProps = {
  state: LiveTriviaState;
  /** Parent's ticking clock (VenueScreenClient), for pure countdown interpolation. */
  nowMs: number;
};

// Live Trivia question view (Prompt A, authored via Claude Web UI + wired in).
// Venue name is already shown by VenueScreenClient's header — this panel owns
// only the question/category/round/timer content.
export function LiveTriviaScreen({ state, nowMs }: LiveTriviaScreenProps) {
  const live = state.liveTrivia;

  return (
    <section className="flex flex-1 flex-col">
      <TvQuestionReveal
        question={live.question ?? "Question loading…"}
        category={live.category ?? "Live Trivia"}
        roundNumber={live.roundNumber ?? 1}
        totalRounds={live.totalRounds}
        secondsRemaining={live.secondsRemaining}
        nowMs={nowMs}
        updatedAtMs={state.updatedAt}
      />
    </section>
  );
}
