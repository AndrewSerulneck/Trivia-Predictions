# App feel phase 3 → phase 4 handoff

Date: 2026-09-05. Phase 3 implementation is complete with the device/browser
exceptions below. Phase 4 has **not** been activated by this work.

## Start here

1. Read `CLAUDE.md`, `SYSTEM_CONTEXT.md`, and
   `docs/app-feel-and-footer-removal-plan.md` (especially the scope amendments).
2. Read `docs/pwa-install-rollout-runbook.md` and
   `docs/phase-6-domain-split-runbook.md` before changing deployment configuration.
3. Inspect the current working tree. These changes are uncommitted, on top of
   `0379666` (`Nav Fixes`). The tree already contained completed phases 1 and 2
   when phase 3 began. Preserve them; do not reset the tree to start phase 4.
4. Verify deployed state independently. Neither source comments nor an old
   runbook's “off” status prove today's production flag values.

The pre-existing phase 1/2 changes are `app/layout.tsx`, `app/info/page.tsx`,
`components/ui/AppShell.tsx`, the scrollbar changes in `app/globals.css`,
`tests/category-blitz-mobile-shell-contract.test.ts`, removal of
`tests/components.app-shell-legal-notice.test.ts`, and the new scrollbar test and
master plan. The legal footer stays removed and scrolling stays enabled.

## What phase 3 changed

### Shared controls and real touch targets

- `app/globals.css` adds opt-in `.tp-player-hit-target` and
  `.tp-player-pressable`. Targets use **44 physical CSS pixels**, not rems.
  The legacy compact mode sets the root font to 13px and several important
  36px minimum heights. Real Chrome testing caught that those rules defeated
  ordinary `h-11`/minimum utilities. The new explicit minima override them
  without changing overflow, scroll locks, input selection, or global fonts.
- Press feedback applies only to enabled, non-busy controls. Reduced motion
  uses opacity instead of movement. Its transform overrides also take
  precedence over the old `.tp-clean-button:active !important` rule.
- `ExitBackButton` has a player 44px hit area containing the 34px slate circle.
  `.tp-player-back` removes the outer frame/padding so it does not become a
  second visible button. Light-tone owner/admin Back retains its original
  single control markup and sizing. Navigation precedence/history logic stays
  in `exitNavigation.ts`.
- Next/Step Back/Sign Out use shared feedback and busy semantics. Player
  `WizardFooter` disables Step Back while `nextBusy`; light-tone flows retain
  their existing behavior. Sign Out uses a synchronous ref lock around the
  existing teardown, not a new logout implementation.
- Opt-ins cover venue tabs/menu/game cards, notifications, date arrows,
  Fantasy draft controls, join controls, prize/venue/onboarding overlays, NFL
  picks/tiebreaker, and existing story-sharing actions. Dense Bingo squares,
  Category Blitz answer rows, and constrained Bingo landscape controls retain
  their special sizing.
- No brand tokens, routes, game rules, API contracts, SQL, cron, manifest, or
  deployment configuration were changed.

### Pending actions and error recovery

`components/ui/ButtonSpinner.tsx` is decorative (`aria-hidden`), inherits color,
and becomes static under reduced motion. Visible action labels and ARIA carry
its meaning.

- Join: synchronous locks around location retry, account/PIN submission,
  passkey sign-in/enrollment, and venue entry. PIN submission drives the shared
  footer's busy state. Errors are announced; failed PIN attempts retain the
  entered PIN. Server-first venue resolution and God Mode bypass stay intact.
- Venue: a synchronous launch ref blocks competing game launches; all game
  cards disable while the selected destination opens. Pending card feedback is
  positioned inside the card so adding a spinner does not grow every card.
  Passkey setup has its own lock. Games/Leaderboard/Rewards tab layout remains.
- Speed Trivia: first answer activation takes a ref lock before feedback/request
  work. Selected answer and next-round actions expose busy state; disabled
  answer controls cannot run their Framer press animation. Scoring, answer
  results, timer expiry, and the existing round lifecycle are preserved.
