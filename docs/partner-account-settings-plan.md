# Partner Account Settings Plan

## Goal

Give Partner Venues a self-serve **Account Settings** entry from the Partner Dashboard where a logged-in owner can:

- Change the email address associated with their owner account.
- Change their password.

This should live inside the existing `/owner/*` Partner Dashboard surface and use the current owner auth model: `tp_owner_sess` -> `requireOwnerAuth()` -> `venue_owners.auth_id` -> Supabase Auth admin updates.

## Current Context

- Partner Dashboard entry: `app/owner/dashboard/page.tsx`.
- Owner shell/UI patterns: `components/owner/OwnerShell.tsx`.
- Owner session cookie: `lib/ownerSession.ts`.
- Owner auth guard: `lib/requireOwnerAuth.ts`.
- Login/register/reset-password routes already use `venue_owners` and Supabase Auth:
  - `app/api/owner/auth/login/route.ts`
  - `app/api/owner/auth/register/route.ts`
  - `app/api/owner/auth/reset-password/route.ts`
- `venue_owners.email` is copied into local app data and must stay in sync with the Supabase Auth user email.

## Recommended UX

Add an **Account Settings** tile/button to the dashboard tile grid in `app/owner/dashboard/page.tsx`.

- Route: `/owner/account`
- Label: `Account Settings`
- Description: `Email address and password`
- Status pill: current email once loaded, or `Manage account`
- Keep it visually consistent with the other Partner Dashboard tiles.

Create `app/owner/account/page.tsx` using `OwnerShell` with `variant="dark"` and `maxWidth="lg"`.

The page should include two compact settings sections:

1. **Email Address**
   - Show current email.
   - Input for new email.
   - Require current password before applying the email change.
   - On success, update the displayed email and show a confirmation message.

2. **Password**
   - Current password.
   - New password.
   - Confirm new password.
   - Enforce the existing minimum password length of 8 characters.
   - On success, clear password fields and show a confirmation message.

## Security Decisions

- Require the current password for both email and password changes. This reduces risk if a logged-in dashboard session is left open on a shared venue device.
- Do not expose whether a requested new email belongs to another account beyond a generic conflict message.
- Update both Supabase Auth and `venue_owners.email` when changing email.
- Keep the existing owner session active after successful changes.
- Do not rename owner tables or routes; UI can say Partner Dashboard, code should keep `owner`.

## Implementation Phases

### Phase 1: Discovery and Contract Check

**Work**

- Confirm the shape of `venue_owners` rows used by owner auth: `id`, `auth_id`, `email`, `name`.
- Confirm whether Supabase Auth email updates should immediately confirm the new email for owner accounts. Recommended first implementation: use `email_confirm: true` via the admin API to avoid locking partners out, then consider verified-email workflows later if needed.
- Decide final copy for success and error states.

**Best Codex model:** 5.4  
**Intelligence level:** Medium  
**Why:** Mostly codebase reading and product scoping. The existing patterns are clear.

### Phase 2: Backend API

**Work**

Add authenticated owner endpoints:

- `GET /api/owner/account`
  - Uses `requireOwnerAuth(request)`.
  - Loads the owner row from `venue_owners`.
  - Returns `{ ok: true, owner: { id, name, email } }`.

- `PATCH /api/owner/account/email`
  - Uses `requireOwnerAuth(request)`.
  - Body: `{ email, currentPassword }`.
  - Loads owner row with `auth_id` and current email.
  - Reauthenticates current password against Supabase Auth password grant using the current owner email.
  - Validates new email format.
  - Checks for duplicate owner email in `venue_owners`.
  - Calls `supabaseAdmin.auth.admin.updateUserById(authId, { email: newEmail, email_confirm: true })`.
  - Updates `venue_owners.email` to the normalized new email.
  - If Supabase Auth succeeds but the local row update fails, return a server error and log enough context for repair.

- `PATCH /api/owner/account/password`
  - Uses `requireOwnerAuth(request)`.
  - Body: `{ currentPassword, newPassword }`.
  - Loads owner row with `auth_id` and email.
  - Reauthenticates current password.
  - Validates new password length.
  - Calls `supabaseAdmin.auth.admin.updateUserById(authId, { password: newPassword })`.

Add a small shared helper, likely in `lib/ownerAccount.ts`, for:

- Loading the authed owner profile.
- Reauthenticating an owner password with the Supabase Auth REST password grant.
- Normalizing and validating emails.

**Best Codex model:** 5.5  
**Intelligence level:** High  
**Why:** This is the security-critical phase. It touches authentication, credential updates, duplicate handling, and data consistency between Supabase Auth and `venue_owners`.

### Phase 3: Partner Dashboard UI

**Work**

- Add the Account Settings tile to `app/owner/dashboard/page.tsx`.
- Build `app/owner/account/page.tsx`.
- Fetch current owner account details from `GET /api/owner/account`.
- Redirect to `/owner/login` on 401, matching existing owner pages.
- Use existing owner input/button styles where appropriate, but make the page feel native to the dark dashboard surface.
- Include loading, saving, validation, success, and error states for each form independently.

