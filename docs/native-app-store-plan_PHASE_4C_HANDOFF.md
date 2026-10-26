# Native App Store Plan — Phase 4c handoff

**Android activation follow-up, 2026-10-25 (latest):** Andrew requested the next plan work and supplied the public
**Play app-signing** certificate SHA-256:
**D6:3F:6E:3E:B3:E3:BA:49:7E:A7:3B:AE:19:A3:56:3D:86:D7:8F:4A:9D:59:E6:16:2B:FD:22:99:06:ED:8C:4E**.
New production Config variable **ANDROID_APP_CERT_SHA256** was added to confirmed Vercel project **hightop-challenge**
(**prj_yjIvzEUquV1gPWBsgOIluVp8v1ci**); no previous value existed. No .env.local read/edit or secret exposure.
Android app origin is **android:apk-key-hash:1j9uPrPjukl-pzuuGaNWPYbXj0qdWeYWK_0imQbtjE4**. This is different
from the upload key E4:1C:A0:44…BB:EC:B4; do not swap them.

Publication candidate is isolated at **/private/tmp/hightop-android-passkeys-release-2026-10-25**, branch
**release/android-passkeys-2026-10-25**, based on production/remote main **f0cc758f285925db997f463d426b12a50f35adf8**.
Production before release is READY **dpl_C7WEtdjcADThY7vAgmWzeuqom1fA**, both apex/play aliases on this same project
and exact base SHA. Only native passkey helper/routes, Android support/dependencies/versionCode 2 (already uploaded
by Andrew), their tests, this handoff and the **already applied** 20261025150000 migration record are in the candidate.
No migration execution. Root's partner-message/POS/design/tooling/docs work remains excluded and dirty.

Candidate gates: **5,530 tests passed / 13 environment skips**, **447 suites / 1 skip**; typecheck, lint and
**217-page production build** passed. Native build/signature checks and Google Production In review are recorded in
Phase 6 handoff. Baseline association endpoints on both domains are **404 / 0 bytes**. Expected new JSON body is
**267 bytes apex** (get_login_creds only), **312 bytes play** (get_login_creds + handle_all_urls), package
com.hightopchallenge.app and the supplied Play fingerprint. Both existing HTTPS web origins remain valid when
configured; native origins only augment explicitly allowed HTTPS origins under the production RP. Synthetic real
ES256 verification still rejects wrong challenge/RP/cert, missing user verification and tampered signatures.

No new DB reads/writes per ceremony, timer/job, provider service or paid API. The OS fetches the existing association
route, cached s-maxage=3600/stale-while-revalidate=86400. At a hypothetical 1,000 or 10,000 checks/day, 312-byte bodies
are about 0.312/3.12 MB per day, 9.36/93.6 MB per 30 days before headers, compression/retries/cache; at one retry
these body upper estimates double. Actual OS frequency, CDN billing and invoices unmeasured; origin work is cached
and regional, so no claim of a fixed global origin-request cap. No recurring job or per-player DB loop added.
Publication/live checks are the remaining action for this candidate snapshot. After deployment record exact commit,
READY ID and canonical endpoint/Google DAL checks here; a real Play-installed Android passkey creation/sign-in and
cross-platform ceremony still need an Android tester. Never mark those passed from synthetic/server checks.


Date: **2026-10-25**. Plan: `docs/native-app-store-plan.md`, Phase 4c (plan model Opus 5.5, xhigh).
**Status: iOS live and verified; Android implementation built/tested, release activation pending.**

**Later 2026-10-25 update:** Andrew has now created the Play app record, selecting **App**, not Game. This supersedes
the no-record state below. Advised changing its application type/category to Game → Trivia via Grow users → Store
presence → Store settings; change not yet confirmed. Next inspect Protected with Play → Play Store distribution →
Go to Play app signing for the public app-signing SHA-256. If unavailable, first signed internal-testing AAB/signing
setup is needed. No certificate, release bundle/upload, publication or production env change is confirmed.

## Summary for Andrew

