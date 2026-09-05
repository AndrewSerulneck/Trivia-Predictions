# App Feel + Legal Footer Removal Plan

## Goal

1. Remove the global legal-language footer.
2. Make the player experience feel like an app while preserving normal scrolling.

This plan treats the player experience as the primary app surface. The existing
PWA policy remains intact: `/owner/*` and `/admin` are ordinary web surfaces,
and no service worker or offline cache should be added.

## Current state

- The global footer is supplied by `GLOBAL_LEGAL_NOTICE` in `app/layout.tsx` and
  rendered by `components/ui/AppShell.tsx`.
- `/info` also contains a shorter related sentence; remove that sentence too if
  the intent is to eliminate all restriction-language footers, while retaining
  the normal partnerships contact link.
- The project already has a PWA manifest, icons, standalone metadata, safe-area
  handling, unified navigation, route transitions, and standalone pull-to-reload.
- Installation promotion is already implemented but deliberately gated by
  `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED` and must not be enabled before the
  domain split is live.
- The document currently uses normal scrolling (`overflow-y: auto`) and reserves
  desktop scrollbar space with `scrollbar-gutter: stable both-edges`.

## Phased implementation

### Phase 1 — Remove the legal footer

**Model:** GPT-5.6 Luna  
**Reasoning effort:** Low  
**Engineering effort:** 30–60 minutes

- Remove `GLOBAL_LEGAL_NOTICE` and the `legalNotice` prop from
  `app/layout.tsx` and `components/ui/AppShell.tsx`.
- Delete the footer rendering and `shouldShowLegalNotice` helper.
- Remove or rewrite tests that assert the notice is present.
- Remove the shortened restriction sentence from `app/info/page.tsx` if the
  desired scope is all footer language, but keep the partnerships email in the
  contact area.
- Update stale source comments that describe the legal notice as mandatory.

The user's request is the explicit product/compliance decision required before
changing the prior legal-notice behavior.

### Phase 2 — Hide scrollbar chrome without disabling scrolling

**Model:** GPT-5.6 Terra  
**Reasoning effort:** High  
**Engineering effort:** 0.5–1 day

- Hide vertical and horizontal scrollbar visuals in the intended app surface
  using cross-browser rules (`scrollbar-width` and WebKit scrollbar selectors).
- Keep scrolling enabled with `overflow-y: auto`; never use `overflow: hidden`
  as the scrollbar solution.
- Remove or override the desktop `scrollbar-gutter: stable both-edges` rule so
  hidden bars do not leave empty side rails.
- Audit nested carousels, tab strips, modals, and panels so they remain
  independently scrollable.
- Verify mouse-wheel, trackpad, touch, keyboard Page Up/Down, Home/End, and
  focus-driven scrolling.
- Preserve the existing scroll-lock and scroll-recovery infrastructure.

Recommended default: hide scrollbar chrome across the site as requested. If
desktop usability testing shows that admin operators need the visual affordance,
scope the rule to player routes and leave `/info`, `/owner/*`, and `/admin`
untouched.

### Phase 3 — App-style interaction polish (implementation specification)

**Status:** Implemented 2026-09-05; automated/browser fixture verification complete,
with physical-device acceptance exceptions recorded in
[`app-feel-phase3-handoff.md`](app-feel-phase3-handoff.md).  
**Model:** GPT-6 Astra  
**Reasoning effort:** High  
**Engineering effort:** 3–5 engineering days, plus physical-device QA

#### 3.0 Outcome and boundaries

This phase is a behavior-and-accessibility pass over the **player app**, not a
visual redesign. It will make taps feel immediate, make pending work obvious,
remove avoidable motion for users who request it, and return players to the
screen they left. It will not change navigation structure, game rules, page
copy, brand colors, card layouts, APIs, database behavior, authentication, or
geofencing.

In scope:

- Player entry: `/` and `/join` (`components/join/JoinFlow.tsx`).
- Venue hub: `/venue/[venueId]`, including its header, carousel, account drawer,
  game cards, reward details, and notification menu.
- Player content: `/activity`, `/faqs`, `/redeem-prizes`, `/active-games`, and
  `/pending-challenges` where they use `PageShell`.
- Games: Live Trivia, Speed Trivia, Category Blitz, Bingo, daily Pick 'Em, NFL
  Pick 'Em, Predictions, and Fantasy.
- Shared player chrome: `PageShell`, `GameAppBar`, `VenueHubHeaderBar`,
  `WizardFooter`, and the four canonical navigation controls.

