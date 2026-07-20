import { TvLetterReveal } from "@/components/venue-screen/TvLetterReveal";
import type { VenueScreenState } from "@/lib/venueScreen";

type CategoryBlitzState = Extract<VenueScreenState, { mode: "category-blitz" }>;

type CategoryBlitzScreenProps = {
  state: CategoryBlitzState;
  /** Parent's ticking clock (VenueScreenClient), for pure countdown interpolation. */
  nowMs: number;
};

// Category Blitz round view (Prompt D, authored via Claude Web UI + wired in).
// Venue name is already shown by VenueScreenClient's header — this panel owns
// only the letter/category/timer content.
export function CategoryBlitzScreen({ state, nowMs }: CategoryBlitzScreenProps) {
  const blitz = state.categoryBlitz;

  return (
    <section className="flex flex-1 flex-col">
      <TvLetterReveal
        letter={blitz.letter ?? "-"}
        categories={blitz.categories}
        secondsRemaining={blitz.secondsRemaining}
        nowMs={nowMs}
        updatedAtMs={state.updatedAt}
        roundId={blitz.roundId ?? undefined}
      />
    </section>
  );
}
