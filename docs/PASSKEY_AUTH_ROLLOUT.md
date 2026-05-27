# Passkey Auth Rollout

This runbook covers deployment and validation for the passkey-first auth system with PIN fallback.

## Scope
- Passkey-first login using WebAuthn via SimpleWebAuthn.
- Username-first flow.
- PIN fallback only when no passkey exists or passkey auth is unavailable.
- Case-insensitive username lookup (`username_normalized`).
- User-initiated username change.

## Required Migrations
Apply in order:
- `20260527143000_add_passkeys_and_username_normalization.sql`
- `20260527161500_add_username_change_attempts.sql`
- `20260527170000_enable_players_rls.sql`

Push:
```bash
supabase db push
```

Verify:
```bash
supabase migration list
```

## Required Environment Variables
- `WEBAUTHN_ORIGIN=https://hightopchallenge.com`
- `WEBAUTHN_RP_ID=hightopchallenge.com`
- `WEBAUTHN_DEV_ORIGIN=http://localhost:3000`
- `WEBAUTHN_DEV_RP_ID=localhost`
- `WEBAUTHN_RP_NAME=Hightop Challenge`

Optional hardening:
- `WEBAUTHN_ALLOWED_ORIGINS=https://hightopchallenge.com,http://localhost:3000`
- `WEBAUTHN_ALLOWED_RP_IDS=hightopchallenge.com,localhost`
- `WEBAUTHN_CHALLENGE_TTL_MS=300000`
- `USERNAME_UPDATE_COOLDOWN_SECONDS=3600`

## Prompt 6 Regression Tests
```bash
npm test
```

Expected: all tests pass, including:
- `tests/api.auth.passkey.test.ts`
- `tests/api.auth.username-update.test.ts`
- `tests/lib.webauthn.test.ts`

## Prompt 7 Runtime Smoke Check
Start app:
```bash
npm run dev
```

Run smoke:
```bash
npm run auth:smoke
```

The smoke script validates:
- `/join` reachable
- passkey auth/register endpoints respond with expected guard behavior
- username update route rejects unauthenticated requests

## Production Validation Checklist
1. Register account with username + PIN.
2. Enroll passkey on same device.
3. Logout and login with username-first passkey flow (no PIN prompt on success).
4. Verify PIN fallback works on a device without enrolled passkey.
5. After PIN fallback login, verify passkey registration prompt appears.
6. Change username and verify:
   - old username no longer logs in
   - new username works with case-insensitive match
7. Confirm points remain unchanged for venue/business-scoped behavior.

## Incident Notes
- If users see `Origin is not allowed for WebAuthn`, check `WEBAUTHN_*ORIGIN*` values and reverse proxy forwarded headers.
- If passkey verify fails repeatedly, inspect `webauthn_challenges` expiry/used flags and ensure one-time challenge use.
- If login fails only for capitalization, confirm `users.username_normalized` is populated and indexed.