Out of scope:

- `/info`, `/advertise`, `/owner/*`, `/admin`, and `/tv` beyond regression
  checks. Owner/admin remain ordinary web surfaces.
- A bottom navigation bar, gesture-navigation system, new route hierarchy, or
  changes to the established Back/Next/Sign Out semantics.
- Service workers, offline caching, install prompting, manifest changes, domain
  split work, or enabling `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED`.
- New sharing destinations or new share buttons for Bingo, Pick 'Em, NFL Pick
  'Em, Predictions, Fantasy, rewards, or the venue hub.
- Persisting answers, picks, open drawers/modals, pending mutations, countdowns,
  or other transient game state across navigation.
- Blanket `overflow: hidden`, `touch-action: none`, or `user-select: none` rules.

#### 3.1 Existing behavior that will be retained

The implementation starts from the current primitives rather than replacing
them:

- `PageShell`, `GameAppBar`, and `VenueHubHeaderBar` already own the fixed/sticky
  top chrome; `WizardFooter` owns step controls at the bottom. Phase 3 will not
  create another shell or navigation primitive.
- `ScrollRecoverySentinel`, `ScrollRescueGuard`, and `lib/scrollLock.ts` already
  recover stale locks. Phase 3 will not replace or broaden them.
- Category Blitz already has extensive `useReducedMotion` coverage and its own
  keyboard/visual-viewport handling. Those mechanics stay intact.
- Live Trivia and Category Blitz already use the native Web Share pipeline with
  save/deep-link fallbacks. Phase 3 only polishes those existing controls.
- Existing game-specific feedback remains: the venue-card spring, trivia answer
  feedback, score/coin animations, Bingo landscape behavior, and route/venue
  return transitions. Reduced-motion mode changes their movement, not their
  result or timing semantics.

#### 3.2 Batch A — touch targets, pressed states, and control semantics

Add two narrowly scoped CSS utilities in `app/globals.css`:

- `.tp-player-hit-target`: a minimum 44×44px interactive box, with
  `touch-action: manipulation`, no text selection, and no WebKit tap flash.
- `.tp-player-pressable`: a short scale/translate press response only while an
  enabled control is active. Disabled controls never move. Keyboard focus rings
  remain visible.

These utilities will be opted into player controls; they will **not** be applied
to every `button` globally. Text selection remains enabled for headings, body
copy, coupon details, and error messages, and remains native in `input`,
`textarea`, `select`, and content-editable fields.

Concrete control changes:

- `components/navigation/ExitBackButton.tsx`: expand the clickable area from
  34×34px to 44×44px while keeping the visible slate circle at 34×34px inside
  it. Back behavior and neutral coloring do not change.
- `NextButton.tsx`, `StepBackButton.tsx`, and `SignOutButton.tsx`: retain their
  current visual sizing, add the shared press behavior, expose pending state
  with `aria-busy`, and suppress repeated activation while busy.
- `components/venue/VenueHubHeaderBar.tsx`: expand the hamburger from 32×32px to
  44×44px and make each Games/Leaderboard/Rewards tab at least 44px high. The
  header remains fixed and the three-tab layout remains unchanged.
- `components/ui/NotificationBell.tsx`: make the bell, “Mark all read,” and each
  notification row meet the 44px target without changing menu width or content.
- `components/pickem/PickEmGameList.tsx`: expand the 32px previous/next-date
  arrow hit areas to 44px while keeping the icons visually unchanged.
- `components/fantasy/FantasyHome.tsx`: expand the 28px roster add/remove buttons
  to 44px hit areas while retaining the small visible +/- badges.
- Player overlay controls in `VenueHubClient.tsx`, `VenueAccessOverlay.tsx`,
  `PrizeWalletPanel.tsx`, `SportsBingoSelectBoard.tsx`, and
  `CategoryBlitzOnboardingOverlay.tsx`: ensure Close, Cancel, Retry, Confirm, and
  primary actions are at least 44px high and share the same enabled/disabled
  press behavior.
- Existing story-share controls in `StoryShareLauncher.tsx`,
  `StoryCaptureModal.tsx`, and `ShareActionsSheet.tsx`: bring the action sheet's
  40px Close button up to 44px, retain the capture modal's existing 44px Close
  button, and leave the native-share/fallback pipeline unchanged.

Explicit target-size exceptions:

