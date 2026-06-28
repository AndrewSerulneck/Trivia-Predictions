-- Idempotency guard for SlimCD hosted-session returns.
--
-- The /api/owner/billing/return handler books an invoice keyed on the SlimCD
-- `gateid` (transaction ticket), which is stable across replays of a completed
-- session. The handler checks for a prior invoice with the same ticket before
-- inserting, but two truly concurrent redirects could both pass that check and
-- both insert. This partial unique index makes the second insert fail at the
-- database, so a duplicate redirect can never double-book a charge.
--
-- Partial (WHERE slimcd_ticket IS NOT NULL) because failed/pending invoices may
-- have a null ticket and must not collide with one another.

CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_invoices_slimcd_ticket
  ON billing_invoices (slimcd_ticket)
  WHERE slimcd_ticket IS NOT NULL;
