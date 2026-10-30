# Native App Store Plan — Phase 7 handoff

## Summary for Andrew

The store-download section, player sign-in pointer, Android banner and Apple Smart App Banner
support are built locally. **Uncommitted, not deployed, not enabled.** The switch defaults off
and both store URL constants remain empty. Existing browser/home-screen play remains; old PWA
install prompts are removed from this working tree. Activation and real Safari checks remain open.

Apple build 1 is already uploaded, last confirmed Processing. Google code 2 was reported In review.
These store/device steps must finish before enabling promotion. No production data or configuration changed.

## For the next agent

### 1. Goal and scope

Finish Phase 6's TestFlight/device/listing/legal work, verify both public listing URLs, then review
and release Phase 7 with `NEXT_PUBLIC_APP_STORE_LINKS_ENABLED=true`. Test actual Safari banner behavior
before calling Phase 7 fully complete. Phase 8's runbook exists; native update rehearsal remains open.
Do not release separate Phase 5.5 messaging, alter games/prizes, send notifications or use TinyFish.

### 2. Starting state, source, deployment and data

- Date 2026-10-25 (America/New_York); root branch `main`, HEAD/origin
  `7aacf153cd8707b6d3f3644051a96614703ecaba`. All Phase 7 changes uncommitted/unpushed.