- Bingo board squares, Category Blitz's twelve answer rows, rank/status badges,
  progress dots, and decorative game glyphs are not resized. They are dense game
  content, not isolated chrome buttons.
- Bingo's height-constrained landscape tabs and card arrows keep their compact
  rendered size so the board continues to fit. Their current landscape contract
  is more important than a generic 44px rule and will be verified separately.
- No invisible hit area may overlap a neighboring control. If a 44px target
  cannot fit without overlap, the exception is documented in the component and
  its row/card remains the larger activation target.

#### 3.3 Batch B — loading, success, error, and disabled feedback

Add `components/ui/ButtonSpinner.tsx`, a small inline spinner that inherits the
button's color, is hidden from assistive technology, and becomes static under
reduced motion. It is for pending buttons only; existing full-page
`BouncingBallLoader` and route loading screens remain.

Every async player action below will follow the same contract:

1. On activation, disable the initiating control immediately.
2. Keep its width/height stable, show the inline spinner and an action-specific
   label, and set `aria-busy="true"`.
3. Prevent duplicate submissions while the request is in flight.
4. On success, render the existing result plus a polite `role="status"` message.
5. On failure, re-enable the control, keep the user's input/selection, and put
   the existing error text in `role="alert"`; do not navigate away or erase the
   form.

The visible changes by surface are:

| Surface | Actions covered | Pending label / completion behavior |
| --- | --- | --- |
| `JoinFlow` | Location retry/share, passkey sign-in/setup, username/PIN submit, venue entry | Keep current labels such as “Checking location…” and “Signing in…”, add spinner/ARIA, and retain entered credentials on error. |
| Venue hub | Open a game, set up a passkey, retry venue access | Disable all competing game-card launches while one route is opening; keep the existing opening-card animation and show a stable pending label. |
| Speed Trivia | Category choice, answer submission, next round | Lock answer buttons on the first choice; expose `isSubmitting`/next-round work as busy without changing scoring or timers. |
| Category Blitz | Submit answers and skip round | Keep the existing submit-lock animation; add busy semantics and duplicate-submit protection only. No answer-row or keyboard-flow changes. |
| Daily Pick 'Em | Pick submission and point collection | Keep its existing optimistic selection; show per-action pending state and restore the prior selection if the request fails. |
| Predictions | Prediction submission | Keep optimistic selection only where it already exists; show per-action pending state and restore the prior selection if the request fails. |
| NFL Pick 'Em | Team pick and tiebreaker save | Disable only the affected game/tiebreaker while saving, show “Saving…”, then announce “Pick saved” or “Tiebreaker saved.” |
| Bingo | Board generation/selection and prize-point collection | Keep board dimensions fixed while loading and distinguish “Generating…”, “Opening…”, and “Collecting…” states. |
| Fantasy | Lineup submit and settled-point collection | Lock roster mutation while submission is pending, preserve the chosen lineup on failure, and announce successful save/collection. |
| Prize wallet / challenge redemption | Claim and Confirm Redemption | Keep the confirmation modal open while pending; on success show the existing Redeemed state before closing; on error leave the coupon visible for retry. |
| Story sharing | Capture, native share, save image, and retry | Keep the current native-share cancellation/fallback behavior; add busy state only while image generation or the share request is active. |

Loading placeholders will be changed only where content currently collapses and
causes a measurable jump. The expected changes are fixed-height placeholders
for the venue hub's three panels and the NFL/Bingo/Fantasy list areas. Existing
`app/loading.tsx`, `app/venue/[venueId]/loading.tsx`,
`app/nfl-pickem/loading.tsx`, question-image skeletons, and game loaders remain;
this phase will not replace all loading UI with a new skeleton system.

#### 3.4 Batch C — haptic policy and implementation

Create `lib/haptics.ts` with one guarded, best-effort wrapper around
`navigator.vibrate`. Unsupported devices—including iPhones that do not expose
the Vibration API—silently do nothing. Haptics never gate or delay an action.

Named patterns:

- `selection`: one short pulse for a deliberate game choice.
- `commit`: a slightly stronger pulse after an irreversible submission is
  accepted locally.
- `success`: a short double pulse only after the server confirms a claim/save.
- `warning`: the existing separated double pulse for Sign Out.

Exact trigger policy:

- Keep Back's existing short press haptic in `exitNavigation.ts`, implemented
  through the shared helper so the navigation behavior remains canonical.
- Use `selection` for Speed Trivia category/answer selection and daily/NFL Pick
  'Em team selection.
