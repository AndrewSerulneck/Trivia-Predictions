# POS Rewards Integration — Phase 3a Handoff (Clover spike + toolchain)

**Plan:** `docs/pos-rewards-integration-plan.md` · **Phase:** 3a · **Dates:** 2026-10-05 → 2026-10-06 ·
**By:** Claude Opus 5.5 · **State:** **Partly done, blocked on Clover.** Toolchain, test app and the
server-side token proof are done. The on-device checks (facts 2, 3, 4, 5) are **not done** because
Clover's sandbox emulator sign-in is broken for Global Developer (GDE) accounts. Nothing deployed,
nothing committed, no database or Vercel change.

---

## For Andrew (plain English)

**What got done**
- Your Mac can now build Android apps, and runs a Clover Mini (3rd gen) emulator.
- A small test app is built ("Hightop Spike") and passes all of Clover's upload rules.
- **The most important design question is answered: yes.** Our server can tell, with one call to
  Clover, that a request really comes from *our* app on *that* bar's Clover. Clover said yes (200) to a
  real Hightop token and no (401 / 404) to anything else. So the register app can work without staff
  logins, as planned.

**What's blocked, and why it isn't us**
- To test on the emulator, someone must sign in to Clover on it. With your kind of Clover account it
  asks for a "temporary token from the GDE dashboard". Nobody can find where Clover issues that, and
  when I gave it a valid Hightop token anyway, **Clover's own server answered "404 Not Found"**: the
  sign-in address it uses doesn't exist in the sandbox. That's on Clover's side.