Face ID sign-in now works on your iPhone. The paid Apple signing switch had already been done correctly. You could
save a passkey, but the Face ID button then failed before Apple's prompt because the database required an account
before the passkey identified one. You approved a small database migration; it is applied. You then confirmed native
Face ID sign-in and using that same passkey in iPhone Safari. No iOS rebuild was necessary.

The missing Android WebView integration and certificate-origin verification are built and tested locally. Android
release activation still needs a Play app record and signing certificate. **Andrew confirmed no app is listed in
Play Console yet.** No fingerprint was supplied or guessed. Nothing was committed, pushed, web-deployed or uploaded
to either store. The database correction is live; Android source changes remain local. The full cross-device matrix
and 7+ day session observation remain open.

## For the next agent

### 1. Next goal and scope

Finish Android's release trust and end-to-end checks once the Play app record/signing setup exists. Publish only the
selected verifier changes from a clean release tree and ship the rebuilt Android shell through internal testing;
then complete native/browser interoperability and fallback/cancellation checks. iPhone setup/login/Safari checks
already pass; do not redo the signing switch or add an iOS plugin without evidence of a new failure.

Out of scope: unrelated Phase 5.5/POS/design work, paid audits, trivia imports, prize mutations, app-store submission,
new cron work, weakening origin checks, reapplying/down-migrating the applied migration, or marking the seven-day
observation passed early. Phase 7 still waits for live store URLs.

### 2. Starting state: source, deployment and data

- Workspace `/Users/andrewserulneck/Documents/Trivia-Predictions`; branch **main**, HEAD/local origin/main
  **f0cc758f285925db997f463d426b12a50f35adf8**, `docs: record verified live Nunito and venue layout release`.
  No commit, push, fresh remote fetch, Vercel deployment or store upload was performed in this session.
- All Phase 4c application/native/tests/docs changes remain uncommitted, including the applied migration file.
  Preserve existing dirty Phase 5.5 code, POS notes, `CLAUDE.md`, device-checklist edits, design image moves and local
  tool config. Do not blanket-stage/deploy the root tree. No package.json/lockfile or iOS project edit was needed.
- Linked production project **pkmxupsayzshvpirkaav**: migration **20261025150000_native_discoverable_passkeys.sql**
  was explicitly approved by Andrew (answer: **Apply this migration**) and applied **alone**, at approximately
  **2026-10-25T14:40Z**. Live anonymous options succeeded at **2026-10-25T14:40:16.158Z**.
- The migration drops `webauthn_challenges.account_id NOT NULL` and adds
  `webauthn_challenges_registration_identity_required`: authentication can have no account/profile yet;
  registration must have one. Existing foreign keys, RLS/grants, unique challenge, expiry and used-at rules remain.
  **No existing passkey/player/challenge row was updated/deleted by the migration.** It creates no table or grant.
- New ordinary authentication attempts create the existing short-lived challenges. Andrew created **one** appreview
  passkey through normal iPhone UI at **2026-10-25T14:32:18.348927Z**. It is multiDevice/backed_up true; last_used_at
  advanced to **2026-10-25T14:42:43.933Z** after native/Safari checks. Credential values were not exported or printed
  by the verification queries. No other account/prize/game data was intentionally changed by this phase.