- Use `commit` for Category Blitz answer submission and final Fantasy lineup
  submission.
- Use `success` after NFL tiebreaker save, points collection, prize claim, or
  confirmed coupon redemption succeeds.
- Keep `warning` on player Sign Out.
- Replace the duplicate local wrappers in `TriviaGame.tsx`,
  `CategorySelect.tsx`, and `PredictionMarketList.tsx`.
- Do not vibrate for typing, tab changes, opening menus/modals, loading, errors,
  disabled taps, timers, automatic scoring, or decorative animations.
- Fire once from the action handler—not both pointer-down and click—so touch and
  mouse compatibility events cannot double-trigger it.

#### 3.5 Batch D — reduced motion

Reduced-motion mode preserves all information and state changes but removes
decorative travel, bounce, shake, scale, particle/rain, and smooth scrolling.
Simple color/opacity state changes may remain, with duration capped at 100ms.
Timers, countdown values, and game timing are never shortened or skipped.

Concrete changes:

- `GlobalTransitionOverlay.tsx`: use `useReducedMotion`; show/hide without the
  620ms fade when reduction is requested. Safety timers and ready events remain.
- `lib/venueGameTransition.ts`: bypass card flight/return movement and navigate
  directly while still dispatching the same transition lifecycle events.
- `VenueHubClient.tsx`: use `auto` instead of `smooth` for programmatic carousel
  scrolling only when reduced motion is requested, and render reward-detail
  overlays without slide/scale motion in that mode.
- `GameLandingExperience.tsx`: reduce rules-to-game surface animations to a
  near-instant opacity change.
- Add `useReducedMotion` branches to the player Framer Motion call sites that
  currently lack one: `JoinFlow.tsx`, `TriviaGame.tsx`, `ReadyPrompt.tsx`,
  `SportsBingoHome.tsx`, `SportsBingoSelectBoard.tsx`, `ActionPop.tsx`,
  `PickEmGameList.tsx`, `NFLGameCard.tsx`, `WeeklySummary.tsx`,
  `NFLPickEmLeaderboard.tsx`, `FantasyHome.tsx`, and `VenueAccessOverlay.tsx`.
- Add reduced-motion fallbacks for the in-component Pick 'Em keyframes and the
  remaining global Speed Trivia/Bingo animation classes in `app/globals.css`.
- Retain Category Blitz's existing `useReducedMotion` branches; extend only its
  remaining Tailwind `animate-pulse`/`animate-spin` status indicators so their
  information remains visible without continuous motion.
- The new pressed-state utility uses color/opacity rather than transform under
  reduced motion. Loading spinners become a static progress glyph plus visible
  pending text.

#### 3.6 Batch E — return-state preservation

This phase will preserve one currently lost piece of screen state: the active
Games/Leaderboard/Rewards panel on the venue hub.

- Add a small session-scoped helper in `lib/playerViewState.ts`.
- `VenueHubClient.tsx` stores the active panel by venue ID whenever the player
  swipes or taps a tab, then restores it before the first carousel positioning
  pass when the player returns from a game or content page.
- Invalid/missing values fall back to Games. State is per venue and clears with
  normal session storage/auth teardown.
- The restoration uses `behavior: "auto"` so it does not visibly sweep through
  intermediate panels and honors reduced motion.

Normal document scroll restoration remains browser/Next-owned. Phase 3 will add
an interaction test that navigates from a scrolled `PageShell` page into a child
and Back, verifying that existing scroll recovery does not reset the position.
It will not add a second global scroll-restoration system unless that test
demonstrates an actual failure; any such failure would require this plan to be
amended before implementation.

Existing state mechanisms remain authoritative:

- Pick 'Em sport/date and NFL week stay URL-driven.
- Bingo keeps `bingoSelectedGameCache`.
- Venue arrival/bootstrap remains in `venueHomeBootstrap`/`warmupCache`.
- Live game/server state remains server-authoritative.
- Open overlays, draft answers, and pending requests are intentionally not
  restored after leaving a route.

#### 3.7 Batch F — share and safe-area review

No new share feature is being added. Phase 3 will verify that the existing Live
Trivia and Category Blitz story launchers use the native share sheet when file
sharing is supported, preserve download/deep-link fallback when it is not, and
meet the touch/loading/reduced-motion rules above.

No safe-area architecture is being replaced. The review is limited to ensuring:

