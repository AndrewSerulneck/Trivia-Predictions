# Phase 0 — Section & field removals

Pure subtraction. Do this first so later phases work against a smaller surface.

## A. Delete three admin sections

- **Answer Grader** — `answer-grading`, `components/admin/sections/TriviaAnswerGraderSection.tsx`
- **Create Question** — `trivia-create`, `components/admin/sections/TriviaCreateSection.tsx`
- **Pick 'Em Settlement** — `pickem-settlement`, `components/admin/sections/PickEmSettlementSection.tsx`

Rationale: trivia answer/question authoring belongs in the local JSON files per
CLAUDE.md's Trivia Source of Truth rules, not an admin form. Pick 'Em
settlement is unnecessary.

For each, remove **every** reference — leave no orphans:
- the id from the `AdminSection` union in `components/admin/adminSections.tsx`
- its entry in `ADMIN_SECTION_OPTIONS`
- its membership in `ADMIN_NAV_GROUPS` (the `.filter([...])` id lists)
- its membership in `MIGRATED_SECTIONS`
- its `case` arm and its import in `components/admin/AdminShell.tsx`
- its import in `adminSections.tsx`
- the component file itself

**API routes are OUT OF SCOPE for deletion.** `app/api/admin/answer-grading/`
and `app/api/admin/answer-variants/` may have non-admin callers. Grep for
callers; if anything outside the deleted components uses them, leave them
alone. Note what you found in the run log.

## B. Remove two venue form fields

In `components/admin/sections/VenuesSection.tsx`, remove the **Icon Emoji**
(~line 730) and **Logo Text** (~line 726) form fields. They serve no practical
purpose.

**Scope limit:** this is UI removal. Do NOT drop DB columns and do NOT write a
migration. Before changing what the form *writes*, grep for other readers of
these fields (venue screen, venue cards, `lib/venueScreenBrand.ts`, TV display
surfaces). If other surfaces read them, keep persisting existing values
untouched — removing the input must not blank out data another surface renders.
Report the readers you found in the run log.

## Verify
`npm run build`, `npx tsc --noEmit`, `npm run lint`, `npm test`.
No dangling imports, no unreachable slugs, no TS errors from the narrowed union.
