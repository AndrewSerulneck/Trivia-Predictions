# Navigation Unification Plan — Back / Next / Sign Out

> **Status:** **ALL PHASES (0–7) shipped 2026-09-05.** The navigation system is
> unified: one `ExitBackButton` (dark slate circle) for exit-back, one
> `WizardFooter` (`StepBackButton` + `NextButton`) for step flows, one
> `SignOutButton` for account teardown. Phase 7 amended the design-system guide +
> Partner Dashboard design doc so the circle is documented as canonical and the
> warm "exit pill" is retired, deleted the dead pill CSS / tokens / components,
> and added `tests/navigation-controls-contract.test.ts` as the standing
> tripwire. **The only work left is a real-device visual pass — see §13c.**
> Every **player game
> surface** now renders the canonical circle, **player sign-out is correct end to
> end**, **every multi-step flow in the app now progresses through one
> `WizardFooter`**, **every player content page now pins Back in the `PageShell`
> header instead of inline in content**, **every `/owner/*` page now takes its
> Back from `OwnerShell`'s header slot, with Sign Out reachable from every
> authenticated partner page**, and **the admin desktop + mobile shells and the
> three admin section sub-view backs now use `SignOutButton` / `ExitBackButton
> tone="light"`** (Phases 3 and 4 both ran ahead of Phase 2 — §4 marks 3
> independent, and 4 touches none of Phase 2's files; Phase 2 itself was done
> last but touches none of 3/4's files either).
> **All Back call sites in the app are now migrated.** The only sign-out /
> exit-back controls not on `SignOutButton` / `ExitBackButton` are deliberate:
> the legacy `BackButton.tsx` (zero callers, deleted in Phase 7) and
> `ActivateVenueFlow`'s bespoke light exit button (§9c — Phase 6 left it, §12e).
> Read **§6 (Phase 0 contract)**, then **§7 (Phase 1)**, then
> **§8 (Phase 3)**, then **§9 (Phase 4)**, then **§10 (Phase 2)**, then
> **§11 (Phase 5)**, then **§12 (Phase 6 as-built + handoff to Phase 7)**.
> **All phases are done. Read §13 for the Phase 7 as-built record and the
> remaining device-pass checklist.**
> **Purpose:** one unified navigation system for the three controls that appear on
> every surface — Back, Next, Sign Out. This doc is the canonical reference; it is
> written to be readable cold in a fresh chat with no other context loaded.

---

## 0. The rule (read this first)

**"Back" is two different controls that have been conflated across the app.**
Separating them is what makes a single consistent rule possible.

| Control | Means | Position | Style |
|---|---|---|---|
| **Exit-back** | Leave this screen for its parent | **Leading slot of the sticky top bar, top-left.** Always. Exactly one per screen. Never inline in content, never at the bottom. | Small dark circle, Lucide `ChevronLeft`, neutral slate — identical in every context |
| **Step-back** | Previous step of a multi-step flow | **Leading side of a sticky bottom footer**, paired with Next | Ghost/tertiary (`bg-white/5`, `border-white/15`, `text-slate-300`) |
| **Next** | Advance the flow | **Trailing side of that same bottom footer, bottom-right** | Primary CTA (`accent-500` bg, `text-slate-950`) |
| **Sign Out** | Leave your account | **Last item of the account drawer / sidebar footer**, below a divider | Danger-tinted (`text-rose-300`, `border-rose-400/45`) |

**One sentence:** top-left = leave this screen; bottom-left/bottom-right = move
within this flow; inside the menu = leave your account.

A wizard screen therefore has **both** an exit-back (top-left: abandon the whole
flow) and a step-back (bottom-left: go back one step). They are visually distinct
and never occupy the same region.

Sign Out is deliberately kept out of every top bar so it can never sit adjacent to
Back and be mis-tapped.

---

## 1. Decisions taken (Andrew, 2026-09-05)

### 1a. Back is the small dark circle everywhere — NOT the exit pill

Chosen over the warm red/orange pill because the circle is smaller and fits more
places, and consistency matters more than the pill's findability.

The canonical treatment is the one already used by `GameAppBar`:

```
border border-white/10  bg-slate-900  text-slate-300  hover:text-white
h-[34px] w-[34px] rounded-full  +  Lucide ChevronLeft h-4 w-4
```

Neutral slate, **no accent tint** — this is what lets it sit unchanged on Bingo's
warm felt, Category Blitz's emerald, Live Trivia's cyan, and the plain content
pages. Category Blitz's emerald-tinted variant becomes neutral.

Icon-only by default, with `aria-label` always set. An optional short text label
may be rendered *beside* the circle (not inside it) on content pages where the
destination isn't obvious from context.

> **⚠️ This deliberately reverses the style guide.** The 7-point brand check says
> "Back/exit uses `.tp-exit-pill` (warm red gradient pill)" and calls the pill "the
> only warm element on screen." Overriding it is fine, but it must be written down
> in the guide rather than silently diverged from — otherwise the next design pass
> reverts it. See Phase 7.
>
> Files to amend: `design-system/hightop-challenge-design-system/project/SKILL.md`
> (lines 42, 102 + critical rule 3), `design-system/project/SKILL.md` (same),
> `design-system/.../uploads/Claude Design Brief.md` (lines 182, 238, 460, 553, 659).
> After the migration, `.tp-exit-pill` in `app/globals.css:2018` and `.ht-btn-exit`
> at `:1231` have no remaining callers and should be removed with the guide edit.

### 1b. Back is pinned to the top on content pages

On the 8 pages that currently render Back inside page content, it moves into the
`PageShell` header so it stays visible while scrolling. This is a real layout
change and those pages need a phone look-over afterward.

### 1c. "Leave Venue" is renamed "Sign Out" and made to actually sign out

There **is** an existing player exit — `Leave Venue` at the bottom of the venue
home drawer ([`components/venue/VenueHubClient.tsx:1709`](../components/venue/VenueHubClient.tsx#L1709)).
It is renamed rather than duplicated. See §3 for why the rename alone isn't enough.

---

## 2. Audit — every instance found

### 2a. Back: 10 implementations, 5 visual treatments

| # | Treatment | Location | Note |
|---|---|---|---|
| 1 | Warm gradient pill, hand-inlined | `components/navigation/BackButton.tsx` | 8 call sites. Reimplements `.tp-exit-pill` in Tailwind rather than using the class |
| 2 | Slate circle + `ChevronLeft` | `components/venue/AppBar.tsx:80` (`GameAppBar`) | Bingo, Fantasy, Pick'Em, NFL Pick'Em. **This is the treatment we're standardizing on** |
| 3 | `.tp-exit-pill` inline | `components/trivia/TriviaGame.tsx` ×3 (`:1493`, `:1622`, `:1818`); `app/trivia/live/page.tsx` ×2 (`:1149`, `:1235`); `components/trivia/CategorySelect.tsx:56` | 3 different sizes/labels — "← Venue", "← Back", bare "←" |
| 4 | Emerald chevron pill | `components/category-blitz/CategoryBlitzGame.tsx:2097` | Hand-rolled clone of `GameAppBar`; has a `compact` mode that hides it when the keyboard opens |
| 5 | `ht-exit-*` gradient `<Link>` | `app/owner/{account:248, billing:96, billing/setup:120, competitions:217, display:116, game-settings:174, schedule:255}` | "← Dashboard". Same colors as #1/#3 via CSS vars — a third spelling of one thing |
| 6 | Bare text link | `app/owner/login:106`, `app/owner/register:104` + `:178`, `app/owner/forgot-password:44` + `:66`, `app/owner/category-blitz:133`, `components/admin/sections/ChallengesSection:689`, `components/admin/sections/SchedulesSection:995` + `:1183` | |
| 7 | Blue gradient pill | `components/predictions/BackToVenueButton.tsx` | **Dead code — zero usages.** Delete |
| 8 | Local `BackButton` shadowing the import | `components/rewards/CreateRewardWizard.tsx:613` (used `:691`, `:1069`, `:1165`) | Step-back, not exit-back. Name collision with the real component |
| 9 | Inline warm pill ×2, plus white-border "← Back" | `components/join/JoinFlow.tsx:592`, `:705`, `:2741` | |
| 10 | Inline "← Back to Venue" | `components/challenges/ChallengeRedeemPanel.tsx:353` | |

Also: `components/venue/GameLandingExperience.tsx:86` exposes a
`showPlayingBackButton` prop (default `true`); `app/pickem/page.tsx:18` passes
`false`. That opt-out must survive the refactor.

### 2b. Next: only 2 real progression controls

- `components/join/JoinFlow.tsx:605` — `"Next →"` (username → PIN step)
- `components/join/JoinFlow.tsx:2749` — `"Next →"` / `"Let's Go! →"` (welcome carousel)

Everything else matching /next/ is body copy ("Next round starts in", "Next
question in"). The wizards that *should* have a Next — `CreateRewardWizard`,
`app/owner/register`, `components/admin/mobile/ActivateVenueFlow` — advance via
context-labelled buttons instead. That's a **gap**, not an inconsistency: this
refactor gives them a real footer.

### 2c. Sign Out: 5 implementations across 2 drawers, none complete

| Location | Label | What it calls |
|---|---|---|
| `components/venue/VenueHubClient.tsx:1709` | "Leave Venue" | `leaveVenue()` → `clearVenueSession()` → `clearClientState()` + `router.push("/")` |
| `components/join/JoinFlow.tsx:3051` | "← Sign Out" | `handleSignOut()` → `hardClearAuthAndCache()` + `venueListBuiltRef` reset + `refreshAuthSession()` + `signOut()` |
| `app/owner/dashboard/page.tsx:182` | "🚪 Sign out" | `POST /api/owner/auth/logout` |
| `components/admin/AdminShell.tsx:435` | "Sign out" | `POST /api/admin/logout` |
| `components/admin/AdminMobileShell.tsx:153` | "Sign out" | same, via the "More" bottom sheet |

Four distinct problems:

1. **`JoinFlow.tsx:3051` is styled as an exit pill with a `←` arrow.** It reads as
   Back and acts as Sign Out. The most genuinely dangerous instance in the audit.
2. **`tp_sess` is never cleared on the player side.** It's `HttpOnly`, `Max-Age`
   90 days ([`lib/serverSession.ts:29`](../lib/serverSession.ts#L29)), set by
   `/api/join/profile:39`. `clearClientState()` ([`lib/storage.ts:171`](../lib/storage.ts#L171))
   clears `tp_venue_id` and `tp_user_id` but **cannot** clear an HttpOnly cookie
   from JS. There is no `/api/join/logout` route — admin and owner both have one.
   So neither "Leave Venue" nor JoinFlow's sign out actually revokes the server
   session.
3. **Two parallel player drawers.** `components/ui/AccountMenu.tsx` (non-venue
   pages) and the inline drawer in `VenueHubClient.tsx` (venue home) duplicate the
   same menu list; only the `VenueHubClient` one has an exit item.
4. **The partner sign out exists on 1 of 12 `/owner/*` pages** (dashboard only).

### 2d. Clearing helpers — which does what

- `clearVenueSession()` (`lib/storage.ts:167`) → thin alias for `clearClientState()`
- `clearClientState()` (`lib/storage.ts:171`) → clears memory store, managed
  localStorage keys, `sessionStorage`, `tp_venue_id` + `tp_user_id` cookies;
  dispatches auth-state events
- `hardClearAuthAndCache()` (`lib/authFastPath.ts:37`) → `abortActiveAuthRequests()`
  **+** `clearClientState()`
- `signOut()` (`lib/auth.ts:451`) → Supabase auth only; does **not** touch app state

A correct player sign out = `hardClearAuthAndCache()` + `void signOut().catch(()=>{})`
+ `POST /api/join/logout` (new) + `venueListBuiltRef` reset + redirect to `/`.

---

## 3. Target components

All new, under `components/navigation/`:

| Component | Replaces |
|---|---|
| `ExitBackButton.tsx` | Treatments 1, 2, 3, 4, 5, 6, 9, 10. Absorbs the existing `BackButton` history logic; switches to the dark circle + `ChevronLeft`. Props: `href?`, `label?` (for `aria-label` + optional adjacent text), `preferHref?`, `venueHomeFallback?`, `onExit?` |
| `StepBackButton.tsx` | Treatment 8 and JoinFlow's step backs |
| `NextButton.tsx` | JoinFlow's two `Next →` buttons; new footers elsewhere |
| `WizardFooter.tsx` | Sticky bottom bar composing StepBack + Next |
| `SignOutButton.tsx` | All 5 sign-out instances. `variant: "player" \| "partner" \| "admin"`, each wired to its own real teardown |

**Preserve from `BackButton.tsx` — do not regress:**
- PWA hardening at `:88` — `window.history.length <= 1` → internal referrer →
  `href`, because an installed PWA cold-launches with an empty history stack and
  no browser back button
- The 150ms post-`history.back()` check that falls through to `router.push` when
  the navigation didn't take
- `runVenueGameReturnTransition` / `navigateBackToVenue` for game→venue exits
- `triggerBackHaptic()` (`navigator.vibrate(14)`)

`components/venue/AppBar.tsx` gets a default `leading` of `ExitBackButton` so the
four `GameAppBar` games inherit the change for free.

---

## 4. Phases

Each phase is independently shippable and leaves the app in a working state.

### Phase 0 — Primitives + contract ✅ **DONE (2026-09-05)**
No visual change to any call site.
- Create the five components in §3
- Extend `AppBar` with a defaulted `leading` slot
- Delete `components/predictions/BackToVenueButton.tsx` (dead)

**Model: Opus 5 · Effort: high.** Every later phase inherits this API, and the
`BackButton` history/PWA logic is subtle enough that porting it wrong fails only
on a real installed device.

**As-built notes and the exact API each later phase consumes: §6.**

### Phase 1 — Player game surfaces ✅ **DONE (2026-09-05)**
- `GameAppBar` → `ExitBackButton` (Bingo, Fantasy, Pick'Em, NFL Pick'Em inherit)
- `CategoryBlitzGame.tsx` hand-rolled bar → `ExitBackButton` **inside its own
  `Header`** — *not* `GameAppBar`; see §7b for why that substitution is unsafe
- `TriviaGame.tsx` ×3, `app/trivia/live/page.tsx` ×2, `CategorySelect.tsx` → `ExitBackButton`

**Model: Opus 5 · Effort: medium-high.** Live Trivia's back runs a `goHome()`
teardown behind an `isLeaving` guard; Category Blitz hides its bar when the
keyboard opens. Both break silently.

**Must run:** `npm run test:pwa-contract` (touches the landscape bingo chrome).

**As-built notes and the traps found: §7.**

### Phase 2 — Player content pages ✅ **DONE (2026-09-05, after Phases 3 and 4)**
Move Back into the `PageShell` header (decision 1b) for: `app/active-games`,
`app/activity`, `app/advertise`, `app/bingo/select-sport`, `app/bingo/select-game`,
`app/bingo/select-board`, `app/faqs`, `app/pending-challenges`, `app/redeem-prizes`.
Plus `components/challenges/ChallengeRedeemPanel.tsx`.

`PageShell` gains a `backTo` prop; the compact-header spacer math at
`components/ui/PageShell.tsx:33-41` needs updating for the added row.

**Model: Sonnet 5 · Effort: medium.** Mostly mechanical; the spacer math is the
one place to be careful.

**As-built notes and handoff to Phase 5: §10.**

### Phase 3 — Sign out correctness ✅ **DONE (2026-09-05, ahead of Phase 2)**
- Add `POST /api/join/logout` that expires `tp_sess` (mirror `app/api/admin/logout`)
- `SignOutButton variant="player"` performs the full sequence from §2d
- Rename "Leave Venue" → "Sign Out" in `VenueHubClient.tsx:1709`, pointed at the new button
- Fix `JoinFlow.tsx:3051` — drop the `←` and the exit-pill styling; it is not a Back
- Consolidate the `VenueHubClient` drawer and `AccountMenu` onto one menu list

**Model: Opus 5 · Effort: medium-high.** Auth teardown. Getting it wrong either
strands a session or logs people out unexpectedly.

**Must run:** `npm run test:god-mode-join`.

**As-built notes, the two API deviations, and what Phases 2/4/5/6/7 inherit: §8.**

### Phase 4 — Step flows ✅ **DONE (2026-09-05, ahead of Phase 2)**
- `JoinFlow.tsx` — 3 backs, 2 nexts → `WizardFooter`
- `CreateRewardWizard.tsx` — remove the shadowing local `BackButton`, adopt `WizardFooter`
- `app/owner/register`, `components/admin/mobile/ActivateVenueFlow.tsx`

**Model: Opus 5 · Effort: high.** `JoinFlow` is auth-critical and governed by
CLAUDE.md: the canonical panel order, `venueListBuiltRef` reset semantics, and the
"no geolocation before auth" tripwire all hang off these exact buttons.

**Must run:** `npm run test:god-mode-join`.

**As-built notes, the four API additions, and the two behaviour changes: §9.**

### Phase 5 — Partner Dashboard ✅ **DONE (2026-09-05)**
`OwnerShell` gains a header back slot + an account menu; the 7 "← Dashboard" links
and 5 bare text links collapse into it; Sign Out becomes reachable from all 12
`/owner/*` pages instead of just the dashboard.

**Check `docs/partner-dashboard-plan.md` and `docs/partner-dashboard-design.md`
for a conflicting header spec before starting.**

**Model: Sonnet 5 · Effort: medium.**

**As-built notes, the design-doc conflict resolution, and handoff to Phase 6: §11.**

### Phase 6 — Admin ✅ **DONE (2026-09-05)**
`AdminShell.tsx`, `AdminMobileShell.tsx`, and the 3 "← Back to list" section links
(`ChallengesSection:689`, `SchedulesSection:995`, `:1183`).

Admin is deliberately a light-themed, non-player surface — it adopts the
**positions and behavior** but not the dark-native circle styling.

**Model: Sonnet 5 · Effort: low-medium.**

**As-built notes, the one API addition, and handoff to Phase 7: §12.**

### Phase 7 — Style guide amendment + verification ✅ **DONE (2026-09-05)**
- Amend the design-system files listed in §1a so the circle is documented as
  canonical and the pill rule is retired
- Remove `.tp-exit-pill` (`app/globals.css:2018`) and `.ht-btn-exit` (`:1231`)
  once they have no callers
- New `tests/navigation-controls-contract.test.ts` — static tripwire in the style
  of `tests/nfl-pickem-exit-navigation-contract.test.ts`: no raw `←` in
  player-facing TSX, no hand-rolled warm-gradient class strings outside
  `globals.css`, no `signOut`/`clearVenueSession` call outside `SignOutButton`
- Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run test`,
  `npm run test:god-mode-join`, `npm run test:pwa-contract`
- Device pass on `docs/bingo-fullscreen-pwa-device-checklist.md` — headless
  browsers cannot verify this surface

**Model: Sonnet 5 · Effort: medium.**

**As-built notes, the tripwire's exact scope, and the one remaining task: §13.**

---

## 5. Verification checklist for item 5 of the original ask

- **Back triggers history correctly** — covered by preserving the `BackButton`
  logic (§3) and by the Phase 7 tripwire. The PWA cold-launch case (empty history
  stack) is the one that needs a real installed device, not a headless browser.
- **Next progresses the flow** — Phase 4. `JoinFlow`'s panel order is asserted by
  `npm run test:god-mode-join`.
- **Sign out clears auth state** — Phase 3. The `tp_sess` gap in §2c-2 is the part
  that is currently broken and must be fixed for this to be true at all.
- **Layout responsiveness** — Phase 2's `PageShell` spacer math and Phase 1's
  landscape bingo chrome are the two real risks; `npm run test:pwa-contract` plus
  the device checklist cover them.

---

## 6. Phase 0 as-built + handoff to Phase 1

> Written 2026-09-05, immediately after Phase 0 shipped. Read this before
> touching any call site — it is the contract every later phase consumes.

### 6a. What actually landed

| File | Change |
|---|---|
| `components/navigation/exitNavigation.ts` | **NEW.** The exit-back *behavior*, extracted verbatim from `BackButton.tsx`. Exports `useExitNavigation()`, `triggerBackHaptic()`, `getInternalReferrerPath()` |
| `components/navigation/ExitBackButton.tsx` | **NEW.** The canonical dark-slate circle. Also exports `EXIT_BACK_CIRCLE_CLASS` |
| `components/navigation/StepBackButton.tsx` | **NEW.** Ghost step-back. Also exports `STEP_BACK_CLASS` |
| `components/navigation/NextButton.tsx` | **NEW.** Primary CTA. Also exports `NEXT_BUTTON_BASE_CLASS`, `NEXT_BUTTON_ACCENT_CLASS` |
| `components/navigation/WizardFooter.tsx` | **NEW.** Sticky bottom bar composing the two above |
| `components/navigation/SignOutButton.tsx` | **NEW.** Also exports `performSignOut(variant)` |
| `components/navigation/BackButton.tsx` | **MODIFIED.** Markup byte-identical; its 60 lines of navigation logic now delegate to `useExitNavigation` |
| `components/venue/AppBar.tsx` | **MODIFIED.** `leading` now defaults to `<ExitBackButton venueHomeFallback />` |
| `components/predictions/BackToVenueButton.tsx` | **DELETED** (confirmed zero references repo-wide) |

**Nothing else changed.** All 10 Back treatments, both `Next →`s and all 5 sign
outs still render exactly what they rendered before. Nothing outside the table
above was touched.

### 6b. The one decision that departed from this doc

**§0's Next spec says `accent-500` bg. There is no `accent-500` in this codebase**
— `tailwind.config.ts` defines `ht.cyan/emerald/amber/...` and nothing named
`accent`. `NextButton` therefore ships the app's real primary,
`bg-cyan-400 text-slate-950` (identical to `THEME.*.primary` in
`lib/themeTokens.ts` and to JoinFlow's existing `Next →`), exposed as
`NEXT_BUTTON_ACCENT_CLASS`. An `accentClass` prop overrides it for a surface
whose accent genuinely differs; reach for it rarely. **When Phase 7 amends the
design-system files, write "cyan-400", not "accent-500".**

### 6c. Why the logic was extracted instead of copied

§3 says `ExitBackButton` "absorbs the existing `BackButton` history logic." Copying
it would have left two divergent copies alive for six phases while call sites
migrate. Instead both components call one `useExitNavigation` hook, so the legacy
pill and the new circle are behaviorally identical by construction and Phase 7's
deletion of `BackButton.tsx` removes markup only.

**The four things §3 says not to regress all live in `exitNavigation.ts` now** —
the `window.history.length <= 1` PWA branch, the 150ms post-`history.back()`
fallthrough, `runVenueGameReturnTransition` / `navigateBackToVenue`, and
`triggerBackHaptic()`. Do not reimplement any of them at a call site; if a surface
needs different behavior, add an option to the hook.

### 6d. API reference — what to call in Phases 1–5

```tsx
// Exit-back. Precedence: onExit > venueHomeFallback > preferHref > history.
<ExitBackButton
  href="/"                  // parent, used whenever history can't be trusted
  label="Back to venue"     // always the aria-label
  showLabel={false}         // true renders `label` as text BESIDE the circle
  preferHref={false}        // skip history, just push href
  venueHomeFallback={false} // resolve /venue/<stored id> + run the return transition
  onExit={undefined}        // caller owns navigation entirely; wins over everything
  className=""              // layout only — never re-tint it per game
/>

<StepBackButton onClick={goPrev} label="Back" disabled={false} />

<NextButton
  onClick={goNext} label="Next" busyLabel="Loading..." busy={false}
  disabled={false} hideChevron={false} accentClass={undefined}
/>

<WizardFooter
  onBack={goPrev}           // omit entirely on the first step
  onNext={goNext} nextLabel="Next" nextBusy={false} nextDisabled={false}
  hint={<span>Step 2 of 4</span>}   // optional line above the buttons
/>

<SignOutButton
  variant="player"          // "player" | "partner" | "admin"
  label="Sign Out"
  redirectTo={undefined}    // default: player "/", partner "/owner/login", admin null
  onSignedOut={() => {}}    // runs after teardown, before the redirect
  className={undefined}     // replaces the rose danger row wholesale
/>
```

`AppBar`'s `leading` default only fills in for `undefined`. **Pass
`leading={null}` to render no leading control** — a root screen with nothing above it.

### 6e. Phase-specific traps found while doing Phase 0

**Phase 1 — `GameAppBar` is a two-line change, but read this first.**
`GameAppBar` still hand-renders the circle at `components/venue/AppBar.tsx:80`
with `EXIT_BACK_CIRCLE_CLASS`'s exact classes. Replace that `<button>` with:

```tsx
leading={<ExitBackButton onExit={onExit} venueHomeFallback label={exitLabel} />}
```

Then **delete `GameAppBar`'s local `handleExit` and its `useRouter`/`getVenueId`
imports** — `venueHomeFallback` supersedes them and is strictly better: today's
fallback is a bare `router.push`, which skips the venue-return animation. That is
a deliberate behavior *improvement*, so watch the Bingo/Fantasy/Pick'Em exits once
on device. Note the `<>…</>` fragment currently wrapping that button is vestigial;
drop it.

**Phase 1 — the two silent breakers named in the plan are real.** Live Trivia's
back runs a `goHome()` teardown behind an `isLeaving` guard: pass that as
`onExit`, never as `href`, or the teardown is skipped. Category Blitz hides its
bar in `compact` mode when the keyboard opens: that is a *render* decision at the
call site (`{compact ? null : <ExitBackButton …/>}`), not a prop on the button —
do not add a `hidden` prop for it.

**Phase 2 — `showLabel` exists for exactly this.** Content pages whose parent
isn't obvious (`/advertise`, `/faqs`) can render `showLabel`. The circle is 34px,
matching today's `GameAppBar` — below the 44px touch target the legacy pill met.
That was accepted to keep Phase 0 visually inert. If a device pass finds it fiddly
in the `PageShell` header, enlarge it **once** in `EXIT_BACK_CIRCLE_CLASS` so every
surface moves together; never per-page.

**Phase 3 — `/api/join/logout` still does not exist.** `SignOutButton`'s player
variant already POSTs to it; until the route lands, that POST 404s harmlessly and
`tp_sess` survives, exactly as today. **Do not wire `variant="player"` into a real
call site before creating the route** (mirror `app/api/admin/logout/route.ts`,
expiring the `tp_sess` cookie name from `lib/serverSession.ts`), or you ship a
sign-out that looks complete and isn't. The teardown order in `performSignOut` is
POST-first (so the request still carries the cookie), then
`hardClearAuthAndCache()`, then fire-and-forget `signOut()`.
`VenueHubClient`'s `vibrate([22, 40, 22])` is already reproduced inside the button
— don't duplicate it at the call site.

**Phase 3 — what `SignOutButton` deliberately cannot do.** It has no access to
JoinFlow's `venueListBuiltRef`, its panel state, or AdminShell's
`setAuthState("unauthenticated")`. Those go in `onSignedOut`, which fires after
teardown and before the redirect. Admin's default `redirectTo` is `null` because
`AdminShell.handleLogout` re-renders in place rather than navigating.

**Phase 4 — `WizardFooter` renders Next alone when `onBack` is omitted**, and Next
keeps the trailing position. JoinFlow's welcome carousel (`:2749`) needs
`hideChevron` on its terminal `"Let's Go!"` slide if you want to keep today's
arrow-free look — today it renders a literal `"Let's Go! →"`.

**Phase 7 — the tripwire has a false-positive to avoid.** "No raw `←` in
player-facing TSX" must not fire on `→` in body copy, and the "no hand-rolled
warm-gradient class strings" rule must allow `BackButton.tsx` right up until that
file is deleted in the same phase. `.tp-exit-pill` (`app/globals.css:2018`) and
`.ht-btn-exit` (`:1231`) still have callers today — check both are at zero before
removing them.

### 6f. Verification run for Phase 0

- `npx tsc --noEmit` — clean (the lone `LayoutProps` duplicate is from a stray
  `.next/types/routes.d 2.ts` build artifact, pre-existing, not source)
- `npm run lint` — clean
- `npm run build` — succeeds, `Proxy (Middleware)` still listed
- `npm run test` — 1898 pass. **5 pre-existing failures, unrelated to navigation**,
  confirmed still failing on a stashed tree: the MLB/NFL star-index staleness
  tripwires (×4, time-based) and `lib.billingDiscounts` free-month date math
- `npm run test:pwa-contract` — 20/20
- `npm run test:god-mode-join` — 34/34

No device pass was needed: nothing visual changed. **Phase 1 is the first phase
that does change pixels, and per CLAUDE.md a headless browser cannot verify the
bingo landscape chrome — budget a real-device look at
`docs/bingo-fullscreen-pwa-device-checklist.md`.**

---

## 7. Phase 1 as-built + handoff to Phase 2

> Written 2026-09-05, immediately after Phase 1 shipped. §6 is still the API
> contract; this section records what Phase 1 changed, the one place it
> deliberately departed from §4, and what the next phase inherits.

### 7a. What actually landed

| File | Change |
|---|---|
| `components/venue/AppBar.tsx` | `GameAppBar`'s hand-rendered circle → `<ExitBackButton onExit={onExit} venueHomeFallback label={exitLabel} />`. Local `handleExit`, `useRouter`, `getVenueId` and `ChevronLeft` imports **deleted**; the vestigial `<>…</>` wrapper dropped |
| `components/category-blitz/CategoryBlitzGame.tsx` | The emerald chevron pill in `Header` → `<ExitBackButton onExit={onBack} label="Back to venue" />`. `ChevronLeft` import removed. `compact` still returns `null` for the whole bar, untouched |
| `components/trivia/TriviaGame.tsx` | 3 `.tp-exit-pill` buttons → `ExitBackButton` with `onExit`. The mid-game one keeps `onChangeCategory ?? returnToVenueHome` and now labels itself accordingly |
| `components/trivia/CategorySelect.tsx` | 1 `.tp-exit-pill` → `ExitBackButton`; the balancing spacer narrowed `w-[72px]` → `w-[34px]` to match the circle |
| `app/trivia/live/page.tsx` | 2 `.tp-exit-pill` buttons → `ExitBackButton`, both wired `onExit={() => void goHome()}`; the header one keeps `disabled={isLeaving}` |
| `components/navigation/ExitBackButton.tsx` | **API addition:** a `disabled?: boolean` prop (+ `disabled:opacity-50` on the circle). See 7c |

Bingo, Fantasy, Pick 'Em and NFL Pick 'Em changed **without being edited** — they
render `GameAppBar`. `components/venue/GameLandingExperience.tsx`'s
`showPlayingBackButton` opt-out (`app/pickem/page.tsx:18` passes `false`) was not
touched and still works: it gates whether the bar renders at all, above this layer.

### 7b. The departure from §4 — Category Blitz did **not** move to `GameAppBar`

§4 said "`CategoryBlitzGame.tsx` hand-rolled bar → `GameAppBar`, keeping `compact`
mode." That substitution was examined and rejected. Three independent blockers:

1. **`GameAppBar` is keyed by `GameChromeKey`**, which is
   `"bingo" | "fantasy" | "pickem" | "nfl-pickem"` (`components/venue/GameChrome.tsx:15`).
   Category Blitz would need a fifth key *and* a hand-drawn `GameMark` tile.
2. **`GameAppBar`'s trailing slot is `PointsPill` + `NotificationBell`.** Adding a
   live points poll and a notification bell to a timed, keyboard-driven game
   screen is a product change, not a navigation unification — and it would evict
   the bar's existing "Reconnecting…" error indicator.
3. **The geometry is load-bearing and would double-count the safe area.**
   Every Category Blitz branch renders inside `CategoryBlitzFrame`, a
   `position: fixed` backdrop plus a `.tp-cbz-visible-frame` child that is sized
   and offset to the **visual** viewport with `translate3d` (so it tracks the iOS
   keyboard on the same frame). `AppBar` is `sticky top-0` with
   `pt-[max(env(safe-area-inset-top),8px)]` — safe-area padding *inside* a frame
   that has already been translated past the safe area, and `sticky` inside a
   transformed, overflow-hidden container. See the z-index ladder comment at
   `CategoryBlitzGame.tsx:75-95` for how much prior debugging that frame cost.

**What was done instead:** Category Blitz keeps its own `Header` shell (its
padding, border and `compact` behavior are unchanged) and renders the canonical
`ExitBackButton` inside it. The user-visible outcome §1a asked for — "Category
Blitz's emerald-tinted variant becomes neutral" — is achieved.

**Do not "finish" this in a later phase** unless someone deliberately wants
points/bell chrome on the Category Blitz play screen; that is a product decision,
and blocker 3 has to be solved regardless.

### 7c. The one API addition — `ExitBackButton disabled`

`app/trivia/live/page.tsx:1235` disabled its back control while `isLeaving` (the
280ms exit animation), and §6d had no way to express that. Rather than leave a
hand-rolled button on that one surface, `ExitBackButton` gained
`disabled?: boolean`, defaulting `false` and adding only `disabled:opacity-50`.

`goHome()` already self-guards (`if (isLeaving) return;`), so this is purely the
visible affordance — but keep them in sync; the prop is not a substitute for the
guard. Phases 2–5 should not need this prop; reach for it only where an exit
runs an async teardown.

### 7d. Traps that were real, and how they were handled

- **Live Trivia's `goHome()` teardown** — passed as `onExit`, exactly as §6e
  warned. Never give this surface an `href`/`venueHomeFallback`; `goHome()` sets
  `isLeaving` (driving the `motion.main` exit animation), waits 280ms, then calls
  `navigateBackToVenue`. `venueHomeFallback` would skip all of it.
- **Category Blitz `compact`** — left as the call-site render decision it already
  was (`if (compact) return null;` at the top of `Header`). No `hidden` prop was
  added to the button, per §6e.
- **Speed Trivia's `onMouseDown={() => triggerHaptic(14)}`** — deleted at all four
  Speed Trivia call sites. `ExitBackButton` already fires `triggerBackHaptic()`
  (`navigator.vibrate(14)`) on mousedown; keeping both would double-fire. The
  file-local `triggerHaptic` helper is still used by other buttons in both files
  — don't remove it.
- **`GameAppBar`'s fallback improved on purpose.** With no `onExit`, it used to
  `router.push` straight to the venue home; `venueHomeFallback` now runs
  `runVenueGameReturnTransition` first. In practice every current caller passes
  `onExit`, so this path is a safety net — but it is the one behavior change in
  Phase 1 that isn't purely visual.

### 7e. Verification run for Phase 1

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run build` — succeeds, `Proxy (Middleware)` still listed
- `npm run test` — **1898 pass**, the same 5 pre-existing failures §6f recorded
  (4 MLB/NFL star-index staleness tripwires + `lib.billingDiscounts` date math).
  Unchanged count in both directions: Phase 1 neither fixed nor added a failure
- `npm run test:pwa-contract` — 20/20
- `npm run test:god-mode-join` — 34/34 (not required by Phase 1; run as a cheap check)

**Device pass still owed.** This is the first phase that changed pixels, and per
CLAUDE.md a headless browser cannot verify the bingo landscape chrome. Six
surfaces need a real-phone look:

1. **Bingo** (portrait **and** landscape-fullscreen) — `docs/bingo-fullscreen-pwa-device-checklist.md`
2. **Fantasy / Pick 'Em / NFL Pick 'Em** — same bar, one glance each
3. **Speed Trivia** — three headers (playing / pre-round / finished). The circle
   is ~38px narrower than the pill it replaced, so the centered "SPEED TRIVIA"
   title now sits slightly left of where it did
4. **Speed Trivia category select** — same, spacer already re-matched
5. **Live Trivia** — header back, plus the disabled state during the 280ms exit
6. **Category Blitz** — the bar in normal mode, and that it still vanishes the
   moment the keyboard opens

### 7f. What Phase 2 inherits

- **`ExitBackButton` is now proven on six surfaces**, all via `onExit`. Phase 2's
  content pages are the first real users of `href` / `showLabel` / plain history.
- **The 34px-vs-44px touch-target question from §6e is now live on real game
  screens.** If the device pass says it's fiddly, enlarge `EXIT_BACK_CIRCLE_CLASS`
  **once** — do not special-case `PageShell`.
- **`.tp-exit-pill` callers remaining: two, and both are in a file that does not
  compile.** `components/animations/LiveTriviaIntermissionLeaderboardReveal` (no
  extension, 94KB, tracked) is a stale copy of `app/trivia/live/page.tsx`. Next.js
  cannot resolve an extensionless module so nothing imports it, but a naive
  `grep tp-exit-pill` will keep reporting callers that don't exist. **Phase 7
  should delete that file** before removing `.tp-exit-pill` from `globals.css`.
  Every *live* `.tp-exit-pill` caller is now gone; `BackButton.tsx` still
  hand-inlines the warm-pill look in Tailwind for its 8 remaining call sites
  (Phases 2/4/5).
- **Two raw-`←` primary CTAs survive in `app/trivia/live/page.tsx`** at the bottom
  of the post-game screen (search `"← Back to venue"` / `"← Back to Venue"`, near
  `:1479` / `:1599`). They are full-width rose CTAs, not exit-backs, so §2a never
  listed them and Phase 1 left them alone — but **Phase 7's "no raw `←` in
  player-facing TSX" tripwire will fire on them.** Decide there whether to drop
  the arrow from the copy or exempt bottom-of-flow CTAs; don't turn them into
  `ExitBackButton`s, the position would be wrong.

---

## 8. Phase 3 as-built + handoff

> Written 2026-09-05, immediately after Phase 3 shipped. §6 is still the API
> contract and §7 is still the Phase 1 record; this section covers sign-out.
>
> **Phase 3 ran out of order.** §4 marks it independent, and it is the one item
> in the whole plan that fixes something *broken* rather than inconsistent, so
> it jumped Phase 2. **Phase 2 (player content pages) is still not started and
> is the next thing to do.** Nothing in Phase 3 blocks it — read 8f first, it
> changes one detail of the `PageShell` header Phase 2 is editing.

### 8a. What actually landed

| File | Change |
|---|---|
| `app/api/join/logout/route.ts` | **NEW.** `POST` → expires `tp_sess` (via `clearSessionCookie()`) plus `tp_venue_id` / `tp_user_id`. The route §2c-2 said was missing |
| `lib/serverSession.ts` | **API addition:** `clearSessionCookie()`, the exact inverse of `createSessionCookie()` |
| `components/navigation/AccountMenuList.tsx` | **NEW.** The single player menu list — nav items + `isActiveMenuPath` + the Sign Out row — rendered by *both* player drawers |
| `components/navigation/SignOutButton.tsx` | `performSignOut` gained a wait ceiling; the "route does not exist yet" warning is gone; the Phase 7 tripwire's two legitimate exceptions are documented in the header comment |
| `components/venue/VenueHubClient.tsx` | "Leave Venue" → `SignOutButton variant="player"` (inside `AccountMenuList`). Local `leaveVenue()`, `VENUE_DRAWER_MENU_ITEMS`, `VenueMenuItem`, `isActiveMenuPath` and the now-unused `usePathname` **deleted** |
| `components/ui/AccountMenu.tsx` | Local `MENU_ITEMS` + `isActiveMenuPath` + the whole `<nav>` block → `<AccountMenuList …/>`. `usePathname` / `useRouter` deleted. **This drawer now has a Sign Out for the first time** |
| `components/join/JoinFlow.tsx` | The `← Sign Out` warm pill at `:3051` → `SignOutButton variant="player" redirectTo={null}`. `handleSignOut` → `handleSignedOut` (post-teardown state only). `hardClearAuthAndCache` import dropped |
| `tests/api.join.logout.test.ts` | **NEW.** 4 tests — see 8d |

Not touched: `app/owner/dashboard/page.tsx:182`, `AdminShell.tsx:435`,
`AdminMobileShell.tsx:153`. Those are Phases 5 and 6; `variant="partner"` /
`variant="admin"` are still unwired and their endpoints already existed.

### 8b. The two deviations from the plan text

**1. The logout route clears three cookies, not one.** §4 says "expires
`tp_sess`". It also expires `tp_venue_id` and `tp_user_id`, because those two —
not `tp_sess` — are what `proxy.ts:122-123` actually gates every venue route on.
`clearClientState()` already clears them from JS, so this is belt-and-braces for
a teardown interrupted by a page unload. It is not a substitute for the client
clear: the client clear also drops localStorage, sessionStorage and the
in-memory store, which no route can reach.

**Every one of the three carries the `NEXT_PUBLIC_COOKIE_DOMAIN` attribute when
it is set.** A browser matches a cookie deletion on name + Domain + Path only,
so once the domain split flips (`docs/phase-6-domain-split-runbook.md`) a
deletion without `Domain=.hightopchallenge.com` would expire a host-only cookie
that does not exist and leave the real session alive — a sign-out that looks
correct locally and silently no-ops in production. There is a test for this.

**2. The route builds raw `Set-Cookie` headers instead of `response.cookies.set`.**
`app/api/admin/logout` uses `response.cookies.set` and that is fine for one
cookie. It is **not** fine when mixed with `headers.append("Set-Cookie", …)`:
`NextResponse` constructs its `ResponseCookies` wrapper eagerly, so a later
`cookies.set` re-serializes from its own snapshot and **silently drops the
appended header**. That cost a failing test run; the route now appends all three
to a `Headers` it passes to `NextResponse.json`. Do not "tidy" it back.

### 8c. How the two drawers were consolidated — and how they were not

§4 says "consolidate the `VenueHubClient` drawer and `AccountMenu` onto one menu
list." That is what happened: one `AccountMenuList`, rendered by both. The
**drawer shells were deliberately not merged** — `VenueHubClient`'s carries a
profile/points card and the passkey-setup block, `AccountMenu`'s carries the
change-username modal, and neither belongs on the other surface. Merging the
shells is a much larger change with no stated benefit; the drift §2c-3 complains
about was in the *list*, and the list is now singular.

Consequences worth knowing:

- **`AccountMenu` gained a Sign Out.** It had none. It is reached from
  `PageShell`'s header (`PageShell` → `LeftHamburgerMenu` → `AccountMenu`), so
  every player content page can now sign out. That is the §2c-3 fix, and it is
  a genuinely new capability on ~9 pages — worth a look on device.
- **`AccountMenu` is not in `GameAppBar`.** Checked: `AccountMenu`'s only caller
  is `LeftHamburgerMenu`, whose only caller is `PageShell`. No sign-out control
  appeared on a gameplay screen.
- **The prize dot is a prop.** `AccountMenu` passes `hasUnclaimedPrize`;
  `VenueHubClient` has no such flag today and passes nothing, matching what it
  rendered before. If venue home ever grows one, pass it — don't fork the list.

### 8d. What the new test actually pins

`tests/api.join.logout.test.ts` (4 tests, not in any named tripwire script — it
runs under plain `npm run test`):

1. `tp_sess` comes back `Max-Age=0`, `HttpOnly`, `Path=/`
2. `tp_venue_id` / `tp_user_id` come back `Max-Age=0`
3. **all three carry `Domain=` when `NEXT_PUBLIC_COOKIE_DOMAIN` is set** — the
   post-domain-split silent-no-op guard from 8b
4. round trip: `readSession()` accepts a live `createSessionCookie()` value and
   returns `null` for what this route sends back

Test 3 is the one that matters and the one most likely to be broken by a
well-meaning refactor. It sets and restores `NEXT_PUBLIC_COOKIE_DOMAIN` itself.

### 8e. Behaviour changes a device pass should confirm

- **Sign-out is now a network round trip.** It was synchronous
  (`clearVenueSession()` then `router.push("/")`). `performSignOut` now awaits
  the POST so the `Set-Cookie` lands before the redirect re-enters `proxy.ts`.
  The await is capped at `LOGOUT_WAIT_CEILING_MS` (4s) — `keepalive` means the
  browser finishes the request and applies the cookie regardless, so the cap
  costs nothing and stops an offline device from wedging on a busy button.
  **The button is disabled while busy; on a slow connection that is visible.**
- **A short window exists where the venue page is mounted with cleared state.**
  Between `hardClearAuthAndCache()` and `router.push("/")`. Audited: the only
  `VenueHubClient` guard that redirects on missing cookies is the arrival
  watchdog, and it is gated on `arrivalInProgress` (initial load), so it cannot
  fire from a drawer tap. `AuthSessionProvider`'s reset listener only drops
  state. If a *new* guard is ever added there, re-check this.
- **JoinFlow's sign-out now revokes `tp_sess`.** It never did. Someone who signs
  out on the venue-list panel and logs in as a different account no longer
  carries the previous account's server session.
- **The `[22, 40, 22]` confirmation buzz now fires on JoinFlow too** — it was
  venue-home only. Deliberate: `SignOutButton` owns the interaction.

### 8f. What each remaining phase inherits

**Phase 2 (next).** The `PageShell` header you are about to add a `backTo` slot
to is the same header that renders `LeftHamburgerMenu` → `AccountMenu`, and that
drawer is now taller by one divider + one row. The drawer is `position: fixed`
and portalled, so it does not affect the compact-header spacer math at
`PageShell.tsx:33-41` — but the header row itself now has to hold **both** the
34px exit circle and the 36px hamburger on a narrow phone. That is the one
Phase 3 → Phase 2 interaction; everything else in Phase 2 is untouched by this.

**Phase 4 (JoinFlow / wizards).** `handleSignOut` no longer exists — it is
`handleSignedOut`, and it runs *after* teardown, so it must never be given
teardown work of its own. It still owns the `venueListBuiltRef.current = false`
reset that CLAUDE.md requires on every return to `auth-method-selection`; if the
`WizardFooter` migration reshuffles JoinFlow's panels, that line moves with the
panel change, not with the button. `redirectTo={null}` on that call site is
load-bearing: JoinFlow *is* `/`, so the default `"/"` redirect would be a no-op
push on top of a panel transition.

**Phases 5 and 6.** `variant="partner"` and `variant="admin"` are written and
typechecked but have never run. Two things to know before wiring them:
they deliberately do **not** call `hardClearAuthAndCache()` (that clears the
*player's* localStorage/venue cookies, which a partner or admin session has no
business touching), and admin's default `redirectTo` is `null` because
`AdminShell.handleLogout` re-renders in place — pass `onSignedOut` to set
`setAuthState("unauthenticated")` there, as §6e said. Both endpoints already
exist, so unlike the player variant there is no route to create.

**Phase 7 (tripwire).** The "no `signOut()` / `clearVenueSession()` outside
`SignOutButton`" rule has **three** legitimate exceptions that are not sign-outs
and must be allowed, or the tripwire is unshippable:

1. `JoinFlow.tsx:2502` — `void signOut()` mid-login, dropping a stale Supabase
   session before `createUserProfile`
2. `VenueHubClient.tsx:1145` — `clearVenueSession()` in the arrival watchdog
3. `hardClearAuthAndCachePreserveVenue(…)` at `JoinFlow.tsx:1375`, `:1717`,
   `:2558` — a *login* helper, not a teardown; do not match it by prefix

Also: `AccountMenuList.tsx` contains the only `SignOutButton` usage that is not
at a leaf call site, so a rule written as "SignOutButton must be the last child
of a menu" should target that file, not its two hosts.

### 8g. Verification run for Phase 3

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run build` — succeeds, `Proxy (Middleware)` still listed, and
  `ƒ /api/join/logout` now appears in the route table
- `npm run test` — **1902 pass** (1898 + the 4 new logout tests), the same 5
  pre-existing failures §6f/§7e recorded. ⚠️ One run also failed
  `tests/lib.sportsBingo.player-props.test.ts > builds NBA board using
  BallDontLie player profiles`; it passes in isolation on this tree *and* on a
  stashed tree, and a re-run of the full suite was clean at 5. It is a
  randomized-board flake, not a Phase 3 regression — but it is a **sixth**
  intermittent failure the next phase may see, so don't chase it
- `npm run test:god-mode-join` — 34/34
- `npm run test:pwa-contract` — 20/20 (not required by Phase 3; cheap check)

**Device pass owed, and it is now two lists deep.** Phase 1's six surfaces
(§7e) are still outstanding, and Phase 3 adds:

7. **Venue home drawer** — the row reads "Sign Out", sits below a divider, and
   actually lands on `/` signed out
8. **Any content page drawer** (`/faqs`, `/active-games`, …) — Sign Out is
   *new* here; confirm it looks intentional and is not reachable by mistake
9. **JoinFlow venue-list panel** — the control is a rose pill with **no arrow**,
   and tapping it returns to `auth-method-selection` with the venue list rebuilt
   (not restored from the previous session)
10. **Sign out, then sign back in as a different account** — the real proof that
    `tp_sess` died. Same-account re-login proves nothing here

---

## 9. Phase 4 as-built + handoff

> Written 2026-09-05, immediately after Phase 4 shipped. §6 is still the API
> contract; §7 is the Phase 1 record and §8 the Phase 3 record. This section
> covers step flows — the `WizardFooter` migration.
>
> **Phase 4 also ran ahead of Phase 2.** Unlike Phase 3 (which §4 explicitly
> marks independent), Phase 4 simply shares no files with Phase 2: Phase 2 edits
> `components/ui/PageShell.tsx` and the 9 content pages, Phase 4 edited two
> wizards, JoinFlow and the admin venue flow. **Phase 2 is still not started and
> is the next thing to do.** Read 8f (Phase 3 → Phase 2) first; 9f below adds
> nothing that changes Phase 2's work.

### 9a. What actually landed

| File | Change |
|---|---|
| `components/navigation/StepBackButton.tsx` | **API addition:** `tone?: "dark" \| "light"`, exported as the shared `NavTone` type. Dark is default and renders exactly what Phase 0 shipped; `STEP_BACK_CLASS` is now composed from a layout string + the dark tone string |
| `components/navigation/NextButton.tsx` | **API additions:** `tone`, a replaceable `sizeClass`, and `onClick` is now optional (so `type="submit"` can let a `<form>` own the action). `NEXT_BUTTON_BASE_CLASS` is now composed from a shell + `NEXT_BUTTON_SIZE_CLASS` |
| `components/navigation/WizardFooter.tsx` | **API additions:** `tone`, `variant: "sticky" \| "inline"`, `nextSizeClass`, `nextType`. Defaults (`tone="dark"`, `variant="sticky"`, `nextType="button"`) reproduce Phase 0's markup byte-for-byte |
| `components/join/JoinFlow.tsx` | 3 backs + 2 nexts + the PIN step's "Enter ↵" → three `WizardFooter variant="inline"`s (username step, PIN step, welcome carousel). The two hand-inlined warm pills and their `style={{border}}` are gone |
| `components/rewards/CreateRewardWizard.tsx` | The shadowing local `BackButton` **deleted**; terms / prize / confirm each get a `WizardFooter variant="inline"` carrying both the step-back and that step's primary. `Styles.backLink` and `Styles.primaryButton` removed from both variant maps (no remaining callers) |
| `app/owner/register/page.tsx` | Step 1's "Find My Venue" submit and step 2's "Create Account" + "← Back to edit details" → two `WizardFooter variant="inline" tone="light"`s. `ownerPrimaryButtonClass` import dropped (still used by login / forgot-password / reset-password, which are single-step forms and out of scope) |
| `components/admin/mobile/ActivateVenueFlow.tsx` | Both steps get a **sticky** `tone="light"` footer; the top-left control becomes exit-only. See 9c — this file has the phase's only real behaviour change |

Nothing else was touched. No sign-out, no exit-back circle, no `PageShell`.

### 9b. The four API additions and why each exists

Phase 0 built the footer for one surface shape — a dark, full-height player
screen. Phase 4's four call sites are none of those, and each addition is the
minimum needed to stop a call site hand-rolling its way around the component.
**All four default to Phase 0's behavior**, so no existing render changed.
`STEP_BACK_CLASS` and `NEXT_BUTTON_BASE_CLASS` are now *composed* rather than
literal — same set of utilities, written in a different order. Tailwind class
order in the attribute is not significant and both constants have zero consumers
outside their own file (checked), so this is safe; if a Phase 7 tripwire ever
asserts on one of those strings, assert on the rendered class *set*.

**1. `tone: "dark" | "light"`.** Three of the four targets are light-themed
non-player surfaces (`CreateRewardWizard variant="admin"`, `/owner/register`'s
white card, admin-mobile). §4's Phase 6 already grants admin "the positions and
behavior but not the dark-native circle styling" — `tone` is that sentence made
executable. Light = `border-slate-300 bg-white text-slate-700` for the step-back
and `bg-indigo-600 text-white` for Next, which is what `ownerPrimaryButtonClass`
and the admin wizard's old `primaryButton` already were. **`NavTone` is exported
from `StepBackButton.tsx`** and re-used by `NextButton` and `WizardFooter`; import
it from there, don't redeclare it.

Note the split: `tone` is a *palette*, `nextAccentClass` is a *one-off override*.
On a light surface reach for `tone="light"` first; `nextAccentClass` is for the
genuinely odd case (ActivateVenueFlow's greyed not-ready state, 9d).

**2. `variant: "sticky" | "inline"`.** `WizardFooter`'s sticky chrome
(`sticky bottom-0` + top border + `bg-slate-950/[0.86]` + `backdrop-blur-md`) is
correct for a screen-height flow, and *wrong* inside a card: JoinFlow's steps live
in a `max-w-md rounded-3xl bg-slate-900` join card and the reward wizard's in an
`ht-surface` / white card, where a full-bleed translucent bar reads as a second
panel bolted to the bottom — and `sticky` inside a non-scrolling card does nothing
anyway. `inline` drops the chrome only: same two controls, same order, same
leading/trailing positions, so §0's rule still holds. Three of the four targets
are `inline`; ActivateVenueFlow is the one genuinely sticky flow.

**3. `nextSizeClass` (a replaceable slot, not an appended `className`).**
ActivateVenueFlow's activate button is `h-[104px] text-[32px]` on purpose — a
salesperson taps it standing inside a bar. A `className` could not have preserved
that: `text-base` and `text-[32px]` are the same CSS property, so an appended
class wins or loses on **stylesheet** order, not on the order you wrote them.
`NEXT_BUTTON_BASE_CLASS` was therefore split into a shell (never overridden) and
an exported `NEXT_BUTTON_SIZE_CLASS` (`min-h-[44px] px-6 py-3 text-base`) that
`sizeClass` replaces wholesale. **If you need a different-sized Next, pass
`sizeClass` — never try to out-append the size.**

**4. `nextType: "button" | "submit"`.** `/owner/register` step 1 is a real
`<form onSubmit>`; a form with several inputs and no submit button loses
Enter-to-submit in most browsers. `nextType="submit"` keeps the form owning the
action, which is why `NextButton.onClick` had to become optional and why
`WizardFooter` renders Next when `onNext !== undefined || nextType === "submit"`.

### 9c. The two behaviour changes — both in `ActivateVenueFlow`

Everything else in Phase 4 is a like-for-like swap. These two are not, and a
device pass should confirm them.

**1. The top-left control is now exit-only.** It used to be *both* controls in one
button, branching on mode+step: create/details → back to step 1, edit/location →
back to details, otherwise → `onCancel`. That is precisely the conflation §0
exists to end. The step-backs moved into each step's footer, so the top-left is
now unconditionally `onCancel` and reads "Venues" (with a Lucide `ChevronLeft`
replacing the raw `‹`, ahead of Phase 7's tripwire — it keeps admin's light
bordered chrome, not the player circle).

**The consequence, stated plainly:** in **edit** mode on the *location* step,
top-left used to walk back to the details step; it now abandons the edit. The
original code carried a comment warning against exactly this ("never out of the
form, which would drop unsaved edits"). It is deliberate — that step now has an
explicit "Details" step-back in its footer, and the same mistap already dropped
edits from the details step before this change, so the risk is unchanged in kind
and now consistent. **If Andrew dislikes it, the fix is a confirm on `onCancel`,
not re-conflating the two controls.**

**2. Step 2's primary is now sticky.** It was an inline button at the very bottom
of a long form (name + map + Advanced). It is now in a sticky footer like step 1's
always was. Watch it once on a phone against the `GeofenceEditor` map — the map is
the one element on that screen with its own gesture handling.

### 9d. Smaller call-site decisions worth knowing

- **`goToDetails` stays reachable when the address isn't ready.** The old
  Continue button went `bg-slate-400` but remained *clickable*, because tapping it
  is what surfaces the "Add a street, city, state and ZIP…" / "Set the pin…" hint.
  `nextDisabled` would have made it silently inert, so the greyed look is carried
  by `nextAccentClass="bg-slate-400 …"` and the button stays enabled. **Do not
  "fix" this into `nextDisabled`.**
- **The PIN step's "Enter ↵" became the footer's Next.** §2b counted only two
  literal `Next →`s in JoinFlow, but the PIN step's primary occupies the Next slot
  and pairs with a step-back, so a footer holding the back and not it would have
  been wrong. It now renders "Enter" with the standard chevron; the `↵` glyph is
  gone.
- **The welcome carousel's terminal slide passes `nextHideChevron`**, exactly as
  §6e predicted, so "Let's Go!" stays arrow-free. Its back button is no longer
  `flex-1` — the step-back is intrinsically sized in every footer, so the first
  slide's Next is now full width and later slides show a narrow Back + wide Next
  instead of two half-width buttons.
- **`CreateRewardWizard`'s "venue" and "definition" steps got no footer.** Their
  option cards advance the flow on tap and there is nothing to go back to; each
  keeps its existing `Cancel` (an exit, not a step control — the wizard is
  embedded in a section with no top bar of its own, so it has nowhere canonical to
  put an exit-back. Phases 5/6 own that surface's chrome).
- **`JoinFlow`'s `PasskeyEnrollmentPrompt` was left alone.** Its "Set Up PIN →" /
  "I'll remember my PIN — skip" pair is a modal overlay with no back, not a wizard
  step; §2a/§2b never listed it. Its `→` is body-copy-adjacent and will not trip
  Phase 7's `←` rule, but see 9f.
- **`/owner/register`'s top "← Back" link to `/owner/login` was left alone** — it
  is an *exit*-back and belongs to Phase 5 (§2a treatment 6). The page now
  correctly demonstrates §0's wizard shape: exit at the top, step-back at the
  bottom.

### 9e. Verification run for Phase 4

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run build` — succeeds, `Proxy (Middleware)` still listed
- `npm run test` — **1902 pass**, the same 5 pre-existing failures §6f/§7e/§8g
  recorded (4 MLB/NFL star-index staleness tripwires + `lib.billingDiscounts`
  date math). Unchanged in both directions. The `lib.sportsBingo.player-props`
  flake §8g warned about did **not** reappear this run
- `npm run test:god-mode-join` — 34/34 (required by Phase 4)
- `npm run test:pwa-contract` — 20/20 (not required; cheap check)

**Device pass owed, and it is now three lists deep.** Phase 1's six surfaces
(§7e) and Phase 3's four (§8g) are still outstanding. Phase 4 adds:

11. **Join flow, username step** — Back is now a ghost pill (not the warm
    gradient) and Next is unchanged cyan. Check the pair inside the join card.
12. **Join flow, PIN step** — same pair; the primary now reads "Enter ›" rather
    than "Enter ↵"
13. **Join flow, welcome carousel** — slide 1 has a full-width Next; slides 2+
    show narrow Back + wide Next. Confirm the fixed `h-[22rem]` slide box above
    it still clears the footer on a small phone
14. **Create Reward wizard, Partner Dashboard** (`/owner/competitions`) — dark
    tone; back moved from above the step heading to below the step content
15. **Create Reward wizard, admin** (Rewards section) — light tone on the white
    card. This is the first render of `tone="light"` anywhere
16. **`/owner/register`** — both steps; specifically that pressing **Enter** in
    the ZIP field still submits step 1 (the `nextType="submit"` path)
17. **Admin mobile → Activate a Venue, create** — both steps, plus the sticky
    step-2 footer over the `GeofenceEditor` map, plus the greyed-but-tappable
    Continue showing its hint
18. **Admin mobile → Activate a Venue, edit** — the 9c behaviour change: top-left
    now exits the edit, and "Details" in the location step's footer is the way
    back

### 9f. What each remaining phase inherits

**Phase 2 (next).** Nothing from Phase 4 constrains it — Phase 4 touched no
`PageShell`, no content page, and no exit-back. §8f is still the section to read
before starting. One incidental gift: `NavTone` now exists, so if the device pass
ever wants `ExitBackButton` on a light surface, the vocabulary is already there
(`ExitBackButton` itself has **no** `tone` prop today — adding one is Phase 6's
call, not Phase 2's).

**Phase 5 (Partner Dashboard).** `/owner/register` is already migrated *below the
fold*: its step controls are footers, and only its top `← Back` → `/owner/login`
link remains for you. When `OwnerShell` grows a header back slot, that link is one
of the 5 bare text links §4 lists — and `tone="light"` is the palette the rest of
that shell already uses, so prefer it over hand-written `accentClass`.

**Phase 6 (Admin).** `tone="light"` is now real, shipped and rendered by
`ActivateVenueFlow` and the admin reward wizard — use it rather than inventing a
second light palette. `ActivateVenueFlow`'s top-left button is the pattern to
copy for admin exits: canonical *position* and a Lucide `ChevronLeft`, admin's own
light bordered chrome, no dark circle. Note it is **not** an `ExitBackButton`
(that component is dark-only); if Phase 6 wants one component for admin exits,
adding `tone` to `ExitBackButton` is the cleanest route and `NavTone` is ready.

**Phase 7 (tripwire + style guide).**

- **The `←` sweep of the *step-flow* files is done.** JoinFlow, the reward
  wizard, `/owner/register`'s step 2 and `ActivateVenueFlow`'s `‹` no longer
  contain a raw arrow. What Phase 7 still has to handle: the two rose CTAs in
  `app/trivia/live/page.tsx` (§7f), `/owner/register:105`, and everything in
  Phases 2/5/6 that hasn't been migrated yet.
- **`→` survivors that are legitimately body copy or non-wizard buttons** and must
  not trip the rule: `JoinFlow.tsx`'s `PasskeyEnrollmentPrompt` ("Set Up PIN →",
  and "Set Up →" in the venue-login path) and `JoinFlow.tsx:399`'s
  "Privacy & Security → Location Services" instruction. Write the rule against
  `←` only, as §6e already said.
- **`.tp-exit-pill` / `.ht-btn-exit` caller count is unchanged by Phase 4** —
  JoinFlow's two backs hand-inlined the warm gradient in Tailwind rather than
  using the class, so removing them shrank the *hand-rolled warm-gradient* set
  but not the class's caller list. §7f's note still stands: the only remaining
  `.tp-exit-pill` matches are in the extensionless, unimportable
  `components/animations/LiveTriviaIntermissionLeaderboardReveal`, which Phase 7
  should delete.
- **The "no hand-rolled warm-gradient class strings outside `globals.css`" rule
  is now closer to shippable.** After Phase 4, exactly **two** files inline
  `from-[#a93d3a] via-[#c8573e] to-[#e9784e]`: `BackButton.tsx` (deleted in
  Phase 7 itself) and `components/challenges/ChallengeRedeemPanel.tsx` (§2a
  treatment 10, migrated by **Phase 2**). So if Phases 2 and 7 both land, that
  rule needs **zero** exceptions rather than the one §6e anticipated — but
  re-run the grep before relying on it.
- **A footer-shape rule is worth adding while you're there:** `StepBackButton`
  and `NextButton` should only ever be rendered by `WizardFooter`. After Phase 4
  that is true everywhere — no call site imports either primitive directly.

---

## 10. Phase 2 as-built + handoff to Phase 5

> Written 2026-09-05, immediately after Phase 2 shipped — last of Phases
> 0–4 to land, after Phase 3 and Phase 4 as §8/§9 already predicted. §6 is
> still the base API contract; §8f is the specific note this phase resolves.

### 10a. What actually landed

| File | Change |
|---|---|
| `components/ui/PageShell.tsx` | **API addition:** `backTo?: ExitBackButtonProps`. New `hasHeaderRow = showUserStatus \|\| Boolean(backTo)` drives both which children render and the compact-header spacer class (replacing the old `showUserStatus` branch 1:1) |
| `components/ui/LeftHamburgerMenu.tsx` | Its inner row **lost** `border-b border-ht-border-hairline bg-ht-surface px-2 py-1.5 shadow-[...]` — those moved up to PageShell's wrapper so an `ExitBackButton` can share the exact same bar. Layout classes (`flex w-full items-center gap-2`) stayed |
| `components/challenges/ChallengeRedeemPanel.tsx` | Its inline warm-gradient "← Back to Venue" pill **deleted**. New optional prop `onExitReady?: (exit: () => void) => void`, called from a `useEffect` keyed on `[backToVenue, onExitReady]`. `backToVenue` itself (the gauge-progress save + `runVenueGameReturnTransition`) is untouched |
| `components/challenges/ChallengeRedeemPageShell.tsx` | **NEW**, client. Holds the lifted `exit` handler in `useState` and renders `PageShell backTo={{ label: "Back to Venue", onExit: exit ?? undefined }}` around `VenuePresenceBoundary` + `ChallengeRedeemPanel` |
| `app/venue/[venueId]/redeem/page.tsx` | Now just resolves `venueId` and renders `<ChallengeRedeemPageShell venueId={venueId} />` |
| 9 content pages | `app/active-games`, `app/activity`, `app/advertise`, `app/bingo/select-sport`, `app/bingo/select-game`, `app/bingo/select-board`, `app/faqs`, `app/pending-challenges`, `app/redeem-prizes` — `<BackButton .../>` deleted from content, same props moved onto `<PageShell backTo={{...}}>`. `advertise` and `faqs` also pass `showLabel: true` (§6e's "parent isn't obvious" case); every other page is icon-only |

**Note the count:** §2a's audit said "8" `BackButton` call sites; the actual
repo had **9** (the list above) by the time this phase ran, plus
`ChallengeRedeemPanel.tsx`'s separate inline pill (treatment #10, never
imported `BackButton.tsx`). All 9 are migrated; `grep -rl
'from "@/components/navigation/BackButton"' app components` now returns
**zero** files. `components/navigation/BackButton.tsx` itself is untouched
and still exists — **its deletion stays Phase 7's job** (bundled with
`.tp-exit-pill` / `.ht-btn-exit` removal per §1a), even though it now has no
callers. Don't delete it early; Phase 7's tripwire work assumes it's still
there to exempt until the same commit removes it.

### 10b. The header-sharing design — and the one thing to verify on device

§8f flagged the real risk: "the header row itself now has to hold **both**
the 34px exit circle and the 36px hamburger on a narrow phone." The
implementation makes them literal siblings in one flex row:

```tsx
<div className="relative flex w-full items-center gap-2 rounded-none border-b border-ht-border-hairline bg-ht-surface px-2 py-1.5 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
  {backTo ? <ExitBackButton {...backTo} /> : null}
  {showUserStatus ? <div className="min-w-0 flex-1"><LeftHamburgerMenu showAlerts={showAlerts} /></div> : null}
</div>
```

The border/bg/padding/shadow that used to live inside `LeftHamburgerMenu`'s
own row now live on this wrapper instead, because `LeftHamburgerMenu` has
exactly one caller (`PageShell`, confirmed by grep) so relocating its
styling can't affect anything else. This keeps every combination — `backTo`
alone (e.g. `/advertise`, `showUserStatus=false`), `showUserStatus` alone
(every pre-existing page, unchanged), or both together (the 7 remaining
Phase 2 pages) — rendering as one continuous full-width bar rather than two
bars or a floating chip. `hasCompactHeaderContent` and the spacer-height
branch that used to key on `showUserStatus` now key on `hasHeaderRow =
showUserStatus || Boolean(backTo)`; the four spacer-height values themselves
are unchanged, since `backTo` never changes the row's height, only its
horizontal contents.

**The one thing this couldn't be verified without a device:**
`LeftHamburgerMenu`'s `+points` fly-in overlay (`summary.pointsGain`) is
absolutely positioned (`top-[3.15rem]`) relative to `LeftHamburgerMenu`'s own
outer `relative z-[220] w-full` wrapper. That wrapper's top edge used to sit
flush against the row's padded top edge (padding was *inside* it, on a
sibling row div); now the padding is on an *ancestor* (PageShell's wrapper),
so the wrapper's top edge is inset by `py-1.5` (~6px) more than before. Net
effect: the "+N points" toast likely renders ~6px lower than it did pre-Phase
2, on **every** page that shows it (not just the 9 migrated ones — this is a
PageShell-wide change). It is a single-digit-pixel cosmetic drift, not a
functional break, and nothing in the automated suite catches it (it's a
`position: absolute` visual, not something `tsc`/lint/vitest can see). Look
at it once on a phone earning points on any non-venue page; if it reads
wrong, the fix is shaving `~0.4rem` off `top-[3.15rem]` in
`components/ui/LeftHamburgerMenu.tsx`, nothing structural.

### 10c. Why `ChallengeRedeemPanel` needed a wrapper component, not just a prop

`backToVenue` isn't a static callback — it reads `activeCampaignsRef`
(populated by data the panel loads itself) and calls
`runVenueGameReturnTransition` / `navigateBackToVenue`, i.e. it's the same
shape of "real teardown" as Live Trivia's `goHome()` (§7d). `PageShell`'s
header, though, is rendered by the **page**, a level above the panel — so
the callback has to be lifted out before the header can call it. Since
`app/venue/[venueId]/redeem/page.tsx` is an async Server Component (it
awaits `params`), it can't hold the `useState` needed to receive that
callback itself. `ChallengeRedeemPageShell.tsx` is the minimal client
wrapper that can: it owns `exit` state, passes `backTo={{ onExit: exit ??
undefined }}` to `PageShell`, and hands `ChallengeRedeemPanel` an
`onExitReady` prop that runs `setExit(() => fn)` (note the functional
form — `setExit(fn)` directly would be read as a state updater and misfire).

**The one implication worth knowing:** there is a brief window between first
paint and the panel's mount effect where `exit` is `null`, so `backTo.onExit`
is `undefined` and `ExitBackButton` would fall through to its default
`href="/"` behavior if tapped in that instant. In practice the effect fires
before any human can tap — same class of gap as the "exit runs an async
teardown" note in §7e (Live Trivia's `disabled` during `isLeaving`) — but if
a future device pass ever manages to catch it, the fix is the same shape:
gate `disabled` on `exit === null`, don't restructure the lift.

### 10d. Smaller call-site decisions worth knowing

- **`showLabel` used only on `/advertise` and `/faqs`,** exactly as §6e
  scoped it — both have a destination that isn't obvious from the page
  alone (home, not "the flow you were just in"). The other 7 pages are
  icon-only; their parent is either "venue home" (unambiguous once the
  circle convention is learned) or a visible breadcrumb-like sequence
  (bingo's select-sport → select-game → select-board).
- **The 3 bingo pages keep `preferHref` with computed hrefs**, unchanged
  from their `BackButton` props — `backTo={{ href: backHref, label: "Back",
  preferHref: true }}`. No behavior change, just a prop relocation.
- **`app/active-games`, `/activity`, `/pending-challenges`, `/redeem-prizes`
  all use `venueHomeFallback: true`**, matching their previous `BackButton`
  props exactly.
- **`mt-1` on the page-title strip was also repointed from `showUserStatus`
  to `hasHeaderRow`.** None of the 9 Phase 2 pages currently combine
  `backTo` (without `showUserStatus`) with `showPageTitle=true` — so this
  had no visible effect this phase — but it was a latent bug for the next
  caller that does, so it's fixed now rather than left for Phase 5/6 to
  rediscover.

### 10e. Verification run for Phase 2

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run build` — succeeds; `Proxy (Middleware)` still listed;
  `/venue/[venueId]/redeem` still builds as a dynamic route
- `npm run test` — **1902 pass**, the same 5 pre-existing failures §6f/§7e/
  §8g/§9e recorded (4 MLB/NFL star-index staleness tripwires +
  `lib.billingDiscounts` date math). Unchanged in both directions
- `npm run test:god-mode-join` — 34/34 (not required by Phase 2; cheap check
  since `LeftHamburgerMenu` — used by every non-join, non-venue page — was
  touched)
- `npm run test:pwa-contract` — 20/20 (not required; cheap check)

**Device pass owed, and it is now four lists deep.** Phases 1, 3 and 4's
18 items (§7e, §8g, §9e) are still outstanding. Phase 2 adds:

19. **The 9 migrated content pages** — confirm the header bar reads
    correctly with the circle present (icon-only on 7, icon+"Back" label on
    `/advertise` and `/faqs`), and that it stays pinned while the page
    content scrolls underneath (the actual point of decision 1b).
20. **`/venue/[venueId]/redeem`** specifically — tap Back and confirm it
    still runs the save-progress-then-transition teardown (not a bare
    `router.push`), since this is the one call site where the handler is
    lifted through component state rather than passed as a literal prop.
21. **The `+points` toast position** on any ordinary (non-venue, non-join)
    page — the ~6px drift from 10b. Cheap to check, cheap to fix if wrong.
22. **A phone narrow enough to be a real test** for the exit-circle +
    hamburger-row combo — none of Phase 2's 9 pages currently render both at
    once except transiently (`showUserStatus` defaults `true` and `backTo`
    is set on all 9), so this is actually the *first* time that combination
    ships anywhere. Look at `/active-games` or `/activity` first.

### 10f. What Phase 5 inherits

**`PageShell backTo` is the vocabulary `OwnerShell` should reach for**, not a
hand-rolled header control. §4's Phase 5 already planned "`OwnerShell` gains
a header back slot" — that slot can be exactly `<ExitBackButton {...backTo}
/>` rendered the same way, though `OwnerShell` is a different component tree
than `PageShell` (partner surfaces don't use `PageShell` today) so this is
guidance, not a shared import.

**`tone` exists on `StepBackButton`/`NextButton`/`WizardFooter` (§9b) but
`ExitBackButton` still has no `tone` prop.** Phase 5's partner surfaces are
light-themed, same as `/owner/register` and admin. If `OwnerShell`'s new
back slot wants the dark circle unchanged (a deliberate accent on an
otherwise light shell) that's zero work; if it wants a light-palette exit
control instead, adding `tone` to `ExitBackButton` — using the same
`NavTone` type already exported from `StepBackButton.tsx` — is the
Phase 6 note from §9f restated: whichever of Phase 5/6 needs it first should
add it once, not invent a second light-exit component.

**`LeftHamburgerMenu`'s styling is now split across two files** (layout in
`LeftHamburgerMenu.tsx`, chrome in `PageShell.tsx`). Phase 5 doesn't touch
either file, but if a future phase ever wants the account-menu bar outside
`PageShell` (unlikely — it's `PageShell`'s one caller by design), remember
the border/bg/padding won't come along for free anymore.

### 10g. What Phase 7 inherits

- **`BackButton.tsx` has zero callers as of this phase**, not "8 remaining"
  as §1a's original note assumed. Phase 7's deletion is now pure cleanup
  with nothing to re-verify first — just confirm the grep is still zero
  before removing it.
- **The "two files inline the warm-gradient" count from §9f drops to one.**
  `components/challenges/ChallengeRedeemPanel.tsx` no longer does (its pill
  is deleted, not migrated-in-place); only `BackButton.tsx` itself remains,
  and it dies in the same phase per §1a. So Phase 7's "no hand-rolled
  warm-gradient class strings outside `globals.css`" tripwire needs **zero**
  exceptions once Phase 7 also deletes `BackButton.tsx` — confirmed, not
  just anticipated as §9f left it.
- **`showLabel` on `ExitBackButton` renders a raw text label, not an
  arrow** — `/advertise` and `/faqs` render "Back" as plain text beside the
  circle, no `←`/`→` glyph. The "no raw `←` in player-facing TSX" tripwire
  should not need an exception for either page.

---

## 11. Phase 5 as-built + handoff to Phase 6

> Written 2026-09-05, immediately after Phase 5 shipped. §6 is still the base
> API contract; §7/§8/§9/§10 are the Phase 1/3/4/2 records. This section covers
> the Partner Dashboard (`/owner/*`).

### 11a. What actually landed

| File | Change |
|---|---|
| `components/navigation/ExitBackButton.tsx` | **API addition: `tone?: NavTone`** (default `"dark"`). `EXIT_BACK_CIRCLE_CLASS` is now *composed* — `EXIT_BACK_CIRCLE_LAYOUT_CLASS` (new export) + `EXIT_BACK_TONE_CLASS.dark` (new export) — same utility set as Phase 0, order not significant. Added `EXIT_BACK_LABEL_TONE_CLASS` (file-local) so `showLabel` text follows the tone. **In practice Phase 5 passes no `tone`** — see 11c — but the prop is what §9f/§10f said Phase 5-or-6 should add once, and Phase 6 is the consumer |
| `components/owner/OwnerAccountMenu.tsx` | **NEW.** The trailing-slot account menu: a circle trigger (mirrors `ExitBackButton`'s geometry via the two new exports) opening a click-away popover whose items are an "Account settings" link and, below a divider, `<SignOutButton variant="partner" />`. Escape closes; a transparent fixed scrim handles click-away. `tone?: NavTone` prop exists (unused today — every caller is dark) |
| `components/owner/OwnerShell.tsx` | **API additions: `backTo?: ExitBackButtonProps` and `showAccountMenu?: boolean`.** When either is set, a header row renders **above the logo block, inside the width column**, on the shell's outer background: `<ExitBackButton {...backTo} />` leading, `<OwnerAccountMenu />` trailing, `justify-between` with an empty `<span>` placeholder when there's no back. Both variants (`light`/`dark`) get the row; nothing else in the shell moved |
| `app/owner/dashboard/page.tsx` | `showAccountMenu` added; the loose bottom "🚪 Sign out" `<button>` **and `handleLogout`** deleted (Sign Out now lives only in the menu, per §0). No `backTo` — it's the root. `useRouter` kept (still used by the 401 redirect) |
| `app/owner/{schedule,competitions,display,game-settings}/page.tsx` | The `flex items-center justify-between gap-3` header wrapper (← Dashboard pill + optional venue `Dropdown`) → `backTo={{ href: "/owner/dashboard", label: "Dashboard", preferHref: true }}` + `showAccountMenu` on `OwnerShell`; the wrapper collapses to `{venues.length > 1 ? <div className="flex justify-end"><Dropdown/></div> : null}`. `import Link` dropped from `competitions`/`display`/`game-settings` (no remaining `<Link>`); kept in `schedule` (links to `/owner/competitions`) |
| `app/owner/{account,billing/setup}/page.tsx` | Bare "← Dashboard" `<Link>` (first child of `space-y-5`) → same `backTo` + `showAccountMenu`. `import Link` dropped from both |
| `app/owner/billing/page.tsx` | Module-level `ExitPill` component **and both `<ExitPill />` call sites** (two render branches) deleted → one `backTo` + `showAccountMenu` on the single `OwnerShell`. `import Link` kept (billing/setup links) |
| `app/owner/category-blitz/page.tsx` | Bottom "← Back to Schedule" `<a>` block deleted → `backTo={{ href: "/owner/schedule", label: "Back to Schedule", preferHref: true, showLabel: true }}` + `showAccountMenu`. **Still `variant="light"`** — see 11d |
| `app/owner/login/page.tsx` | Bottom bordered "← Back to Home Page" `<Link>` → `backTo={{ href: marketingHref("/"), label: "Back to Home Page", preferHref: true, showLabel: true }}`. **No `showAccountMenu`** (pre-auth). `import Link` kept ("Forgot password" / "Create an account") |
| `app/owner/register/page.tsx` | Top bordered "← Back" `<Link>` → `backTo={{ href: "/owner/login", …, showLabel: true }}`. No `showAccountMenu`. The step-2 `WizardFooter`'s `onBack` (→ step 1) is untouched — this is exactly §0's wizard shape: exit at top, step-back in the footer. `import Link` kept (bottom "Sign in") |
| `app/owner/forgot-password/page.tsx` | **Both** "← Back to Sign In" `<Link>`s (the `sent` branch and the form branch) → one `backTo={{ href: "/owner/login", …, showLabel: true }}`. No `showAccountMenu`. `import Link` dropped |

`app/owner/reset-password/page.tsx` was **not touched** — you land on it from an
emailed link, there is no in-app parent to go "back" to, and §2a never listed it.

### 11b. The design-doc conflict — resolved in favour of the circle

§4 told Phase 5 to "check `docs/partner-dashboard-design.md` for a conflicting
header spec." It conflicts head-on: that doc's §2 (line ~77) and §3 (line ~109)
specify a **warm-gradient "Exit / Back pill", `rounded-full`, `min-h-11`, sticky
at top of every sub-screen, "the only warm element on screen."** That is
precisely the treatment §1a (Andrew, 2026-09-05) reverses app-wide in favour of
the neutral dark circle. **The navigation plan wins** — it is the newer explicit
decision and Phase 7 already owns amending the design-system files. Phase 5
therefore ships the circle (`ExitBackButton`) on the partner surface too.

**Phase 7 must also amend `docs/partner-dashboard-design.md`** — it is *not* in
§1a's file list (that list predates the dark Partner Dashboard), but its "Exit /
Back pill" spec and the per-screen "Sticky back pill" references are now stale.
Add it to the Phase 7 sweep.

The `--ht-exit-*` CSS vars (`app/globals.css:79-83`) and the `.ht-btn-exit` class
(`:1231`) now have **zero callers in `app/owner/`** — every `ht-exit-*` utility
string is gone. `grep -rn "ht-exit" app/ components/` returns only `globals.css`.
Fold their removal into Phase 7 alongside `.tp-exit-pill` / `BackButton.tsx`.

### 11c. Why Phase 5 added `tone` but doesn't use it

§10f: "Phase 5's partner surfaces are light-themed… if `OwnerShell`'s new back
slot wants a light-palette exit control, adding `tone` to `ExitBackButton`… is
the Phase 6 note restated: whichever of Phase 5/6 needs it first should add it
once." Phase 5 added it (composed classes, `NavTone` from `StepBackButton.tsx`,
`dark` default byte-identical to Phase 0). **But the header row turned out to sit
on a dark background in *both* `OwnerShell` variants** — `bg-ht-canvas` (dark) or
`bg-slate-900` (light; only the inner content card is white) — so the default
dark circle is correct on every owner page and no call site passes `tone`.

**Phase 6 is the real first consumer.** Admin is a genuinely light surface (§4:
"adopts the positions and behavior but not the dark-native circle styling"). Use
`<ExitBackButton tone="light" … />` there — `EXIT_BACK_TONE_CLASS.light` is
`border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50
hover:text-slate-900`, already written and typechecked, matching
`STEP_BACK_TONE_CLASS.light`'s palette. `OwnerAccountMenu` also has an unused
`tone` prop if admin ever wants a parallel menu, though admin already has
`AdminShell`/`AdminMobileShell` drawers (§2c) that are Phase 6's actual target.

### 11d. Smaller call-site decisions worth knowing

- **`preferHref: true` on every owner `backTo`.** These are deterministic
  parent links ("this sub-screen's parent is the dashboard"), not history
  walks — matching what the old `<Link href>` did. No `history.back()`, no PWA
  branch (the partner portal is explicitly *not* a PWA per CLAUDE.md).
- **`login`'s `backTo` href is `marketingHref("/")`.** Today (domain split
  OFF) that resolves to `"/"` and `router.push("/")` is fine. **When the domain
  split flips** (`docs/phase-6-domain-split-runbook.md`), `marketingHref`
  returns an absolute cross-origin URL and `router.push` of an absolute URL is
  a hard navigation in current Next — acceptable, but **verify this one
  control** during that runbook, or switch it back to a plain `<a>`/`<Link>` if
  a hard nav misbehaves. It's the only owner `backTo` that can ever be
  cross-origin.
- **`category-blitz` stays `variant="light"`.** Its child components
  (`CategoryBlitzContinuousSettings`, `CategoryPoolManager`,
  `LetterCoverageVisualizer`) render their own `bg-slate-800`/`border-slate-700`
  chrome inside the white card — a half-dark page. Flipping it to
  `variant="dark"` is a re-skin with real risk and no nav-unification benefit;
  left for whoever re-skins that page. The nav swap (header back + account menu)
  is done regardless. Its `backTo` points at `/owner/schedule`, **not** the
  dashboard — it's a sub-page of Live Games, and that was the old link's target.
- **`showLabel: true` on the four non-dashboard destinations** (`category-blitz`
  → "Back to Schedule", `login` → "Back to Home Page", `register` /
  `forgot-password` → "Back to sign in"). Same rationale as §6e / §10d: the
  parent isn't "the dashboard" so the circle alone is ambiguous. The seven
  `→ /owner/dashboard` backs are icon-only (`label: "Dashboard"` is the
  `aria-label`).
- **The account menu is a popover, not a full drawer.** `VenueHubClient` /
  `AccountMenu` (§8c) are heavy player drawers with profile cards; the partner
  menu is deliberately minimal — "Account settings" + Sign Out — because the
  dashboard already surfaces everything else as tiles. If it grows, it should
  stay a popover; don't port the player drawer shell.
- **`OwnerAccountMenu`'s scrim is a transparent fixed `<button>`** at
  `z-[4990]`, panel at `z-[5000]` (below `PartnerManual`'s `z-[5000]` modal,
  which sets its own scroll lock — the two don't stack in practice). No focus
  trap and no scroll lock: it's a 2-item menu, not a dialog. If it ever grows
  into something dialog-shaped, copy `PartnerManual`'s Escape + `setScrollLock`
  + closing-animation machinery.

### 11e. What Phase 6 inherits

- **`ExitBackButton tone="light"` is ready and unused** — Phase 6 is its first
  real caller (11c). `NavTone` is exported from `StepBackButton.tsx`; import it
  from there, don't redeclare.
- **`OwnerShell`'s `backTo` / `showAccountMenu` shape is the template**, but
  `AdminShell` / `AdminMobileShell` are a different component tree — this is
  guidance, not a shared import (same relationship §10f drew between `PageShell`
  and `OwnerShell`).
- **`SignOutButton variant="admin"`** is written, typechecked, never run (§8f).
  Its default `redirectTo` is `null` because `AdminShell.handleLogout`
  re-renders in place — pass `onSignedOut` to set
  `setAuthState("unauthenticated")`. It does **not** call
  `hardClearAuthAndCache()` (that's player-only teardown). The
  `/api/admin/logout` endpoint already exists. `variant="partner"` is now
  *proven in production* by this phase, so `admin` is the last unrun variant.
- **The 3 admin "← Back to list" section links** (`ChallengesSection:689`,
  `SchedulesSection:995`, `:1183`) are step-flow-ish in-page backs, not
  `OwnerShell`-style header exits — read them in context before deciding
  whether each is an `ExitBackButton tone="light"` or belongs in a
  `WizardFooter tone="light"` (which Phase 4 already shipped and admin already
  renders via `ActivateVenueFlow`).
- **Phase 6's `ActivateVenueFlow` top-left pattern (§9f)** — canonical position,
  Lucide `ChevronLeft`, admin's own light bordered chrome, **not** an
  `ExitBackButton` — was written before `tone="light"` existed. Now that it
  does, Phase 6 can decide to unify on `<ExitBackButton tone="light" />` and
  retire that bespoke button, or keep it. Either is defensible; just don't grow
  a *third* light-exit spelling.

### 11f. What Phase 7 inherits (additions to §10g)

- **`--ht-exit-*` vars + `.ht-btn-exit` join `.tp-exit-pill` / `.ht-btn-exit`
  in the "confirm zero callers, then delete" list.** After Phase 5,
  `grep -rn "ht-exit" app/ components/` is `globals.css`-only. Admin (Phase 6)
  does **not** use `ht-exit-*` (checked — it uses its own light chrome), so if
  Phases 5+6+7 all land, these vars need zero exceptions.
- **`docs/partner-dashboard-design.md` needs the same amendment as the
  design-system files in §1a** — its "Exit / Back pill" (warm gradient) spec is
  now contradicted by shipped code. Not in §1a's original list; add it.
- **No raw `←` remains in `app/owner/**`.** Every owner back control is now an
  `ExitBackButton` (icon or `showLabel` text, no glyph). The `→` in
  `dashboard`'s tile chevrons (`›`) and elsewhere is decorative, not a nav
  arrow. Phase 7's `←` sweep of owner files is done.
- **`ExitBackButton`'s exported class constant changed shape** (`EXIT_BACK_
  CIRCLE_CLASS` is now `LAYOUT + TONE.dark` composed). It still has no external
  consumers (checked). If a Phase 7 tripwire asserts on nav class strings,
  assert on the rendered class *set*, as §9b established.

### 11g. Verification run for Phase 5

- `npx tsc --noEmit` — clean (the lone `.next/types/routes.d 2.ts` `LayoutProps`
  duplicate is the same pre-existing build artifact §6f noted)
- `npm run lint` — clean
- `npm run build` — succeeds; `Proxy (Middleware)` still listed; all 13
  `/owner/*` routes still build (`○ (Static)` for the client pages, unchanged)
- `npm run test` — **1902 pass**, the same 5 pre-existing failures
  §6f/§7e/§8g/§9e/§10e recorded (4 MLB/NFL star-index staleness tripwires +
  `lib.billingDiscounts` free-month date math). Unchanged in both directions
- `npm run test:god-mode-join` — 34/34 (not required by Phase 5; cheap check)
- `npm run test:pwa-contract` — 20/20 (not required; cheap check — Phase 5
  touches no player/PWA surface)

**Device pass owed, and it is now five lists deep.** Phases 1/3/4/2's 22 items
(§7e, §8g, §9e, §10e) are still outstanding. Phase 5 adds:

23. **Every `/owner/*` page, header row** — the dark circle sits top-left in the
    width column, above the logo; the account-menu circle sits top-right. On a
    narrow phone confirm the two circles + the centered logo below don't crowd.
    `maxWidth="lg"` pages (all the dark ones) have the most room; `login` /
    `register` / `forgot-password` are `max-w-sm` — check those hardest.
24. **`OwnerAccountMenu`** — tap the top-right circle on any dark page: popover
    opens below it, "Account settings" navigates and closes, Sign Out runs the
    partner teardown and lands on `/owner/login`. Tap outside → closes. Esc →
    closes. This is the **first** time Sign Out is reachable from
    schedule / competitions / display / game-settings / billing / account /
    category-blitz — confirm it reads as intentional, not accidental.
25. **`dashboard`** — the loose "🚪 Sign out" at the bottom is **gone**; Sign
    Out is now only in the top-right menu. Confirm nothing looks like it's
    missing a control.
26. **`login` → "Back to Home Page"** — with domain split OFF it should land on
    `/`. (Re-check under the domain-split runbook — 11d.)
27. **`register` / `forgot-password`** — the top exit-back reads "Back to sign
    in" beside the circle and lands on `/owner/login`; on `register` step 2 the
    footer's "Details" step-back still goes to step 1 (two distinct controls,
    §0's point).
28. **`billing`** — both render branches (no-subscription and active) show the
    same single header row; the old duplicated `ExitPill` is gone.

---

## 12. Phase 6 as-built + handoff to Phase 7

> Written 2026-09-05, immediately after Phase 6 shipped. §6 is still the base API
> contract; §7–§11 are the Phase 1/3/4/2/5 records. This section covers admin
> (`components/admin/*`). **Phase 7 is the only phase left.**

### 12a. What actually landed

| File | Change |
|---|---|
| `components/navigation/SignOutButton.tsx` | **API addition: `children?: ReactNode`.** When provided it renders in place of `label` (still must not be an arrow). Needed so the desktop admin sidebar footer keeps its leading logout SVG icon — the row would otherwise be visually asymmetric with the "Switch to Mobile" button beside it. `label` is unchanged and still the fallback; every prior call site (`player`/`partner`) passes no `children` and renders exactly as before |
| `components/admin/AdminShell.tsx` | `Sidebar`'s footer `<button onClick={onLogout}>` → `<SignOutButton variant="admin" onSignedOut={onSignedOut} className="<the exact prior chrome + disabled:opacity-50>">…icon…Sign out</SignOutButton>`. `SidebarProps.onLogout` renamed to `onSignedOut`. `handleLogout` (which did `fetch("/api/admin/logout") + setAuthState`) replaced by `handleSignedOut` (just `setAuthState("unauthenticated")`) — the POST now lives in `performSignOut("admin")` inside the button. All three prop sites (`<AdminMobileShell>`, `<Sidebar>` ×2) updated to `onSignedOut={handleSignedOut}` |
| `components/admin/AdminMobileShell.tsx` | The "More" bottom-sheet `<button onClick={() => { setMoreOpen(false); onLogout(); }}>` → `<SignOutButton variant="admin" onSignedOut={() => { setMoreOpen(false); onSignedOut(); }} className="<prior red-row chrome + disabled:opacity-50>">Sign out</SignOutButton>`. Prop `onLogout` → `onSignedOut` |
| `components/admin/sections/ChallengesSection.tsx` | The `mode === "edit" \| "create"` form header: `<div flex justify-between>` with `<h2>` + a `← Back to list` text `<button>` → `<div flex gap-3>` with `<ExitBackButton tone="light" onExit={() => { resetCreateForm(); setMode("list"); }} label="Back to reward list" />` **leading**, then the `<h2>`. Icon-only (no `showLabel`) — the parent list is unambiguous from a form |
| `components/admin/sections/SchedulesSection.tsx` | Same treatment on the create/edit form header (`onExit={() => { resetCreateForm(); setEditingScheduleId(null); setMode("list"); }}`, label "Back to session list") **and** the "Manage Questions" sub-view header (`onExit={closeManageQuestions}`, label "Back to schedule list"). Both header rows go `justify-between` → `gap-3` with the button moved to the leading slot |

Nothing else in `components/admin/*` was touched. `LoginScreen`, `AdminModeChooser`, the `PaginationBar` `‹ › « »` glyphs, and `MobileVenuesSection` / `ActivateVenueFlow` are all out of scope (see 12e).

### 12b. Why the sign-out wiring went through `SignOutButton`, not just `performSignOut`

§11e said `variant="admin"` was "written, typechecked, never run" and to pass
`onSignedOut` for `setAuthState("unauthenticated")` because `AdminShell` re-renders
its login state in place. That is exactly what shipped:

- `performSignOut("admin")` does **only** `fetch("/api/admin/logout", { method: "POST", keepalive: true })` + the 4 s wait ceiling. It does **not** call
  `hardClearAuthAndCache()` or `signOut()` — those are `variant === "player"` only
  (that clears the *player's* localStorage / venue cookies, which an admin session
  must not touch). Confirmed in `SignOutButton.tsx:74`.
- `redirectTo` defaults to `null` for admin, so the button does no `router.push`.
  `onSignedOut` fires after teardown; `handleSignedOut` sets
  `authState = "unauthenticated"`, which re-renders `<LoginScreen>` in place.
- One consequence: `SignOutButton`'s `finally { setBusy(false) }` runs after
  `handleSignedOut` has already swapped the tree, so it's a `setState` on a
  component about to unmount. React 18 (Strict Mode off per CLAUDE.md) does not
  warn on this and it is harmless — but if a future change makes admin sign-out
  navigate instead, revisit.

The alternative — leaving the three hand-rolled `<button>`s and routing their
`onClick` through the exported `performSignOut("admin")` — was rejected: §3's
intent is that `SignOutButton` *is* the control on all five instances, and §11e
explicitly frames Phase 6 in terms of the component's `redirectTo` / `onSignedOut`
props. The `children` prop is the minimum needed to make that literal without
regressing the sidebar icon.

### 12c. The one API addition — `SignOutButton children`

Three lines: a `children?: ReactNode` prop, destructured, rendered as
`{children ?? label}`. All prior callers omit it. The header comment already
forbids arrows; the new prop's doc-comment repeats that constraint since a caller
could now pass arbitrary nodes.

**Phase 7's tripwire** ("no `signOut` / `clearVenueSession` outside
`SignOutButton`", §2c / §8f) is unaffected — `children` changes only what the
button renders, not what it calls. The admin logout endpoint literal
(`/api/admin/logout`) now appears **only** in `SignOutButton.tsx`'s
`LOGOUT_ENDPOINT` map; `AdminShell.tsx` no longer contains it (it did, at the old
`handleLogout`). If Phase 7's tripwire also asserts on the three logout endpoint
strings, admin is now clean.

### 12d. Why `ExitBackButton tone="light"` for the section backs (and not `WizardFooter`)

§11e left this open: "read them in context before deciding whether each is an
`ExitBackButton tone="light"` or belongs in a `WizardFooter tone="light"`."

All three are **exit-backs, not step-backs**: each leaves a single-page sub-view
(a create/edit form with its own submit, or the read-only "Manage Questions"
panel) and returns to the section's list. There is no `Next`, no multi-step
sequence, nothing a `WizardFooter` composes. So `ExitBackButton tone="light"` in
the **leading** slot of the sub-view's header row is the right call — canonical
position (§0: top-left = leave this screen), admin's light palette (§11c:
`EXIT_BACK_TONE_CLASS.light`, already shipped by Phase 5, unused until now — Phase
6 is its first real caller as §11c predicted).

`onExit` is used (never `href`) because each teardown is a real state reset
(`resetCreateForm()` etc.), the same reason Live Trivia's `goHome()` goes through
`onExit` (§7d). Icon-only: the `<h2>` beside the circle ("Edit Reward", "Manage
Questions: …") already names the context, and "the list" is the unambiguous
parent, so `showLabel` would just be noise (contrast §11d's owner backs, where the
parent genuinely wasn't "the dashboard").

### 12e. What was deliberately NOT touched

- **`components/admin/mobile/ActivateVenueFlow.tsx`** — its top-left exit button
  (bespoke light chrome + Lucide `ChevronLeft` + "Venues") was migrated by
  **Phase 4** (§9c) and is out of Phase 6's stated scope (`AdminShell`,
  `AdminMobileShell`, 3 section links). §9f / §11e both say keeping it is
  defensible and only warn against growing a *third* light-exit spelling — after
  Phase 6 there are exactly **two**: `ExitBackButton tone="light"` (owner + the 3
  admin section backs) and `ActivateVenueFlow`'s button. **Phase 7 may optionally
  unify** `ActivateVenueFlow` onto `<ExitBackButton tone="light" showLabel
  label="Venues" onExit={onCancel} />` and delete the bespoke button — low risk,
  `onClick={onCancel}` → `onExit={onCancel}` — but it is not required and would
  add a device-pass item on a flow Phase 4 just changed.
- **`components/admin/sections/BillingSection.tsx:1081`** — `← Use a dollar
  amount instead` is a form input-mode toggle, not navigation. It is not
  player-facing, so Phase 7's "no raw `←` in player-facing TSX" tripwire should
  not fire on it. If Phase 7's rule is scoped more broadly (all TSX), exempt this
  line explicitly — it is not a Back control.
- **`PaginationBar`'s `‹ › « »`** (`AdminShell.tsx:104-143`) — pagination glyphs,
  not navigation arrows, and not `←`. No change.
- **`LoginScreen` / `AdminModeChooser`** — no Back/Next/Sign-Out controls.

### 12f. Verification run for Phase 6

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run build` — succeeds; `Proxy (Middleware)` still listed; all admin routes
  build unchanged
- `npm run test` — **1902 pass**, the same 5 pre-existing failures
  §6f/§7e/§8g/§9e/§10e recorded (4 MLB/NFL star-index staleness tripwires +
  `lib.billingDiscounts` free-month date math). Unchanged in both directions; the
  `lib.sportsBingo.player-props` flake §8g flagged did not reappear
- `npm run test:god-mode-join` — 34/34 (not required by Phase 6; cheap check)
- `npm run test:pwa-contract` — 20/20 (not required; Phase 6 touches no
  player/PWA surface — cheap check only)

**Device pass owed.** Admin is a headless-verifiable *light* web surface (not the
bingo landscape PWA), so most of this can be checked in a normal browser, unlike
Phases 1–5's outstanding lists. Phases 1/3/4/2/5's 28 items (§7e, §8g, §9e, §10e,
§11g) are still outstanding. Phase 6 adds:

29. **Admin desktop sidebar footer** — "Sign out" still shows its leading icon,
    still sits below the divider under "Switch to Mobile", and now runs the POST
    (watch it: the button disables while busy — up to the 4 s ceiling on a slow
    link — then the login screen replaces the shell in place, no navigation)
30. **Admin desktop mobile-drawer** (narrow viewport, ☰ menu) — same `Sidebar`
    component, same footer, confirm the `<SignOutButton>` renders identically
    inside the slide-over
31. **Admin mobile shell → "⋯ More" bottom sheet** — "Sign out" (red row) runs
    the POST then drops to the login screen; the sheet close is now driven from
    `onSignedOut` (post-teardown) rather than on tap — visually the shell just
    swaps to `<LoginScreen>`, so the delayed `setMoreOpen(false)` is not
    observable
32. **Reward create/edit form** (admin → Rewards → New/Edit) — the light circle
    sits left of the "New Reward" / "Edit Reward" heading; tapping it discards the
    form and returns to the list (same as the old text link)
33. **Live Trivia schedule create/edit form** — same, left of "Schedule Live
    Trivia" / "Edit Live Trivia Session"
34. **Live Trivia → Manage Questions** sub-view — the light circle sits left of
    the "Manage Questions: <title>" block; tapping it returns to the schedule list
35. **Sign out (any of the three admin entrypoints), then confirm the session is
    actually dead** — reload `/admin`; it must land on `<LoginScreen>`, not a
    logged-in shell. Proves the `performSignOut("admin")` POST reached
    `/api/admin/logout` and expired the cookie

### 12g. What Phase 7 inherits (additions / confirmations to §10g / §11f)

- **`SignOutButton` now has a `children` prop.** A Phase 7 tripwire that asserts
  "`SignOutButton` renders `label` and never an arrow" must account for
  `children` too — assert on the *rendered* text/DOM, not just the `label` prop.
- **The admin logout endpoint string `/api/admin/logout` is now centralized** in
  `SignOutButton.tsx` only. Combined with §8f (player) and Phase 5 (partner),
  **all three logout endpoint literals now live in that one file.** A tripwire
  can assert exactly that.
- **`←` sweep — admin is done.** `ChallengesSection`, `SchedulesSection` no longer
  contain a raw `←` nav arrow. The only remaining raw `←` in admin is
  `BillingSection.tsx:1081` (a form toggle, 12e) — exempt or ignore per the
  rule's scope. Player-facing `←` survivors are still just the two rose CTAs in
  `app/trivia/live/page.tsx` (§7f) and `/owner/register:105`-adjacent copy
  already handled in Phase 5 (§11f says owner is clean — re-grep to confirm).
- **`ExitBackButton tone="light"` is now shipped and rendered** on the 3 admin
  section backs (in addition to being *available* since Phase 5). Its composed
  class exports (`EXIT_BACK_CIRCLE_LAYOUT_CLASS` + `EXIT_BACK_TONE_CLASS`) are
  unchanged by Phase 6.
- **`BackButton.tsx` still has zero callers** (unchanged since Phase 2, §10g).
  Phase 7 deletes it + `.tp-exit-pill` (`app/globals.css:2018`) + `.ht-btn-exit`
  (`:1231`) + `--ht-exit-*` vars (`:79-83`) + the extensionless
  `components/animations/LiveTriviaIntermissionLeaderboardReveal` (§7f) — re-run
  `grep -rn "tp-exit-pill\|ht-exit\|ht-btn-exit\|from \"@/components/navigation/BackButton\"" app/ components/`
  and confirm every hit is one of those files before removing.
- **Style-guide / design-doc amendments Phase 7 owes** (§1a + §11b): the
  design-system `SKILL.md` files, the Claude Design Brief, **and**
  `docs/partner-dashboard-design.md` (its "Exit / Back pill" spec — §11b). Add
  that the canonical Back is the neutral circle (`cyan-400` for Next per §6b, not
  `accent-500`), with `tone="light"` the sanctioned light-surface variant for
  admin + owner auth.
- **Optional Phase 7 cleanup** (12e): unify `ActivateVenueFlow`'s bespoke exit
  button onto `ExitBackButton tone="light"` so there is a single light-exit
  spelling. Not required.
- **A footer-shape / control-placement tripwire** (§9f): `StepBackButton` /
  `NextButton` only ever rendered by `WizardFooter`; `SignOutButton` only as the
  last child of a menu/sidebar footer (target `AccountMenuList.tsx` and now the
  two admin shells); `ExitBackButton` only in a leading header slot, never in
  page content or a footer.

---

## 13. Phase 7 as-built + the one remaining task

> Written 2026-09-05, immediately after Phase 7 shipped. §6 is still the base API
> contract; §7–§12 are the Phase 1/3/4/2/5/6 records. This section closes the
> plan. **Nothing in code is left to do — only a device pass (§13c).**

### 13a. What actually landed

| File | Change |
|---|---|
| `app/trivia/live/page.tsx` | The two bottom-of-post-game rose CTAs (§7f) lost their leading `←` glyph — now `Back to venue` / `Back to Venue`. They stay full-width rose `<button>`s wired to `goHome()`; per §7f they were **not** turned into `ExitBackButton`s (wrong position). This clears the last raw `←` in player-facing TSX |
| `components/navigation/BackButton.tsx` | **DELETED.** Zero callers since Phase 2 (§10g). `git rm -f` (it had local mods from the Phase 0 `useExitNavigation` extraction). `exitNavigation.ts` — the logic it shared with `ExitBackButton` — is untouched and still in use |
| `components/animations/LiveTriviaIntermissionLeaderboardReveal` | **DELETED** (`git rm -f`). Extensionless, unimportable stale copy of `app/trivia/live/page.tsx` (§7f); held the last two `.tp-exit-pill` references in the repo. Nothing imported it (confirmed — no extension, Next.js can't resolve it) |
| `app/globals.css` | Removed `.tp-exit-pill` + `.tp-exit-pill:active` (was ~`:2018`), `.ht-btn-exit` + `:hover` (was ~`:1231`), and the five `--ht-exit-*` vars (was `:79-83`). The `--ht-exit-*` block is replaced by a comment pointing at §1a; the two class blocks are gone outright |
| `tailwind.config.ts` | Removed the `ht.color.exit` scale (`from/via/to/text/border`) — the Tailwind-side mirror of `--ht-exit-*`. Zero callers of `*-ht-exit-*` utilities anywhere (confirmed) |
| `design-system/project/SKILL.md` **and** `design-system/hightop-challenge-design-system/project/SKILL.md` | Kept byte-identical (they were before; re-synced with `cp` after editing one). 7-point check line 42 and critical rule 3 rewritten: Back/exit is **the neutral dark slate circle** (`ExitBackButton`, Lucide `ChevronLeft`, `border-white/10 bg-slate-900`, no warm tint, pinned top-left), `tone="light"` for admin + owner white cards. The "Exit pill" code sample → the circle's raw markup. Rule 3 also now names the other primitives (`WizardFooter` / `StepBackButton` / `NextButton` / `SignOutButton`). Line 41 / brand-check gained a parenthetical: wizard-footer Next is `cyan-400`, not `accent-500` (§6b) |
| `design-system/project/uploads/Claude Design Brief.md` | The "Back / Exit Navigation (THE WARM ELEMENT…)" section (lines ~181–193) rewritten for the circle + the light variant + a pointer to the other nav controls. Line 33, the two `.tp-exit-pill` "Back button:" specs (Bingo select ~460, game-landing ~553), the hamburger "Close button" (~238), and the SECTION 22 brand check (~659) all updated. `.tp-exit-pill` no longer appears in the brief |
| `docs/partner-dashboard-design.md` | §1 accent table: the "Back / Exit only — warm red-orange" row removed and replaced by a callout that exit is no longer an accent (it's the neutral circle). §2 "Buttons" — the "Exit / Back pill" bullet replaced by a "Back / Exit" subsection describing `ExitBackButton` in `OwnerShell`'s `backTo` slot + `OwnerAccountMenu`. §3 "Sticky back pill" → "Header back circle". Interaction-notes + implementation-status lines de-pilled. The stale "red-orange reserved for exit ⇒ Category Blitz takes fuchsia" reasoning is annotated (the fuchsia choice stands; the constraint is gone) |
| `tests/navigation-controls-contract.test.ts` | **NEW.** 7 static assertions — see §13b. Runs under plain `npm run test` (not in any named `test:*` script) |

**`design-system/**/colors_and_type.css` was deliberately left alone.** Its
`--ht-exit-*` tokens (lines 91–95, in both copies) still back the standalone
HTML preview specimens (`design-system/project/preview/colors-exit-pill.html`
and the `screen-shared.jsx` prototype). Those are an archived handoff, not
production, and the tripwire doesn't scan them. The SKILL.md edit says as much
("remain in `colors_and_type.css` so old preview specimens render"). If someone
later prunes the design-system archive, that's the place to finish.

### 13b. Exactly what the tripwire asserts (and its deliberate allowances)

`tests/navigation-controls-contract.test.ts`, 7 `it`s. Every scan strips `//`
and `/* */` comments first (prose about why the pill is gone must not fail it):

1. **No raw `←` in player-facing `.tsx`** — scope is `app/**` + `components/**`
   minus `app/owner/`, `app/admin/`, `components/owner/`, `components/admin/`.
   `→` is **not** checked (it's live body copy — "Privacy & Security → Location
   Services", "Set Up PIN →"), per §6e. Admin's one remaining `←`
   (`BillingSection.tsx:1081`, a form-mode toggle — §12e) is outside scope by
   construction, not by an explicit exception.
2. **No retired warm exit-pill styling** in `app/**` + `components/**` (all of it,
   not just player-facing): the literals `tp-exit-pill`, `ht-btn-exit`,
   `ht-exit-`, `#a93d3a`, `#c8573e`, `#e9784e`. Zero exceptions — `BackButton.tsx`
   was the last holder and it's deleted in the same phase, exactly as §6e/§9f/§10g
   anticipated.
3. **`signOut(` / `clearVenueSession(` confined** to an allowlist of 3:
   `SignOutButton.tsx` (the real teardown) plus the two non-sign-out exceptions
   from §8f — `JoinFlow.tsx` (drops a stale Supabase session mid-login) and
   `VenueHubClient.tsx` (arrival watchdog). Note §8f also listed
   `hardClearAuthAndCachePreserveVenue` as a "don't match by prefix" trap — the
   test sidesteps it by matching `signOut\s*\(` / `clearVenueSession\s*\(`
   exactly, not a prefix, so that helper is simply never a candidate.
4. **The 3 logout endpoint literals** (`/api/join/logout`,
   `/api/owner/auth/logout`, `/api/admin/logout`) appear only in
   `SignOutButton.tsx` across `app/**` + `components/**`. The route files
   themselves (`app/api/**/route.ts`) name their path only in comments, so they
   pass the stripped scan without needing an exception (§12g).
5. **`<StepBackButton` / `<NextButton` JSX only in `WizardFooter.tsx`** (§9f).
   Type-only `import { type NavTone } from ".../StepBackButton"` is fine — the
   rule matches the rendered tag, not the import.
6. **`<SignOutButton` JSX only in 5 sanctioned hosts** — `AccountMenuList.tsx`,
   `OwnerAccountMenu.tsx`, `AdminShell.tsx`, `AdminMobileShell.tsx`, and
   `JoinFlow.tsx` (the venue-list panel's sign-out, §3/§8a). §8f said "target
   `AccountMenuList.tsx` and the two admin shells" — JoinFlow is the 5th because
   its Phase 3 rose-pill sign-out is a legitimate leaf call site, not a creep.
7. **`BackButton.tsx` and the extensionless animation file stay deleted** —
   `statSync` must throw for both.

**What the tripwire does NOT assert** (considered, left out as too brittle for
their value):
- "`ExitBackButton` only in a leading header slot, never in content/footer"
  (§12g) — there's no reliable static signal for "leading slot"; `OwnerAccountMenu`
  deliberately mirrors the 34px circle geometry, so a class-string match would
  false-positive. Rely on review + the device pass.
- "`SignOutButton` is the *last* child of its menu" — assertion 6 pins the host
  file; ordering within it is a design-review concern.

### 13c. The one thing left: the device pass

Everything in §7e, §8g, §9e, §10e, §11g and §12f is **still owed** — Phases 1–5
changed player-facing pixels and per CLAUDE.md a headless browser cannot verify
the Bingo landscape PWA chrome. Phase 7 changed **no runtime pixels** (only the
two `←`-glyph removals on Live Trivia's post-game CTAs, which are trivial), so it
adds nothing new to check beyond:

36. **Live Trivia post-game screen** — the two bottom "Back to venue" CTAs read
    correctly without the leading arrow (both the venue-standings branch and the
    no-standings fallback branch).

The consolidated device checklist is items **1–36** across §7e / §8g / §9e /
§10e / §11g / §12f / here. Admin (29–35) and owner (23–28) are light web
surfaces checkable in a normal browser; **1–22 and 36 need a real phone**, and
the Bingo landscape items (1) specifically need
`docs/bingo-fullscreen-pwa-device-checklist.md` run on-device. Only Andrew can
close those.

### 13d. Verification run for Phase 7

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run build` — succeeds; `Proxy (Middleware)` still listed; all routes
  build unchanged
- `npm run test` — **1909 pass** (1902 + the 7 new nav-contract tests), the same
  **5 pre-existing failures** §6f onward recorded: the 4 MLB/NFL star-index
  staleness/freshness tripwires (time-based) + `lib.billingDiscounts` free-month
  date math. Unchanged in both directions — Phase 7 neither fixed nor added one
- `npm run test:god-mode-join` — 34/34
- `npm run test:pwa-contract` — 20/20
- `npx vitest run tests/navigation-controls-contract.test.ts` — 7/7

### 13e. If you still want to do the optional cleanup

§12e / §12g flagged one **optional, not-required** item: unify
`components/admin/mobile/ActivateVenueFlow.tsx`'s bespoke top-left exit button
(hand-rolled light chrome + Lucide `ChevronLeft` + "Venues") onto
`<ExitBackButton tone="light" showLabel label="Venues" onExit={onCancel} />`, so
there is a single light-exit spelling instead of two. It was left undone because
(a) it's cosmetically inert, (b) Phase 4 just changed that flow (§9c) and this
would pile another item onto an already-long device list, and (c) the tripwire
doesn't care — `ActivateVenueFlow` is under `components/admin/`, outside the
`←`-scan, and its button uses no retired token. If you do it: it's a one-line
prop swap (`onClick={onCancel}` → `onExit={onCancel}`), delete the local button
markup, and add one line to the admin device checklist.