- Last verified production READY `dpl_2Y9ixHxGcj5ijT5P5pNfSSkjYxvx`, Vercel project
  `hightop-challenge` / `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, same SHA. No new deployment.
- No env changes; `.env.example` documents default off. `.env.local` was not read/modified/printed;
  the normal Next build loads its existing env internally. Root has unrelated messaging/POS/assets/
  tooling changes: preserve them. Do not publish the dirty root wholesale.
- No DB operation, migration, account change, test push, paid API call, data backup or undo log.
  Undo only these file changes; applied migrations remain immutable.

### 3. Decisions already made

- Andrew asked for the next phase. Phase 7 was prepared ahead of store approval behind an off flag;
  don't infer live listings or enable early. Keep both URL constants empty until independently verified.
- Players only, free US-only launch, iPhone+iPad; partners use browser, no partner store promotion.
- Apple record **6826962606**, bundle `com.hightopchallenge.app`, team `2U7HMXGQM3`. Upload 1.0.0/build 1
  succeeded 2026-10-26T01:29:30Z (Oct 25 New York); Andrew confirmed Processing. Do not upload again.
- Google Organization account, code 2 already In review by Andrew's choice. No personal-account tester gate.
- APNs uploaded confirmed. Real iPhone delivery still open; don't ask for upload again.
- Reviewer `appreview` / private chosen PIN (never repository); visible demo `venue-hightop-test`,
  Hightop Test Bar, 1010 Pacific St, Brooklyn, NY 11238. iPad/reviewer choices are settled.
- Retire PWA promotion, retain browser/standalone behavior and permanent printed `/app`/join QR destinations.
  Optional rating prompt remains undecided. Andrew explicitly stopped TinyFish; do not resume it.

### 4. Files and functions

- `lib/appStorePromotion.ts`: single flag reader, `appStorePromotionReady` (both valid store URLs,
  Android package matches), `iosStoreAppId`, device/touch-iPad detection, player path exclusions,
  `smartAppBannerScript` and Safari predicate. Missing/malformed URLs fail closed.
- `components/native/AppStorePromotion.tsx`: `AppStoreDownloadSection` (For players, device badge(s),
  browser button, desktop QR), `JoinAppStoreLink` (below existing sign-in choices),
  `PlayerAppStoreBanner` (Android dismissal and Safari metadata across client navigation).
  Server/initial hydration outputs nothing; native/installed-PWA promotion suppressed.
- `app/info/page.tsx`: separate player section before Contact; partner CTAs unchanged.
- `components/join/JoinFlow.tsx`: pointer only in auth-method-selection below Create Account;
  passes existing `inNativeApp` including server UA hint. No auth/join logic changes.
- `app/layout.tsx`: conditional early head script and conditional Suspense runtime before AppShell.
  No request headers/cookies added, so static pages stay static. Android bar is document flow,
  not a fixed overlay. Root/join use quiet pointer instead of duplicating the bar.
- `lib/nativeApp.ts`: `nativeAppPrePaintGuard` centralizes native token/bridge knowledge for head script.
- `public/brand/stores/`: official unmodified Apple SVG/Google PNG, provenance README. Apple fixed
  40 CSS px high; Google 60 px including transparent space; 12 px clear-space padding. Local assets.
- `lib/pwa.ts`: retains installed-mode helpers only. `components/bingo/SportsBingoHome.tsx`: removes
  old install hooks/button/coach card; fullscreen and landscape behavior preserved.
- `.env.example`: new switch default false, retired PWA switch removed. `tests/pwa-contract.test.ts`
  enforces retirement while preserving manifest/no-service-worker/landscape contracts.
- New `tests/lib.app-store-promotion.test.ts` and `tests/components.app-store-promotion.test.ts` cover
  gates, device choice, desktop QR/browser, native suppression, storage denial, persistent Android
  dismissal, head script and metadata removal on partner navigation.
- `docs/pwa-install-rollout-runbook.md` superseded; plan/CLAUDE.md/SYSTEM_CONTEXT.md updated.

### 5. Traps, cost and reversal

- `h-10` shrank Apple badge to 35 px on phone-scale root typography. Fixed to `h-[40px]` and physical
  padding. Don't replace with rem sizing below Apple's minimum or crop/recolor badge artwork.
- Smart App Banner is an early head DOM insertion to keep root layout static. Runtime adds/removes
  meta during client navigation. Script/DOM behavior tested; **actual Safari chrome still needs iPhone
  verification after listing is live**. Safari owns its dismissal memory, not our localStorage.
- Android dismissal key `htc:app-store-promotion-dismissed`, try/catch; blocked storage still dismisses
  for the mounted visit. No Android bar on native, apex, partner/admin/TV/marketing paths or iOS.
- Fixture initially missed public env stubs; fixed fixture, not application. Fixture store URLs aren't
  public-availability evidence. Never copy fixture links into production without verification.
- No new DB/API/cron. Badge files total **15,708 bytes**, existing QR **587 bytes**: raw desktop artwork
  up to 16.3 KB/fresh viewer. 10k uncached views/day ≈163 MB/day, 4.89 GB/30 days; 100k/day ≈1.63 GB/day,
  48.9 GB/30 days. Browser/CDN caches reduce this; excludes existing assets and new bundled JS (incremental
  compressed JS not measured against baseline). Off flag loads no badge/QR artwork. Compare actual CDN
  transfer after launch. No paid browser/API budget used.
- Revert only Phase 7 changes from a selected clean release commit. Don't reset the dirty root.
  Flag env changes require a Vercel deployment; don't violate canonical env removal/pull restrictions.

### 6. Commands and verification

Repository root, current installed dependencies:

```sh
npx vitest run tests/lib.app-store-promotion.test.ts tests/components.app-store-promotion.test.ts tests/pwa-contract.test.ts tests/native-app-contract.test.ts
npm run test:god-mode-join
npx tsc --noEmit
npx eslint . --ignore-pattern 'tmp/**'
npm run test
npm run build
git diff --check
```

Focused **59 passed**, God Mode/join **59 passed**. Full working-tree suite **5,561 passed / 13
environment skips**, 450 suites pass / 1 skip. Typecheck/source lint pass; production build passes with 218
generated pages, `/info` static. Local working-tree evidence includes unrelated dirty files; not deployed.
Logs `/private/tmp/hightop-phase7-{tests,god-mode,typecheck,lint,full-tests,build}.log`.
Full `npm run lint` also scanned old ignored `tmp/group-games-phase-4` copies/generated artifacts and
failed (311 errors, including two original Phase 7 state-in-effect findings). Phase 7 findings were
fixed with hydration-safe `useSyncExternalStore` browser/storage snapshots. Rechecked repository sources
using the explicit `tmp/**` exclusion above; log `/private/tmp/hightop-phase7-lint-source.log`.
Do not modify old temporary work or weaken lint rules to make scratch artifacts pass.

Ignored fixture evidence `tmp/native-phase7-2026-10-25/`: `preview.cjs`, `visual-results.json`, PNGs
desktop 1280px, iPhone 390px, Android 350px, iPad 820px, Android bar and native-empty check. Real
components, fixture URLs/flag on, compiled Tailwind, local artwork; all external requests blocked,
no app server/auth/DB. Run `node tmp/native-phase7-2026-10-25/preview.cjs` with Chromium allowed outside
sandbox. Checks no overflow, loaded assets, native empty and Android dismissal after reload. Whole
signed-in game layouts with enabled bar, actual destinations and Safari chrome remain unverified.

### 7. Open developer/device steps

TestFlight processing/internal install, iPhone push/sharing/news, iPad, Play-installed Android passkeys,
7+ day session observation, screenshots, privacy/rating/legal review and Apple submission. Wait for
Google approval. Verify both public listing URLs before activation. No settled choices need re-asking.

### 8. Recommended first steps and plan model

Continue Phase 6 handoff first. Once stores are live, fill `lib/appDownloadLink.ts`, update the test
currently pinning unverified URL slots empty, preview switch on, test Safari/iPad/Android/browser paths,
then commit/publish selected reviewed files from an isolated checkout. Verify exact deployment/source
and record activation facts here. Then Phase 8 rehearsal (`..._PHASE_8_HANDOFF.md`). Plan labels Phase 7
Sonnet 5.5 / medium, Phase 8 Haiku 4.5 / low; no delegation/model switch required.
