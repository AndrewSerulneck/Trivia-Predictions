# Native App Store Plan — Phase 8 partial handoff

## Summary for Andrew

The release instructions are written in `docs/native-app-release-runbook.md`. They explain which
changes need a store release, how version numbers and signing work, and how to test and roll out an
update. **Phase 8 is not finished:** its update rehearsal needs the initial store release first.
No app code, production data, recurring job or minimum-version gate changed for this documentation.
Apple/Google launch status remains in the Phase 6 handoff and the plan's latest status table.

## For the next agent

### 1. Goal, scope and exclusions

Finish the Phase 8 update rehearsal after initial launch: one intended small native change, version/
counter update, signed artifacts, both test-track installs over the previous app, session/passkey/
notification checks, and release-control evidence. The runbook is already prepared. Do not call the
documentation alone completion. Do not manufacture an unnecessary production change or start Phase
5.5 partner-written messages to satisfy this rehearsal. Final Apple review requires Andrew's legal
review and submit action. TinyFish is prohibited by Andrew's explicit stop request.

### 2. Starting state, source and data

- Date: 2026-10-25. Root branch `main`, HEAD/origin main
  `7aacf153cd8707b6d3f3644051a96614703ecaba` (Android passkey verifier release).
- Current web production: READY `dpl_2Y9ixHxGcj5ijT5P5pNfSSkjYxvx`, project
  `hightop-challenge` / `prj_yjIvzEUquV1gPWBsgOIluVp8v1ci`, both hosts/exact source verified earlier.
  No deployment was performed for this runbook.
- Runbook and this handoff are new/uncommitted. Plan, Phase 6/5.2 handoffs and a small CLAUDE.md status
  correction are uncommitted. Preserve the root's extensive unrelated messaging/POS/artwork/tooling changes.
- No database read/write, migration, push send, backup or undo journal was needed for this documentation.
  Deleting/reverting only these documentation changes undoes it. Applied migrations remain immutable.
- The selected passkey release already passed 5,530 tests / 13 environment skips, typecheck, lint and
  217-page build; GitHub CI `40252657482` passed. These are prior release results, not new tests of this text.

### 3. Decisions already made

- `com.hightopchallenge.app`, Apple paid team `2U7HMXGQM3`, Organization publisher Hightop Challenge LLC.
- Players only, free, US-only initial launch; keep iPhone **and iPad**. Partners use browser.
- Reviewer `appreview`, user-chosen PIN private (never repository), God Mode location bypass; visible
  `venue-hightop-test`, Hightop Test Bar, 1010 Pacific St, Brooklyn, NY 11238, USA.
- Google build 2 is already in Production review by Andrew's choice; do not repeat an internal-track
  detour merely to reconcile an older plan. Organization account has no personal-account tester gate.
- Andrew confirms APNs key uploaded. Actual iPhone push test remains separate.
- Andrew created Apple app record **6826962606** during the follow-up. Latest upload outcome is in
  Phase 6 handoff. Do not recreate the app record.
- Optional rating prompt undecided; not a launch blocker. Combined Phase 7 promotion waits for both live listings.

### 4. Files

- `docs/native-app-release-runbook.md`: current launch baseline, four marketed-version source locations,
  native counters, exact archive/export/Gradle/signing commands, upload vs review separation, test tracks,
  rollout/rollback, shared semantic minimum version, store URLs and still-open rehearsal.
- `docs/native-app-store-plan.md`: current remaining-work table and Phase 8 partial-status pointer.
- `docs/native-app-store-plan_PHASE_6_HANDOFF.md`: artifact hashes, store upload outcomes and launch next steps.
- `docs/native-app-store-plan_PHASE_5_2_HANDOFF.md`: APNs confirmation supplement; historical instructions below it.
- `native/scripts/sign-android-bundle.cjs`: existing untracked signing helper referenced by runbook. Reuse
  private key; never run `--create-upload-key` again. Its contents were not changed for Phase 8.

### 5. Facts, traps, permissions and cost

- Version `1.0.0` appears in native package, both UA strings, both iOS MARKETING_VERSION settings and
  Android versionName. Counters currently iOS 1 / Android 2; check console history before any next upload.
- iCloud Documents duplicate files can break builds. Existing build caches use `~/Library/Caches/hightop-native`.
- Xcode/Gradle/keychain access may require approved execution outside sandbox. Trust failures inside
  sandbox do not justify changing trust settings. Xcode-managed distribution signing succeeded earlier.
- Xcode export `testFlightInternalTestingOnly=true` permanently prevents App Store use of that build.
  Omit it for a launch build. Normal upload does not itself submit App Review.
- Native config URL is cached: `s-maxage=300, stale-while-revalidate=86400`; normal five-minute refresh
  is not a hard propagation deadline during refresh failure. Minimum version is shared across platforms
  and compares marketed versions, not build counters.
- No new recurring cloud cost or API credit was introduced. Runbook's existing config endpoint baseline:
  no DB access, roughly 288 refreshes/day/active CDN region at steady five-minute cache intervals,
  plus retries/evictions. Future SDK additions require renewed data/cost review.
- Never read/print `.env.local`, private signing credentials, tokens or PIN; obey canonical env rules.

### 6. Build and verify

Exact commands are in the runbook. They were compared to native config, version contract, signing helper,
successful prior Xcode archive/export and `xcodebuild -help`. Current machine Xcode 27.0 (27A266a),
iPhone SDK 27.0, Java `/opt/homebrew/opt/openjdk@21`. Android has cached dependencies for offline Gradle.
No native rebuild or broad suite rerun was necessary for documentation alone. Recheck commands if version,
dependencies or machine changes; choose fresh paths and never overwrite a prior release artifact.

### 7. Open developer/device work

Apple processing/TestFlight, real iPhone notification checks, screenshots (iPhone+iPad), privacy/rating/legal
review and Apple submission; Google approval and Play-installed passkeys; remaining device sharing/news
checks; 7+ day session retention. Android upload-key secure backup and APNs private-key backup location
remain unconfirmed. Only ask for storage location, never key contents. Do not request APNs upload again.

### 8. First steps and plan model

Follow Phase 6's latest handoff to finish initial launch first. Then Phase 7 implements store promotion
(plan suggests Sonnet 5.5 / medium), followed by Phase 8 rehearsal (plan suggests Haiku 4.5 / low).
Use the current agent when no override is explicitly authorized; do not spawn agents based on these
historical model labels. Finish Phase 8 by recording exact source/artifacts/install/retention/release evidence
here and updating plan status. Until then this is a partial handoff.
