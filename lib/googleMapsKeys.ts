/**
 * NOT `server-only`. `serverGoogleMapsKey()` is called from `lib/geolocation.ts`,
 * a module that also exports the browser geolocation helpers and is therefore
 * imported by `"use client"` components (JoinFlow, FantasyHome…). A `server-only`
 * import here would fail their build. There is no leak: none of the three env
 * vars below is `NEXT_PUBLIC_*`, so all three resolve to `""` in a browser
 * bundle, and the two browser-key accessors are only ever *called* from API
 * routes. The real boundary is Finding #5's `publicBrowserGoogleMapsKey()`.
 *
 * Google Maps Platform uses ONE Google Cloud project but needs TWO API keys,
 * because a single key cannot be safely restricted for both use cases at once:
 *
 * - **Browser key** — handed to the client by `/api/admin/maps-key` and
 *   `/api/signup/maps-key`, then used to load the Maps JavaScript API in the
 *   page. Because `/api/signup/maps-key` serves it to unauthenticated strangers,
 *   it MUST carry an **HTTP-referrer restriction** (Google Cloud Console →
 *   Credentials → the key → Application restrictions → "Websites") limited to our
 *   own hosts, or a scraper can bill Google against our account. Referrer
 *   restrictions only work for browser-loaded APIs (Maps JS, Static/Street View
 *   from a page).
 *
 * - **Server key** — used by server-side `fetch` in `lib/geolocation.ts`
 *   (Places API v1), the `venue-map` routes (Static Maps), and
 *   `/api/admin/places`.
 *   A server request carries no matching `Referer`, so a referrer-restricted key
 *   returns `REQUEST_DENIED` for these. This key must therefore be restricted a
 *   different way — by **IP** (the Vercel egress range) or left application-
 *   unrestricted but **API-restricted** to Places + Static Maps + Geocoding —
 *   and it is NEVER sent to a browser.
 *
 * THE FALLBACK IS AUTHENTICATED-ONLY. `browserGoogleMapsKey()` falls back to
 * `GOOGLE_MAPS_API_KEY` when `GOOGLE_MAPS_BROWSER_KEY` is unset, which is
 * exactly today's single-key behavior and is safe behind `requireAdminAuth`.
 * The PUBLIC handout uses `publicBrowserGoogleMapsKey()`, which has NO fallback
 * — an unset browser key there means a 503, never the unrestricted server key
 * handed to a stranger at 10 req/min/IP (Finding #5 of
 * docs/self-serve-signup-review-fixes-plan.md). Do not collapse the two.
 *
 * Flip the split by:
 *   1. creating a referrer-restricted browser key in Google Cloud Console,
 *   2. setting `GOOGLE_MAPS_BROWSER_KEY` to it (Vercel + `.env`),
 *   3. adding an IP/API restriction to the now-server-only `GOOGLE_MAPS_API_KEY`.
 *
 * Step 2 is a hard prerequisite of `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED`: with
 * it unset, `/api/signup/maps-key` 503s and the wizard's map steps cannot load.
 * That is deliberate — a visible failure beats a silent key leak, and it makes a
 * mid-rollout env skew loud instead of expensive.
 *
 * See `docs/self-serve-signup-runbook.md` §2.
 */

/**
 * The referrer-restricted key safe to hand to a browser, falling back to the
 * single-key `GOOGLE_MAPS_API_KEY`.
 *
 * ONLY for authenticated surfaces (`/api/admin/maps-key`). A public route must
 * use `publicBrowserGoogleMapsKey()`.
 */
export const browserGoogleMapsKey = (): string =>
  (process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() || process.env.GOOGLE_MAPS_API_KEY?.trim()) ?? "";

/**
 * The referrer-restricted browser key, or "" — **never** the server key.
 *
 * This is what `/api/signup/maps-key` serves to unauthenticated strangers. It
 * fails closed on purpose: returning `GOOGLE_MAPS_API_KEY` here would publish an
 * un-referrer-restricted key that also carries Places, Geocoding and Static Maps
 * to anyone who can reach the route.
 */
export const publicBrowserGoogleMapsKey = (): string =>
  process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() ?? "";

/** The server-only key for Places / Static Maps / Geocoding `fetch` calls. */
export const serverGoogleMapsKey = (): string => process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
