# Native App Review Fixes — Phase R4 Handoff (iPhone location check budget)

Plan: `docs/native-app-review-fixes-plan.md` · Phase R4 finished 2026-10-09 · Next phase: **R5** (last).

## 1. For Andrew (plain English)

**What changed.** In the iPhone app, the check "are you at the venue?" can now take less time when
your phone is slow to find you. The app now uses the same time limits as the website: a short
precise attempt, then a quick rough one that uses any recent location the phone already has.

- **The plan overstated the problem.** It said the check could take about 32 seconds. The two real
  places that check location (the venue list and picking a venue) pass shorter limits, so the
  slowest case today is about 10–11.5 seconds for that step, after the first 8-second try. Now it is
  about 5.8 seconds. So the slowest whole check drops from about 19.5 s to about 13.8 s. A phone that
  finds you quickly (most of the time) is unchanged and still takes about 1–3 s.
- **Added a safety net:** if the phone's location system never answers at all, the app now gives up
  on its own instead of spinning forever.
- **Messages are unchanged.** The "location denied", "couldn't find you" and "timed out" messages are
  exactly as before.

**The website is unchanged.** This code only runs inside the iPhone app.

**Is it live?** No. R1, R2 and R3 were committed together as `0d0c745` (not pushed). R4 is finished
and all automated checks pass, but it is **not committed**. As you asked, push and deploy happen after
R5. No new app build is needed.

**What needs you.**
1. Your answer on the Back-button question (§2.7 explains it).
2. After deploy, an optional iPhone check (§2.6).

---

## 2. For the next agent

### 2.1 Next phase goal and scope

**R5: code tidy-ups** (Sonnet 5.5, low). Spec: `docs/native-app-review-fixes-plan.md` § "Phase R5", four
items:
1. `components/venue/VenueHubHeaderBar.tsx`: inline `fontFamily` style → `[font-family:var(--ht-font-display)]`;
   check `spacer.style.setProperty` (runtime-measured → keep and add a comment; static → Tailwind).
2. `proxy.ts` (~line 66) and `lib/domainSplit.ts` (~line 146) `/.well-known/` comments: rewrite them to say the branch is
   defence in depth (the matcher skips dotted paths today). **Change comments only.**
3. `components/join/JoinFlow.tsx` ~line 347: delete the `checkPermissionState` wrapper. Its two callers use
   `queryLocationPermission()` directly. `tests/native-app-contract.test.ts:383` asserts the file contains
   `queryLocationPermission()`, which still holds afterwards. Also fix the comment at ~line 352 that names
   `checkPermissionState()`. Then run `npm run test:god-mode-join`.
4. `lib/nativeImageShare.ts` `blobToBase64`: use `FileReader.readAsDataURL` and keep what follows the comma.
   Keep the same signature and update its unit test.

**Out of scope:** any behaviour change, `native/`, and push/deploy unless Andrew says so. Andrew's instruction:
**push and deploy after the whole plan is done**, so after R5. Ask him before pushing, because pushing to `main`
deploys.

### 2.2 Starting state

- Branch `main`. R1+R2+R3 committed as **`0d0c745`** ("Native app review fixes R1–R3…") on top of `6726074`.
  **Not pushed.**
- **R4 uncommitted:** `lib/geolocation.ts` (modified), `tests/lib.native-location-budget.test.ts` (new),
  `docs/native-app-review-fixes-plan.md` and `docs/native-app-store-plan.md` (status lines), and this handoff.
  Commit R4 alone or together with R5. Ask Andrew, but he was relaxed about combining R1–R3.
- Untracked files that aren't ours: `.vscode/settings.json` and `native/ios/App/App/config 2.xml` (iCloud " 2"
  duplicate). **Never commit them.** Ask Andrew before deleting. Add files by name, never `git add -A`.
- No DB, env, migration or Vercel change in R1–R4.
- A dev server (`npm run dev`, port 3000) was started in the background during this session for a smoke check.
  It may still be running.

### 2.3 Decisions made in R4 (don't re-ask)

- **Native budget:** high-accuracy fix `timeout = sampleDurationMs`. Fallback `enableHighAccuracy: false`,
  `maximumAge: 120000`, `timeout = max(3000, timeoutMs − elapsed)`. With the defaults (9000/18000) that is
  9 s + 9 s = 18 s worst case.
- **The 3 s floor beats "total ≤ timeoutMs"** for short budgets. Both real callers pass
  `sampleDurationMs: 2800` with `timeoutMs` 4000 (`getInitialLocation`, JoinFlow ~line 369) or 5500 (venue
  select, ~line 1154). For those, the remainder is 1.2 s or 2.7 s, too short for a useful fallback, so they get
  3 s: worst case 5.8 s, down from 10 s / 11.5 s. Their outer flow first calls `getCurrentLocation()` (8 s
  high-accuracy). `getBestCurrentLocation` runs only if that fix's accuracy is worse than 500 m.
