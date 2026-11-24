import { TvCarousel } from "@/components/venue-screen/TvCarousel";
import { formatIdleCountdown } from "@/lib/venueScreenIdleLine";
import type { TvCarouselSlideId } from "@/lib/tvCarousel";
import type { VenueScreenState } from "@/lib/venueScreen";

type IdleVenueState = Extract<VenueScreenState, { mode: "idle" }>;

type IdleVenueScreenProps = {
  state: IdleVenueState;
  nowMs: number;
  /** Pin one carousel slide (`?mode=carousel*&slide=`, Try demo). Null = the carousel rotates. */
  previewSlide?: TvCarouselSlideId | null;
};

// Kept as the home of the idle countdown formatter for the screens that import it from here.
export { formatIdleCountdown };

// Idle screen: the carousel (docs/fire-tv-app-plan.md D20, Phase 11): Next Live Trivia, the Pick 'Em board, the
// All-Time Leaderboard, Prizes and the app-download screen, with a score ticker and a corner QR. Slides with nothing
// to show are skipped, so a venue with no data sees today's app-download screen. No Category Blitz card (Andrew
// 2026-11-14): the display shows Category Blitz only while someone is playing it. Sponsor slots are not drawn here.
export function IdleVenueScreen({ state, nowMs, previewSlide = null }: IdleVenueScreenProps) {
  return <TvCarousel state={state} nowMs={nowMs} pinnedSlide={previewSlide} />;
}
