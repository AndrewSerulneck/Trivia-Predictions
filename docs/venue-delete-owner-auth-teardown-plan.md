# Venue Delete Owner Auth Teardown Plan

Created: 2026-07-23

## Investigation Finding

The concern is valid for any code path or deployed build that only deletes the
`venues` row and relies on database cascades. The database schema cascades
`venues -> venue_owner_venues`, but it does not cascade from a deleted venue to
`venue_owners`, and it does not delete the Supabase Auth user that stores the
partner email/password login.

In the current working tree, the Admin Dashboard venue delete path already has
the intended teardown:

- UI: `components/admin/sections/VenuesSection.tsx`
- API: `DELETE /api/admin?resource=venues&id=...` in `app/api/admin/route.ts`
- Server helper: `deleteAdminVenue()` in `lib/admin.ts`

`deleteAdminVenue()` currently:

1. Looks up the `venue_owner_venues` link and embedded
   `venue_owners(auth_id)` before deleting the venue.
2. Cancels any live Stripe subscription before deleting the venue.
3. Deletes the `venues` row.
4. Explicitly deletes the owner link for the venue.
5. Checks whether that owner still has any other linked venues.
6. If not, deletes the Supabase Auth user with
   `supabaseAdmin.auth.admin.deleteUser(auth_id)`.
7. Deletes the orphaned `venue_owners` row.

So, based on the current repo, the statement "deleting a venue does not also
delete the partner email/password account" is not true for the main Admin
Dashboard delete flow. It may still be true in production if these changes have
not been deployed, if a venue was deleted before this teardown existed, or if a
different/manual deletion path bypasses `deleteAdminVenue()`.

Follow-up finding: the Partner Dashboard login route used to accept any valid
Supabase Auth email/password as long as a `venue_owners` row existed. That meant
a historical orphan could still log in, then land on an empty dashboard with
"No venue found for this account." The login route now treats an owner account
as valid only if it resolves to at least one live `venues` row. If it has zero
links, or only stale links to deleted venues, login is rejected with the same
generic "Invalid email or password." message and the orphaned owner/auth records
are cleaned up best-effort.

The shared `requireOwnerAuth()` gate now also verifies that linked venue ids
still exist before authorizing Partner Dashboard API requests, so an old owner
session cookie should be bounced as unauthorized instead of reaching an empty
dashboard.

Relevant tests already exist:

- `tests/admin.delete-venue.test.ts`
- `tests/admin.venue-deletion-summary.test.ts`
- `tests/admin.repair-orphaned-link.test.ts`
- `tests/admin.orphaned-owner-accounts.test.ts`

## Desired Behavior

When an admin deletes a venue from the Admin Dashboard:

- If the venue has no partner owner, delete only the venue and venue-scoped data.
- If the venue has a partner owner who owns other venues, delete only this venue
  and its venue-owner link; keep the partner login because it still grants
  access to other venues.
- If the venue has a partner owner and this is their only venue, delete:
  - the venue,
  - the `venue_owner_venues` link,
  - the `venue_owners` profile row,
  - the Supabase Auth user that stores the partner email/password login.

## Phase 1 - Confirm Current Behavior Locally

Model required: Codex with medium reasoning.

Work:

- Run the focused teardown tests:
  - `npm run test -- tests/admin.delete-venue.test.ts`
  - `npm run test -- tests/admin.venue-deletion-summary.test.ts`
  - `npm run test -- tests/admin.repair-orphaned-link.test.ts`
  - `npm run test -- tests/admin.orphaned-owner-accounts.test.ts`
- Confirm the delete modal still warns when the owner account will be deleted.
- Confirm the API response includes `ownerAccountDeleted` and `authUserDeleted`
  for an only-venue owner.

Exit criteria:

- Focused tests pass.
- The current branch is safe to deploy from an owner-auth-teardown standpoint.

## Phase 2 - Confirm Production/Deployment State

Model required: Codex with medium reasoning plus deployment/log access.

Work:

- Identify the deployed commit currently serving production.
- Compare it to the commit containing `deleteAdminVenue()` owner teardown.
- In a staging or test Supabase project, create a throwaway venue and partner
  owner, delete the venue through the Admin Dashboard, then verify:
  - no `venue_owner_venues` link remains,
  - no `venue_owners` row remains when it was the owner's only venue,
  - the Supabase Auth user for that owner email is gone,
  - the owner can no longer sign in at `/owner/login`.

Exit criteria:

- Production is confirmed to include the teardown, or a deploy is scheduled.
- A real end-to-end staging delete proves the auth user is removed.

## Phase 3 - Clean Up Historical Orphans

Model required: Codex with high reasoning for data-safety review; use a stronger
model if running against production data.

Work:

- Use the existing orphan cleanup helpers in `lib/admin.ts`:
  - `repairOrphanedVenueOwnerLink(venueId)` for stale links tied to deleted
    venues.
  - `deleteOrphanedOwnerAccount(ownerId)` for owner accounts with no linked
    venues.
- Add or run a read-only audit script first that reports:
  - owner accounts with zero venue links,
  - venue-owner links whose venue no longer exists,
  - auth users referenced by orphaned `venue_owners` rows.
- Review the report manually before any destructive cleanup.

Exit criteria:

- Historical orphaned partner logins are removed.
- Shared/multi-venue owner accounts are preserved.

## Phase 4 - Optional Hardening

Model required: Codex with medium reasoning.

Work:

- Add an admin-facing "Owner/Auth cleanup" result to the delete success message
  that distinguishes DB profile deletion from Supabase Auth user deletion.
- Add structured server logs around owner teardown outcomes.
- Consider a scheduled/read-only orphan audit that alerts rather than deletes.
- If manual database deletes are common, consider moving the owner teardown into
  a database-side function plus a required admin API wrapper. Supabase Auth user
  deletion still has to be performed by trusted server code, so the API remains
  the authoritative path.

Exit criteria:

- Operators can see exactly what happened after deletion.
- Future orphan regressions are observable quickly.

## Recommended Next Step

Run Phase 1 now, then Phase 2 before relying on this behavior in production.
If Phase 2 shows production is behind the current repo, deploy the current
teardown work before deleting any more partner venues.
