// What leaves the native app for the phone's own browser
// (docs/native-app-store-plan.md §2 item 2, Phases 2E and 3). Pure; no React.
//
// ONE list, two readers:
//   - the shell: `plugins.HightopShell.openInBrowser.paths` in
//     native/capacitor.config.json, which the iOS/Android wrappers apply to every
//     full page load on the apex (links, location.href, redirects);
//   - the web: a client-side (Next router) navigation never reaches the shell,
//     so each web-only page also renders WebOnlyNotice in the app instead of
//     itself (components/native/WebOnlyInApp.tsx, from its layout).
// tests/native-app-contract.test.ts fails when the two drift.
//
// Never list `/owner` itself: the partner sign-in and the Partner Dashboard stay
// IN the app. Legal pages stay in the app too (Apple wants them reachable).

/** Marketing pages: the app has none (Phase 2E). `/` is the apex root only (it rewrites to /info). */
export const APP_MARKETING_LINK_OUT_PATHS = ["/", "/info", "/faqs", "/advertise"] as const;

export type WebOnlyPagePath = "/owner/signup" | "/owner/register" | "/owner/billing/setup" | "/admin";

/**
 * Pages that only work on the website: partner signup and paying (Stripe — no
 * purchase buttons in the app, plan §5), and /admin (never reachable in the app).
 * Each entry also matches the paths below it.
 */
export const APP_WEB_ONLY_PAGES: Record<WebOnlyPagePath, { title: string; body: string }> = {
  "/owner/signup": {
    title: "Partner sign-up is on our website",
    body: "Creating a venue account and choosing a plan happen in your browser. Once you're set up, sign in here to run your venue.",
  },
  "/owner/register": {
    title: "Partner sign-up is on our website",
    body: "Creating a venue account and choosing a plan happen in your browser. Once you're set up, sign in here to run your venue.",
  },
  "/owner/billing/setup": {
    title: "Subscriptions are managed on the web",
    body: "Starting or changing your subscription happens in your browser. Your billing status still shows here in the app.",
  },
  "/admin": {
    title: "Admin opens in your browser",
    body: "The Hightop admin tools aren't part of the app.",
  },
};

export const APP_WEB_ONLY_PATHS = Object.keys(APP_WEB_ONLY_PAGES) as WebOnlyPagePath[];

/** Everything the shell sends to the browser, in config order. */
export const APP_LINK_OUT_PATHS: readonly string[] = [...APP_MARKETING_LINK_OUT_PATHS, ...APP_WEB_ONLY_PATHS];

/** The shell's matcher, mirrored for tests: `/` matches only the root; anything else matches itself and below. */
export const isAppLinkOutPath = (pathname: string): boolean => {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/";
  return APP_LINK_OUT_PATHS.some((entry) => path === entry || (entry !== "/" && path.startsWith(`${entry}/`)));
};
