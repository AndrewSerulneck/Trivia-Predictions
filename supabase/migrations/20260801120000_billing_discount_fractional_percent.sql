-- Phase 3 of docs/billing-code-review-fixes-plan.md.
--
-- validateDiscountSpec (lib/billingDiscounts.ts) already accepts a fractional
-- percentOff and couponIdForSpec encodes a decimal point, but these two
-- columns were left `integer` — a 12.5% grant applied at Stripe while the
-- mirror write failed silently. Both are widening conversions; existing
-- integer values survive intact.

alter table public.billing_subscriptions
  alter column discount_percent_off type numeric(5, 2);

alter table public.billing_discount_grants
  alter column percent_off type numeric(5, 2);