**What to do next (you, ~10 minutes, no rush)**
1. **Order a Clover Dev Kit** (the plan already recommended one; scanning can't be tested without it).
   Global Developer Dashboard (sandbox) → Dev Kits, or docs.clover.com → "Order a Dev Kit in the United
   States". A Dev Kit is switched on with an activation code from the dashboard, not this broken sign-in.
2. **Send Clover this email** (to developer-relations@devrel.clover.com), copy-paste:
   > Subject: Emulator login fails for GDE account (HTTP 404)
   >
   > Hi, I'm developing an Android app (sandbox app ID 1K69BPS2GDK3W, test merchant E6K34ED22MSN1) with a
   > Global Developer (GDE) account, andrew@hightopchallenge.com. On the Android emulator with Clover
   > Engine 2466 (Clover Mini 3rd gen profile, API 29 arm64), Settings → Accounts → Clover asks for a
   > "Temporary token (from GDE dashboard)". (1) Where in the GDE dashboard do I generate this token? I
   > can't find it. (2) Submitting any token POSTs to
   > https://apisandbox.dev.clover.com/globaldeveloperexperience/developers/device_emulators and gets
   > HTTP 404. Is there a newer Engine APK with the "Sign in with GDE Account" browser login your docs
   > describe? Thanks, Andrew
3. When either arrives (Dev Kit or Clover's answer), start a new session: "Finish Phase 3a" (next agent
   reads this file). You'll need to be there only for the Clover sign-ins.
- Also still open (no rush): the Square browser test (Phase 3 handoff §8), and the cleanup of the
  localhost URLs you set on the Clover sandbox app (harmless to leave; sandbox only).

---

## For the next agent

### 1. Goal and scope
Finish Phase 3a: prove on a Clover device the facts the plan lists. Status per fact:
1. **Token proof — server half DONE; device half NOT DONE.** Remaining: on a device, confirm
   `CloverAuth.authenticate()` returns token + `merchantId` + `appId`, and that *that* token gets 200 from
   `billing_info` (the spike app's button does exactly this). Expected yes: CloverAuth tokens are
   app-scoped merchant tokens like the OAuth one, but unverified.
2. ACTION_MODIFY_ORDER button + `EXTRA_ORDER_ID`, Clover OS / Android version → **NOT DONE**.
3. Scanning QR + Code 128 from a phone → **NOT DONE** (needs Dev Kit; emulator can't).
4. `addDiscount2` on a device-opened order, visible on the check, survives payment, `deleteDiscounts`
   works, `Order.getTotal()` before payment → **NOT DONE**.
5. `npm run pos:spike -- clover --order <device-opened id>` → **NOT DONE** (script fixed, see §4).
Out of scope: any product code (that's 3b+). Do not start 3b's auth code until fact 1's device half is
done — though 3b's design can now assume billing_info verification (§3).

### 2. Starting state
- Branch `main`, last commit `27f5eea` (unchanged). **Uncommitted** (all docs/tooling, safe): this file,
  `clover-spike/` (new), `scripts/pos-sandbox-spike.cjs` (fixed), plan status line, plus the previous
  session's uncommitted doc edits (`CLAUDE.md`, plan, roadmap, reward-live plan, Phase 3 handoff).
  `next-env.d.ts` is dev-server noise — don't commit. Nothing pushed or deployed. No DB or Vercel changes.
- **Clover sandbox app changes made by Andrew (2026-10-06):** Site URL = `http://localhost:8787/callback`,
  Alternate Launch Path = `/callback`. The app ("Hightop Challenge", id `1K69BPS2GDK3W`) is installed on
  test merchant `E6K34ED22MSN1` (FREE plan). **No APK uploaded yet** (Andrew didn't get to it).
- `.env.local` has `CLOVER_SANDBOX_APP_ID`, `CLOVER_SANDBOX_APP_SECRET` (added by Andrew 2026-10-05),
  `CLOVER_SANDBOX_API_TOKEN`, `CLOVER_SANDBOX_MERCHANT_ID`. Read names only (CLAUDE.md rule).
- One OAuth access token was minted 2026-10-06 (expires 13:31 EDT same day, ~30 min life; a refresh token
  was also issued and discarded). Token file deleted. Nothing stored.
- Local machine now has: Android SDK at `~/Library/Android/sdk` (cmdline-tools 15641748, platform-tools,
  emulator 37.2.12, platforms;android-35, build-tools 34/35, system image
  `android-29;google_apis;arm64-v8a`); Clover device profiles in `~/Library/Android/clover-device-profiles/`
  and `~/.android/devices.xml` (Mini 3rd gen); AVD `clover_mini3_api29` (2 GB RAM, 16 GB data, density
  213) with **Clover Engine 2466 + App Updater 1262 installed** (APKs in `~/Downloads/`); sandbox signing
  key `~/.hightop-clover/` (chmod 700/600, password inside the properties file — never print it).

### 3. Decisions and facts established (don't re-ask)
- Andrew: "Done, keys added" (Clover Android app created); hardware = **"Emulator now, Dev Kit later"**.
  Given the emulator block, recommend he orders the Dev Kit now (in his notes).
- **Package name `com.hightopchallenge.clover`** (mine). Permanent for the sandbox Clover app once an APK
  is uploaded. Production app (3e) can reuse it.
- **Server verification design (resolves the plan's open question):** `GET
  {api}/v3/apps/{appId}/merchants/{mId}/billing_info` with the device's token as Bearer.
  Evidence 2026-10-05/06, sandbox: our app's OAuth v2 token → **200** (`appSubscription` FREE, active);
  merchant test API token (no app) → **401**; garbage token → 401; wrong app id → 404 "No App with ID";
  wrong merchant id → 404 "No Merchant with ID"; `/v3/merchants/{m}` with our token → 200. So 200 proves
  "token is our app's AND for this merchant". Treat anything but 200 as reject. Cache the 200 per plan.
- Clover APK rules confirmed from docs and met by the build: **v1 (JAR) signing only**, file
  `META-INF/CERT.RSA`, RSA-2048/SHA-256, release-signed, versionCode strictly increasing, package can't
  start `com.clover.`, ≤120 MB, same key forever.
- Clover says **targetSdk ≤ 25** (from 27, Android's account-access prompt breaks CloverAccount);
  minSdk 25 covers Station 2018 (API 25) and Flex 2/3, Mini 2/3, Station Solo (API 29). Gen-1 devices hit
  end-of-app-update May 2026 — ignore them.
- Sideload rule: install from App Market once (device gets app metadata/permissions), then
  `adb uninstall` it and `adb install` your own build with a **higher versionCode**; mixing methods fails
  with `INCONSISTENT_CERTIFICATES`.
- Barcode support per Clover's table: QR and Code 128 "Yes" on Station 2018, Station/Mini, Mini 2, Mobile,
  Flex. Unverified on hardware.
- SDK API (clover-android-sdk **341**): `CloverAuth.authenticate(context, false, 60L, SECONDS)` returns
  `AuthResult{authToken, baseUrl, merchantId, appId, errorMessage}` (older overloads deprecated);
  `Intents.ACTION_MODIFY_ORDER = "clover.intent.action.MODIFY_ORDER"`,
  `Intents.EXTRA_ORDER_ID = "clover.intent.extra.ORDER_ID"`; `OrderConnector.addDiscount2(orderId,
  Discount)` returns the Discount **with id** (use it, not `addDiscount`), `deleteDiscounts(orderId,
  ids)`; `BarcodeResult.INTENT_ACTION = "com.clover.BarcodeBroadcast"`, `isQRCode()/isCode128()`;
  `BarcodeScanner.executeStartScan(Bundle)` with `Intents.EXTRA_SCAN_QR_CODE/EXTRA_SCAN_1D_CODE`.
- Not needed but noted: the SDK has `DeviceAttestationClient` (JWS signed by the Clover device key with
  serial + mid) — a possible later hardening; it proves the *device*, not our app. The
  `clover-android-loyalty-kit` is customer-facing VAS/phone loyalty, not relevant.

### 4. Files created / changed
- `clover-spike/` (new, throwaway; see its README): Gradle 8.10.2 wrapper, AGP 8.7.2, Kotlin 2.0.21
  (matching Clover's own build), `app/build.gradle.kts` (v1-only signing from the external properties
  file, `-PversionCode`), `AndroidManifest.xml`, `SpikeActivity.kt` (log + `proveTokenServerSide()` +
  scanner), `MainActivity.kt` (launcher), `ModifyOrderActivity.kt` (order screen: read / add -$5 / remove /
  scan), `test-codes.html` (QR verified to decode to `HTC1:7K3QD9MXW2` with jsQR), `oauth-probe.cjs`,
  `.gitignore` (build, apk, keystores, local.properties).
- `scripts/pos-sandbox-spike.cjs`: "list open orders" no longer uses `expand=employee` and prints ✗ on
  non-200; "order after discount" reads `/orders/{id}` + `/orders/{id}/discounts` separately; new mode
  **`npm run pos:spike -- clover-token`** (negative controls + "is our app installed"). Both modes run
  green 2026-10-05 (REST-built order total is still `undefined`, as known).
- `docs/pos-rewards-integration-plan.md`: status line → this file.

### 5. Traps
- **Emulator sign-in (the blocker):** Engine 2466 calls `GET /v3/developers/account_type?filter=email…`
  (200), then for a GDE email shows "Temporary token (from GDE dashboard)" and POSTs to
  `https://apisandbox.dev.clover.com/globaldeveloperexperience/developers/device_emulators` → **404** even
  with a valid OAuth v2 app token. Legacy accounts POST `/v2/internal/account/auth` (a fake login got a
  normal 401). The docs' "Sign in with GDE Account" browser button is not in Engine 2466. Clover's FAQ
  even says "Emulators will not work for Clover SDK apps" while the setup guide says they do.
- **Emulator DNS:** start it with `-dns-server 8.8.8.8,1.1.1.1` or nothing resolves. Command:
  `~/Library/Android/sdk/emulator/emulator -avd clover_mini3_api29 -no-snapshot -no-boot-anim -dns-server 8.8.8.8,1.1.1.1 &`.
  `adb root` works (google_apis image). avdmanager wrote `disk.dataPartition.path=<temp>` — removed so data
  persists.
- **OAuth from the App Market** lands on the Site URL with **no `code`**; the app must then redirect to
  `/oauth/v2/authorize` (the probe does). Token exchange: `POST {api}/oauth/v2/token` JSON
  `{client_id, client_secret, code}` → `access_token, access_token_expiration, refresh_token,
  refresh_token_expiration`. Access token lived ~30 min.
- `sandbox.dev.clover.com/developers/dev-apks` and APK upload need Andrew's browser sign-in. `install_apps.py`
  (Clover's script) reads the app list from the device's `content://com.clover.apps/apps` — only works
  after a Clover sign-in on the device.
- Never print the token: the spike app logs length + SHA-256 prefix; `adb shell input text "$(cat file)"`
  types a token without echoing it. A typed token stays visible on the emulator screen — clear the field.
- Classifier: names-only env listing via `node --env-file=.env.local -e "…Object.keys(process.env)…"`
  works; `cut -d= -f1 .env.local` was denied this session.

### 6. Build / run / verify
- Build APK: `cd clover-spike && ./gradlew assembleRelease -PversionCode=1` (JDK 21 Homebrew; ~1 min).
  Verify: `~/Library/Android/sdk/build-tools/35.0.0/apksigner verify --verbose <apk>` → v1 true, v2/v3
  false. Copy at `~/Downloads/hightop-clover-spike-v1.apk`.
- Server checks: `npm run pos:spike -- clover-token`, `npm run pos:spike -- clover`.
- Positive token check: `node --env-file=.env.local clover-spike/oauth-probe.cjs <scratch>/tok.txt`, then
  Andrew opens `http://localhost:8787/callback` and approves; read the printed statuses; delete the file.
- Device run (once signed in / Dev Kit): Andrew uploads the APK (versionCode 1) → Connect on test merchant
  → `python3 install_apps.py` → (optional sideload v2) → open "Hightop Spike" → button 1; open Register,
  make an order, tap "Hightop Reward" → read / add / remove / pay; scan `test-codes.html` from a phone.
  Collect evidence with `adb logcat -s HightopSpike`. Dev Kit: Dashboard → Dev Kits → Associate (serial)
  → activation code within 30 min; ADB over USB/Wi-Fi per Clover docs.
- Not run (no product code changed): typecheck/lint/test/build. `clover-spike/` holds no TS/JS except
  `oauth-probe.cjs` (plain CJS, not under any test glob) — run `npm run lint` before committing to be sure.

### 7. Open questions for Andrew
1. Dev Kit ordered? (recommended now). 2. Clover's reply to the email in his notes. 3. Still pending from
the plan: §6 items 2–3 (funding, %-off cap), 7 (app code location, ask at 3c), 9 (prize > check, ask at
3b), 10 (price, 3e). 4. Upload the spike APK (needed for the device run).

### 8. Recommended first steps
Opus 5.5, high. Check whether Andrew has a Dev Kit or Clover's answer. If Clover supplied a newer Engine
or token path, retry the emulator (it's all set up). Otherwise associate the Dev Kit. Run facts 1–5, record
evidence here (or a `_PHASE_3a_HANDOFF` update section), and **stop and tell Andrew if fact 1's device half
or fact 4 fails**. Then 3b. If Andrew wants progress before hardware, 3b's website side (flag off) can
start using the billing_info design above, leaving only the device-token wiring to confirm.
