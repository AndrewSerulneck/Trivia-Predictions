// What leaves the native app for the phone's own browser
// (docs/native-app-store-plan.md §2 items 2 and 12, Phases 2E, 3 and 3B.1). Pure; no React.
//
// ONE list, two readers:
//   - the shell: `plugins.HightopShell.openInBrowser.paths` in
//     native/capacitor.config.json, which the iOS/Android wrappers apply to every
//     full page load on the apex (links, location.href, redirects);
//   - the web: a client-side (Next router) navigation never reaches the shell,
//     and today the app also loads `/owner` on `play.` (split off), so proxy.ts
//     rewrites every app request for a web-only page to its static notice page
//     (`webOnlyNoticePath`, app/in-app-notice/[page]/page.tsx). Decided by the
//     request's User-Agent at the edge, so browsers keep the static pages and
//     the page's own code (Stripe, signup, admin fetches) never runs in the app.
// tests/native-app-contract.test.ts fails when the two drift.
//
// The app is for PLAYERS ONLY (plan §2 item 12, §5 "No partner surface in the
// app"): `/owner` is listed, so the partner sign-in, the Partner Dashboard,
// billing and signup all open in the browser, and so does the TV pairing page
// `/tv`. Legal pages stay in the app (Apple wants them reachable).

/** Marketing pages: the app has none (Phase 2E). `/` is the apex root only (it rewrites to /info). */
export const APP_MARKETING_LINK_OUT_PATHS = ["/", "/info", "/faqs", "/advertise"] as const;

export type WebOnlyPagePath = "/owner" | "/tv" | "/admin";

/**
 * Pages that only work on the website: every partner page (`/owner/*` — sign-in,
 * dashboard, billing, signup; no purchase buttons in the app, plan §5), the venue
 * TV pairing page, and /admin (never reachable in the app). Each entry also
 * matches the paths below it.
 */
export const APP_WEB_ONLY_PAGES: Record<WebOnlyPagePath, { title: string; body: string; openPath: string }> = {
  "/owner": {
    // `/owner` itself has no page; the notice opens the partner sign-in.
    openPath: "/owner/login",
    title: "The Partner Dashboard is on our website",
    body: "Venue partners sign in at hightopchallenge.com in any web browser. This app is for players.",
  },
  "/tv": {
    openPath: "/tv",
    title: "The venue TV screen is on our website",
    body: "Venue partners set up the TV screen at hightopchallenge.com/tv in the TV's web browser. This app is for players.",
  },
  "/admin": {
    openPath: "/admin",
    title: "Admin opens in your browser",
    body: "The Hightop admin tools aren't part of the app.",
  },
};

export const APP_WEB_ONLY_PATHS = Object.keys(APP_WEB_ONLY_PAGES) as WebOnlyPagePath[];

/** Everything the shell sends to the browser, in config order. */
export const APP_LINK_OUT_PATHS: readonly string[] = [...APP_MARKETING_LINK_OUT_PATHS, ...APP_WEB_ONLY_PATHS];

const trimTrailingSlash = (pathname: string): string =>
  pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/";

/** The shell's matcher: `/` matches only the root; anything else matches itself and below. */
const matchesEntry = (path: string, entry: string): boolean =>
  path === entry || (entry !== "/" && path.startsWith(`${entry}/`));

/** The shell's matcher, mirrored for tests. */
export const isAppLinkOutPath = (pathname: string): boolean => {
  const path = trimTrailingSlash(pathname);
  return APP_LINK_OUT_PATHS.some((entry) => matchesEntry(path, entry));
};

/** The web-only entry a path falls under (`/owner/dashboard` → `/owner`), or null. */
export const webOnlyPageFor = (pathname: string): WebOnlyPagePath | null => {
  const path = trimTrailingSlash(pathname);
  return APP_WEB_ONLY_PATHS.find((entry) => matchesEntry(path, entry)) ?? null;
};

/** Where proxy.ts rewrites an app request for a web-only page: one static page per entry. */
export const WEB_ONLY_NOTICE_ROUTE = "/in-app-notice";

/** `/owner` → `/in-app-notice/owner` (app/in-app-notice/[page]/page.tsx). */
export const webOnlyNoticePath = (page: WebOnlyPagePath): string => `${WEB_ONLY_NOTICE_ROUTE}${page}`;
