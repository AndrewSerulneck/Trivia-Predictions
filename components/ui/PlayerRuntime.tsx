"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { isPlayerRuntimePath } from "@/lib/playerRuntimePaths";

/**
 * The five browser-only runtimes that belong to PLAYER surfaces, loaded on
 * demand instead of statically from the root layout.
 *
 * Why `next/dynamic` and not a plain conditional import: a static import in the
 * layout puts the code in the layout's own chunk, which every route downloads
 * no matter what the component then decides to render. `next/dynamic` moves
 * each one into a chunk that is fetched only when it first renders — so
 * `/owner/*` and `/admin` never download any of it. The biggest single win is
 * `AnimationOverlay`, which statically pulls in all 18 gameplay animation
 * components through `ANIMATION_REGISTRY`.
 *
 * `ssr: false` is correct for all five. Four render `null` until an effect says
 * otherwise (they read `window`, `localStorage` or `matchMedia`). The exception
 * is `GlobalTransitionOverlay`: while idle it renders a 1px invisible `<img>`
 * that warms the transition logo. That markup is NOT worth server-rendering —
 * it is a cache warm-up, not content — but do not restate it as "all five
 * render null", because the next person to read that will conclude the warm-up
 * happens server-side. It does not: it happens when the chunk mounts at
 * hydration, together with the component's own `new Image()` preload.
 *
 * TIMING NOTE: the chunks start loading at hydration, so a listener-based
 * runtime is attached a few milliseconds later than before. The only
 * event-driven one is `GlobalTransitionOverlay` (`tp:global-transition-show`),
 * and its three dispatchers are all inside `JoinFlow`'s venue-selection
 * handlers — a user tap, which needs the venue list on screen and a human to
 * read it, so it is far later than hydration + a 17 KB image. Do not add a
 * dispatcher that fires on mount without buffering the event.
 */
const AnimationOverlay = dynamic(
  () => import("@/components/animations/AnimationOverlay").then((m) => m.AnimationOverlay),
  { ssr: false }
);

const GlobalTransitionOverlay = dynamic(
  () => import("@/components/ui/GlobalTransitionOverlay").then((m) => m.GlobalTransitionOverlay),
  { ssr: false }
);

const AnalyticsRuntime = dynamic(
  () => import("@/components/analytics/AnalyticsRuntime").then((m) => m.AnalyticsRuntime),
  { ssr: false }
);

const PopupAds = dynamic(() => import("@/components/ui/PopupAds").then((m) => m.PopupAds), {
  ssr: false,
});

const MobileAdhesionAd = dynamic(
  () => import("@/components/ui/MobileAdhesionAd").then((m) => m.MobileAdhesionAd),
  { ssr: false }
);

/**
 * Mounts the player-only runtime, and only on player paths.
 *
 * Rendered from the root layout inside `AnimationTriggerProvider`, which
 * `AnimationOverlay` reads through `useAnimationOverlayState()` — keep it inside
 * that provider.
 */
export const PlayerRuntime = (): React.ReactElement | null => {
  const pathname = usePathname();

  if (!isPlayerRuntimePath(pathname)) {
    return null;
  }

  return (
    <>
      <AnimationOverlay />
      <GlobalTransitionOverlay />
      <AnalyticsRuntime />
      <PopupAds />
      <MobileAdhesionAd />
    </>
  );
};
