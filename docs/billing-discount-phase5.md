# Phase 5 — Partner-facing discount display

Read `docs/billing-discounts-plan.md` first. Phase 6 (webhook sync) should
already be done, so this display is always showing current, self-correcting
state rather than something that can silently rot.

## What to build

On `/owner/billing` (`app/owner/billing/page.tsx`), show the active discount
when the Phase 1 mirror columns indicate one is present: what it is (reuse
`discount_label`), what the owner is actually being charged as a result, and
when it ends (`discount_ends_at`, or omit if "forever"/not applicable). A
partner seeing "$100/mo" while actually being charged $0 (a 100%-off month)
will file a support ticket — don't let the price shown and the price charged
disagree.

This touches the same subscription card that just had a mobile-overflow bug
fixed (oversized badge/button fonts clipping at narrow widths) — re-check any
new text you add at a 320px viewport with an actual screenshot, not just by
reading the JSX.

## Tests
No dedicated test file exists for this page. Prioritize correctness of the
discount-shown vs. no-discount states over adding new test infrastructure for
a client component.
