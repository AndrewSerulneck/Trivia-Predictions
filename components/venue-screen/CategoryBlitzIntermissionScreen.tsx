import { ScreenLeaderboard } from "@/components/venue-screen/ScreenLeaderboard";
import type { VenueScreenState } from "@/lib/venueScreen";

type CategoryBlitzState = Extract<VenueScreenState, { mode: "category-blitz" }>;

type CategoryBlitzIntermissionScreenProps = {
  state: CategoryBlitzState;
};

export function CategoryBlitzIntermissionScreen({
  state,
}: CategoryBlitzIntermissionScreenProps) {
  const blitz = state.categoryBlitz;
  const venueName = state.venue.displayName ?? state.venue.name;
  const isResults = blitz.phase === "results";

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-8 px-10 pb-12 text-center">
      <div>
        <p className="text-2xl font-black uppercase tracking-[0.18em] text-white/52">{venueName}</p>
        <h2 className="mt-3 text-[clamp(4rem,7vw,8rem)] font-black leading-none text-white">
          {isResults ? "Round Results" : "Round Intermission"}
        </h2>
        <p className="mt-4 text-3xl font-black uppercase tracking-[0.14em] text-emerald-200">
          {isResults ? "Category Blitz Leaderboard" : "Scores locked while the next round loads"}
        </p>
      </div>

      <ScreenLeaderboard entries={blitz.leaderboard} emptyLabel="Scores are coming in" maxRows={9} />
    </section>
  );
}