- Private evidence: **tmp/native-passkeys-2026-10-25/** (git-ignored): `migration-release.json` (SQL SHA-256, approval,
  exact baseline, applied status), `live-options-after-migration.json`, `ios-reviewer-passkey-status.json`, gate logs,
  emulator.log, and isolated `db-release/supabase/`. Android build log is **tmp/native-passkeys-android-build.log**.
  This is targeted schema-state evidence, not a full database backup; no existing row rewrite required a data export.
- Reviewer-setup baseline/IDs from the earlier same-day task remain in
  **tmp/native-app-review-2026-10-25/provisioning.json**. Never commit private evidence or the reviewer PIN.
- No Vercel/native environment setting, signing key, POS connection, flag or app-store record was changed.

### 3. Decisions and approvals already resolved

- Andrew requested: check and finish Phase 4c and the iOS signing-switch half of Part B. Existing paid signing was
  correct; verify it instead of rebuilding/reprovisioning without a need.
- Andrew unlocked the paired iPhone and personally approved the actual passkey setup/sign-in prompts.
  Confirmed answers: passkey saved; first login failed with no-key copy; migration approved; native Face ID login
  succeeds after migration; same passkey succeeds in iPhone Safari. These are real-device observations.
- **No Play app is listed yet** (Andrew, 2026-10-25). Do not keep asking him to find a nonexistent signing fingerprint.
  Create/configure the Play record and Play App Signing before obtaining the production certificate.
- App remains player-only, US-only, free; iPad support retained. Appreview still uses its chosen PIN as primary store
  reviewer access. Do not put its literal value in any file or ask Andrew to choose another.
- iOS uses standard WKWebView WebAuthn. Android uses standard WebView app-mode WebAuthn + Credential Manager,
  **not** a new Capacitor passkey plugin. One RP ID **hightopchallenge.com**, one existing server verifier.
- Reuse the existing **ANDROID_APP_CERT_SHA256** certificate configuration for both Digital Asset Links and expected
  Android clientData origins. The WebView options fetch still has its https page origin; certificate-derived origins
  are accepted only by response verification for the allowed production RP. No wildcard/browser-privileged mode,
  no separate native origin HTTP-header override, and no new WEBAUTHN_ALLOWED_ORIGINS entry is needed for this flow.
- Do not configure the local debug certificate as the production Play certificate. It was inspected only for testing;
  no production certificate/env change was made.

### 4. Files and implementation details

- **supabase/migrations/20261025150000_native_discoverable_passkeys.sql**: two ALTER TABLE statements described above.
  **APPLIED / IMMUTABLE**. Do not edit, reapply, delete, down-migrate or repair its history.
- **native/android/app/src/main/java/com/hightopchallenge/app/MainActivity.java**: `enablePasskeys()` checks
  `WebViewFeature.WEB_AUTHENTICATION`, selects `WEB_AUTHENTICATION_SUPPORT_FOR_APP`, logs actual support level;
  unsupported WebViews retain PIN fallback. Called after the bridge exists, before wrapping its WebViewClient.
- **native/android/variables.gradle**: `androidxCredentialsVersion = '1.6.0'` (stable, verified in official release
  notes). Existing WebKit stays 1.14.0, minSdk 26, Capacitor 8.5.3. **native/android/app/build.gradle** adds official
  `androidx.credentials:credentials` and `credentials-play-services-auth` using that one version.
- **lib/webauthn.ts**, `getExpectedPasskeyOrigins(challenge)`: returns the unchanged challenge web origin when no
  cert is configured or challenge is not an allowed https origin under the production RP. Otherwise returns that
  exact web origin plus exact `android:apk-key-hash:<base64url SHA256>` origins from
  `readAndroidCertFingerprints` in `lib/nativeAppLinks.ts`; deduplicates certificates. No database reads added.
- **app/api/auth/passkey/register/verify/route.ts** and **authenticate/verify/route.ts** call that helper for the real
  SimpleWebAuthn verifier's `expectedOrigin`. Challenge, RP ID, signature, credential ownership and user-verification
  checks remain intact. No client UI code or registration/options route change was required for the iOS fix.
- **tests/lib.webauthn.test.ts**: native-origin configuration and narrowing regressions.
  **tests/lib.native-passkey-verification.test.ts**: real verifier, synthetic ES256 signatures/COSE/none attestation;
  browser/trusted Android registration and auth, untrusted/removed certificate, wrong challenge/RP, missing user
  verification, tampered signature. These fixtures are synthetic, not provider captures.
  **tests/api.auth.passkey.test.ts**: mock wiring for the helper.
- **tests/native-passkey-challenges-sql.test.ts**: real PGlite/PostgreSQL reproduction of the original NOT NULL
  failure; applied file allows anonymous auth, rejects anonymous registration, preserves existing/account/legacy
  flows and foreign-key/type/uniqueness checks.
- Updated **docs/native-app-store-plan.md**, **docs/PASSKEY_CROSS_DEVICE_MATRIX.md**,
  **docs/native-app-device-checklist.md** section O, **docs/native-app-store-submission-pack.md** (Apple-only verified
  note; shared listing stays PIN until Android ready), **docs/native-app-store-plan_PHASE_6_HANDOFF.md** dated
  follow-up, **CLAUDE.md**, **SYSTEM_CONTEXT.md**, this handoff and **docs/native-app-store-plan_PHASE_2B_HANDOFF.md**.

### 5. Facts, traps, permission boundaries and cost

- Live front-door auth options before the fix: HTTP **400**, errorCode UNKNOWN,
  `null value in column "account_id" of relation "webauthn_challenges" violates not-null constraint`.
  The UI hid this behind “We're sorry, we don't have a passkey saved for your device! ...”. Registration had already
  succeeded. This is a schema incompatibility, not missing Face ID, absent entitlement or missing stored credential.
- The false `isUserVerifyingPlatformAuthenticatorAvailable()` result on the initial probe did **not** prove iOS
  WebAuthn was unusable. Real creation and sign-in are the decisive checks; do not gate away the working flow on
  that probe alone.
- Both public AASA files and Apple's CDN cached files returned 200 with
  **2U7HMXGQM3.com.hightopchallenge.app**. The actual signed device app has
  `webcredentials:hightopchallenge.com`. No associated-domain/signing edit was needed.
- Both live **/.well-known/assetlinks.json** URLs (apex and play) returned **404**. Android release trust is not ready
  merely because the rebuilt emulator reports support level 1 and exposes `PublicKeyCredential`.