**Best Codex model:** 5.4  
**Intelligence level:** Medium  
**Why:** This is straightforward UI implementation using existing dashboard conventions.

### Phase 4: Tests

**Work**

Add Vitest coverage for the API routes:

- `GET /api/owner/account`
  - Returns current owner data for an authenticated owner.
  - Returns 401 through the existing guard when unauthenticated.

- `PATCH /api/owner/account/email`
  - Rejects invalid email.
  - Rejects wrong current password.
  - Rejects duplicate email.
  - Updates Supabase Auth and `venue_owners.email` on success.

- `PATCH /api/owner/account/password`
  - Rejects short new password.
  - Rejects wrong current password.
  - Updates Supabase Auth password on success.

Update or add a focused component/browser check if the repo already has owner page UI tests. Otherwise, keep this to API tests plus TypeScript/build verification.

**Best Codex model:** 5.5  
**Intelligence level:** High  
**Why:** Auth tests need careful mocking and should catch the failure modes that would otherwise become account lockouts or silent data drift.

### Phase 5: Verification

**Work**

Run:

- `npm run test -- tests/api.owner.account.test.ts`
- `npm run test`
- `npx tsc --noEmit`
- `npm run build`

Manual checks:

- Log in as a partner.
- Open Partner Dashboard.
- Tap Account Settings.
- Change password, sign out, confirm old password fails and new password succeeds.
- Change email, sign out, confirm old email fails and new email succeeds.
- Confirm `venue_owners.email` reflects the new email.

**Best Codex model:** 5.4  
**Intelligence level:** Medium  
**Why:** Mostly running commands, reading failures, and making small corrections. Escalate to 5.5 only if tests reveal deeper auth/session inconsistency.

## Suggested Build Order

1. Backend account helper and routes.
2. API tests.
3. `/owner/account` page.
4. Dashboard tile.
5. Full verification.

## Out of Scope for First Pass

- Verified email change workflow with confirmation links.
- Multi-factor authentication.
- Partner name editing.
- Deleting owner accounts.
- Admin impersonation or support workflows.

## Open Product Question

Should changing email require email verification before the login email changes? The fastest safe internal implementation is immediate admin-confirmed email update with current-password verification. A verified-email workflow is stronger long term, but it requires additional UX, email templates, and temporary pending-email state.

## Phase 1 Findings (Completed July 24, 2026)

### Confirmed owner auth contract

- `requireOwnerAuth()` (`lib/requireOwnerAuth.ts`) authenticates the owner session from `tp_owner_sess`, resolves the current `ownerId`, then authorizes access by loading linked live venue ids from `venue_owner_venues`.
- The owner session cookie stores the local `venue_owners.id`, not the Supabase Auth user id (`lib/ownerSession.ts`).
- The current owner login flow (`app/api/owner/auth/login/route.ts`) verifies credentials through the Supabase Auth password grant, then resolves the local owner row from `venue_owners.auth_id`.
- The repo-confirmed `venue_owners` shape used by owner auth and downstream owner surfaces is:
  - `id`
  - `auth_id`
  - `email`
  - `name`

### Confirmed email-update behavior

- Owner registration already creates Supabase Auth users with `email_confirm: true` (`app/api/owner/auth/register/route.ts`).
- Owner password reset already updates credentials through `supabaseAdmin.auth.admin.updateUserById(...)` while keeping the Partner Dashboard owner model centered on `venue_owners.auth_id` (`app/api/owner/auth/reset-password/route.ts`).
- Phase 2 should therefore use `supabaseAdmin.auth.admin.updateUserById(authId, { email: newEmail, email_confirm: true })` for owner email changes.
- Decision: first implementation will immediately confirm the new email for owner accounts. This avoids locking partners out mid-change and matches the existing owner-account creation pattern. Verified-email-change workflows remain out of scope for this pass.

### Final copy decisions for success and error states

Use the following copy in Phase 2 and Phase 3 unless implementation reveals a platform-level constraint that requires a minor wording tweak:

- Account tile label: `Account Settings`
- Account tile description: `Email address and password`
- Account tile fallback status: `Manage account`
- Email section success: `Email address updated.`
- Password section success: `Password updated.`
- Generic save failure: `Something went wrong. Please try again.`
- Invalid email: `Enter a valid email address.`
- Duplicate email / auth conflict: `That email address is unavailable.`
- Wrong current password: `Current password is incorrect.`
- Missing current password for email change: `Enter your current password to change your email.`
- Missing current password for password change: `Enter your current password to change your password.`
- Short new password: `Password must be at least 8 characters.`
- Password confirmation mismatch: `Passwords do not match.`

### Phase 2 implementation notes

- Reauthentication should use the current owner email from `venue_owners.email`, because the current owner login flow already treats that value as the local source paired with Supabase Auth password-grant sign-in.
- If a future drift case exists between `venue_owners.email` and Supabase Auth email, the API should fail safely with a generic credential/update error and log enough context for repair rather than guessing which email is canonical.
