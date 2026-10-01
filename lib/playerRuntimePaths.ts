/**
 * Which paths get the player-only browser runtime.
 *
 * The root layout used to mount `AnimationOverlay`, `GlobalTransitionOverlay`,
 * `PopupAds`, `MobileAdhesionAd` and `AnalyticsRuntime` statically on EVERY
 * route, so a partner opening the Partner Dashboard downloaded all of it —
 * including the 18 gameplay animation components `ANIMATION_REGISTRY` pulls in —
 * to run none of it. That is finding **F5** in
 * `docs/partner-dashboard-merch-button-loader-speed-plan.md`.
 *
 * `components/ui/PlayerRuntime.tsx` is the only caller. It is a pure string
 * test on purpose (no `server-only`, no React) so it can be unit-tested and so
 * the owner/admin prefix list has exactly one home.
 *
 * NOTE: `/owner/*` and `/admin` are an ordinary website, not the player PWA
 * (standing rule in `CLAUDE.md`). They have no ads, no gameplay animations and
 * no venue-game transition overlay, and `tests/owner-loader-contract.test.ts`
 * already pins that nothing under `app/owner/`, `components/owner/` or
 * `app/admin` so much as mentions `tp:global-transition`.
 */

/**
 * Path prefixes that are NOT player surfaces. A prefix matches the path itself
 * and anything below it — `/owner` and `/owner/dashboard`, but never
 * `/ownership`.
 */
export const NON_PLAYER_PATH_PREFIXES = ["/owner", "/admin"] as const;

/**
 * True when the player runtime should mount.
 *
 * **Fails open to the player.** An unknown path (`null`, as `usePathname()` can
 * be before hydration in some renderers) counts as a player path, because the
 * cost of being wrong is asymmetric: a player silently losing their ads,
 * gameplay animations or venue-entry transition is a real regression, while a
 * partner briefly mounting five components that already no-op on `/owner/*`
 * costs only the bytes this change is saving.
 */
export const isPlayerRuntimePath = (pathname: string | null | undefined): boolean => {
  if (!pathname) {
    return true;
  }
  return !NON_PLAYER_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
};
