# Native App Store Plan — Phase 3B.1 Handoff (the app is player-only)

**Date:** 2026-10-09. **Phase:** 3B.1 of `docs/native-app-store-plan.md` (Opus 5.5, high).
**State:** built and verified. **Committed locally, NOT pushed, NOT deployed.** The commit sits directly on
top of `4706072` (Phases 2D + 2E + 3, also local only); run `git log --oneline -3` to see both.

---

## Summary for Andrew (plain English)

**What changed.**
- **The app is for players only.** The app's sign-in no longer shows a "Home" button or a "Venue partner?
  Sign in" link. It is just the player sign-in.
- **Every partner page leaves the app.** Any link to the partner sign-in, dashboard, billing, signup or
  the TV setup page (`/tv`) opens Safari/Chrome. If one is reached some other way inside the app, the app
  shows "The Partner Dashboard is on our website" with an **Open in browser** button.
- **The "remember the partner" shortcut is gone** (the 2E feature that opened the app on the dashboard).
- **Support page** now says partners use the dashboard "in your web browser at hightopchallenge.com".
- **Website visitors see no change.** Partners on phones and computers sign in and use the dashboard
  exactly as before. The partner pages are now slightly cheaper to serve than after Phase 3: signup,
  register and billing setup are pre-built again, not built on every visit.

**Commits.** As you asked, 2D, 2E and 3 are committed first, so 3B.1 is a separate change you can review.
They went in as **one** commit (`4706072`), not three: about 17 files were edited by more than one of those
phases, and the in-between versions never existed on their own or were tested, so splitting them would have
meant guessing.

**Is it live?** No. Nothing is pushed. As planned, the push goes out together with 3B.2. The test apps
on the iPhone simulator and the Android emulator have the new build. **Your iPhone still has the Phase 3
build**, which is fine: once the website is deployed, the website itself keeps partner pages out of that
older app too.

**What's left.**
1. **Phase 3B.2** (`/info`: a Partner Login button you can see on phones, the "no app needed" line, the
   Square badge). You already supplied the badge and the guidelines, and approved the wording.
   **One thing changes because of what the file is:** it is Square's whole **"Built with Square"** badge
   (a white button), not a bare logo. Square's rules ("don't alter the badge", "don't change the
   proposition", 40 px clear space) mean it must be shown whole, on its own line with space around it. It
   can't sit small and inline beside "Works with your Square register!" as the plan first sketched.
   The next agent will lay it out that way.
2. Then push 2D + 2E + 3 + 3B together, and do the ~15-minute check in 3B.3 (updated device checklist
   `docs/native-app-device-checklist.md`).

**Nothing needs you right now.**

---

## For the next agent