- Category Blitz: the existing `submittedRef` remains the submit lock. Retry
  no longer clears that ref before calling the handler (which would defeat the
  same-tick guard). The dev Skip action gains a synchronous lock and busy state.
  Ordinary answer submission remains automatic at expiry; the answer-row and
  keyboard/visual-viewport mechanics were not rewritten.
- Daily Pick 'Em: per-game pending refs/state reject competing taps on that
  game. Save/clear share one optimistic update/rollback path, restoring the
  actual prior team on failure. The old queued-overwrite request path was
  removed because pending controls now reject subsequent activation. Other
  games remain interactive. Point collection remains automatic.
- NFL: only the affected game disables while saving. Pick completion is
  announced. Failed switches restore the previous optimistic selection.
  Tiebreaker saves guard empty input, lock the input/button while pending,
  retain the guess on failure, and announce successful saves.
- Bingo: generation and board opening have synchronous, mutually exclusive
  guards and distinct Generating/Opening labels. Bulk and individual collection
  cannot run concurrently; landscape collection gets busy feedback without
  enlarging its compact control. Board dimensions and fullscreen mechanics stay.
- Fantasy: final lineup submission has a synchronous lock, and draft mutation
  handlers and draft controls respect it. Failed requests preserve the chosen
  lineup. Automatic live/settled collection remains automatic.
- Prize wallet/challenge redemption: claims are locked synchronously. A failed
  confirmation leaves the coupon modal open with an alert. A successful
  confirmation shows Redeemed before the existing delayed close. Reloads after
  mutations use `load(false)` so refreshing the wallet does not replace the
  modal with the page loader. The modal now sits above player chrome and has
  bottom safe-area padding. Atomic server prize/quota rules are unchanged.
- Notifications: Mark all read disables while pending, reports failure, and
  announces completion instead of leaving a rejected request unhandled.
- Sharing: existing camera/capture/share handlers gain synchronous guards;
  retry sharing is disabled while sharing. Busy/status feedback is added around
  the existing pipeline. Image saving remains synchronous. No destinations or
  launchers were added, and native-cancel/download/deep-link behavior is retained.
- Predictions only receives maintenance of its existing handler/feedback. It
  remains deprecated; phase 3 did not expose it in navigation or reactivate it.

### Haptics

`lib/haptics.ts` centralizes guarded `navigator.vibrate` calls:

| Pattern | Milliseconds | Use |
| --- | --- | --- |
| selection | 14 | Back, Speed Trivia category/answer, daily/NFL picks |
| commit | 22 | Explicit Category Blitz retry, Fantasy lineup submit |
| success | 14 / pause 35 / 14 | Confirmed tiebreaker save, Bingo collection, prize claim/redemption |
| warning | 22 / pause 40 / 22 | Player Sign Out |

Unsupported or throwing devices silently continue. Back now triggers on click,
not mouse-down, so keyboard activation works and compatibility pointer events
cannot double-trigger it. Menu opening, tab changes, errors, automatic scoring,
and normal automatic Category Blitz/Fantasy/Pick 'Em collection do not vibrate.
The old local Trivia/CategorySelect/Predictions wrappers were removed.

### Reduced motion

- Global route overlay finalizes immediately on hide and still emits its hidden
  event; the ready handling and safety timers remain.
- Venue open/return already had direct-navigation reduced-motion branches.
  The remaining card-settle helper now checks the preference too. Entry
  snapshots and transition gates remain in place.
- Venue carousel uses `auto` in reduced mode; explicit restoration always uses
  immediate positioning. The unconditional `scroll-smooth` class is removed.
- Join/onboarding, rules surfaces, reward details, ReadyPrompt, Trivia, Bingo,
  Pick 'Em, NFL, Fantasy, and venue-access Framer call sites have reduced-motion
  branches. Imperative answer/score pops are also guarded, rather than only
  changing their JSX props. ActionPop retains its result hold timer.
- Scoped CSS fallbacks stop remaining player shake/bounce/loader/rain effects;
  Category Blitz's existing motion branches remain authoritative, with its
  continuous status animation classes now static under reduction.
