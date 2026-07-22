import { TvAnswerReveal } from "@/components/venue-screen/TvAnswerReveal";
import { REVEAL_HOLD_SECONDS } from "@/lib/liveTriviaShared";
import type { VenueScreenState } from "@/lib/venueScreen";

type LiveTriviaState = Extract<VenueScreenState, { mode: "live-trivia" }>;

type LiveTriviaRevealScreenProps = {
  state: LiveTriviaState;
  /** Parent's ticking clock (VenueScreenClient), for pure countdown interpolation. */
  nowMs: number;
};

// The Live Trivia answer-reveal beat (Prompt I, TvAnswerReveal), shown during
// the "reveal" phase — i.e. the engine's rest_warning window, after answers
// have locked. `correctAnswer` is only present on the state during this phase
// (the security gate lives in selectVenueScreenState), so it's safe to render.
//
// The countdown is derived from `revealEndsAt` (an absolute deadline set by
// selectVenueScreenState), not by re-interpolating secondsRemaining/updatedAt
// locally — this is the field's whole reason for existing. The hold's total
// length comes from REVEAL_HOLD_SECONDS, a mirror of the engine's real
// REST_WARNING_MS (guarded against drift in tests/lib.liveTriviaShared.test.ts)
// rather than an independently-guessed local constant. Both feed
// TvAnswerReveal's depleting rail and its late-mount guard so a mid-reveal
// poll settles statically instead of replaying the bloom.
export function LiveTriviaRevealScreen({ state, nowMs }: LiveTriviaRevealScreenProps) {
  const live = state.liveTrivia;
  const revealEndsAtMs = live.revealEndsAt ? Date.parse(live.revealEndsAt) : NaN;
  const hasDeadline = Number.isFinite(revealEndsAtMs);
  const secondsRemaining = hasDeadline ? Math.max(0, (revealEndsAtMs - nowMs) / 1000) : live.secondsRemaining;
  // Already interpolated against nowMs above, so tell TvAnswerReveal not to
  // apply a second elapsed-time adjustment on top.
  const updatedAtMs = hasDeadline ? nowMs : state.updatedAt;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <TvAnswerReveal
        question={live.question ?? "Question loading…"}
        correctAnswer={live.correctAnswer ?? ""}
        roundNumber={live.roundNumber ?? 1}
        totalRounds={live.totalRounds}
        category={live.category ?? undefined}
        secondsRemaining={secondsRemaining}
        totalSeconds={REVEAL_HOLD_SECONDS}
        nowMs={nowMs}
        updatedAtMs={updatedAtMs}
      />
    </section>
  );
}
