# Native App Review Fixes Plan

**Status:** Plan written 2026-10-09 from the `/code-review` of the native-app work through Phase 4b
(commit `6726074`). **R1 done 2026-10-09** (Android Back: popups first, replace-not-push, venue hub
minimises) — website code only, checks green, **not committed / pushed / deployed**; Andrew's Android
device check still open. Handoff: `docs/native-app-review-fixes-plan_PHASE_R1_HANDOFF.md`.
**R2 done 2026-10-09** (venue QR scan on the signed-in venue list selects the venue, geofence unchanged) —
website code only, checks green, **not committed / pushed / deployed**. Handoff:
`docs/native-app-review-fixes-plan_PHASE_R2_HANDOFF.md`.
**R3 done 2026-10-09** (one `haptic()` path that uses the native plugin in the app; "prize won" buzz baselines only on a
successful load) — website code only, checks green, **not committed / pushed / deployed**. Handoff:
`docs/native-app-review-fixes-plan_PHASE_R3_HANDOFF.md`.
**R1–R3 committed together as `0d0c745` on 2026-10-09** (Andrew: push + deploy once the whole plan is done).
**R4 done 2026-10-09** (iPhone app location check uses the web path's time budget) — `lib/geolocation.ts` only,
checks green, **not committed / pushed / deployed**. Handoff: `docs/native-app-review-fixes-plan_PHASE_R4_HANDOFF.md`.
**R5 done 2026-10-09** (four code tidy-ups, no behaviour change) — checks green, **not committed / pushed / deployed**. Handoff: `docs/native-app-review-fixes-plan_PHASE_R5_HANDOFF.md`.
Plan complete; remaining: Andrew's Back-button answer, commit, push + deploy (his go-ahead), device checks.

Parent plan: `docs/native-app-store-plan.md`. Every fix here is **website code** (the app loads the
live site), so each phase ships with a normal web deploy. No new app build is needed.

## 1. Plain-English summary for Andrew

The review found 10 issues. Four are real problems players would notice in the app. The rest are
tidy-ups.

| # | What a player would see | Phase |
|---|---|---|
| 1 | Android Back skips past an open popup (menu, story picture, coupon) and changes the page under it | R1 |
| 2 | Android Back inside a game can bounce between the game and the venue forever | R1 |
| 3 | A signed-in player who scans a venue QR on the venue list sees nothing happen | R2 |
| 4 | On iPhone the location check can take about 32 seconds (the website takes about 9) | R4 |
| 5 | The "prize won" buzz can fire for a prize won days ago | R3 |
| 6 | Bingo and Trivia buzzes don't work in the iPhone app (two separate buzz systems) | R3 |
| 7–10 | Code tidy-ups: a style-rule break, a misleading comment, a needless wrapper, a slow image conversion | R5 |

Nothing here needs a decision from you before work starts. R1 has one default you can override
(§3, item 2). After R1 and R4 you'll need a quick phone check (Android for R1, iPhone for R4).

## 2. Phases

Order: R1 → R2 → R3 → R4 → R5. Each phase is independent and can be committed alone. Run the
**core checks** after every phase: `npx tsc --noEmit`, `npm run lint`, `npm run test`
(never typecheck at the same time as `npm run build`).

---

### Phase R1 — Android Back: popups first, and no history bouncing (Opus 5.5, high)

**Findings:** #2 (`components/owner/sheet/useModalOverlay.ts:120`), #3
(`components/navigation/ExitBackButton.tsx:89`).

**Problem A — player popups never register for Back.** `nativeBackButton.ts` picks
`overlay > step > exit`, but the only `"overlay"` registration is in the owner-only
`useModalOverlay`, and `/owner/*` is web-only in the app. So no player popup ever wins.

Fix: every player popup that can be closed calls
`useNativeBackHandler("overlay", open ? close : null)` with the **same close its X/scrim uses**.
Audit list (confirm each and add any missing ones: `grep -rln 'role="dialog"\|aria-modal\|Drawer\|Sheet' components app`):
- the venue hub menu drawer (`components/venue/`, find the drawer component)
- `components/social-share/StoryCaptureModal.tsx`
- `components/prizes/PrizeWalletPanel.tsx` (`RedeemModal`)
- `components/bingo/CreateBoardSheet.tsx`
- `components/ui/DateCalendarPopover.tsx`
- `components/venue/VenueAccessOverlay.tsx`: check whether it can be dismissed. If not, do not register.
- `components/native/AppUpdateRequired.tsx` is a **blocking** screen. Do not let Back close it. Leave
  it unregistered so Back falls through to minimise. Confirm that nothing underneath it still has an
  `"exit"` handler mounted. If something does, register a no-op `"overlay"` handler (or one that
  minimises) so Back can't navigate behind the update screen.
- Skip admin-only sheets (`components/admin/*`). `/admin` is web-only in the app.

Don't build a new primitive. One hook call per component is the whole fix.

**Problem B — Back pushes history.** `useExitNavigation` (`components/navigation/exitNavigation.ts`,
the `router.push(...)` calls around lines 127–200) is correct for a tap. But when Android Back runs
it, each push adds a history entry, so the next Back on a screen with no handler calls
`history.back()` and returns to the screen the player just left.

Fix: give `handleExit` an option (for example `handleExit({ replace: true })`) that uses
`router.replace` instead of `router.push` for its fallback/href navigations. `ExitBackButton`'s
native registration passes it. A tap stays exactly as it is today (the website must not change).
The `history.back()` paths are already correct. Keep the precedence order and the 150 ms fallthrough
untouched. The logic stays in `exitNavigation.ts`, never in the component (CLAUDE.md navigation rule).

**Problem B, part 2 — the venue hub has no Back handler.** After the fix, Back on the venue hub
falls to `history.back()` and can still reach a stale game entry. Default (§3 item 2): treat the
venue hub as the signed-in player's root screen. Back there **minimises the app**, which is
Android's convention for a root screen. Implement this by registering an `"exit"` handler on the
venue hub (app only) that calls the shell's minimise. Use the same `minimize` fallback that
`components/native/NativeAppRuntime.tsx` passes to `handleNativeBackPress`. Expose it from
`nativeBackButton.ts` rather than calling the bridge directly.

**Tests:** extend the existing native-back unit tests (`grep -rl nativeBackButton tests`).
- An open player overlay beats an `"exit"` handler.
- Back from the exit handler calls `replace`, never `push`.
- A tap still calls `push`.
- The venue hub Back minimises.

Run `npm run test` (`tests/navigation-controls-contract.test.ts`) and
`npm run test:god-mode-join` if `JoinFlow` was touched.

**Device check (Andrew, Android emulator or phone):**
- Open each popup above, press Back. The popup closes and the page stays.
- Venue → game → Back → venue → Back → the app goes to the background (no bounce).

---

### Phase R2 — Venue QR scan on the signed-in venue list (Opus 5.5, medium)

**Finding:** #1 (`components/join/JoinFlow.tsx` ~3261, `handleVenueQrScanned`).

**Problem:** on the `venue-list` panel, a scan only does `router.push('/?v=X')`. The load effect sees
a stored identity, calls `setVenue`, and stays on the list (`venueListBuiltRef` is still true). The
venue is never selected.

**Fix:** when `activePanel === "venue-list"` (the player is already signed in), the scan handler
resolves the venue and calls the **same `handleSelectVenue` path a tap on the list uses**, with no
URL push.
- **The geofence rule doesn't change.** A QR proves nothing about where the player is.
  - If the venue is in the built list, select it.
  - If it isn't (out of range), show a clear message such as "You need to be at <venue> to join".
    Don't select it.
  - A God Mode account sees every venue, so it always finds it.
  - `/api/join/profile` stays the authority.
- An unknown or hidden venue id shows the same "not found" message as a bad code.
- Before the player is signed in (the `/?v=` deep-link path), behaviour is unchanged.
- Don't reset `venueListBuiltRef` here, and don't call geolocation again (CLAUDE.md join-flow rules).
  Any list reset goes through `discardVenueList()`.

**Tests:** unit-test the scan → select decision (in list, out of range, unknown id). Then
`npm run test:god-mode-join` (required: join flow) plus the core checks.

---

### Phase R3 — One haptics path, and the stale "prize won" buzz (Sonnet 5.5, medium)

**Findings:** #6 (`lib/nativeHaptics.ts:36` next to `lib/haptics.ts`), #5
(`components/venue/VenueChallengesPanel.tsx:46`).

**Unify (#6):** make `lib/haptics.ts`'s `haptic()` the single buzz function.
- When `hasNativeCapability("Haptics")` is true, it calls `playHaptic` and **skips**
  `navigator.vibrate`.
- Otherwise it keeps today's `navigator.vibrate` path, so the website and old app builds are
  unchanged.
- Pattern map: `selection` → `tap`, `commit` → `tap`, `success` → `success`, `warning` → `warning`.
- `playHaptic` already respects Reduce Motion. `haptic()` should respect it the same way on the
  native path only. Don't change website behaviour.

About 20 files import `haptic` from `@/lib/haptics` (Bingo, Trivia, Pick 'Em, Category Blitz,
Fantasy, prizes, sign-out, Back).

**Double-buzz trap:** `triggerAnimation` already fires `playHaptic` for the animations in
`HAPTIC_BY_ANIMATION`. Find every place that calls both `haptic(...)` and `triggerAnimation(...)`
for the same moment, for example a Speed Trivia correct answer or a Bingo win. Drop one of the two
so the player feels one buzz.

Update the CLAUDE.md native-app bullet ("Haptics fire from ONE place, `triggerAnimation`") to
describe the new rule: one native call site in `lib/nativeHaptics.ts`, reached from
`triggerAnimation` and `haptic()`.

**Baseline (#5):** only set `wonIdsRef` from a **successful** load. Skip the baseline while
`challengesError` is set, and skip it while the first load returned nothing because it failed. Treat
the first successful card list as the baseline, even when it arrives after a failure.

**Tests:**
- `haptic()` routes to native when the capability exists and to `vibrate` when it doesn't.
- No double buzz on the audited call sites.
- Panel: first load fails → refresh returns an old win → no buzz. A genuinely new win after a good
  baseline → buzz.

---

### Phase R4 — iPhone location check takes too long (Opus 5.5, medium)

**Finding:** #4 (`lib/geolocation.ts:153`, `getBestCurrentLocation` native branch).

**Problem:** in the app, the high-accuracy fix waits up to `timeoutMs` (18 s), then the fallback
waits up to 14 s more, about 32 s in total. The website settles at `sampleDurationMs` (9 s).

**Fix:** give the native path the same budget as the web path.
- High-accuracy attempt: timeout = `sampleDurationMs`.
- Low-accuracy fallback: `maximumAge: 120000`, timeout = whatever remains of `timeoutMs`
  (at least about 3 s).
- Total ≤ `timeoutMs`, so the worst case drops from about 32 s to 18 s, with a typical result near
  9 s. Keep the error type and message the same, so `JoinFlow`'s location messages don't change.
- Check every caller's options. If any caller passes a custom `timeoutMs` or `sampleDurationMs`,
  confirm the new math still respects it.

**Tests:** fake-timer tests for the native branch: high accuracy succeeds; high accuracy times out
at `sampleDurationMs`, then the fallback succeeds; both fail within `timeoutMs`. Then
`npm run test:god-mode-join` plus the core checks.

**Device check (Andrew, iPhone app, indoors):** the venue-list location check finishes in about
10 s or less.

---

### Phase R5 — Code tidy-ups (Sonnet 5.5, low)

1. **#7 `components/venue/VenueHubHeaderBar.tsx`:**
   - Line 70: replace `style={{ fontFamily: "var(--ht-font-display)" }}` with the class
     `[font-family:var(--ht-font-display)]` (`tests/fonts-contract.test.ts` rule).
   - Line 37 (`spacer.style.setProperty`): read what it measures. If it writes a **runtime-measured**
     value (for example the header height), Tailwind can't express that. Keep it and add a one-line
     comment saying why.
   - If the value is static, replace it with a Tailwind class.
2. **#8 `proxy.ts:66` and `lib/domainSplit.ts:146`:** the `/.well-known/` branches never run,
   because the matcher skips dotted paths. **Keep the branches** as defence in depth: they keep the
   app-link files public if the matcher changes. Rewrite both comments to say that, instead of
   claiming the file "would otherwise be gated". No behaviour change. `proxy.ts` is the live gate, so
   change comments only.
3. **#9 `components/join/JoinFlow.tsx:345`:** delete the `checkPermissionState` wrapper. Callers use
   `queryLocationPermission` directly. Run `npm run test:god-mode-join`, because the static guard
   reads this file.
4. **#10 `lib/nativeImageShare.ts:26`:** replace the `String.fromCharCode` + `btoa` loop in
   `blobToBase64` with `FileReader.readAsDataURL`, keeping the part after the comma. Keep the same
   function signature. Update its unit test.

---

## 3. Decisions and defaults (for the next agent)

1. All fixes are website-only. Don't touch `native/` unless a phase proves it has to.
2. **R1 default: Back on the venue hub minimises the app** (Android root-screen convention). Andrew
   can override this, for example by making Back go to the player sign-in. If he does, change only
   the venue hub's registered handler.
   *(2026-10-09: explained to Andrew with a recommendation to keep it; his answer is pending — see the R4 handoff §2.7.)*
3. A QR scan never bypasses the geofence (R2).
4. The website's behaviour must not change in R1, R3 or R4. Every change is gated on
   `isNativeApp()` or `hasNativeCapability()`.

## 4. Handoffs

Per the global rule, each phase ends with `docs/native-app-review-fixes-plan_PHASE_R<N>_HANDOFF.md`.
Update this file's status line to point at it.