- The master plan was amended before touching three additional shared renderers:
  `AnimationOverlay` drains decorative celebrations without rendering them,
  `CoinFXCanvas` skips its animation work and cleans up when the preference
  changes, and `BouncingBallLoader` renders its existing ball statically.
  Score updates and gameplay timing are not driven by those decorations.

### Venue-panel memory

`lib/playerViewState.ts` stores only `0 | 1 | 2` under
`tp:player-view:v1:<encoded venue id>` in sessionStorage. Invalid/absent/denied
storage reads as Games. The hub reads it in its layout effect **before** first
carousel positioning, with SSR-safe initial state; taps/swipes persist the
panel. Normal authentication teardown clears sessionStorage, so no new teardown
path was introduced.

No answers, drafts, open dialogs, pending requests, date/week choices, or live
game state were added to this cache. Existing URL/game-specific caches remain
in charge. No second document-scroll restoration system was added.

## Verification and reproducible commands

Passed:

- `npx tsc --noEmit`
- `npm run lint` (zero warnings)
- `npm run build` (Next production build, including the existing Proxy)
- `npm run test:god-mode-join`: 34 tests
- `npm run test:pwa-contract`: 20 tests
- `git diff --check`
- Existing native share-pipeline tests in the full suite.

New focused tests:

- `tests/lib.player-interactions.test.ts`: seven cases for named haptics,
  unsupported/throwing devices, venue isolation, malformed/denied storage, and
  session clearing.
- `tests/components.player-pending.test.ts`: real mounted tiebreaker/coupon
  components with deferred responses; same-tick double clicks, busy state,
  input preservation, retry success, and Redeemed remaining visible during
  refresh.
- `tests/components.player-reduced-motion.test.ts`: immediate global overlay
  completion/lifecycle event and direct venue open/return without card
  measurement/cloning.
- `tests/components.nfl-game-card.test.ts`: existing three spread tests still
  pass; its Framer mock now supplies `useReducedMotion`.

Full-suite result: **1,916 passed, 5 failed, 13 skipped** (211 files). These are
exactly the five phase-2-documented unrelated date/freshness failures:

1. `tests/lib.billingDiscounts.test.ts`: free-month expectation is fixed at
   `2026-11-30`, while the runtime-clock-derived result is in December.
2. `tests/lib.sportsBingo.mlb-star-index-freshness.test.ts`: stale committed MLB snapshot.
3. `tests/lib.sportsBingo.mlb-star-index.test.ts`: same stale MLB snapshot.
4. `tests/lib.sportsBingo.nfl-star-index-freshness.test.ts`: stale committed NFL snapshot.
5. `tests/lib.sportsBingo.nfl-star-index.test.ts`: same stale NFL snapshot.

Do not regenerate data, change billing behavior, or weaken these tests as part
of PWA activation. The remaining suite, including navigation, sharing,
Category Blitz, auth, and PWA contracts, passes.

Real-browser fixture:

```sh
node tests/browser/player-interactions.mjs
```

This bundles production components with the project's Tailwind/global CSS and
runs isolated intercepted test pages. It makes no production API calls or
writes. It uses installed Chrome on this Mac; otherwise Playwright Chromium,
or set `PLAYER_TEST_BROWSER_CHANNEL` to an installed compatible channel.
Browser startup needed sandbox escalation on this machine.

Measured and passed in headless Chrome:

- 17 fixture controls at 320/375/430px meet 44×44px and fit within the viewport;
  actual venue header, notification controls, shared navigation, NFL team
  controls, and share actions are rendered.
- Back's visible child remains exactly 34×34px, and one click causes exactly one
  14ms vibration call in the instrumented browser.
- Notification dropdown targets meet the minimum.
- Reduced-motion spinner is static; pressing Next has no transform.
- Body text remains selectable.
- A scrolled production PageShell fixture opens a child and uses production
  Back to return. Browser scroll position survives both initial scroll-recovery
  passes (including a one-second follow-up check).

The fixture stubs Next navigation with real browser document navigation. It
**does not prove authenticated Next client-routing behavior**, all possible
live game states, WebKit/Firefox behavior, or installed-PWA behavior.

## Device/browser acceptance exceptions carried forward

