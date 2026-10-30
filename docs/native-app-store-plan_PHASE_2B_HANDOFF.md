# Native App Store Plan — Part B / Phase 2B handoff

Date **2026-10-25**. Plan `docs/native-app-store-plan.md`, Phase 2 Part B.
**Requested signing-switch half: already complete, independently verified.** Full Part B still has Android release
checks and a seven-day session observation open. Passkey implementation/live-fix details are in
`docs/native-app-store-plan_PHASE_4C_HANDOFF.md`.

**Later 2026-10-25 update:** Andrew has created the Play record as **App**, not Game; the earlier no-record notes
below are historical. Game → Trivia is recommended and can be changed in Store settings. No signing certificate
or first release upload is confirmed; next obtain/configure Play App Signing and its public SHA-256 fingerprint.

## Summary for Andrew

Your iPhone app was already signed correctly by Hightop Challenge LLC under its permanent ID. I checked the actual
signed app and its annual provisioning profile, not only the source settings. No signing switch or iOS rebuild was
needed. You have now successfully created a passkey, signed in with Face ID in the app and used that passkey in Safari
after the separately approved database fix. Android still needs its Play record/signing setup; you confirmed no app
is listed there. The seven-day stay-signed-in observation cannot be replaced by checking a certificate's expiry.

## For the next agent

### 1. Next goal / boundaries

Preserve the working paid signing and finish Android release trust plus remaining native/browser/persistence checks.
Do not redo provisioning, change the bundle ID, add a passkey plugin without evidence, claim a distribution build was
uploaded, or mark full Part B complete from these signing checks. Store submission, unrelated root work, APNs setup
and Phase 5.5 cutover are outside this signing verification.

### 2. Starting state / data

- Branch **main**, HEAD/local origin/main **f0cc758f285925db997f463d426b12a50f35adf8** in
  `/Users/andrewserulneck/Documents/Trivia-Predictions`. No commits/pushes/deployments/uploads in this session.
- Paid signing switch was made in Phase 5.2 on **2026-10-23**; read
  `docs/native-app-store-plan_PHASE_5_2_HANDOFF.md` for that original implementation. No iOS file was edited here.
- Actual signed app:
  `~/Library/Caches/hightop-native/ios-dd-device/Build/Products/Debug-iphoneos/App.app`.
  application-identifier **2U7HMXGQM3.com.hightopchallenge.app**, team **2U7HMXGQM3**,
  webcredentials:hightopchallenge.com, applinks:play.hightopchallenge.com, development APNs entitlement.
- Profile **iOS Team Provisioning Profile: com.hightopchallenge.app**, created **2026-10-23T12:00:55Z**, expires
  **2027-10-23T12:00:55Z**. This is a development profile, not proof of App Store distribution signing/upload.
- Native app already installed on paired **iPhone 16 Pro**, UDID **00008140-001E74DE1A7B001C**, iOS **26.6.1**.
  Andrew unlocked it and approved actual passkey prompts.
- Companion Phase 4c writes are uncommitted locally. Production migration **20261025150000** was explicitly approved
  and applied alone at approximately **2026-10-25T14:40Z** on **pkmxupsayzshvpirkaav**. It fixes identity-less
  authentication challenges, preserves registration identity and changes no existing player/passkey rows.