- `PageShell`, `GameAppBar`, `VenueHubHeaderBar`, and `WizardFooter` keep top and
  bottom controls outside the notch/home indicator.
- Enlarging Back, hamburger, bell, and footer actions does not make header
  spacers overlap content.
- Live Trivia and Speed Trivia's custom headers/footers retain their existing
  `env(safe-area-inset-*)` padding.
- Category Blitz's visual-viewport keyboard work and Bingo's landscape sizing
  remain unchanged.
- `MobileAdhesionAd`, popup overlays, reward redemption, and story capture do
  not cover the last actionable row above the home indicator.

Any safe-area defect found will be corrected in the shell that owns it; Phase 3
will not add page-level compensating padding or change global viewport metadata.

#### 3.8 Planned file set

New files:

- `components/ui/ButtonSpinner.tsx`
- `lib/haptics.ts`
- `lib/playerViewState.ts`
- Focused unit/contract tests for those three additions and the 44px/reduced-
  motion rules.

Shared files expected to change:

- `app/globals.css`
- `components/navigation/{ExitBackButton,NextButton,StepBackButton,SignOutButton}.tsx`
- `components/navigation/exitNavigation.ts`
- `components/ui/{GlobalTransitionOverlay,NotificationBell}.tsx`
- `components/venue/{CategoryBlitzOnboardingOverlay,GameLandingExperience,VenueGamesPanel,VenueHubClient,VenueHubHeaderBar,VenueAccessOverlay}.tsx`
- `lib/venueGameTransition.ts`

Player feature files expected to change only for the behaviors listed above:

- `components/join/JoinFlow.tsx`
- `components/trivia/{CategorySelect,ReadyPrompt,TriviaGame}.tsx`
- `components/category-blitz/CategoryBlitzGame.tsx`
- `components/bingo/{ActionPop,SportsBingoHome,SportsBingoSelectBoard}.tsx`
- `components/pickem/PickEmGameList.tsx`
- `components/predictions/PredictionMarketList.tsx`
- `components/nfl-pickem/{NFLGameCard,NFLPickEmGameList,NFLPickEmLeaderboard,NFLTiebreakerCard,WeeklySummary}.tsx`
- `components/fantasy/FantasyHome.tsx`
- `components/challenges/ChallengeRedeemPanel.tsx`
- `components/prizes/PrizeWalletPanel.tsx`
- `components/social-share/{ShareActionsSheet,StoryCaptureModal,StoryShareLauncher}.tsx`

If implementation requires a product-facing file outside this list, stop and
amend the plan before changing it.

#### 3.9 Acceptance criteria and verification

Automated checks:

- All named standalone player controls have a computed hit box of at least
  44×44px at 320px, 375px, and 430px viewport widths, excluding the documented
  dense-game/landscape exceptions.
- Async controls set `aria-busy`, disable immediately, reject duplicate
  activation, keep their dimensions stable, and expose success/error text to
  assistive technology.
- Haptic unit tests prove unsupported-device no-op behavior and exactly one
  vibration call per supported action.
- Reduced-motion tests prove the global transition and venue game return do not
  run spatial animation, smooth scrolling, or long fades.
- Venue-hub state tests prove panel restoration is venue-scoped and malformed
  storage falls back to Games.
- Existing native-share pipeline tests continue to pass unchanged.
- Run `npx tsc --noEmit`, `npm run lint`, `npm run test`,
  `npm run test:god-mode-join`, `npm run test:pwa-contract`, and `npm run build`.

Physical/browser checks:

- iPhone Safari and installed PWA; Android Chrome and installed PWA; desktop
  Safari/Chrome/Firefox with mouse and keyboard.
- At 320px portrait, enlarged controls do not overlap, truncate essential text,
  or push a primary action below an unreachable area.
- Tap/press feedback appears immediately; disabled/busy controls cannot fire
  twice; keyboard focus remains obvious.
- VoiceOver/TalkBack announce busy, success, and error states without announcing
  decorative spinners.
- With Reduce Motion enabled, gameplay results remain understandable and timers
  remain correct, but decorative travel/bounce/shake and smooth carousel motion
  are absent.
- Back from a game restores the venue hub panel; Back on a scrolled content page
  retains its position; intentional scroll locks still release after overlays.
- Notches, Dynamic Island, Android cutouts, the iPhone home indicator, the soft
  keyboard, and Bingo landscape do not cover controls or content.

Phase 3 is complete only when these checks pass or every device-only exception
is written into the handoff. Phase 4 remains separately gated on the live domain
split and is not activated as part of this work.

