# clover-spike (THROWAWAY — Phase 3a only)

Proof-of-facts app for `docs/pos-rewards-integration-plan.md` Phase 3a. Not product code. Delete this
folder when Phase 3c creates the real app (`clover-app/` or a separate repo, plan §6 item 7).

- `app/` — Kotlin Android app, package `com.hightopchallenge.clover` (also the sandbox Clover app's
  package once its APK is uploaded — permanent for that Clover app). Launcher screen = fact 1 + 3;
  "Hightop Reward" (ACTION_MODIFY_ORDER) screen = facts 2 + 4. Logs to logcat tag `HightopSpike`.
- Build: `cd clover-spike && ./gradlew assembleRelease -PversionCode=1` →
  `app/build/outputs/apk/release/app-release.apk` (v1-signed only, as Clover requires). The signing key
  is `~/.hightop-clover/sandbox-upload.jks` + `sandbox-signing.properties` — OUTSIDE the repo; Clover
  locks the key on first upload, so keep using it for every sandbox upload.
- `test-codes.html` — fake coupon codes (QR `HTC1:7K3QD9MXW2`, Code 128 of the same, Code 128 of the bare
  code) to show on a phone for the scanner test.
- `oauth-probe.cjs` — local v2 OAuth catcher that proves server-side token verification (see header).
