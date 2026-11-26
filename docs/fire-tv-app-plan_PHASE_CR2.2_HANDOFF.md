# Fire TV plan — Phase CR2.2 handoff (release script hardening: F55–F63)

**For Andrew:** `npm run fire-tv:release` is now safe to fail. If anything goes wrong (bad signing key, Gradle, a network
error, Amazon rejecting the file, Ctrl-C) it puts `build.gradle.kts` back exactly as it was and deletes the half-made
Amazon edit, so the next run isn't blocked. It never reuses a version number, stops if Amazon's version is already
ahead of this checkout, and no longer gives Gradle the Amazon secret. A release build with no key now stops with a clear
message instead of making an unsigned file. It's tooling only: **no app change, no store release, nothing is live that
players or TVs see.** I ran the new script's `--dry-run` for real: it built, signed and verified the APK, and reverted the
bump. Nothing needs you. **Next is CR2.1; I'm waiting for your go.**

One thing I found: while 1.0.0 is in review, Amazon answers "no edit" (`{}`), so the old "a release is in review" guard
never fired. The script now opens the edit first (and deletes it on failure), so a release in review stops the run before
any build.

---

## For the next agent

### 1. Next phase
**CR2.1** (TV display polish, F45–F47, F49–F53; `docs/fire-tv-app-plan.md` "Phase CR2.1"; Sonnet 5.5 / high). Web only.
**Wait for Andrew to say go** (he wants phases in order and asked to be told). Out of scope: CR2.3, CR3, CR1.7 (waits
for Amazon to approve 1.0.0).

### 2. Starting state
- Branch `fix/cr2-release-script` from `main` `330113c1`. Code, tests, plan and this note are one PR (see the plan's
  status line / `git log` for the PR number and merge). Not deployed anywhere: scripts under `native-tv/` and tests only.
- No data changed. No Amazon edit was opened by me. One read-only Amazon probe (token + `GET /edits`) was run.
- `~/Library/Application Support/Hightop Challenge/releases/fire-tv/` still holds only `hightop-challenge-tv-1.0.0-vc1.apk`.
  `native-tv/app/build.gradle.kts` still has vc1 / 1.0.0 (matches the release in review).

### 3. Decisions made (don't re-ask)
- Andrew approved CR2.1–CR2.3 on 2026-11-25, asked for CR2.2 first, and said the corner QR heights (`bottom: 130` on
  idle slides, `44` on Live Trivia) are fine for D16.
- Amazon's live version code ≥ the next code → **stop**, don't jump over it (the plan said `max(...)`; stopping avoids
  releasing "1.0.1" twice under different codes). The local file and the saved-APK folder still raise the code silently.
- Edit opened **before** the build (full runs). `--dry-run` opens no edit and keeps no APK.

### 4. Files
- `native-tv/scripts/release.cjs` — rewritten around `release()` (throws `ReleaseError`) and one `cleanup()` (idempotent;
  restores the gradle file only if the bump was written and the commit didn't succeed; deletes this run's edit with
  GET etag + `DELETE`; removes the lock only if this run took it). `SIGINT`/`SIGTERM` call it (exit 130/143). `childEnv()`
  strips `AMAZON_*` and sets `JAVA_HOME` for Gradle and `apksigner`. `highestSavedCode()`, `takeLock()` (`.release.lock`,
  stale pid replaced), `COPYFILE_EXCL` for the saved APK. Prints the `git add … && git commit …` line at the end.
- `native-tv/scripts/create-upload-key.cjs` — keystore creation in `createKeystore()`; credentials file removed if it fails
  and no keystore exists.
- `native-tv/app/build.gradle.kts` — `gradle.taskGraph.whenReady` guard: `assembleRelease` / `bundleRelease` /
  `packageRelease` fail when `uploadSecrets == null`. Checked live with an empty fake home (blocked) and the real keys
  (allowed); `lintRelease` and `assembleDebug` pass without keys.
- `tests/fire-tv-release-script.test.ts` + `tests/helpers/fire-tv-release-preload.cjs` — runs a copy of the script in a
  child process with `fetch` and `execFileSync` mocked and `HOME` pointed at a temp dir. 19 tests. `FIRE_TV_RELEASE_SCRIPT`
  / `FIRE_TV_KEY_SCRIPT` point the tests at another copy (old scripts: 16 of 19 fail).

### 5. Facts and traps
- `GET /edits` → `200 {}`, no etag, while 1.0.0 is in review. A 404 is also treated as "none".
- Amazon documents deleting an edit (draft only) with `if-match` from a prior GET; the `validate` response shape is not
  documented, so only a non-empty `errors` stops. Whether the live APK object carries `versionCode` is unproven (the
  script warns and goes on if it doesn't): **check on the first real release (CR1.7)** by reading the log line.
- The test bug that mattered: a mocked never-resolving promise lets Node exit on its own; the preload keeps it alive with
  an interval. And cleanup must not delete a lock held by another run (caught by a test).
- `os.homedir()` follows `HOME`, which is why tests need no script overrides. `tsc` here wants `NODE_ENV` in a typed env.
- Never print or open the signing folder or `.env.local` values; `node --env-file=.env.local` is the way to use them.

### 6. Build, run, test
`npx vitest run tests/fire-tv-release-script.test.ts`; `npm run test` (615 files pass), `npm run lint`, `npx tsc --noEmit`.
Verified live: `npm run fire-tv:release -- --dry-run` (build, signature, revert, lock removed). **Not verified against Amazon:**
the delete-edit call, `validate` errors, `versionCode` on the live APK (all mocked); the first real release proves them.

### 7. Open questions
None for Andrew. Waiting only on his go for CR2.1.

### 8. Recommended first steps (CR2.1)
Read the plan's "CR2.1" details and findings F45–F47, F49–F53; branch from up-to-date `main`; the carousel rotation, FX
timing and the "one QR / keep-out / nothing replays on a poll" standing rules apply (`docs/live-trivia-pregame-and-display-cleanup-plan.md`,
`docs/venue-display-hype-and-intro-stinger-plan.md`). Model: Sonnet 5.5 / high, as the plan says.