- **Production history already contains 20261023145024**, despite older Phase 5.5 docs saying unapplied. An isolated
  dry run initially excluded that file, then correctly refused because a remote history version was missing locally.
  It was copied into the isolated comparison directory; the next dry run and actual apply showed **only
  20261025150000**. Do not run the CLI's suggested history repair. This session did not execute/reapply 5.5 or inspect
  its deployment/flag. The isolated directory is evidence, not a permanent alternative migration source.
- Network/device/build commands required approved sandbox escalation; no auto-review rejection occurred.
  Supabase CLI **2.116.0** writes telemetry outside the repo even for help; use proper escalation, not HOME overrides.
- Plain `npm run lint` traversed ignored historical release copies under tmp/ and reported 309 unrelated artifact
  errors. `npm run lint -- --ignore-pattern 'tmp/**'` passes real project source. Preserve those evidence directories;
  do not delete or edit them to make lint pass.
- No new paid integration or cron. The restored discoverable path uses one existing challenge insert per attempt,
  then fixed-count existing verification reads/updates on success, never per-user whole-bank work. Budget estimate:
  roughly <=6 bounded DB operations/success, about 6,000/day (180,000/30d) at 1,000 successful logins/day or
  60,000/day (1.8m/30d) at 10,000. Challenge storage order of magnitude <=1 KB/attempt including indexes: ~30 MB or
  300 MB per 30 days at those volumes. Attempts/retries increase this linearly. Rows expire logically in five minutes;
  **no physical-retention cleanup was added**. Actual billing/egress deltas were not measured. Android origin mapping
  is CPU-only and adds no DB query; existing website/PIN flows are unchanged.
- Undo: do not delete saved passkeys or player records. Applied migration is immutable; any schema reversal is a new,
  separately approved forward migration and would restore the broken discoverable login if account_id NOT NULL
  returned. Preserve valid existing rows and expired challenge handling. Android source is still local and can be
  excluded from release; never revert unrelated dirty files or remove production envs without authorization.

### 6. Build/run/test and verified limits

From `/Users/andrewserulneck/Documents/Trivia-Predictions`, installed root/native npm dependencies required:

