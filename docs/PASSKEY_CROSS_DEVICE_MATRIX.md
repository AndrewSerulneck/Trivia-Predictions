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