### Phase 4 — Activate the standalone PWA experience

**Model:** GPT-6 Astra  
**Reasoning effort:** Extra high  
**Engineering effort:** 1–2 days after prerequisites are complete

- Confirm the `play.hightopchallenge.com` domain split is live.
- Confirm WebAuthn allowed origins and cold-launch authentication behavior.
- Enable `NEXT_PUBLIC_PWA_INSTALL_PROMPT_ENABLED` only after the domain split.
- Validate Android install prompting and iOS Add to Home Screen guidance.
- Preserve `start_url: "/"`, `scope: "/"`, and the absence of an orientation lock.
- Do not add a service worker or offline caching.

This phase is what removes browser chrome for users who install the app. A normal
Safari or Chrome tab cannot be made completely browser-chrome-free by CSS.

### Phase 5 — Regression and device verification

**Status:** Automated and local-browser verification completed 2026-09-05;
physical-device and authenticated live-game acceptance remain open (see the
handoff below).

**Model:** GPT-5.6 Sol  
**Reasoning effort:** High  
**Engineering effort:** 0.5–1 day of engineering checks, plus physical-device QA

Run:

```text
npx tsc --noEmit
npm run lint
npm run test
npm run test:pwa-contract
npm run build
```

Check at minimum:

- `/`, `/join`, `/redeem-prizes`, and a venue home.
- Live Trivia, Speed Trivia, Bingo, Pick'em, Fantasy, and Category Blitz.
- `/info`, `/owner/*`, and `/admin` for unintended layout regressions.
- Touch, wheel, keyboard, and focus scrolling with no visible scrollbar.
- Back navigation, sign-out, overlays, ads, and scroll recovery.
- Installed iPhone and Android behavior: cold launch, safe areas, reload escape
  hatch, authentication, installation, and rotation.

Headless browsers can cover build and interaction contracts, but real browser
chrome and installed-PWA behavior require physical-device testing.

## Suggested priority

Ship Phases 1 and 2 first for the immediate requested result. Phase 3 is the
highest-value visual polish. Phase 4 should follow the existing domain-split and
PWA rollout prerequisites rather than being enabled independently.

## Phase 1 handoff notes — completed 2026-09-05

Phase 1 is implemented. The global legal/restriction footer has been removed
from the application shell, and the related shortened sentence has been
removed from `/info`. The partnerships contact link remains in the `/info`
contact column.

Files changed:

- `app/layout.tsx`: deleted `GLOBAL_LEGAL_NOTICE`; renders `<AppShell>` without
  a notice prop.
- `components/ui/AppShell.tsx`: removed `legalNotice` from `AppShellProps`,
  removed `shouldShowLegalNotice`, removed the conditional footer, and cleaned
  the stale mandatory-notice comments. Fullscreen/game route behavior and the
  existing scroll/clamp logic were left unchanged.
- `app/info/page.tsx`: deleted only `Use restricted to authorized, geofenced
  venues.`; the `partnerships@hightopchallenge.com` mailto remains.
- `tests/category-blitz-mobile-shell-contract.test.ts`: removed the assertion
  that required the old notice helper and footer rendering. The remaining
  Category Blitz shell contracts are unchanged.
- `tests/components.app-shell-legal-notice.test.ts`: deleted because its entire
  contract asserted behavior that the product decision explicitly removed.

Verification completed:

- `npx tsc --noEmit` — passed.
- `npm run lint` — passed.
- `npm run test -- --run tests/category-blitz-mobile-shell-contract.test.ts` —
  passed (13 tests).
- `git diff --check` — passed.
- Search of `app`, `components`, and `tests` found no remaining
  `GLOBAL_LEGAL_NOTICE`, `legalNotice`, `shouldShowLegalNotice`,
  `showLegalNotice`, or restriction-footer references.

Next-phase guidance:

- Phase 2 should modify scrollbar presentation only. Preserve scrolling:
  `overflow-y: auto`/normal document scrolling must remain available, and do
  not solve scrollbar visibility with `overflow: hidden`.
- Do not reintroduce a footer or legal-notice prop while changing shell CSS.
- `AppShell` currently uses `overflow-x-hidden overflow-y-visible` on its
  normal player shell, while Category Blitz deliberately uses a dedicated
  `h-[100svh]`/`overflow-hidden` shell. Treat that Category Blitz gameplay lock
  as an intentional exception; audit its internal scroll regions separately.
