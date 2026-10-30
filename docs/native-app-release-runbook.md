# Native app release runbook

Prepared 2026-10-25 for `docs/native-app-store-plan.md`, Phase 8. **Documentation prepared; the
end-to-end update rehearsal is still open.** Read `CLAUDE.md`, `SYSTEM_CONTEXT.md`, the plan's
current status and latest phase handoff before running release commands.

## Current launch state

- Bundle/package: `com.hightopchallenge.app`; Apple team `2U7HMXGQM3` (Hightop Challenge LLC).
- Google: Andrew reports Production **In review**, version `1.0.0`, code **2**. Codes 1 and 2
  have already been uploaded; the next Android artifact must use code **3 or greater**, after checking Console.
- Apple: signed `1.0.0` / build **1** archive and IPA exist. The first upload failed before an app
  record existed. Andrew then created record **6826962606**; retry succeeded at 2026-10-26T01:29:30Z
  (Oct 25 in New York). Andrew confirms TestFlight **Processing**. App Review submission is still pending.
- Andrew confirmed the APNs key is uploaded to Firebase. Real iPhone push delivery remains unverified.
- Native Face ID and the same passkey in Safari passed. Play-installed Android passkeys remain unverified.
- Keep **iPhone and iPad**. The app is **players only**, free and US-only at launch.
- No public store URLs are verified yet. Leave download constants empty until each listing is live;
  Phase 7's combined store promotion waits for both listings.

## Decide whether a store build is needed

The shell opens the live website at `https://play.hightopchallenge.com`. Normal game logic,
copy, layout and server changes use the normal web deployment process. Keep native capability
checks: old shells continue loading the updated website.

Changes to native permissions, plugins, platform code, icons, splash, signing configuration or
Capacitor require new native artifacts and store releases. Update disclosures if SDK behavior or
data collection changes. Never include partner sign-in, dashboard or payments inside the shell;
`/owner/*`, `/tv` and `/admin` open the system browser.

## Source and version preparation

Use a clean, reviewed checkout containing only intended release changes. The root workspace has
unrelated unpublished work; do not commit or deploy it wholesale. Record the exact commit, artifact
hashes, store build counters and any configuration changes in a release record.

The user-facing version must agree in all four source locations:

| Location | Value to update for a new marketed version |
|---|---|
| `native/package.json` | `version` |
| `native/capacitor.config.json` | Both `appendUserAgent` version tokens |
| `native/ios/App/App.xcodeproj/project.pbxproj` | Both `MARKETING_VERSION` entries |
| `native/android/app/build.gradle` | `versionName` |

Independently increase both iOS `CURRENT_PROJECT_VERSION` entries and Android `versionCode`
when producing a replacement upload. Check each console's highest uploaded counter first; deleting
a release does not make an Android counter reusable. A replacement of the initial release can retain
marketing version `1.0.0` with a higher build counter. A new marketed version also updates the four
locations above. Do not bump counters merely to fix a Console form or optional warning.

From repository root (dependencies already installed):

```sh
npx vitest run tests/native-app-contract.test.ts tests/push-notifications-contract.test.ts
npx tsc --noEmit
npm run lint
```

Run the broader web release checks when web/source changes warrant them. If native config or dependencies
changed, run `npm run sync` from `native/` and review generated changes. Keep dependency locks; do not
perform unsolicited SDK upgrades during signing. Native build caches belong outside iCloud Documents.

## iOS archive, export and upload

Requirements: Xcode, the existing authenticated paid-team account, signing/network access, and an
App Store Connect record for the exact bundle ID. Keychain/package-cache access may require running
outside the tool sandbox. Do not change certificate trust to work around sandbox failures.

For the current prepared archive, **reuse it with existing app record 6826962606**; no rebuild is
needed merely to upload. Its path is:

`/Users/andrewserulneck/Library/Caches/hightop-native/releases/Hightop-Challenge-1.0.0-1.xcarchive`

For a future build, substitute its version/build in the archive path and run from the repository root:

```sh
xcodebuild -project native/ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath /Users/andrewserulneck/Library/Caches/hightop-native/ios-dd-device \
  -clonedSourcePackagesDirPath /Users/andrewserulneck/Library/Caches/hightop-native/ios-dd-device/SourcePackages \
  -disableAutomaticPackageResolution \
  -archivePath /Users/andrewserulneck/Library/Caches/hightop-native/releases/Hightop-Challenge-1.0.0-1.xcarchive \
  -allowProvisioningUpdates archive
```

Choose a fresh archive path for a new build. If required cached packages are missing, resolve the locked
packages deliberately before retrying; don't remove package resolution controls and accept upgrades silently.

Create an export-options plist outside Git with these values:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>2U7HMXGQM3</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>stripSwiftSymbols</key><true/>
  <key>uploadSymbols</key><true/>
</dict></plist>
```

```sh
xcodebuild -exportArchive \
  -archivePath /Users/andrewserulneck/Library/Caches/hightop-native/releases/Hightop-Challenge-1.0.0-1.xcarchive \
  -exportOptionsPlist /private/tmp/hightop-ios-export-options.plist \
  -exportPath /Users/andrewserulneck/Library/Caches/hightop-native/releases/ios-app-store-1.0.0-1 \
  -allowProvisioningUpdates
