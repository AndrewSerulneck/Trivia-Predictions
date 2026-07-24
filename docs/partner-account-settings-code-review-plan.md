# Partner Account Settings — Code Review Plan

> **Status:** Planning only. No code changes in this doc.
> **Created:** 2026-07-24
> **Purpose:** Handoff for a separate Codex review pass over the Partner Account
> Settings implementation that was added after
> [docs/partner-account-settings-plan.md](/Users/andrewserulneck/Documents/Trivia-Predictions/docs/partner-account-settings-plan.md).

## Required review configuration

- **Best Codex model:** `Codex 5.5`
- **Intelligence level:** `High`

## Why this model / effort level

This review is not mainly about UI polish or styling. It is a security and
correctness review of owner-account management code that touches:

- current-password reauthentication
- Supabase Auth admin credential updates
- duplicate-email handling
- consistency between `venue_owners.email` and Supabase Auth email
- owner-session continuity after credential changes
- API/UI drift in success and failure handling

A lighter pass could miss subtle auth regressions or partial-failure cases. Use
the higher-scrutiny review setting.

## Non-negotiable scope boundary

Do **not** change or "clean up" the current order of buttons / tiles on the
Partner Dashboard. The user has intentionally changed that ordering.

That means the review pass should:

- treat the current tile order in `app/owner/dashboard/page.tsx` as intentional
- avoid style-only or preference-only edits to that ordering
- ignore dashboard-order observations unless they are tied to a real bug

## Review target

Review the Partner Account Settings work already present in the repo, primarily:

- `app/api/owner/account/route.ts`
- `app/api/owner/account/email/route.ts`
- `app/api/owner/account/password/route.ts`
- `lib/ownerAccount.ts`
- `app/owner/account/page.tsx`
- `tests/api.owner.account.test.ts`
- any minimal supporting usage in `app/owner/dashboard/page.tsx`

## Review objective

Run a code-review pass, not an implementation pass. Findings should be the main
output. Prioritize:

1. security bugs
2. data-consistency risks
3. auth/session regressions
4. correctness issues
5. missing or weak test coverage
6. only then lower-priority maintainability concerns

If there are no findings, say so explicitly and note any remaining manual-test
gaps.

## Specific questions the review should answer

1. Can email-change and password-change flows be abused without the true current
password?
2. Are error paths generic enough to avoid leaking whether another owner email
already exists?
3. Is the system safe if `venue_owners.email` and Supabase Auth email have
already drifted before the change request starts?
4. What happens if Supabase Auth updates succeed but the local
`venue_owners.email` update fails?
5. Does the UI make any assumption that conflicts with the API contract?
6. Are there missing tests around malformed request bodies, unexpected auth
responses, or partial-failure logging paths?
7. Does keeping the existing owner session active after credential changes have
any hidden downside in this implementation?

## Recommended review procedure

1. Read `CLAUDE.md` and `SYSTEM_CONTEXT.md` first.
2. Read [docs/partner-account-settings-plan.md](/Users/andrewserulneck/Documents/Trivia-Predictions/docs/partner-account-settings-plan.md) for the intended contract.
3. Inspect the implementation files listed above.
4. Review in code-review mode with findings first, ordered by severity, with
file references.
5. Do not write code in the review pass unless the user explicitly asks for
fixes afterward.

## Verification context for the reviewer

Automated verification already completed on 2026-07-24:

- `npm run test -- tests/api.owner.account.test.ts` passed
- `npm run test` passed
- `npx tsc --noEmit` passed
- `npm run build` passed

So the review should assume the feature is buildable and test-green, and focus
on whether any subtle bugs remain despite that.

## Expected output format from the separate review

- Findings first, ordered by severity, each with file references
- Brief open questions / assumptions
- Short summary only after the findings

If there are zero findings, the review should say:

- no findings found
- what was checked
- what manual verification still remains outside static review
