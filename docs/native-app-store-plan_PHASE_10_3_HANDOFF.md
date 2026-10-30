# Native app store plan — Phase 10.3 handoff (2026-10-26)

## For Andrew (plain English)

**What changed:** the "Get the app" pieces now behave correctly when they go live (nothing is live yet).
1. As you decided, the app banner (Android bar + Safari's iPhone banner) and the "Get the app" line on the sign-in
   screen show on **both** `play.hightopchallenge.com` **and** `hightopchallenge.com` (plus `www.`) while the domain
   split is off. When you switch the split on, they go back to `play.` only. `/info`, `/owner`, `/admin` and the other
   marketing pages are still excluded.
2. The `/info` "For players" section now exists in the page's static HTML, so `hightopchallenge.com/app` on a computer
   lands on it properly. A computer is only sent there when the section really is on the page; otherwise it goes to the
   player sign-in, as today.
3. The iPhone Safari banner tag is no longer removed and re-added while the page loads.
4. The store links are checked once instead of on every screen update (small speed-up).

**Is it live?** No. Nothing is committed, pushed or deployed. Everything stays off until `NEXT_PUBLIC_APP_STORE_LINKS_ENABLED`
is on **and** both store URLs are filled in `lib/appDownloadLink.ts` (still empty), so nothing changes for anyone today.

**What's left / needs you:** nothing for 10.3. Your own Safari check of the real banner still waits for the live listings
(Phase 7). Next is 10.4 (delete one iCloud duplicate file). You confirmed `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` is set in
Vercel and `.env.local`; I did not read the value (its value decides whether partner messages switch on at the first deploy
that includes 5.5 — worth a glance at it before deploying).

---

## For the next agent (Phase 10.4)

### 1. Next phase goal and scope
Phase 10.4 in `docs/native-app-store-plan.md` ("10.4 — Remove the iCloud duplicate", Haiku 4.5, low): compare
`native/ios/App/App/config 2.xml` with `config.xml` via `diff`; if identical delete it; then
`find native -name '* 2.*' -not -path '*/node_modules/*'` and list (don't delete) anything else for Andrew. Out of scope:
everything in 10.1–10.3, Phase 7's flag.

### 2. Starting state
Branch `main`, last commit `7aacf153`. All of 5.5, Phase 7, 10.1, 10.2 and 10.3 are **uncommitted** on top of other dirty
work; never `git checkout -- <file>`. No migration or data change in 10.3. Nothing deployed.

### 3. Decisions already made
- Andrew (2026-10-26): show banner + sign-in line on the apex's player pages while the split is off.
- Plan text followed for F7–F10 exactly, with one detail: `decideAppLinkDestination(ua, stores, desktopSectionLive = false)`
  — third parameter defaults to false (safe: desktop → sign-in) and `app/app/route.ts` passes `appStorePromotionReady()`
  (`undefined` for `stores` so the default `STORE_URLS` is used). A test pins the route string.

### 4. Files changed
- `lib/appStorePromotion.ts` — new `promotionHosts()` (`[playHost()]`, plus `apexHost()` and `www.` + apex when
  `isDomainSplitEnabled()` is false, de-duplicated), `isPromotionHost(hostname)`; head script embeds
  `JSON.stringify(promotionHosts())` instead of the typed host.
- `lib/appDownloadLink.ts` — `desktopSectionLive` argument; removed `anyLive`.
- `app/app/route.ts` — passes `appStorePromotionReady()`.
- `components/native/AppStorePromotion.tsx` — module constant `PROMOTION_READY`; three-valued snapshot (`"pending"` on the
  server/hydration, `""` hide, `"device:host"`); `AppStoreDownloadSection` renders desktop form while pending (server HTML
  has `id="app"`), narrows after hydration, hides for native/installed PWA; `JoinAppStoreLink` and the Android bar use
  `isPromotionHost`; the Safari-tag effect reads `location`/`navigator` directly, depends on `[pathname]` only, and adds /
  keeps / removes the tag (updates `content` in place if it differs, never remove+add).
- Tests: `tests/lib.app-store-promotion.test.ts` (hosts per split value, env host overrides, no-literal contract, script on
  apex), `tests/components.app-store-promotion.test.ts` (server render has `id="app"` + both badges; gate off → empty;
  same meta element through hydration; `/owner` removes, back adds; apex sign-in line + Android bar with split off, not
  with split on), `tests/app-download-link.test.ts` (desktop destination by `desktopSectionLive`; route passes the gate).
- Docs: plan status line + 10.3 status, `CLAUDE.md` bullet "Get the app promotion hosts".

### 5. Facts and traps
- `PROMOTION_READY` is read at module load, so component tests set `NEXT_PUBLIC_APP_STORE_LINKS_ENABLED` inside
  `vi.hoisted` (before imports). A "gate off" test must `vi.resetModules()` and dynamically import **react, react-dom/server
  and the component together** (a stale React gives "invalid hook call").
- `useSyncExternalStore`'s server snapshot is also used for the hydration render — that is why "pending" renders the
  desktop form and the client snapshot takes over just after.
- Because both store URL constants are empty, a build can't exercise the section's static HTML with the gate on; the
  `renderToString` test is the proof. Re-check `/info` is `○` when the listings go live.
- Only the section renders while "pending"; the sign-in line and the Android bar treat "pending" as hidden.

### 6. Build / test — verified 2026-10-26 (sequential)
`npx tsc --noEmit` clean; eslint on every changed file clean; `npm run test` → 452 files passed, 1 skipped, 0 failed (5,586
tests); `npm run test:god-mode-join` 59/59; `npm run test:pwa-contract` 17/17; `npm run build` succeeded, `/info` still `○`
(static). **Unverified:** any of this in a real browser or with real store URLs (nothing is switched on).

### 7. Open questions for Andrew
None for 10.4. Before the first deploy containing 5.5: glance at the value of `NEXT_PUBLIC_PARTNER_MESSAGES_ENABLED` (a
`true` switches partner messages on at once; plan says keep it off until section N of the device checklist passes).

### 8. Recommended first steps for 10.4
Run `diff "native/ios/App/App/config 2.xml" native/ios/App/App/config.xml`; delete only if identical; run the `find` and
report. Model/effort per plan: Haiku 4.5, low. Then write `docs/native-app-store-plan_PHASE_10_4_HANDOFF.md`.