```

Before upload, verify bundle/version/build, device families `[1, 2]`, valid distribution signature,
`get-task-allow=false`, production APNs, expected associated domains and team identifier. Extract
the IPA into a temporary directory to inspect its `Payload/App.app`; use
`codesign --verify --deep --strict --verbose=2 PATH_TO_APP`. For parsable entitlement output on this
Xcode, use `codesign -d --entitlements - --xml PATH_TO_APP`. Hash the final IPA with `shasum -a 256`.

Upload using Xcode Organizer → Distribute App → App Store Connect, Transporter with the exported IPA,
or repeat `-exportArchive` with a **separate** options plist whose `destination` is `upload` and a fresh
export path. Existing authenticated Xcode login can be used; never ask for passwords in chat.
**Do not set `testFlightInternalTestingOnly=true` on a build intended for the App Store:** that option
permanently excludes external testing and App Store distribution for that build.

Upload acceptance, Apple processing, TestFlight availability and App Review submission are separate
steps. Wait for processing, resolve actual compliance questions against the app, and install through
an internal TestFlight group. Internal testers must have appropriate App Store Connect access;
external testers use the external-testing workflow. An upload alone does not submit App Review.

Complete real-device checks and iPhone+iPad screenshots, then use
`docs/native-app-store-submission-pack.md` for listing/reviewer drafts. Andrew reviews legal/privacy/
age-rating answers and performs the final review submission. Keep reviewer PIN only in private
store review fields, never in the repository. Keep first launch release timing under Andrew's control.

## Android bundle and signing

Requirements: Android SDK/cached Gradle dependencies, OpenJDK **21**, and the existing private upload key.
Android Studio's Java 25 is unsuitable for this Gradle build. From `native/android/`:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21 ./gradlew :app:bundleRelease --offline --console=plain
```

Unsigned output:
`/Users/andrewserulneck/Library/Caches/hightop-native/android/app/outputs/bundle/release/app-release.aab`.
From repository root, sign to a fresh output name (example for a future code 3):

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@21 node native/scripts/sign-android-bundle.cjs \
  /Users/andrewserulneck/Library/Caches/hightop-native/android/app/outputs/bundle/release/app-release.aab \
  /Users/andrewserulneck/Downloads/Hightop-Challenge-1.0.0-3.aab
```

The filename does not set the code: first update `versionCode` in Gradle and verify the built manifest.
**Never rerun `--create-upload-key`.** The helper reads existing credentials privately, refuses output
overwrite, signs and verifies the bundle. Key, credentials and public upload certificate are in
`~/Library/Application Support/Hightop Challenge/signing/`. Andrew's secure backup is still unconfirmed.
Do not print credential contents or add the key to Git. Google retains the separate Play app-signing key.

Check signature, bundle ID, version counter, release permissions and SDK behavior before uploading.
Current build has notification permission, no advertising-ID permission, no obfuscation mapping because
minification is off, and 16 KB-compatible native libraries. Recheck when native dependencies change.
No mapping or symbols warning alone requires a replacement release.

For future updates, upload to Play internal testing, select testers and install via the opt-in link;
test the **Play-installed** build's signing identity, links, passkeys and notification flow. Upload-key/
debug-signed installs do not establish that Play certificate trust works. Promote the tested artifact
to Production rather than uploading its already-used version code again. Keep only the intended
current bundle in the release to avoid lower-code shadowing. Initial code 2 is already in Production
review; don't discard it or create a second launch release just to match the earlier internal-track plan.

## Release timing and recovery

For updates, use Apple phased release or a Google staged rollout where available and appropriate.
Choose rollout size with Andrew; watch actual crash reports, sign-in, notifications and support before
increasing it. First release controls differ; inspect the live Console rather than assuming update
rollout options apply. Record approved, live and installed states separately.

A web regression can be reverted through the normal reviewed deployment process. A native regression
requires a corrected build with a new counter; halting rollout prevents further automatic exposure but
does not remove an installed update. Keep web behavior compatible with supported older shells.
Changing Android signing identity or Apple bundle/team is not a rollback strategy.

## Store URLs and minimum supported version

After listings are publicly available, set the verified canonical URLs in `lib/appDownloadLink.ts`.
The `/app` path and printed join QR are permanent. Phase 7 implements the combined promotional UI
only once both listings are live; keep the browser path visible.

The update gate reads server settings through `lib/nativeAppConfig.ts` and `/api/app/config`:

- `NATIVE_APP_MIN_VERSION`: semantic app version below which native use is blocked; unset means no gate.
- `NATIVE_APP_LATEST_VERSION`: informational only.
- `NATIVE_APP_IOS_STORE_URL`: exact HTTPS `apps.apple.com` listing.
- `NATIVE_APP_ANDROID_STORE_URL`: exact HTTPS `play.google.com` listing.

Do not raise the minimum until a working replacement version is available to affected users on
**both** platforms and the update links work. The shared minimum compares marketed versions, not
Android/iOS build counters. Use capability fallback for a one-platform change instead of locking
the other platform out. Vercel environment changes require the next deployment; verify exact source.
`/api/app/config` uses `s-maxage=300, stale-while-revalidate=86400`: normal refresh is around five
minutes, but stale settings may persist longer during refresh failure. Verify live responses and
devices before treating a gate change or rollback as complete. Follow `CLAUDE.md` env rules for any
rollback; do not remove/pull env values or read `.env.local` secrets.

The endpoint performs no database work. At most roughly 288 refreshes/day per active CDN region at
five-minute steady traffic, plus retries/evictions; no new scheduled job is introduced by this runbook.

## Phase 8 rehearsal still required

After initial store availability, make a small intended native update with Andrew, bump versions,
build/sign, install over the old app through both test tracks, verify account/session/passkey/push
retention, and rehearse the release controls. Record commit, checksums, counters, test results and
any rollback. Do not create a cosmetic production change solely to mark this checklist complete.

References checked 2026-10-25: [Apple app records](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/),
[Apple uploads](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds).
Local Xcode `xcodebuild -help` is authoritative for this installation's export options.
