# Native App Store Plan — Phase 2C Handoff (venue-list leak fix)

Plan: `docs/native-app-store-plan.md` → "Phase 2C". Worked 2026-10-08 by Claude Opus 5.5 (medium).
**Status: built and fully tested locally. NOT committed, NOT pushed, NOT deployed** — Andrew hasn't
asked for a commit. Next phase: **2D or 2E** (the plan allows either order; 2D recommended first,
see §8).

---

## Summary for Andrew (plain English)

**What changed.** A new player could briefly see *every* venue behind the "share your location"
question if a God Mode account (Rick) had signed out on the same phone. The list from the previous
sign-in stayed on screen until the new player's location came back. That's fixed. The venue list now
remembers which sign-in it was built for. It's emptied the moment anyone signs out or goes back to
the sign-in choice, and again before every location check. A slow, older lookup that finishes late
is thrown away. While the location check runs, the screen shows "Checking your location to find
venues in range…" and no venues. Opening a direct venue link also no longer loads every venue into
the list.

**Is it live?** No. It's on your Mac only. This is a **website** fix: the app picks it up as soon as
the site deploys, so no app rebuild is needed. To ship it: say "commit and push" (Vercel deploys from
`main`).

**What's left / what needs you.**
1. Say whether to commit and push 2C now. I recommend committing **only the 2C files** (list in §4),
   separate from the uncommitted Phase 2A native-shell files.
2. After it deploys, do a 2-minute check on your phone. Sign in as Rick, sign out, then create a brand-new
   player. Confirm that **no venue appears** behind the location question, and that after you allow location only the
   nearby venues show. (Rick showing all venues is expected: Rick is God Mode. That's R3; turning it
   off for Rick is your call in the admin.)

---

## For the next agent

You have none of this conversation. Read `CLAUDE.md`, `docs/native-app-store-plan.md` (§2, §5, the
"Andrew's first device report" table, and Phases 2D/2E), `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`
(its §5 traps and §9 device report), and this file.

### 1. Next phase: goal and scope

**2D — fit the screen inside the app** (R1 status bar / safe areas, R2 venue-home gap, smaller logos)
or **2E — app front door** (R5 no `/info` in the app, R6 false "No connection", R7 Airplane-Mode
re-test). The plan's Phase 2D and 2E sections are the spec. Both need Andrew's iPhone for the final
check; 2D needs it *first*, for diagnosis (Safari → Develop → the phone).

Out of scope for both: the rest of Phase 3 (icons, splash, min-version gate, link-out rules,
Universal Links), passkeys (Phase 2 Part B), push. Don't touch the 2C venue-list logic except
through its helpers (see §5).

### 2. Starting state

- Branch `main`, HEAD **`ea4ca4d`** ("Phase 1b handoff: record live deploy check"). **Nothing from
  Phase 2A or 2C is committed.** The working tree mixes both:
  - **2C files:** `components/join/JoinFlow.tsx`, `lib/joinVenueList.ts` (new),
    `tests/lib.join-venue-list.test.ts` (new), `tests/god-mode-join-contract.test.ts`,
    `package.json` (the `test:god-mode-join` script), `CLAUDE.md` (one new Join-flow bullet; the
    file *also* has an uncommitted Phase 2A bullet under "Native app"), `docs/native-app-store-plan.md`
    (status line + a 2C status note; the file also has uncommitted 2A edits), this file, and §9 of
    `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`.
  - **2A files (not mine):** `native/`, `.vercelignore`, `tsconfig.json`, `eslint.config.mjs`,
    `docs/native-app-store-plan_PHASE_2A_HANDOFF.md`, `docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md`.
  - If Andrew says "commit", ask whether to commit 2A and 2C together or separately. `CLAUDE.md` and
    the plan hold edits from both, so a clean split needs `git add -p` (non-interactive here: stage
    whole files, or commit both phases together). **Never `git checkout -- <file>` to undo an
    edit** (see the memory note): it wipes all uncommitted changes in that file, including 2A's.
- No production data was read or written. No env vars, migrations, `vercel.json` or `proxy.ts`
  changes. No deploy. The native shell (`native/`) was not touched or rebuilt.

### 3. Decisions already made (don't re-ask)

- Plan §2 decisions all stand (one app, US-only, Capacitor over the live site, website stays
  first-class, etc.).
- R3 (Rick sees all venues) is **working as designed**. Rick is God Mode. Andrew decides in the admin;
  nothing to build.