No physical phone, VoiceOver/TalkBack session, live venue game, or real native
share sheet was available here. These checks are explicitly pending, not claimed
as passed. Perform them during the phase 4 pilot and phase 5 verification:

- iPhone Safari **and installed PWA**, Android Chrome **and installed PWA**;
  desktop Safari/Firefox and Chrome with mouse/keyboard. Include 320px portrait.
- All actual gameplay states and overlays: enlarged targets must not overlap
  neighbors, clipped text, keyboards, ads, or the last actionable row. The
  fixture's 17 controls are representative, not a render of every game screen.
- Wheel, trackpad, touch, Page Up/Down, Home/End, and focus scrolling on real
  routes; Back from authenticated Next content/game routes; swipe/tab venue
  restoration per venue; intentional modal lock release and stale-lock recovery.
- Real reduced-motion changes, including toggling while effects are active;
  timed results/countdowns remain readable and correctly paced.
- VoiceOver/TalkBack busy/success/error announcements without announcing spinners.
- Notch/Dynamic Island/cutouts/home-indicator clearance; custom Live Trivia and
  Speed Trivia chrome; Category Blitz keyboard flow; Bingo landscape fit and
  rotation/fullscreen entry/exit. Compact landscape targets remain intentional
  exceptions to 44px.
- Native story-file sharing on Live Trivia and Category Blitz, cancellation,
  capture retry, unsupported-file fallback, saved image, and deep-link fallback.
- Slow/error network responses on real list/board/lineup screens. No new blanket
  skeleton system was added; verify initial-load layout stability in those states.
- `/info`, `/owner/*`, `/admin`, `/tv`, and partner/admin light navigation regressions.

## Exact phase 4 starting point

1. **Verify the live domain split first.** Inspect deployed host behavior,
   HTTPS/DNS, and actual deployment configuration. Confirm apex root is marketing,
   player routes redirect to `play.hightopchallenge.com`, and `play./` is the
   login flow. Do not infer production state from this checkout.
2. **Account for stale runbook prose.** Current `proxy.ts` already removed the
   old `isPlayRootRequest → /coming-soon` block. Its comment says it was retired
   at cutover; only the apex `/coming-soon` redirect remains. Do not try to remove
   a nonexistent block or rewrite the auth gate. The domain runbook's earlier
   “config only” and later “remove placeholder” instructions reflect history.
3. Verify `WEBAUTHN_ALLOWED_ORIGINS` includes
   `https://play.hightopchallenge.com`, and confirm the RP ID/allowed RP IDs and
   fresh passkey registration/login on that origin. Test fresh installed-app
   storage, username/PIN, sign-out/relogin, location denial/retry, and God Mode.
   Read current `lib/webauthn.ts`; do not change auth logic based on old prose.
4. Verify deployment cookie-domain/origin settings and both host smoke tests
   from the domain runbook. `CLAUDE.md` forbids reading/editing `.env.local`;
   ignore the stale runbook suggestion to mirror settings there. Use the approved
   deployment configuration surface without printing secrets.
5. **Only after those checks**, enable
   `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED=true` in the intended deployment
   environment and redeploy. It is a build-time public flag: changing a dashboard
   value alone does not change an already built deployment. Phase 3 made no
   such change.
6. Preserve manifest `start_url: "/"`, `scope: "/"`, `display: "standalone"`,
   and the absence of an orientation lock. Add no service worker/offline cache.
   Keep partner/admin as ordinary web surfaces.
7. Follow the install runbook's one-venue pilot: Android install event/button;
   iOS Safari Add to Home Screen guidance; cold launch → login → venue → Bingo
   landscape; close/reopen, rotation, safe areas, and the reload escape hatch.
   Current install promotion is in Bingo's player surface. There is no hidden
   per-venue deployment flag; do not invent one while following the pilot notes.
8. Record deployed build/flag/origin evidence and physical-device outcomes.
   Reversal is install-prompt flag off + redeploy. It removes promotion; it does
   not uninstall existing apps or disable self-directed installation.

Phase 4 is operational activation and verification, not another interaction
rewrite. Keep the phase 3 code and the phase 1/2 footer/scrollbar work intact.