- Andrew created one appreview passkey through normal UI (2026-10-25T14:32:18Z), then verified native and Safari
  sign-in. No keys/PIN/credential export. Private evidence/SQL hash/baseline/action journal:
  **tmp/native-passkeys-2026-10-25/**; original reviewer IDs/baseline:
  **tmp/native-app-review-2026-10-25/provisioning.json**. Both ignored; preserve and never commit private records.
- No full DB backup needed/taken for signing inspection; no signing keys or environment values changed. Preserve
  unrelated dirty Phase 5.5/POS/design/local-tool work. Applied migration is immutable, not a rollback script.

### 3. Decisions already made

- Andrew asked to complete missing passkeys/signing, authorized the exact DB migration, and confirmed all three
  iPhone creation/native login/Safari login checks. Do not re-ask him to unlock/test those merely for a handoff.
- Team **2U7HMXGQM3**, bundle **com.hightopchallenge.app**, players only, US-only, keep **iPhone + iPad**.
  Still reconfirm the permanent app ID before first store upload as the plan requires.
- No Play app is listed yet (Andrew, 2026-10-25); do not ask for a fingerprint before that setup exists.
- Existing WKWebView WebAuthn works on iOS. No native passkey plugin or signing reconfiguration is justified.

### 4. Files and connections

- **native/ios/App/App.xcodeproj/project.pbxproj** (read, unchanged): both configurations have permanent bundle ID,
  paid team, **CODE_SIGN_ENTITLEMENTS = App/App.entitlements**, device family **1,2**.
- **native/ios/App/App/App.entitlements** (read, unchanged): associated domains and development APNs.
- **lib/nativeAppLinks.ts** (read, unchanged): AASA team/bundle identity and scoped link handling. Apex and play
  public AASA files plus Apple's CDN versions name the correct app; RP is hightopchallenge.com.
- **docs/native-app-store-plan.md**: dated Part B result/current status links here.
- **docs/native-app-device-checklist.md** section O and **docs/PASSKEY_CROSS_DEVICE_MATRIX.md**: exact observed passes
  and unobserved cases. **docs/native-app-store-plan_PHASE_4C_HANDOFF.md**: full Android/verifier/migration file list.
- **CLAUDE.md**, **SYSTEM_CONTEXT.md**, **docs/native-app-store-submission-pack.md** and Phase 6 handoff updated to
  avoid re-raising already-complete signing or falsely claiming Android release readiness.

### 5. Traps / permissions / undo

- Source settings alone are insufficient; actual codesign entitlements and embedded.mobileprovision were checked.
  The annual profile eliminates the old free-provisioning seven-day app-expiry issue, but does not verify cookies,
  keychain syncing, push delivery, distribution certificates, store access or seven-day login persistence.
- Before the database fix the UI falsely said no passkey was saved. The passkey existed; anonymous auth options
  failed a NOT NULL constraint before the OS prompt. No signing edit would fix that. Never reintroduce account_id
  NOT NULL on every challenge. Phase 4c handoff has live error/approval/apply facts.
- Initial platform-authenticator-available probe was false, yet actual native setup/login worked. Record observed
  ceremonies rather than interpreting that one probe as definitive lack of support.
- Device/CLI inspection required approved sandbox escalation. No approval-review rejection. Never print private
  signing key or raw .env.local data; only public selected profile metadata was printed. No signing undo is needed:
  no signing state was changed. Database reversals require a new approved forward migration; no down-migration.

### 6. Exact verification / remaining limits

- `codesign -d --entitlements :- ~/Library/Caches/hightop-native/ios-dd-device/Build/Products/Debug-iphoneos/App.app`
  -> paid-team application identifier, associated domains and development APNs verified.
- `security cms -D -i .../App.app/embedded.mobileprovision` parsed via Python plistlib, printing only Name,
  CreationDate, ExpirationDate and TeamIdentifier -> annual profile facts above. Do not dump the full profile/keys.
- `xcrun devicectl list devices` / `device info details --device 00008140-001E74DE1A7B001C` -> paired real phone.
  Existing debug HIGHTOP_PROBE_STEPS confirmed secure play origin/PublicKeyCredential. Real prompts were Andrew's.
- Native save -> PASS; sign-out/Face ID sign-in -> PASS after approved migration; iPhone Safari same-key sign-in ->
  PASS. Backend last_used_at advanced to **2026-10-25T14:42:43.933Z**. One reviewer passkey remains present.
- Companion final gates: **5,551 tests / 13 environment skips**, typecheck, source lint with `--ignore-pattern tmp/**`,
  web production build, Android debug build/unit tests, SQL and real-verifier regressions pass. Plain root lint scans
  historical ignored tmp release copies; preserve evidence and use the source lint command (details in 4c handoff).
- Not verified: iPad UI, browser-first enrollment/native use, cancel/no-key/device-PIN cases, Play release flow, full
  browser matrix, or 7+ day persistence. No iOS build/upload/reinstall was performed in this session.

### 7. Open prerequisites

- Create Play app record/configure Play App Signing, then obtain production app-signing SHA-256, publish selected
  verifier/association setup and test Play-installed app. Current menu: Play Store protection -> Protected with Play
  -> App signing (Google moved it from App integrity in May 2026).
- Observe native stay-signed-in for **at least seven days after the last actual login**, without sign-out, storage
  clearing or reinstall. Current native success baseline is **2026-10-25**; no earlier than **2026-11-01** could a
  seven-day observation from this session be made. It has not been scheduled or claimed complete.
- Earlier APNs/device/Instagram/store/legal prerequisites are separate. Do not revive resolved venue/PIN/iPad choices.

### 8. Recommended first steps / model

1. Keep paid signing and working iPhone passkey state. Do not rebuild iOS merely to fix an already-correct switch.
2. Follow Phase 4c handoff for Play setup and Android release activation, then update actual device matrix results.
3. Collect the time-based persistence observation when enough time passes and complete remaining matrix scenarios.
4. Continue Phase 6 internal-track/screenshots/legal work before store submission. Plan model for Part B/4c is
   **Opus 5.5, xhigh**; no subagent was used. Phase 6 names Sonnet 5.5, medium + Andrew.