- **Added a JS deadline** (`withNativeDeadline` in `getNativePosition`, plugin timeout + 1000 ms, rejects with
  the plugin's timeout code `OS-PLUG-GLOC-0010` → browser code 3). This is a backstop if a bridge call never
  returns. It also applies to `getCurrentLocation()` in the app (8 s → backstop at 9 s). The error shape is
  unchanged: `Error("Unable to determine location.")` with `code` 1/2/3.
- The website path (`watchPosition` sampling) is untouched.

### 2.4 Files changed in R4

- `lib/geolocation.ts`: `NATIVE_DEADLINE_GRACE_MS` + `withNativeDeadline` (above `getNativePosition`);
  `getNativePosition` wraps `callNative` with it; `NATIVE_FALLBACK_MIN_MS = 3000` (above `BestLocationOptions`);
  the native branch of `getBestCurrentLocation` computes the split described above.
- `tests/lib.native-location-budget.test.ts` (new, 5 fake-timer tests; mocks `@/lib/nativeApp` to iOS with the
  capability and `@/lib/googleMapsKeys`): high accuracy succeeds and is asked with `sampleDurationMs`; it times out
  at `sampleDurationMs`, then the fallback (9000, `maximumAge` 120000) succeeds; both fail → code 3 within 18 s;
  short budget 2800/4000 → fallback 3000; the bridge never answers → code 3 after 3.8 s + 4 s.
- Status lines: `docs/native-app-review-fixes-plan.md` (top, plus a note under §3 item 2) and
  `docs/native-app-store-plan.md` (~line 41).

### 2.5 Facts and traps

- Location callers: `getBestCurrentLocation` has only the two JoinFlow callers above. `getCurrentLocation` is
  also called by `components/venue/VenuePresenceBoundary.tsx` (×2) and `components/fantasy/FantasyHome.tsx`, and
  those now get the JS backstop too.
- `/verify` (repo skill) was run before the R1–R3 commit as a smoke check. Logged in as Andrew's Pacific Street
  player via `scripts/print-test-auth-cookies.cjs`, headless Chromium at 390 px. `/venue/venue-pacific-street`,
  `/trivia`, `/redeem-prizes` and `/bingo` all returned 200 with zero console or page errors. A headless browser
  is not the app, so `isNativeApp()` is false there. This only proves the website path still renders.
  Playwright is installed in another session's scratchpad
  (`/private/tmp/claude-501/-Users-andrewserulneck-Documents-Trivia-Predictions/f1fed1da-…/scratchpad/node_modules`).
  That folder may disappear, so reinstall into your own scratchpad if needed.
- zsh: quote globs. BSD `sed -i ''`. Never run typecheck at the same time as `npm run build`.

### 2.6 How to build, run and test (run 2026-10-09 after R4)

- `npx vitest run tests/lib.native-location-budget.test.ts tests/lib.native-app-phase3.test.ts tests/native-app-contract.test.ts`:
  48 passed.
- `npm run test:god-mode-join`: 59 passed.
- `npx tsc --noEmit`: clean. `npm run lint`: clean (only the usual Babel size note on `lib/sportsBingo.ts`).
- `npm run test`: 321 files passed, 1 skipped; 3,697 tests passed, 13 skipped, 0 failed. The flaky failure noted
  in R3 did not reappear.
- `npm run build`: not run. It isn't a core check, but run it once before the final push.
- **Unverified:** real-device timing. **Andrew's iPhone check (after deploy, app, indoors):** open the venue list
  and pick a venue. The location check should finish in about 10 s or less. Turn on Airplane mode with Wi-Fi off
  and try: you should get the "couldn't find you" or "timed out" message instead of an endless spinner.

### 2.7 Open questions for Andrew

1. **R1 Back on the venue page (asked again 2026-10-09; Andrew asked what it means).** It was explained in chat
   like this: the "venue page" is the venue hub, the screen with the game tiles after a player picks a venue.
   On Android, the phone's Back button on that screen now sends the app to the background, like Instagram or
   Gmail on their main screen. It does **not** sign the player out, and reopening the app returns to the same
   screen. iPhone has no Back button, so this is Android-only. The recommendation given: **keep it**. The
   alternatives were going to the venue list or the sign-in, which would effectively mean leaving the venue or
   signing out with one accidental press. If Andrew answers "change it", edit only the venue hub's `"exit"`
   registration in `components/venue/VenueHubClient.tsx` (see the R1 handoff §2).
2. The Android device check from R1 is still open.
3. Push/deploy: after R5 (Andrew's instruction). Confirm before pushing.

### 2.8 Recommended first steps for R5 (Sonnet 5.5, low)

1. Read plan § R5 and this handoff §2.1.
2. Make the four edits (comments only in `proxy.ts` / `lib/domainSplit.ts`).
3. Run `npm run test:god-mode-join`, `npx tsc --noEmit`, `npm run lint`, `npm run test`, then `npm run build` (not
   at the same time as typecheck).
4. Write `docs/native-app-review-fixes-plan_PHASE_R5_HANDOFF.md`. Mark the plan complete in both status lines.
5. Ask Andrew to commit R4 + R5, push to `main` (that deploys) and run the device checks: R1 Android, R4 iPhone,
   R3 optional.
