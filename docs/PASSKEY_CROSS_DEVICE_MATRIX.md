# Passkey Cross-Device Test Matrix

Use this checklist before every production promotion that touches auth.

## Required Browser/Device Matrix

- iOS Safari (latest iOS)
- iOS Chrome (latest iOS)
- Android Chrome (latest stable)
- Android Samsung Internet (latest stable)
- macOS Safari (latest stable)
- macOS Chrome (latest stable)
- Windows Edge (latest stable)
- Windows Chrome (latest stable)

## Scenarios To Validate Per Browser

1. New user signup with username + PIN.
2. PIN login succeeds for returning user.
3. Passkey setup from Venue menu succeeds (`Set Up Passkey`).
4. Passkey login succeeds on next sign-in with same account.
5. Passkey unavailable path cleanly falls back to PIN.
6. Cancel passkey prompt path returns user to PIN flow with clear message.
7. Wrong PIN path shows explicit error and does not dead-end.
8. Username capitalization changes still allow login (case-insensitive).

## Session/Device Scenarios

1. Same user, second device without passkey -> PIN fallback works.
2. After PIN fallback on second device -> passkey setup succeeds.
3. Device with biometrics disabled but device PIN enabled -> passkey prompt still works.
4. Device where passkeys are unsupported -> PIN fallback and clear message.

## API Error Code Contract

All passkey endpoints return `errorCode` on failure:

- `PASSKEY_DISABLED`
- `SERVER_MISCONFIG`
- `INVALID_REQUEST`
- `ORIGIN_NOT_ALLOWED`
- `RP_ID_NOT_ALLOWED`
- `USER_NOT_FOUND`
- `AUTH_FAILED`
- `NO_PASSKEYS`
- `CHALLENGE_EXPIRED`
- `CHALLENGE_USER_MISMATCH`
- `CREDENTIAL_NOT_FOUND`
- `VERIFICATION_FAILED`
- `RATE_LIMITED`
- `UNKNOWN`

## Telemetry Expectations

Track and alert on:

1. Passkey setup starts vs. setup successes.
2. Setup failure count by `errorCode`.
3. Passkey auth attempts vs. PIN fallback rates.
4. Browser + OS breakdown for failures (from user-agent logs).

## Go/No-Go Criteria

- No blocker failures in matrix above.
- Passkey setup success rate >= 90% on supported browsers.
- PIN fallback success rate >= 99% for returning users.
- No unexplained “dead button” reports in QA.


## Native app verification — 2026-10-25 (Phase 4c / Part B)

RP ID stays **hightopchallenge.com** for the browser and both native apps. No native passkey plugin was added.

| Platform / scenario | Result | Evidence / limit |
|---|---|---|
| iPhone 16 Pro, iOS 26.6.1, paid-team native app: save passkey | PASS | Andrew confirmed; appreview passkey created 2026-10-25T14:32:18Z |
| Same native app: sign out, Face ID / Touch ID sign-in | PASS after fix | Failed before the prompt on DB account_id NOT NULL; approved migration 20261025150000 applied; Andrew confirmed successful sign-in |
| iPhone Safari: sign in with the passkey created in the app | PASS | Andrew confirmed; last_used_at advanced to 2026-10-25T14:42:43.933Z |
| iOS paid-team signing / associated domain | PASS | Actual signed app: 2U7HMXGQM3.com.hightopchallenge.app; webcredentials:hightopchallenge.com; Apple CDN association matches; profile expires 2027-10-23T12:00:55Z |
| Android API 36 emulator, rebuilt debug app: WebView capability and sign-in control | PASS | WebView app-mode support level 1; PublicKeyCredential exposed; Face ID/Touch ID control has its accessibility label |
| Android association + server verifier | LIVE / VERIFIED | Commit 7aacf153, READY dpl_2Y9ixHxGcj5ijT5P5pNfSSkjYxvx; both assetlinks.json URLs 200 with supplied Play cert; Google's DAL API confirms both credential links and play. App Link; native discoverable-options HTTP 200 |
| Android release: save passkey, sign in, browser/native interchange | NOT RUN | Server/association prerequisites done; still needs a Play-installed build and Android tester. Synthetic verification and Google DAL do not prove an actual credential ceremony |
| Browser-created passkey first used in the native app | NOT RUN in this session | Native-created passkey -> Safari is verified; do not claim the opposite enrollment direction was separately tested |
| Cancel prompt, biometrics disabled, no-key device, iPad native UI | NOT RUN in this session | Existing PIN route remains; full device scenarios above still need their own observations |
| 7+ day signed-in persistence | NOT YET OBSERVED | Paid profile validity is proven; time-based cookie/session retention is separate |
| Other browsers / Windows / Samsung matrix above | NOT RUN in this session | Synthetic cryptographic regressions do not replace device observations |

Tests: full suite **5,551 passed / 13 environment skips**; real PostgreSQL constraint regressions; real verifier
regressions for trusted/untrusted certificate origins, browser origins, challenge, RP hash, user verification and
signature tampering. These verifier fixtures are synthetic, not physical-device captures.

Current handoffs: `docs/native-app-store-plan_PHASE_4C_HANDOFF.md` and `docs/native-app-store-plan_PHASE_2B_HANDOFF.md`.