- Mine, for 2C: the "belt and braces" render guard is a **generation number**, not an account-id +
  God Mode owner key. Why: `accountId` is null for legacy user-id sessions, and `getGodMode()` reads
  storage (not reactive state), so an owner key would be unreliable. The generation is bumped by
  every build, retry and reset, which covers every case without reading identity.
- Mine: the direct-venue-link load path still calls `await listVenues()`, only to warm the
  session-cached venue list for the post-auth builder. Removing it would change error handling on
  that path, and it costs nothing extra (the builder would fetch it anyway).

### 4. What was built (files and key functions)

- **`lib/joinVenueList.ts`** (new, pure, no React):
  - `JoinVenueListState = { generation, builtForGeneration, venues }`, `INITIAL_JOIN_VENUE_LIST`.
  - `emptyJoinVenueList(generation)`, which starts a build or reset with an empty list.
  - `commitJoinVenueList(state, generation, venues)`, which is a no-op for an old generation.
  - `visibleJoinVenueList(state)`, the render guard: venues only if `builtForGeneration === generation`.
  - `filterVenuesInRange(venues, coords)` — the geofence filter + nearest-first sort. It was
    duplicated in two places in `JoinFlow`; both now call this. The math still comes from
    `lib/geofence.ts` (unchanged).
- **`components/join/JoinFlow.tsx`:**
  - `venueList` is now **derived**: `const venueList = visibleJoinVenueList(venueListState)`. There
    is no `setVenueList` any more.
  - `venueListGenerationRef` (the authority for async code) plus three callbacks next to
    `venueListBuiltRef`: `beginVenueListBuild()` (bump + empty, returns the generation),
    `commitVenueList(generation, venues)` (drops a stale one), and `discardVenueList()` (the **only**
    place `venueListBuiltRef.current = false` appears; it also begins a new empty generation).
  - `buildVenueListAfterAuth`: begins a build **before any await**, sets `locationLoading` true and
    clears `locationFailureReason` up front, and after each await returns early if a newer build has
    started. `finally` releases `locationLoading` only for the current build. God Mode still gets
    every venue with zero geolocation calls; nothing about the server-authoritative path changed.
  - `handleGrantLocation("venue-list")` (the Retry / Allow Location buttons): begins a build at the
    start, so the old list disappears while the retry runs, and drops its result if a sign-out
    happened mid-retry. The `"venue-specific"` intent doesn't touch the list.
  - `handleSignedOut` and `handleBackToAuthMethodSelection` call `discardVenueList()`.
  - Direct venue link (`venueParam`, no stored identity): `await listVenues();` with no list write
    (comment marker `// Direct venue link (pre-auth): warm the venue cache only.`).
- **Tests:**
  - `tests/lib.join-venue-list.test.ts` (new, 11 tests): the geofence filter, plus the scenario the plan
    asks for, driven through the same transitions JoinFlow makes. God Mode builds all venues → sign
    out → new normal player → list empty while location is pending → only in-range venues after. Also
    covered: a late God Mode build after the next sign-in is dropped; back-to-sign-in; a retry; and a
    fresh deep-link page.
  - `tests/god-mode-join-contract.test.ts`: a new `describe("Venue-list leak guard (Phase 2C)")` with 5
    static guards. They check: no `setVenueList(`; exactly two `setVenueListState(` writers (empty and
    guarded commit); exactly one `venueListBuiltRef.current = false`, inside `discardVenueList`; sign-out
    and back both call it; the builder and the venue-list retry begin a build before their first
    `await`; and the deep-link branch never writes the list. The existing "direct venue link" test's
    start anchor moved from `const venues = await listVenues();` (no longer unique) to the new comment
    marker.
  - `package.json`: `test:god-mode-join` now also runs `tests/lib.join-venue-list.test.ts`.
- Docs: plan status line + 2C status note; 2A handoff §9 (Andrew's R1–R7 report, copied as the plan
  asked); `CLAUDE.md` Join/Login Flow bullet; this file.

### 5. Facts and traps

- **If 2E (or anything) adds a new path back to `auth-method-selection` that should rebuild the
  list, call `discardVenueList()`.** Never write `venueListBuiltRef.current = false` or set the list
  state directly; the contract test counts both and fails.
- **Back-navigation *to* the venue list from a venue-login sub-screen must keep reusing the built
  list** (CLAUDE.md rule). That still works: those paths don't call `discardVenueList`, so the
  generation is unchanged and the list stays visible.
- The venue-list panel's render order is: list (if non-empty) → `status === "loading"` skeleton →
  `locationLoading` card → location-failure cards → "No venue in range". A stale list used to win
  the first branch; now the list is empty during a build, so the `locationLoading` card shows.
