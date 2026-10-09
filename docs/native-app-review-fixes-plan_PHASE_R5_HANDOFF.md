# Native App Review Fixes — Phase R5 Handoff (code tidy-ups) — LAST PHASE

Plan: `docs/native-app-review-fixes-plan.md` · R5 finished 2026-10-09 · No further phase in this plan.

## 1. For Andrew (plain English)

**What changed.** Four small clean-ups. Nothing a player will notice.
- The venue page's title now takes its font through the approved styling rule instead of an inline style.
- Two code comments about the app-link files (`/.well-known/`) now say honestly that the code is a safety net. No behaviour changed.
- A needless middle-man function in the join screen was removed.
- Turning the share-story picture into text for the share sheet now uses the phone's built-in converter. It is faster and uses less memory on big pictures.

**Is it live?** No. Nothing is pushed or deployed. R4 and R5 are uncommitted. All automated checks pass.

**Your Android Back-button recommendation is unchanged: keep it.** On the venue page (the game tiles), Back sends the app to the background like Gmail or Instagram. It doesn't sign anyone out. Your answer is still pending.

**What needs you.** (1) The Back-button answer. (2) Say "push" when you want it deployed (pushing to `main` deploys). (3) Optional device checks, §2.6.

---

## 2. For the next agent

### 2.1 Scope
Plan is complete. Remaining work is only: commit R4+R5, then push/deploy **only on Andrew's go-ahead**, then his device checks. If Andrew changes the Back answer, edit only the venue hub's `"exit"` registration in `components/venue/VenueHubClient.tsx`.

### 2.2 Starting state
Branch `main`, last commit `0d0c745` (R1–R3, not pushed). Uncommitted: R4 (`lib/geolocation.ts`, `tests/lib.native-location-budget.test.ts`), R5 files (§2.4), status lines in both plan docs, R4 and R5 handoffs. Not ours, never commit: `.vscode/settings.json`, `native/ios/App/App/config 2.xml` (iCloud duplicate). Add files by name, never `git add -A`. No DB, env, migration or Vercel change.

### 2.3 Decisions
- `VenueHubHeaderBar` `spacer.style.setProperty("--venue-hub-header-h", …)` is runtime-measured (header height via ResizeObserver), so it stays. It already had a comment explaining why; no change needed.
- `proxy.ts` and `lib/domainSplit.ts`: comments only.
- `checkPermissionState` had one caller (the plan said two); now `queryLocationPermission()` is called directly.
- Back on the venue hub minimises the app (kept; recommendation unchanged from R4).

### 2.4 Files changed
- `components/venue/VenueHubHeaderBar.tsx`: `<h2>` inline `fontFamily` → `[font-family:var(--ht-font-display)]`.
- `proxy.ts` (~line 63), `lib/domainSplit.ts` (~line 144): comment text only.
- `components/join/JoinFlow.tsx`: deleted `checkPermissionState`; call site in `resolveDeniedPermissionState` uses `queryLocationPermission()`; comment updated.
- `lib/nativeImageShare.ts`: `blobToBase64` uses `FileReader.readAsDataURL`, returns the text after the comma. Same signature.
- `tests/native-image-share.test.ts`: Node has no `FileReader`, so a `FakeFileReader` is stubbed globally (re-stubbed in `afterEach` after `unstubAllGlobals`). Existing assertion on the base64 value (`cG5nLWJ5dGVz`) still holds.

### 2.5 Traps
- Tests run in the Node environment; a new test touching browser-only APIs needs a stub.
- `tests/god-mode-join-contract.test.ts:53` still names `checkPermissionState(` as a string that must NOT appear; it passes.
- zsh: quote globs. Never run typecheck and `npm run build` together.

### 2.6 Verification (2026-10-09)
`npx vitest run tests/native-image-share.test.ts` 8/8; `npm run test:god-mode-join` 59/59; `npx tsc --noEmit` clean; `npm run lint` clean; `npm run test` 321 files passed, 1 skipped, 3,697 tests passed, 13 skipped, 0 failed; `npm run build` succeeded (run after the tests, not concurrently).
**Unverified:** real phones. Optional after deploy: Android — share a story picture (opens share sheet with the picture) and press Back on the venue page (app minimises); iPhone — venue-list location check finishes in about 10 s or less.

### 2.7 Open questions
1. Andrew's answer on the Android Back behaviour (recommendation: keep).
2. Commit R4+R5 together or separately, and the push/deploy go-ahead.

### 2.8 First steps
Ask Andrew the two questions, commit by file name with the Co-Authored-By line, push only on his yes, then compare nothing further (no cost-affecting change in this plan).
