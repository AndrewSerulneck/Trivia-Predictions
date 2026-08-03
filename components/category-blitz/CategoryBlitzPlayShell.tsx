"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CategoryBlitzGame } from "@/components/category-blitz/CategoryBlitzGame";
import { VenuePresenceBoundary } from "@/components/venue/VenuePresenceBoundary";
import { endCurrentGameSession, startGameSession } from "@/lib/analytics";
import { markOnboardingComplete } from "@/lib/gameOnboarding";
import { forceRecoverDocumentScroll } from "@/lib/scrollLock";
import { getVenueId } from "@/lib/storage";
import {
  navigateBackToVenue,
  runVenueGameReturnTransition,
  sweepOrphanedVenueTransitionOverlays,
} from "@/lib/venueGameTransition";

const GAME_KEY = "category-blitz" as const;

/**
 * Dedicated route shell for live Category Blitz gameplay (`/category-blitz/play`).
 *
 * This deliberately does NOT use `GameLandingExperience`/`PageShell`. Those exist for
 * games that need a tutorial-slides landing step, a page header, and a scrolling page
 * body; Category Blitz has none of those (its tutorial lives on venue home) and every
 * one of those layers was actively harmful here:
 *
 *  - `GameLandingExperience` painted a `position: fixed; inset: 0` branded background
 *    (the `#a10d63` Category Blitz magenta) underneath the game. That layer never
 *    shrinks for the iOS keyboard, so ANY gap between the game frame and the true
 *    visible viewport — a sub-pixel width mismatch at rest, or a frame height lagging
 *    the keyboard's open animation — was painted magenta rather than dark. That is
 *    Findings F and G in `docs/category-blitz-app-feel-plan.md`; deleting the layer is
 *    what closes them, rather than trying to keep the frame perfectly in sync.
 *  - `PageShell` added a fixed `z-[1000]` header, a `100svh` shell, and a scroll
 *    container, all inert during play but all still laying out and compositing under
 *    the game.
 *  - The route shell was a `z-[70]` stacking context while the game portaled to
 *    `document.body` at `z-[100]`, which put `VenueAccessOverlay` (`z-[140]`, rendered
 *    inside the boundary) *behind* the game. The game now renders inside this shell,
 *    which creates no stacking context, so that overlay paints above it again.
 *
 * What this shell must keep doing (all of it was wired through GameLandingExperience
 * before, and the failure mode for each is silent rather than visual):
 *  - `startGameSession` / `endCurrentGameSession` analytics for the play session
 *  - `markOnboardingComplete` so the venue-home tutorial slides know this game was played
 *  - `VenuePresenceBoundary`, which is what gates answer submissions on venue presence
 *  - `onBack` → `runVenueGameReturnTransition` + `navigateBackToVenue`
 *  - `data-venue-game-surface`, which is the element `runVenueGameReturnTransition`
 *    animates back down into the venue-home game card
 */
export function CategoryBlitzPlayShell() {
  const router = useRouter();

  useEffect(() => {
    markOnboardingComplete(GAME_KEY);
    startGameSession("category-blitz");
    // Any lingering modal/popup scroll lock from the venue-home open transition
    // would otherwise leave the document unscrollable behind the game.
    forceRecoverDocumentScroll();
    // Defensive: the open-transition overlay's magenta shell (Finding B) is
    // always removed by its own finally block, but a bfcache restore or a
    // re-entrant transition could in principle land on this route before
    // that runs. See sweepOrphanedVenueTransitionOverlays.
    sweepOrphanedVenueTransitionOverlays();
    return () => {
      endCurrentGameSession("abandoned");
    };
  }, []);

  const backToVenue = useCallback(() => {
    endCurrentGameSession("abandoned");
    const venueId = getVenueId()?.trim() ?? "";
    if (venueId) {
      const targetPath = `/venue/${encodeURIComponent(venueId)}`;
      void runVenueGameReturnTransition({
        gameKey: GAME_KEY,
        navigate: () =>
          navigateBackToVenue({
            venuePath: targetPath,
            gameKey: GAME_KEY,
            fallbackNavigate: () => {
              router.push(targetPath);
            },
          }),
      });
      return;
    }
    router.push("/");
  }, [router]);

  return (
    <div
      data-venue-game-surface
      data-category-blitz-play-shell
      className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950"
    >
      <VenuePresenceBoundary>
        <CategoryBlitzGame onBack={backToVenue} />
      </VenuePresenceBoundary>
    </div>
  );
}
