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
 * Venue display (TV) paths: `/venue/<id>/screen` (and anything below it), `/tv` and `/tv/<code>`, and the
 * Hightop Challenge TV app's `/tv-app` (Connect screen, Try demo; docs/fire-tv-app-plan.md Phase 3).
 *
 * The display is a spectator surface, not a player one. It gets NONE of the player runtime
 * (ads, adhesion banner, gameplay animations, transition overlay, analytics) — a Carrabba's
 * pop-up once leaked onto a TV because `/venue/<id>/screen` matched the `venue` ad page key.
 * `docs/live-trivia-pregame-and-display-cleanup-plan.md` Phase 1.
 */
export const isVenueDisplayPath = (pathname: string | null | undefined): boolean => {
  if (!pathname) {
    return false;
  }
  return (
    /^\/venue\/[^/]+\/screen(\/|$)/.test(pathname) ||
    pathname === "/tv" ||
    pathname.startsWith("/tv/") ||
    pathname === "/tv-app" ||
    pathname.startsWith("/tv-app/")
  );
};

/**
 * True when the player runtime should mount.
 *
 * **Fails open to the player.** An unknown path (`null`, as `usePathname()` can
 * be before hydration in some renderers) counts as a player path, because the
 * cost of being wrong is asymmetric: a player silently losing their ads,
 * gameplay animations or venue-entry transition is a real regression, while a
 * partner briefly mounting five components that already no-op on `/owner/*`
 * costs only the bytes this change is saving.
 *
 * Display paths are NOT player paths. The display page is server-rendered with a real pathname,
 * so `null` only happens before hydration and the next render corrects it; `PopupAds` and
 * `MobileAdhesionAd` also check `isVenueDisplayPath` themselves to cover that gap.
 */
export const isPlayerRuntimePath = (pathname: string | null | undefined): boolean => {
  if (!pathname) {
    return true;
  }
  if (isVenueDisplayPath(pathname)) {
    return false;
  }
  return !NON_PLAYER_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
};
