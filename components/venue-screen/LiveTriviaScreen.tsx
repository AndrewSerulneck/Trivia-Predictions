import { ScreenCountdown } from "@/components/venue-screen/ScreenCountdown";
import type { VenueScreenState } from "@/lib/venueScreen";

type LiveTriviaState = Extract<VenueScreenState, { mode: "live-trivia" }>;

type LiveTriviaScreenProps = {
  state: LiveTriviaState;
};

export function LiveTriviaScreen({ state }: LiveTriviaScreenProps) {
  const live = state.liveTrivia;
  const venueName = state.venue.displayName ?? state.venue.name;

  return (
    <section className="flex flex-1 flex-col justify-center gap-10 px-12 pb-16">
      <div className="flex items-end justify-between gap-8">
        <div className="min-w-0">
          <p className="text-2xl font-black uppercase tracking-[0.18em] text-white/52">{venueName}</p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <p className="rounded-lg border border-amber-200/25 bg-amber-200/10 px-5 py-3 text-3xl font-black uppercase tracking-[0.12em] text-amber-100">
              Round {live.roundNumber ?? "-"} of {live.totalRounds}
            </p>
            <p className="rounded-lg border border-cyan-200/20 bg-cyan-200/10 px-5 py-3 text-3xl font-black text-cyan-100">
              {live.category ?? "Live Trivia"}
            </p>
          </div>
        </div>
        <ScreenCountdown seconds={live.secondsRemaining} label="Question Timer" tone="white" />
      </div>

      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.065] p-10 shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-white to-amber-200" />
        <p className="text-balance text-[clamp(4rem,6vw,7rem)] font-black leading-[1.04] text-white">
          {live.question ?? "Question loading..."}
        </p>
      </div>
    </section>
  );
}