- `npm run test` -> **448 files passed / 1 skipped; 5,551 tests passed / 13 environment skips**.
- `npx tsc --noEmit` -> exit 0.
- `npm run lint -- --ignore-pattern 'tmp/**'` -> exit 0 (plain invocation caveat above).
- `npm run build` -> exit 0, Next 16.1.6 webpack production build. No source deployment performed.
- `cd native/android && JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :app:assembleDebug :app:testDebugUnitTest`
  -> **BUILD SUCCESSFUL**, 234 tasks, 18s. Output outside iCloud:
  `~/Library/Caches/hightop-native/android/app/outputs/apk/debug/app-debug.apk`.
- Emulator `hightop_api36` (API 36) started; APK installed with `adb install -r`, launched as
  `com.hightopchallenge.app/.MainActivity`. Hightop log `WebView passkey support: 1`; raw CDP confirmed secure play
  origin, PublicKeyCredential function and sign-in button aria-label. No full Android credential ceremony completed.
- Signed iOS app inspected at
  `~/Library/Caches/hightop-native/ios-dd-device/Build/Products/Debug-iphoneos/App.app` using
  `codesign -d --entitlements :- .../App.app`. Profile parsed with `security cms -D -i .../embedded.mobileprovision`,
  selecting only public team/creation/expiry metadata. No iOS rebuild or reinstall.
- Migration dry run/apply used
  `supabase db push --workdir tmp/native-passkeys-2026-10-25/db-release --linked --skip-vault --yes`
  (first with **--dry-run**, only actual apply after Andrew's explicit approval). Do not rerun the applied migration.
- Live options POST with `{}` and Origin https://play.hightopchallenge.com: now **HTTP 200**, RP
  **hightopchallenge.com**, challenge issued, empty allowCredentials (discoverable).
- Andrew personally confirmed iPhone 16 Pro / iOS 26.6.1 passkey setup, native sign-in after migration and same-key
  Safari sign-in. One reviewer passkey and advancing last_used_at independently verified without credential export.

Not verified: Play-signed Android authentication, browser-first enrollment used natively, iPad native UI, cancellation,
biometrics-disabled fallback, the full desktop/other-browser matrix, 7+ day session retention, invoices/cloud usage,
TestFlight/Play uploads or store approval. Annual provisioning validity is not a persistence test.

### 7. Open questions / developer-dependent prerequisites

- Andrew confirmed **no Play app is listed**. Next create its record and configure Play App Signing. Reconfirm
  **com.hightopchallenge.app** before the first store upload (existing plan rule). Obtain the **app signing key
  certificate SHA-256**, not merely the upload-key fingerprint, for the Play-installed build.
- Current Google UI: app -> **Play Store protection -> Protected with Play -> App signing**. Google moved this in
  May 2026; the earlier App integrity path is stale. Official source:
  https://google.play/business/whats-new/ and https://support.google.com/googleplay/android-developer/answer/9842756.
- Release of the local verifier/native changes still needs a deliberately selected clean source tree; do not deploy
  the unrelated uncommitted Phase 5.5/POS/design tree. No publish approval or store upload was requested in this test.
- Long-session and remaining device checks remain real observations to collect; don't ask Andrew to repeat the three
  successful iPhone checks merely because another agent starts.

### 8. Recommended first steps

1. Read plan's current status and Part B handoff. Preserve the live migration and reviewer passkey; iOS is working.
2. Help Andrew create the Play record/signing setup, reconfirm permanent ID before upload, record public Play signing
   fingerprint. Add ANDROID_APP_CERT_SHA256 via allowed env workflow and publish only selected verified changes.
3. Verify both assetlinks URLs contain the expected signing certificate and only play claims links. Test a build
   installed through Play internal testing; debug/emulator builds have a different certificate and do not prove it.
4. Run the setup/login/browser-native/cancel/no-key/device-PIN cases, updating the matrix with exact observations.
5. Continue Phase 6 screenshots/internal testing/legal review before store submission; leave Phase 7 URLs empty.
6. Phase 4c/Part B plan model is **Opus 5.5, xhigh**; Phase 6 names Sonnet 5.5, medium + Andrew. No subagent was spawned.