- Keep `/owner/*` and `/admin` ordinary web surfaces per the PWA policy. Do not
  add a service worker, offline cache, install-prompt changes, or domain-split
  changes as part of Phase 2.
- Before broadening a CSS rule, inspect `app/globals.css` for the existing
  `scrollbar-gutter: stable both-edges` rule and the admin/game theme selectors.
  Removing the gutter should not disturb safe-area padding, scroll recovery,
  modal scroll locks, nested carousels, or the landscape Bingo surface.
- Run `npm run test` after shell/navigation CSS changes; also run
  `npm run test:pwa-contract`, `npx tsc --noEmit`, `npm run lint`, and a build
  before handoff. Physical wheel, keyboard, touch, and installed-PWA checks
  remain necessary because headless contracts cannot verify browser chrome.

## Phase 2 handoff notes — completed 2026-09-05

Phase 2 hides scrollbar chrome across the site while preserving every existing
scroll container and lock. The global rule in `app/globals.css` applies
`scrollbar-width: none` and `-ms-overflow-style: none` to the document and all
elements, plus `::-webkit-scrollbar { display: none; }` for WebKit/Blink. It
does not set or override `overflow`, so document scrolling remains
`overflow-y: auto`, and nested carousels, tab strips, modals, panels, and admin
content panes keep their existing independent overflow behavior.

The desktop-only `scrollbar-gutter: stable both-edges` block was removed, so
the invisible scrollbar no longer reserves empty side rails. The deliberate
`scrollbar-gutter: auto !important` declarations on the Bingo landscape,
Category Blitz gameplay, and admin locked-root states remain; those routes are
already intentionally non-document-scrollable while their respective gameplay
or application shells are active.

Files changed in this phase:

- `app/globals.css`: added the cross-browser scrollbar presentation rules and
  removed the desktop gutter reservation; no overflow or scroll-lock rules were
  changed.
- `tests/app-feel-scrollbar-contract.test.ts`: static contract for Firefox,
  legacy Edge, and WebKit/Blink suppression, continued `overflow-y: auto`, and
  removal of the gutter reservation.

Verification completed:

- `npx tsc --noEmit` — passed.
- `npm run lint` — passed.
- `npm run test -- --run tests/app-feel-scrollbar-contract.test.ts` — passed
  (2 tests).
- `npm run test:pwa-contract` — passed (20 tests).
- `npm run build` — passed.
- `git diff --check` — passed.
- `npm run test` — 1,905 tests passed and 5 failed for pre-existing,
  phase-unrelated freshness/time assertions: the NFL and MLB star-index snapshot
  tests each report their committed snapshot as stale (four failures total), and
  `lib.billingDiscounts.test.ts` expects a fixed `2026-11-30` free-month end
  date but receives a date derived from the current clock. No scrollbar contract
  or CSS test failed.

Phase 3 should build interaction polish on top of this CSS-only change. Keep
the global scrollbar rules unless product direction changes; do not replace
them with `overflow: hidden`, and do not alter the targeted body locks for
Bingo landscape, Category Blitz gameplay, modals, popups, or Pick 'Em's stale
lock recovery. The key scrollable surfaces already audited here include normal
document flow (`html`/`body`), `GameLandingExperience`, admin mobile/content
panes, Bingo and venue modals, game rails/tab strips, the venue carousel, and
the `/info`/owner/admin pages. All retain their existing `overflow-auto` or
`overflow-scroll` declarations, so their wheel, trackpad, touch, keyboard, and
focus scrolling need real-browser verification rather than a source rewrite.

Before Phase 3 handoff, perform physical checks with mouse wheel/trackpad,
touch, Page Up/Down, Home/End, and focus navigation on `/`, `/join`,
`/redeem-prizes`, a venue home, each game, `/info`, `/owner/*`, and `/admin`.
Also verify Back, sign-out, overlays, ads, scroll recovery, and installed-PWA
safe areas. This phase did not touch PWA/domain-split/install-prompt/service
worker behavior, navigation primitives, or Phase 1's legal-footer removal.


## Phase 3 implementation scope amendments — 2026-09-05

- Include `components/animations/AnimationOverlay.tsx`,
  `components/ui/CoinFXCanvas.tsx`, and `components/ui/BouncingBallLoader.tsx` in
  Batch D. Inspection found shared celebration/canvas/loader motion that would
  otherwise bypass the per-game reduced-motion branches. Suppress decorative
  overlays/canvas work and render the existing loader statically under Reduce
  Motion; do not alter game clocks, scoring, ready events, or loader copy.
