# Partner Business Type — Phase 3 handoff (2026-11-12)

**For Andrew:** Admin → Partner Billing now shows each partner's business type and lets you change it
(a dropdown per partner; "—" if unknown). Not committed or deployed. The plan's other Phase 3 item,
a required choice in Activate-a-Venue, was **not done on purpose**: that flow only creates *venues*,
never partner accounts, so there's nothing to attach it to. Partners are created only by sign-up
(Phase 2 asks there) and the legacy `/owner/register` route (still NULL; see Phase 1 §7 question).
**Phase 2 (the sign-up question) is still not done.**

**What changed:**
- `app/api/admin/billing/route.ts`: GET now selects `venue_owners.business_type` and returns
  `partners[].businessType` (`BusinessType | null`; unrecognised stored value → null). New POST
  `action: "set-business-type"` `{ ownerId, businessType }` → updates `venue_owners` (no venue needed,
  handled before the `venueId` check), 400 on missing/invalid (never clears to unknown), 404 if no such partner.
- `components/admin/sections/BillingSection.tsx`: `Partner.businessType`; `businessTypePicker` (AdminSelect)
  in a new desktop "Type" column and in the mobile detail sheet; label line in the mobile list.
  The type is per partner, so changing it on one venue row changes it for all of that partner's venues
  (list refetches).
- `tests/api.admin.billing-business-type.test.ts` (new, 10 tests).

**Verified:** new tests pass; `npx tsc --noEmit` and eslint on changed files clean; full `npm run test`
531 files / 7,024 tests pass (first full run showed 1 failure I couldn't identify; two reruns clean).
**Not verified:** no browser check of the admin screen (shares production DB; admin login needed).

**State:** branch `feature/venue-display-intro-stinger`, nothing committed/pushed/deployed. Stage Phase 1+3
files by path — the branch also holds unrelated venue-display work. No DB change in this phase.

**Next:** Phase 2 (Sonnet 5.5 / medium) — start from `partner-business-type-plan_PHASE_1_HANDOFF.md` §5 and §8.
Phase 4 should also decide the legacy `/owner/register` path.
