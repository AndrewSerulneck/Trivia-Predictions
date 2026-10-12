# Multi-venue billing — release checklist (for Andrew)

Plan: `docs/multi-venue-volume-billing-plan.md` (Phase 7). Do this **after** the push, the Vercel flag
`NEXT_PUBLIC_MULTI_VENUE_BILLING_ENABLED=true` (+ `NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED` must also be on
for the "+ Add a venue" button) and a **Redeploy**. This charges a REAL card on your own account — use a
venue you can add and remove again. Write what you saw next to anything that looks wrong.

## A. Partner side (phone, then desktop)
- [ ] Dashboard venue dropdown shows **+ Add a venue**.
- [ ] Add flow: address → map → Review. Review shows the quote (this venue's price, today's charge); no number is invented by the page.
- [ ] Confirm: Stripe invoice appears for exactly the quoted amount; venue shows on the dashboard; "Venue added" email arrives once.
- [ ] Billing page lists both venues and the new monthly total.
- [ ] **Remove at end of month**: bill count drops, venue stays live, no credit on Stripe. **Undo** brings it back with no charge.
- [ ] Remove again, leave it: after the period end the daily cron hides it (check next day).
- [ ] A removed venue after its date shows **Add back** (paid) — only on a card bill.
- [ ] Partner Manual → "More than one venue" reads correctly.

## B. Admin side
- [ ] Partner Billing → bill view lists the venues; **Set rate** sheet on a flat-price bill reads "flat Stripe price, not per-venue" and offers **Back to standard pricing**.
- [ ] **Link a venue to a partner**: Preview first; a removed or cancelled-bill venue shows the Add-it-back option on the right bill.
- [ ] With the flag OFF a removed/lapsed venue shows the "Email support" / "only once multi-venue billing is switched on" copy, not "Add it back".

## C. After
- [ ] `npm run billing:backfill-lookup-keys` dry run: nothing left to fix.
- [ ] Next morning's `/api/cron/billing` log: no `[MultiVenueBilling] quantity-drift` line.
- [ ] Rollback if anything is wrong: set the flag to `false` and Redeploy (existing bills are untouched).