- `getGodMode()` is cleared by `clearClientState()` (`lib/storage.ts`) on sign-out, and every account
  auth path calls `saveGodMode(account.godMode ?? false)` before reaching the venue list. So a new
  player after Rick reads `false`. The leak was only the stale React state.
- `listVenues()` (`lib/venues.ts`) returns the session-cached list when present (`readCachedVenues`),
  so the deep-link warm-up plus the builder make one network fetch, not two.
- `tests/god-mode-join-contract.test.ts` slices the JoinFlow source between literal anchors
  (`sourceBetween`). Renaming a callback or changing a dependency array such as
  `}, [refreshAuthSession, discardVenueList]);` breaks the slice. Update the anchor; don't delete
  the assertion.
- Not done (deliberately): a full React render test of `JoinFlow`. The component is ~3,300 lines with
  about 20 imported modules (Supabase, router, auth context, WebAuthn, framer-motion). The pure-module
  scenario test plus the static ordering guards cover the logic. The visual check is Andrew's device
  step.

### 6. How to build, run and test; what was verified

Commands (repo root), all run 2026-10-08 after the change:
- `npm run test:god-mode-join`: **6 files, 50 tests passed**.
- `npx tsc --noEmit`: clean.
- `npm run lint`: clean (only the usual Babel "deoptimised styling" note for `lib/sportsBingo.ts`).
- `npm run test`: **311 files passed / 1 skipped; 3,555 tests passed / 13 skipped / 0 failed**.
- `npm run build`: success, **196 static pages**, `Proxy (Middleware)` listed. Don't run typecheck
  concurrently with build (`.next/types` is regenerated).

**Unverified:** a real-browser or on-phone run of the sign-out → new player sequence. It needs real
accounts in the shared production database, which I didn't create. That's Andrew's post-deploy
check (summary above). Cost: no change. The fix adds no request; the deep-link path makes the same
single `listVenues()` call as before.

### 7. Open questions for Andrew

1. Commit and push 2C now? If yes: 2A and 2C together, or separately? (§2)
2. R3: should Rick stay God Mode? (admin setting; nothing to build)
3. Still outstanding from 2A: the per-item device checklist results (A1–A14) in
   `docs/native-app-store-plan_PHASE_2A_DEVICE_CHECKLIST.md`.

### 8. Recommended first steps for the next phase

Model per plan: **Opus 5.5** — 2D at **high**, 2E at **high**.

**Recommended: 2D first.** R1 means Back buttons can't be tapped in the iPhone app. That blocks
Andrew's device checks for everything else, including 2E's "Back from each legal page".

2D first steps:
1. Ask Andrew to plug in the iPhone and to say its model. Rebuild and install the spike app via Xcode.
   The bundle id is `com.hightopchallenge.spike` and it uses free Personal Team provisioning; see
   2A handoff §6 and the device checklist for the steps.
2. In Safari → Develop → the phone, on the sign-in page, venue home and a legal page, read
   `env(safe-area-inset-top)` (e.g. a probe element with `padding-top: env(safe-area-inset-top)` →
   `getComputedStyle`), `window.scrollY`, and the header's `getBoundingClientRect().top`. Decide
   whether the inset reads as 0 (fix the shell) or some screens ignore it (fix the web pages).
3. Try the shell fix first (`ios.contentInset: "always"`, or `@capacitor/status-bar` with
   overlay off and colour `#020617`), then `cd native && npx cap sync ios` and rebuild. Re-check
   Bingo landscape against `docs/bingo-fullscreen-pwa-device-checklist.md` and run
   `npm run test:pwa-contract`.
4. R2: replace the fixed `8rem` spacer in `components/venue/VenueHubClient.tsx` with the measured
   header height (`ResizeObserver` → `element.style.setProperty`; no inline `style={{}}` outside the
   TV display). Check it in mobile Safari too.

2E first steps (if Andrew picks it first): build `lib/nativeApp.ts` (`isNativeApp()`, single
reader, contract test) and `homeHref()` beside `marketingHref` in `lib/domainSplit.ts`, then switch
the R5 call sites. JoinFlow is one of them, so run `npm run test:god-mode-join` afterwards (§5:
any new reset goes through `discardVenueList()`).

Native build traps carried over from 2A (see its §5): build Android with
`JAVA_HOME=/opt/homebrew/opt/openjdk@21`. iCloud syncs `~/Documents` and makes `* 2*` conflict
copies; check with `find native -name "* [0-9]*" -not -path "*/node_modules/*"`. Gradle output lives in
`~/Library/Caches/hightop-native/`.