You have none of this conversation. Read first: `CLAUDE.md` ("Native app" bullets, updated in this phase),
`docs/native-app-store-plan.md` (§2 item 12, §5 hard rules, Phase 3B and its "As built" / "Andrew's
inputs" notes), and this file.

### 1. Next phase: goal and scope

**Phase 3B.2 — `/info`: obvious Partner Login and the Square badge** (Sonnet 5.5, medium). Website only:
`app/info/page.tsx` (plus a small test). Follow the plan's 3B.2 section, with these inputs already settled:
- **Copy approved as written** (Andrew, 2026-10-09): *"Venue partners: schedule games, set rewards and
  manage billing from any web browser — no app needed."*
- **The artwork is supplied:** `public/info/Square-brand_white.png` (untracked; commit it in 3B.2). It is
  Square's official **"Built with Square" badge**: white rounded rectangle, black outline, black Square mark,
  black "Built with Square" text. 1125×320 px PNG with alpha, **1.46 MB** (too heavy to serve as is).
- **Square's guidelines (Andrew pasted them verbatim):** "Do not alter the button or badge. Do not change
  the proposition. Do not change the color. Give a good amount of clear space around the logo: at least 40
  pixels."
- Consequences:
  - Use the badge **whole**. Don't crop it to the square mark, recolour it, redraw it, re-word it or trace
    it into an SVG.
  - Give it **≥40 px clear space** on every side, so it goes on its own row near the "Works with your
    Square register!" line. The plan's "inline logo at ~20–24 px text height" idea is superseded. A
    sensible size is ~40–56 px tall (≈140–200 px wide) on phones. The white badge reads well on the dark
    hero. Check it at 360 px wide.
  - Scaling down is not "altering". Serve an optimized copy at about 2× its display size (WebP or PNG,
    aim < 30 KB) under a **new** path outside `public/brand/web/` (that folder is cached immutably for a
    year — `next.config.ts` `headers()`), for example `public/brand/partners/built-with-square-badge.webp`.
    Keep the original PNG as the source, or move it to `assets/` (not served), like the merch photos in
    `assets/store-src/`. `sharp` is already used by `scripts/optimize-brand-logo.cjs`, so copy that pattern.
  - `alt="Built with Square"` (the badge's own words), rendered with `next/image`.
  - Don't imply a partnership. Keep our own "Works with your Square register!" text separate from the
    badge.
- Out of scope: anything in the app; store badges (Phase 7); pushing/deploying (that's Andrew's call,
  together with 2D+2E+3+3B.1, after 3B.2).

### 2. Starting state

- Branch `main`. Commits on top of `858660c` (pushed): `4706072` "Native app Phases 2D + 2E + 3" and
  then the 3B.1 commit. **Neither is pushed; nothing is deployed.** Vercel still runs `858660c`'s site,
  so the live site still shows the old "Home" button in the app.
- Untracked and **deliberately left out of every commit**: `.vscode/settings.json` (not ours) and
  `public/info/Square-brand_white.png` (3B.2's input).
- Tracked iCloud conflict copies (`tests/* 2.ts`) predate this work. Mention them to Andrew before you
  delete anything.
- **Devices:** the "iPhone 17" simulator (booted) and the emulator `hightop_api36` (running) both have the
  **3B.1 debug build**. On the emulator, Chrome sits on its first-run screen, left over from the link-out
  tests. Andrew's iPhone 16 Pro still has the **Phase 3** build (installed 2026-10-09 ~06:40, free
  provisioning, stops opening ~2026-10-16). Its link-out list lacks `/owner`, but after the deploy the
  web-side gate (§4) covers it.
- **Production data:** nothing written on purpose. One side effect: the iOS probe opened
  `hightopchallenge.com/tv` in the simulator's Safari, and that page mints a TV pairing code
  (`/api/tv-pair/*`). It is an unclaimed, self-expiring code; leave it.
- No migrations, no env vars, no `vercel.json` change.

### 3. Decisions made (don't re-ask)

- **Andrew (plan §2 item 12): the app is for players only; partners use the website.** Hard rule in plan §5.
- **One combined commit for 2D+2E+3** (see the summary). Andrew asked for "commit 2D, 2E and 3"; the plan
  allowed one combined commit.
- **The in-app gate lives in `proxy.ts`, not in an `app/owner/layout.tsx`** (deviation from the plan,
  recorded in its 3B.1 "As built" note). Why: a layout that reads `headers()` turns every page under it
  into a per-visit server render. That would have been all ~14 static `/owner/*` pages, plus `/tv` on TV
  browsers, against the plan's "website `/owner/*` pages must stay as fast as today". The proxy already
  runs on every request; the check is a prefix match plus a UA substring. **Cost: zero new requests or
  function runs.** Signup/register/billing-setup also went back from `ƒ` to static (`○`).
- **`/admin` uses the same proxy gate.** Its Phase 3 layout was deleted, so there is one mechanism. (`/admin`
  still builds as `ƒ` for its own reasons, unrelated to this.)
- **`/tv` is web-only too** (the plan said "unless it breaks TV pairing": it can't, TVs don't run our app).
  `/venue/<id>/screen` (where a paired TV ends up) is NOT on the list. It is a `play.` game-host page that
  no player screen links to; add it only if Andrew asks.
- **`homeHref(isNativeApp())` stays** in `app/owner/billing/setup/page.tsx` and
  `components/signup/SignupWizard.tsx`. Those pages can no longer render in the app, but CLAUDE.md's
  `/info` rule and `tests/native-app-contract.test.ts` require that form for home controls. It is harmless.
- **`nativeLaunchUrl()` was removed** from `lib/nativeApp.ts`: its only caller was the deleted front door.
  The native shells load Universal/App Links themselves.

### 4. Files changed (this phase)

Web:
- `components/join/JoinFlow.tsx` — new optional prop `nativeAppRequest`; `inNativeApp = useIsNativeApp()
  || nativeAppRequest`. The bottom block is `{inNativeApp ? null : (<Home link>)}`. The partner link and
  the `marketingHref` import are gone. No other JoinFlow panel had a Home or `/info` control (checked).
- `app/page.tsx`, `app/join/page.tsx` — read the UA (`isNativeUserAgent`) and pass `nativeAppRequest`, so
  the app's first server paint already lacks the Home link. Without it, `useIsNativeApp` is false during
  hydration and Home would flash. Both pages were already dynamic (`searchParams`), so this costs nothing.
- Deleted: `components/join/AppFrontDoor.tsx`, `lib/appFrontDoor.ts`, `tests/lib.app-front-door.test.ts`,
  `components/native/ManageBillingOnWeb.tsx`, `components/native/WebOnlyInApp.tsx`,
  `app/owner/signup/layout.tsx`, `app/owner/register/layout.tsx`, `app/owner/billing/setup/layout.tsx`,
  `app/admin/layout.tsx`.
- Restored byte-for-byte to `858660c` (pre-2E), because their only 2E/3 edits were app branches:
  `app/owner/billing/page.tsx`, `app/owner/dashboard/page.tsx`, `components/navigation/SignOutButton.tsx`.
  `app/owner/login/page.tsx` lost only `rememberPartnerSide()`; its `backTo={{ home: true … }}` stays.
- `lib/nativeLinkOut.ts` — `WebOnlyPagePath = "/owner" | "/tv" | "/admin"`. Each `APP_WEB_ONLY_PAGES`
  entry has `title`, `body` and `openPath` (`/owner` → `/owner/login`, since `/owner` has no page). New
  `webOnlyPageFor(pathname)` (the shell's matcher: the entry itself and everything below it; `/ownership`
  doesn't match), `WEB_ONLY_NOTICE_ROUTE = "/in-app-notice"`, `webOnlyNoticePath(page)`.
- `proxy.ts` — after the domain-split block, before `isPublicPath`: if `webOnlyPageFor(pathname)` and
  `isNativeUserAgent(UA)`, it returns `NextResponse.rewrite` to `/in-app-notice/<entry>` with the query
  dropped. A browser UA never matches, so the default behaviour is unchanged. The split runs first on
  purpose: with the split on, an app request for `play./owner/x` is still 308'd to the apex, where the
  shell's link-out opens the browser.
- `app/in-app-notice/[page]/page.tsx` (new) — `generateStaticParams` for the three entries,
  `dynamicParams = false`, noindex. It renders `WebOnlyNotice`. Built as `●` (SSG).
- `components/native/WebOnlyNotice.tsx` — "Open in browser" opens the page actually asked for. After the
  rewrite, the URL bar still holds it: `window.location.pathname + search`, if it falls under the same
  entry, else `openPath`. Deliberately not `usePathname()`, which can report the rewrite target.
- `lib/nativeAppLinks.ts` — the iOS AASA on `play.` excludes `/owner`, `/owner/*`, `/tv`, `/tv/*`,
  `/admin`, `/admin/*` before `/*`. The apex still claims nothing (that test existed already). Android
  App Links can't exclude paths; a stray `play.` partner link opens the app and the gate passes it on.
- `lib/nativeApp.ts` — `nativeLaunchUrl` removed; the `App` capability comment updated.
- `app/support/page.tsx` — the partner line now says the dashboard is on the website, "in your web browser
  at hightopchallenge.com". No legal page links to pricing or Stripe (checked all five pages).

Native (`npx cap sync` regenerated the git-ignored copies of the config):
- `native/capacitor.config.json` `openInBrowser.paths`: `/owner/signup`, `/owner/register` and
  `/owner/billing/setup` → `/owner`, `/tv`. Same order as `APP_LINK_OUT_PATHS`.
- Comment-only: `HightopBridgeViewController.swift`, `HightopShellPlugin.java`, `MainActivity.java` (the
  apex bridge injection is still needed for legal pages on the apex once the split is on).

Tests / docs:
- `tests/native-app-contract.test.ts` — R5 home controls (JoinFlow has no partner link); the new
  "front door is the player sign-in" block (front-door, `ManageBillingOnWeb` and `htc_app_side` are gone
  everywhere); link-out lists = `["/admin","/owner","/tv"]`; every partner path leaves and legal pages
  stay; a "never a Subscribe/Pay button" test pinning `/owner` in both lists, the proxy rewrite lines, the
  static notice route, and no layout gates.
- `tests/proxy.behavior.test.ts` — +4 tests: app UA → notice (both hosts, query dropped); browsers
  untouched; legal/player/lookalikes not rewritten; with the split on, a `play.` partner page still 308s
  to the apex first.
- `tests/lib.native-app-phase3.test.ts` — the AASA component list includes the six exclusions.
- `CLAUDE.md` (native bullets), `docs/native-app-store-plan.md` (status line, 2D/2E/3 commit state, 3B
  status, 3B.1 as-built, 3B.2 "Andrew's inputs", §6 items 2–3 answered), `docs/native-app-device-checklist.md`
  (player-only steps: A2, C9, D10–11, E14, F15–16, H),
  `docs/native-app-store-plan_PHASE_3_HANDOFF.md` ("What needs you" item 3 marked answered).

### 5. Facts and traps

- **A stale `.next/types` breaks `npx tsc --noEmit` after deleting a layout or page** ("Cannot find module
  …/layout.js"). Run `npm run build` (it regenerates them), then typecheck. Never run the two at once.
- **The app's RSC (router) requests carry the app UA**, so the proxy rewrite catches soft navigations. With
  `RSC: 1`, `/owner/dashboard` from the app returns the `in-app-notice` payload; from a browser it doesn't.
  The notice's title text is not in that payload: it's a client component that receives only `path`.
- **CDN caching is safe.** The proxy (routing middleware) runs before the cache, and the cache key is the
  rewritten page, so browsers keep getting `/owner/*` static HTML (`x-nextjs-cache: HIT`) and the app gets
  the notice.
- **The sign-in measures +64 KB after load.** Next now prefetches `/owner/signup` (static again) after the
  page loads: its page chunk plus segment payloads, listed one by one. Before Phase 3 this page measured
  458 KB, the same as now. Load time is unchanged.
- **Android probe:** if Chrome (or its first-run screen) is in front, an in-app navigation can land on our
  "No connection" page: one false result, gone on retry with the app in front. To test, `am force-stop
  com.android.chrome` first.
- **iOS probe steps stop once Safari takes the foreground** (the app is suspended). Probe one link-out per
  launch, or put the link-out last.
- One full `npm run test` run ended with "Worker exited unexpectedly" (313 of 315 files finished, 0 tests
  failed); the immediate re-run was clean. Treat that as a Vitest pool flake and re-run, but never accept
  a real assertion failure that way.
- macOS has no `timeout`; background the `simctl launch --console-pty` and `pkill -f` it.
- In zsh, never name a shell variable `path`.

### 6. Build, run, test — what was verified

Web (2026-10-09, after the change):
- `npx tsc --noEmit` clean (after the build); `npm run lint` clean.
- `npm run test`: **314 files passed / 1 skipped; 3,612 tests passed / 13 skipped / 0 failed.** (Baseline
  before 3B.1: 315 / 3,618; the deleted front-door test file accounts for the drop, net of the new tests.)
- `npm run test:god-mode-join` 50/50 (6 files); `npm run test:pwa-contract` 20/20.
- `npm run build`: success, 199 pages, `Proxy (Middleware)`. Every `/owner/*` page and `/tv` is `○`;
  `/in-app-notice/{owner,tv,admin}` is `●`.
- Local `next start -p 3100`, curl: with the app UA, `/owner/login`, `/owner/dashboard` and
  `/owner/billing/setup` show "The Partner Dashboard is on our website", `/tv` shows the TV notice and
  `/admin` the admin notice. With no UA, the real pages. `/privacy` and `/` are unchanged. `/` has 0 "Home"
  links for the app UA and 1 for a browser.
- **Speed** (`node --env-file=.env.local scripts/measure-owner-load.cjs --base http://localhost:3100 --runs 3`,
  Slow 4G + 4× CPU, median of 3). "Before" is the Phase 3 production build already in `.next` (built 06:33);
  "after" is this build.

  | Page | Before: requests / KB / load | After: requests / KB / load |
  |---|---|---|
  | `/owner/login` | 34 / 395 / 2,369 ms | 39 / 459 / 2,347 ms (extra = post-load prefetch, §5) |
  | `/owner/dashboard` (signed in) | 27 / 368 / 2,214 ms | 26 / 367 / 2,182 ms |

Native:
- `cd native && npx cap sync`; iOS: `xcodebuild … -sdk iphonesimulator -destination 'platform=iOS
  Simulator,name=iPhone 17' -derivedDataPath <scratch>/ios-dd build` (BUILD SUCCEEDED), `xcrun simctl
  install`. Android: `cd native/android && ANDROID_HOME=~/Library/Android/sdk
  JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew assembleDebug`, then `adb install -r
  ~/Library/Caches/hightop-native/android/app/outputs/apk/debug/app-debug.apk`. Full commands: the 2A
  handoff §6 and the Phase 3 handoff §6.
- **Against the LIVE site** (the shell config is what changed):
  - iOS simulator: a full load of `hightopchallenge.com/owner/login` opens Safari (screenshot: Safari on
    the partner sign-in with the "◀ Hightop Challenge" chip). `/tv` opens Safari. `/privacy` stays in the
    app.
  - Android emulator (CDP): `/owner/login` and `/tv` bring Chrome to the front while the app stays on
    `play.`. `/privacy` stays in the app with `window.Capacitor` present.
- **Not verified in the app:** the web half (no Home link, the router-hop notice). It needs the deploy;
  it is verified on the local production server (above) and goes to Andrew's 3B.3 check.

### 7. Open questions for Andrew

None blocking. Pushing and deploying stay his call (after 3B.2).

### 8. Recommended first steps for Phase 3B.2 (Sonnet 5.5, medium)

1. `git log --oneline -3` and `git status`: expect the two local commits, and only the badge PNG and
   `.vscode/settings.json` untracked.
2. Read `app/info/page.tsx`: the header (~line 414, desktop "Partner Login"), the mobile menu (~line 448),
   the hero (~line 540 "Already a partner? Sign in", ~line 553 "Works with your Square register!").
3. Optimize the badge (§1), then build the phone header button, the hero button, the approved line and the
   badge row. Tailwind only, the 12 px text floor, and `/owner/login` links stay plain
   `<a href="/owner/login">`.
4. Tests + screenshots at 390 px and 1280 px (Playwright on `npm run dev`). Write
   `docs/native-app-store-plan_PHASE_3B2_HANDOFF.md` and update the plan's status line. Then ask Andrew
   about pushing everything together and rebuilding his iPhone's app for 3B.3.
