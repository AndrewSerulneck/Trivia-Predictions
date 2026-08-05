# Phase 3 — PWA shell: manifest, icons, iOS meta

**Model:** sonnet / high.

Make the site installable. Ship it **inert**: nothing prompts anyone, and a player who never
installs sees zero difference. This phase changes no existing page behavior.

## Settled decisions (master plan §2 — binding, do not revisit)

- **Players only.** The PWA targets the player game surface. Partners (`/owner/*`) and admins
  (`/admin`) stay an ordinary website.
- **NO SERVICE WORKER.** Not `next-pwa`, not `workbox`, not a hand-rolled caching one. iOS
  does not need one to install. If Android's `beforeinstallprompt` proves to require one,
  register a trivial **pass-through with zero caching** and record that in the run log.
- **Scope is baked into every install at install time**, and the player origin is becoming
  `play.hightopchallenge.com` under `NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED`. Installs made from
  the apex would break when that flag flips. This is why promotion ships off (Phase 5).

## Do

1. **Add `app/manifest.ts`** (Next.js metadata route, typed `MetadataRoute.Manifest` — do not
   hand-write a static `public/manifest.json`):
   - `name: "Hightop Challenge"`, a short name that fits under a home-screen icon.
   - `display: "standalone"`. (`"fullscreen"` is ignored by iOS and would only differ on
     Android; standalone is the correct, predictable choice for both.)
   - **`start_url: "/"`.** Critical and non-negotiable: an installed app starts with an empty
     cookie jar, and `proxy.ts`'s gate redirects cookie-less requests to `/`. Any game route
     as `start_url` means the app cold-launches into a redirect. `/` is the join flow, which
     is exactly where a fresh install should land.
   - `scope: "/"`.
   - `background_color` and `theme_color` matching the app's dark base `#020617` (already the
     `themeColor` in `app/layout.tsx`), so the launch splash does not flash white.
   - `orientation`: **omit it.** Do not lock orientation — the entire feature depends on the
     player freely rotating to landscape.
   - Icons per the next step.

2. **Generate the icon set.** `sharp` is already available in `node_modules`. Source from an
   existing brand asset — `public/brand/HTC_Logo_Final_Transparent copy.png` or
   `public/brand/htc-logo.png` (inspect both, pick the higher-resolution square-croppable
   one). Write a small `scripts/` generator so the set is reproducible, and commit the output
   under `public/icons/`:
   - 192×192 and 512×512 PNG, `purpose: "any"`.
   - A 512×512 **maskable** variant with the logo inset to the safe zone (roughly 80% of the
     canvas on the app's dark background) so Android does not crop it into a circle badly.
   - `apple-touch-icon.png` at 180×180. iOS ignores the manifest's icons for the home screen
     and uses this link tag — omitting it produces a screenshot-of-the-page icon, which looks
     broken.

3. **Add the iOS meta tags** in `app/layout.tsx`'s `<head>` (or via the `metadata` export
   where Next supports it — `appleWebApp` in the Metadata type covers most of this):
   - `apple-mobile-web-app-capable: yes` (this, not the manifest, is what gives iOS the
     chromeless standalone window).
   - `apple-mobile-web-app-status-bar-style: black-translucent` so the app extends under the
     status bar — pairs with the existing `viewportFit: "cover"`. Phase 4 owns making sure
     content is not hidden beneath it.
   - `apple-mobile-web-app-title` — the short home-screen label.
   - The `apple-touch-icon` link.

4. **Add a `lib/pwa.ts` detection helper.** A single typed source of truth for "are we running
   installed," used by Phases 4 and 5. Must check **both**
   `window.matchMedia("(display-mode: standalone)").matches` and the iOS-only
   `navigator.standalone` — iOS Safari historically reports only the latter. Must be
   SSR-safe (guard `typeof window`). Add the `navigator.standalone` type augmentation
   properly; **no `any`**.

## Do not

- Do not register a service worker.
- Do not add an install prompt, banner, or coach mark — that is Phase 5 and it is flag-gated.
- Do not change `proxy.ts`.
- Do not set `orientation` in the manifest.

## Verify

`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`. Confirm `/manifest.webmanifest`
is emitted by the build and that the JSON is well-formed.

## Run-log entry must include

The final `start_url`/`scope`, whether a service worker was registered (and why, if so), the
icon paths generated, and the exported name of the standalone-detection helper so Phases 4
and 5 use it instead of re-implementing detection.
