"use client";

import { HightopLoader } from "@/components/ui/HightopLoader";

/**
 * The player route-transition screen (the root `app/loading.tsx`).
 *
 * `delayMs={0}` because this IS the answer to the tap — the dark backdrop has to
 * arrive immediately. The label is the one `BouncingBallLoader` drew by default
 * before this replaced it (plan Phase 4b, Andrew's Q1: "get rid of the basketball").
 */
export function RouteLoadingScreen() {
  return (
    <HightopLoader
      variant="fullScreen"
      size="lg"
      delayMs={0}
      showLabel
      label="Hightop Challenge: Game On."
    />
  );
}