- Source audit found daily Pick 'Em and Fantasy point collection is automatic,
  and Category Blitz's normal answer submission occurs at timer expiry. Preserve
  those behaviors. Do not add buttons or vibrate for automatic scoring/submission;
  the commit haptic applies only to an explicit Category Blitz retry and manual
  Fantasy submit. Device acceptance must account for these existing flows.

- Include `components/navigation/WizardFooter.tsx` for passing the existing
  `nextBusy` state to the player step-back control. This prevents leaving a PIN
  step while its submission is pending; light-tone owner/admin flows retain
  their existing behavior.


## Phase 3 handoff — implemented 2026-09-05

Detailed as-built notes, verification results, accepted device-only exceptions,
and exact instructions for the phase 4 LLM are in
[`app-feel-phase3-handoff.md`](app-feel-phase3-handoff.md).

The implementation covers player touch/press utilities, pending-action guards
and announcements, centralized haptics, reduced motion (including shared
renderers), and venue-scoped active-panel restoration. The legal footer stays
removed and scrollbar suppression keeps normal scrolling enabled. No PWA flag
or deployment configuration was changed.

Typecheck, lint, production build, God Mode join (34 tests), PWA contracts (20
tests), native sharing tests, and the Chrome geometry/scroll fixture pass.
The full suite reports 1,916 passing tests and the same five unrelated
billing-clock / MLB-NFL snapshot freshness failures documented by phase 2.
Physical/installed-PWA checks are enumerated in the handoff rather than claimed
as completed. Phase 4 must independently verify the live domain/origin/auth
prerequisites before enabling install promotion.

## Phase 5 handoff — automated verification completed 2026-09-05

Phase 4 was deliberately skipped. No deployment flag, manifest behavior,
service worker, domain-split setting, or install-prompt setting changed.

The prescribed engineering checks completed as follows:

- `npx tsc --noEmit` — passed. The first run found three ignored duplicate
  `.next/types/* 3.*` cache files; they were moved to a temporary directory and
  regenerated output passed without source changes.
- `npm run lint` — passed with zero warnings.
- `npm run test:pwa-contract` — 20/20 passed.
- `npm run test:god-mode-join` — 34/34 passed.
- `npm run build` — passed, including the existing Next 16 Proxy.
- `node tests/browser/player-interactions.mjs` — passed at 320, 375, and 430px:
  17 representative controls fit and meet their target contracts; reduced
  motion, selectable text, and PageShell Back/scroll restoration passed.
- `npm run test` — 1,916 passed, 13 skipped, and the same five unrelated known
  failures from the Phase 2/3 baseline remain: one billing test with a fixed
  November 2026 expectation and four stale MLB/NFL star-index assertions.

A built-app Chrome smoke at 390×844 covered `/`, `/join`,
`/redeem-prizes`, a venue URL, Live Trivia, Speed Trivia, Bingo, Pick'em,
Fantasy, Category Blitz, `/info`, `/owner/dashboard`, and `/admin`. Public
routes loaded without horizontal overflow; hidden scrollbar styling and normal
document scrolling remained active; Page Down and wheel scrolling worked on
`/info`. Protected player routes followed the existing unauthenticated Proxy
redirect to `/`; the owner dashboard redirected to owner login, and the admin
session probe remained unauthorized as expected.

The smoke found and fixed stale references to the previously deleted
`/brand/hightop-logo.svg`; the root preload, transition preloads, shared logo,
coming-soon page, and venue-screen debug fixture now use the existing
`/brand/htc-logo.png`. Root metadata now also declares the existing
`/icon.png`, eliminating Chrome's fallback `/favicon.ico` 404. The rebuilt
smoke had no unexpected 4xx responses or console errors.

Still open and not claimed as tested:

- iPhone Safari/installed-PWA and Android Chrome/installed-PWA checks for cold
  launch, safe areas, reload escape hatch, authentication, installation, and
  rotation.
- Physical touch, VoiceOver/TalkBack, native share sheets, dynamic browser
  chrome, notches/cutouts, keyboards, and real reduced-motion toggling.
- Authenticated venue/game states, live data, overlays, ads, sign-out, and the
  complete game-specific interaction matrix. Local unauthenticated smoke can
  verify the auth gate but cannot enter these screens.
- Desktop Safari and Firefox wheel/keyboard/focus verification.
