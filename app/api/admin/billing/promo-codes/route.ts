import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { stripe } from "@/lib/stripe";
import { createOrReuseCoupon, validateDiscountSpec, type DiscountSpec } from "@/lib/billingDiscounts";

/**
 * Phase 7 of docs/billing-discounts-plan.md — admin management of Stripe
 * Promotion Codes for NEW signups (redeemed in Checkout's own UI via
 * `allow_promotion_codes: true` on the session, set in
 * app/api/owner/billing/checkout/route.ts). Separate surface from the
 * admin-grant discount actions in ../route.ts, which apply to an EXISTING
 * subscriber's subscription — a promo code has no bearing on one.
 *
 * A sibling route rather than more actions on ../route.ts, per the phase doc,
 * since that file is already sizeable.
 */

type PostBody = {
  discountType?: "free_months" | "percent_off" | "amount_off";
  months?: number;
  percentOff?: number;
  amountOffCents?: number;
  duration?: "once" | "repeating" | "forever";
  durationInMonths?: number;
  code?: string;
  maxRedemptions?: number;
  expiresAt?: string; // ISO date, optional
};

/** Deactivation only — Stripe promotion codes cannot be deleted or re-activated. */
type PatchBody = {
  id?: string;
};

/** Same spec-building rules the admin-grant route enforces server-side (see its handleApplyDiscount). */
function buildSpecFromBody(body: PostBody): { spec: DiscountSpec } | { error: string } {
  const discountType = body.discountType;
  if (discountType !== "free_months" && discountType !== "percent_off" && discountType !== "amount_off") {
    return { error: "A valid discount type is required." };
  }

  if (discountType === "free_months") {
    return { spec: { type: "free_months", months: Number(body.months) } };
  }

  const duration = body.duration;
  if (duration !== "once" && duration !== "repeating" && duration !== "forever") {
    return { error: "A valid discount duration is required." };
  }
  if (duration === "repeating" && !(Number.isInteger(body.durationInMonths) && (body.durationInMonths as number) > 0)) {
    return { error: "A repeating discount needs a whole number of months." };
  }
  const durationInMonths = duration === "repeating" ? (body.durationInMonths as number) : null;

  if (discountType === "percent_off") {
    const percentOff = Number(body.percentOff);
    if (!(percentOff > 0) || percentOff > 100) {
      return { error: "Percent off must be greater than 0 and no more than 100." };
    }
    return { spec: { type: "percent_off", percentOff, duration, durationInMonths } };
  }

  const amountOffCents = Number(body.amountOffCents);
  if (!(Number.isInteger(amountOffCents) && amountOffCents > 0)) {
    return { error: "Amount off must be a positive whole number of cents." };
  }
  return { spec: { type: "amount_off", amountOffCents, duration, durationInMonths } };
}

/** GET /api/admin/billing/promo-codes — list promotion codes with redemption counts. */
export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 500 });
  }

  try {
    // Auto-paged rather than a flat limit: a code past the first page would be
    // invisible here, and this panel is the only place it can be deactivated.
    // The cap is a runaway guard, not an expected boundary.
    const all = await stripe.promotionCodes
      .list({ limit: 100, expand: ["data.promotion.coupon"] })
      .autoPagingToArray({ limit: 1000 });
    const codes = all.map((pc) => {
      const coupon = pc.promotion.coupon;
      return {
        id: pc.id,
        code: pc.code,
        active: pc.active,
        timesRedeemed: pc.times_redeemed,
        maxRedemptions: pc.max_redemptions ?? null,
        expiresAt: pc.expires_at ? new Date(pc.expires_at * 1000).toISOString() : null,
        couponId: typeof coupon === "string" ? coupon : (coupon?.id ?? null),
        label: typeof coupon === "string" || !coupon ? null : coupon.name,
      };
    });
    return NextResponse.json({ ok: true, codes });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list promotion codes." },
      { status: 502 }
    );
  }
}

/** POST /api/admin/billing/promo-codes — create a promotion code wrapping a (reused) coupon. */
export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as PostBody;

  const built = buildSpecFromBody(body);
  if ("error" in built) {
    return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
  }
  const invalid = validateDiscountSpec(built.spec);
  if (invalid) {
    return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
  }

  let maxRedemptions: number | undefined;
  if (body.maxRedemptions !== undefined) {
    if (!(Number.isInteger(body.maxRedemptions) && body.maxRedemptions > 0)) {
      return NextResponse.json(
        { ok: false, error: "Max redemptions must be a positive whole number." },
        { status: 400 }
      );
    }
    maxRedemptions = body.maxRedemptions;
  }

  let expiresAt: number | undefined;
  if (body.expiresAt) {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: "Expiration date must be in the future." }, { status: 400 });
    }
    expiresAt = Math.floor(parsed.getTime() / 1000);
  }

  const code = (body.code ?? "").trim().toUpperCase() || undefined;

  const couponResult = await createOrReuseCoupon(built.spec);
  if (!couponResult.ok) {
    return NextResponse.json({ ok: false, error: couponResult.error }, { status: couponResult.status });
  }

  try {
    const promotionCode = await stripe.promotionCodes.create({
      promotion: { type: "coupon", coupon: couponResult.coupon.id },
      code,
      max_redemptions: maxRedemptions,
      expires_at: expiresAt,
    });
    return NextResponse.json({
      ok: true,
      code: {
        id: promotionCode.id,
        code: promotionCode.code,
        active: promotionCode.active,
        timesRedeemed: promotionCode.times_redeemed,
        maxRedemptions: promotionCode.max_redemptions ?? null,
        expiresAt: promotionCode.expires_at ? new Date(promotionCode.expires_at * 1000).toISOString() : null,
        couponId: couponResult.coupon.id,
        label: couponResult.coupon.name,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create promotion code." },
      { status: 502 }
    );
  }
}

/** PATCH /api/admin/billing/promo-codes — deactivate a promotion code. Stripe promo codes cannot be deleted, only deactivated. */
export async function PATCH(request: Request) {
  const auth = await requireAdminAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const id = (body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "Promotion code id is required." }, { status: 400 });
  }

  try {
    const promotionCode = await stripe.promotionCodes.update(id, { active: false });
    return NextResponse.json({ ok: true, code: { id: promotionCode.id, active: promotionCode.active } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to deactivate promotion code." },
      { status: 502 }
    );
  }
}
