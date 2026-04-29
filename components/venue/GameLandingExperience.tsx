"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { getVenueId } from "@/lib/storage";
import { type VenueGameKey } from "@/lib/venueGameCards";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";
import { GameRuleCardPanel, GAME_CARD_BG_BY_KEY } from "@/components/venue/GameIdentityPanel";
import { PageShell } from "@/components/ui/PageShell";

export function GameLandingExperience({
  gameKey,
  playLabel = "Play",
  children,
}: {
  gameKey: VenueGameKey;
  playLabel?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPlaying, setIsPlaying] = useState(false);
  const showTriviaTopNav = gameKey === "trivia" && isPlaying;

  const backToVenue = useCallback(() => {
    const venueId = getVenueId()?.trim() ?? "";
    if (venueId) {
      const targetPath = `/venue/${encodeURIComponent(venueId)}`;
      void runVenueGameReturnTransition({
        gameKey,
        navigate: () =>
          navigateBackToVenue({
            venuePath: targetPath,
            fallbackNavigate: () => {
              router.push(targetPath);
            },
          }),
      });
      return;
    }
    router.push("/");
  }, [gameKey, router]);

  return (
    <div
      data-venue-game-surface
      className={`tp-game-page fixed inset-0 z-[70] min-h-[100dvh] w-screen overflow-x-hidden ${
        isPlaying ? "overflow-y-auto" : "overflow-y-hidden"
      } ${GAME_CARD_BG_BY_KEY[gameKey]}`}
    >
      <PageShell
        title=""
        showPageTitle={false}
        showUserStatus={showTriviaTopNav}
        showAlerts={showTriviaTopNav}
        noContainer
      >
        {isPlaying ? (
          <div className="relative min-h-full px-2 py-2 sm:px-3 sm:py-3">{children}</div>
        ) : (
          <div className="mx-auto flex h-full min-h-0 w-full max-w-[28rem] flex-col px-1.5 pb-[max(env(safe-area-inset-bottom,0px),6px)] pt-1.5 sm:px-2 sm:pt-2">
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <div
                className="aspect-[3/4.9]"
                style={{ width: "min(95vw, 22.5rem, calc((100dvh - 5.75rem) * 0.6122449))" }}
              >
                <GameRuleCardPanel gameKey={gameKey} layout="landing" className="h-full w-full" />
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 pt-3 sm:pt-4">
              <button
                type="button"
                onClick={backToVenue}
                className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-emerald-500 px-3 py-2 text-base font-black text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setIsPlaying(true)}
                className="tp-clean-button inline-flex min-h-[52px] items-center justify-center rounded-full bg-blue-700 px-3 py-2 text-base font-black text-white"
              >
                {playLabel}
              </button>
            </div>
          </div>
        )}
      </PageShell>
    </div>
  );
}
