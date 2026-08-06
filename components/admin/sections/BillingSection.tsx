"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminField, adminLabel } from "@/lib/adminStyles";
import { MobileBottomSheet } from "@/components/admin/mobile/MobileBottomSheet";
import { AdminModalSheet } from "@/components/admin/AdminModalSheet";
import { AdminSelect } from "@/components/admin/AdminSelect";

// Mirrors lib/billingCustomPrice.ts's MIN/MAX_CUSTOM_PRICE_DOLLARS — that file
// is "server-only" and cannot be imported from this client component, so the
// band is a client-side UX hint duplicated here on purpose. The server
// (resolveMonthlyPriceForAmount) is the real enforcement point; keep these in
// sync with that file if the policy ever changes.
const MIN_CUSTOM_PRICE_DOLLARS = 10;
const MAX_CUSTOM_PRICE_DOLLARS = 1000;

// AdminSelect renders a <button>, so it misses the global
// `input, select, textarea { border: 1px solid #334155 !important }` rule and
// instead picks up the global `button:not(:disabled)` rule
// (border: 1px solid rgba(255,255,255,0.12)) — an invisible white border on
// the modal's white cards. `.admin-select-bordered` (defined in globals.css)
// re-asserts the same dark border the sibling inputs get so the dropdown
// trigger reads as a bordered input like the fields around it.
const adminSelectField = `${adminField} admin-select-bordered`;

type PartnerDiscount = {
  label: string;
  percentOff: number | null;
  amountOffCents: number | null;
  endsAt: string | null;
};

type PartnerSubscription = {
  status: string;
  planType: string;
  amountCents: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  isManual: boolean;
  isStripe: boolean;
  cancelAtPeriodEnd: boolean;
  discount: PartnerDiscount | null;
};

type DiscountType = "free_months" | "percent_off" | "amount_off";
type DiscountDuration = "once" | "repeating" | "forever";

type PromoCode = {
  id: string;
  code: string;
  active: boolean;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: string | null;
  couponId: string;
  label: string | null;
};

type Partner = {
  venueId: string;
  venueName: string;
  ownerId: string;
  ownerEmail: string;
  ownerName: string;
  subscription: PartnerSubscription | null;
};

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

const formatUsd = (cents: number): string => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;

const statusBadge = (partner: Partner): { label: string; className: string } => {
  const sub = partner.subscription;
  if (!sub || sub.status === "cancelled") {
    return { label: "No access", className: "bg-slate-100 text-slate-600" };
  }
  if (sub.status === "past_due") {
    return { label: "Past due", className: "bg-rose-100 text-rose-700" };
  }
  if (sub.isStripe && sub.cancelAtPeriodEnd) {
    // Revoke schedules cancel_at_period_end at Stripe but status stays 'active'
    // until the period actually ends (no mid-period refund exposure) — surface
    // that distinctly so the admin can see the revoke click actually took effect.
    return { label: `Cancels ${formatDate(sub.currentPeriodEnd)}`, className: "bg-orange-100 text-orange-800" };
  }
  if (sub.isManual) {
    return { label: "Active — offline", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "Active — card", className: "bg-emerald-100 text-emerald-700" };
};

// Disable "Grant offline" for any non-cancelled Stripe row, not just an active
// one — a past_due card sub is still live at Stripe and converting it to
// offline would orphan it (server enforces this too). Exception: once a
// cancellation is already scheduled (cancelAtPeriodEnd), the admin has
// expressed intent to move off Stripe — unlock the button and let openGrant
// force-finalize it. Shared by the desktop table row and the mobile detail
// sheet so the guard can't drift between the two.
const hasLiveCardSubscription = (partner: Partner): boolean =>
  Boolean(
    partner.subscription?.isStripe &&
      partner.subscription.status !== "cancelled" &&
      !partner.subscription.cancelAtPeriodEnd
  );

export function BillingSection() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  // Mobile-only: the card list opens a detail sheet holding the actions that
  // sit in the table's rightmost column on desktop, rather than forking a
  // second partner-fetch path.
  const [detailVenueId, setDetailVenueId] = useState<string | null>(null);

  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);
  const [paidThroughDate, setPaidThroughDate] = useState("");
  // The venue's list rate (what the subscription is billed at before any
  // discount) and what the partner actually handed over on this occasion. They
  // differ whenever a discount is in play; see the grant modal's help text.
  const [amountDollars, setAmountDollars] = useState("100");
  const [amountReceivedDollars, setAmountReceivedDollars] = useState("100");
  // False until the admin types in the "amount received" box; while false that
  // box tracks the rate box, so the common no-discount case stays one keystroke.
  const [receivedEdited, setReceivedEdited] = useState(false);
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  // True when a scheduled-but-not-yet-finalized Stripe cancellation must be
  // force-completed as part of this grant (see openGrant).
  const [forceGrant, setForceGrant] = useState(false);

  const [activeDiscountVenueId, setActiveDiscountVenueId] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<DiscountType>("percent_off");
  const [discountMonths, setDiscountMonths] = useState("1");
  const [discountPercentOff, setDiscountPercentOff] = useState("10");
  const [discountAmountOffDollars, setDiscountAmountOffDollars] = useState("10");
  const [discountDuration, setDiscountDuration] = useState<DiscountDuration>("once");
  const [discountDurationInMonths, setDiscountDurationInMonths] = useState("3");
  const [discountReason, setDiscountReason] = useState("");
  const [discountSubmitting, setDiscountSubmitting] = useState(false);
  const [discountNotice, setDiscountNotice] = useState("");
  // Applying over an existing discount replaces it at Stripe (only one discount
  // per subscription), so the modal opens on the current one and this reveals the
  // form on request — rather than forcing a Remove round-trip to change it.
  const [discountReplacing, setDiscountReplacing] = useState(false);

  // A negotiated permanent rate is NOT a discount — it's a different Stripe
  // Price on the subscription item — so it gets its own control rather than a
  // fourth entry in the discount type dropdown.
  const [activeRateVenueId, setActiveRateVenueId] = useState<string | null>(null);
  const [rateAmountDollars, setRateAmountDollars] = useState("");
  const [ratePriceId, setRatePriceId] = useState("");
  // Dollars-first is the default entry mode; the price-id field is a disclosure
  // for the escape-hatch cases dollars-only can't express (plan §1.2, §5.4).
  const [rateUsePriceId, setRateUsePriceId] = useState(false);
  const [rateReason, setRateReason] = useState("");
  const [rateSubmitting, setRateSubmitting] = useState(false);
  const [rateNotice, setRateNotice] = useState("");

  const fetchPartners = useCallback(async (searchValue: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (searchValue) params.set("search", searchValue);
      const res = await fetch(`/api/admin/billing?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json()) as { ok?: boolean; partners?: Partner[]; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Failed to load partners.");
        return;
      }
      setPartners(payload.partners ?? []);
    } catch {
      setError("Failed to load partners.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPartners(search);
  }, [fetchPartners, search]);

  const defaultPaidThrough = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const openGrant = (partner: Partner) => {
    const sub = partner.subscription;
    // A Revoke click already expressed cancellation intent, but status stays
    // 'active' until Stripe's period actually ends (see statusBadge). Converting
    // to offline now means finalizing that cancellation immediately instead of
    // waiting — confirm before doing it, then pass force:true so the server's
    // live-Stripe-subscription guard doesn't reject the grant.
    const needsForceCancel = Boolean(sub?.isStripe && sub.cancelAtPeriodEnd && sub.status !== "cancelled");
    if (needsForceCancel) {
      const confirmed = window.confirm(
        "This venue's card subscription has a cancellation scheduled but not yet finalized. " +
          "Continuing will immediately cancel it at Stripe now and switch this venue to offline billing. Continue?"
      );
      if (!confirmed) return;
    }
    setForceGrant(needsForceCancel);
    setActiveVenueId(partner.venueId);
    setPaidThroughDate(partner.subscription?.currentPeriodEnd?.slice(0, 10) || defaultPaidThrough);
    const rate = partner.subscription
      ? String(Math.round(partner.subscription.amountCents / 100))
      : "100";
    setAmountDollars(rate);
    setAmountReceivedDollars(rate);
    setReceivedEdited(false);
    setMemo("");
    setNotice("");
  };

  const closeGrant = () => {
    setActiveVenueId(null);
    setForceGrant(false);
    setNotice("");
  };

  const submitGrant = async () => {
    if (!activeVenueId) return;
    setSubmitting(true);
    setNotice("");
    try {
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grant-manual",
          venueId: activeVenueId,
          paidThroughDate,
          amountDollars: Number(amountDollars),
          amountReceivedDollars: Number(amountReceivedDollars),
          memo,
          force: forceGrant,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string; warning?: string };
      if (!res.ok || !payload.ok) {
        setNotice(payload.error ?? "Failed to grant access.");
        return;
      }
      closeGrant();
      await fetchPartners(search);
    } catch {
      setNotice("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (partner: Partner) => {
    if (!window.confirm(`Revoke dashboard access for ${partner.venueName}?`)) return;
    try {
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", venueId: partner.venueId }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Failed to revoke access.");
        return;
      }
      await fetchPartners(search);
    } catch {
      setError("Network error. Please try again.");
    }
  };

  const openDiscount = (partner: Partner) => {
    setActiveDiscountVenueId(partner.venueId);
    setDiscountType("percent_off");
    setDiscountMonths("1");
    setDiscountPercentOff("10");
    setDiscountAmountOffDollars("10");
    // An offline partner has no billing cycle for a discount to expire on, so the
    // server only accepts "forever" for them (lib/billingDiscounts.ts). Default to
    // the one legal value instead of letting the admin build a guaranteed 400.
    setDiscountDuration(partner.subscription?.isManual ? "forever" : "once");
    setDiscountDurationInMonths("3");
    setDiscountReason("");
    setDiscountNotice("");
    setDiscountReplacing(false);
  };

  const closeDiscount = () => {
    setActiveDiscountVenueId(null);
    setDiscountNotice("");
    setDiscountReplacing(false);
  };

  const submitApplyDiscount = async () => {
    if (!activeDiscountVenueId) return;
    setDiscountSubmitting(true);
    setDiscountNotice("");
    try {
      const body: Record<string, unknown> = {
        action: "apply-discount",
        venueId: activeDiscountVenueId,
        discountType,
        reason: discountReason,
      };
      if (discountType === "free_months") {
        body.months = Number(discountMonths);
      } else {
        body.duration = discountDuration;
        if (discountDuration === "repeating") {
          body.durationInMonths = Number(discountDurationInMonths);
        }
        if (discountType === "percent_off") {
          body.percentOff = Number(discountPercentOff);
        } else {
          body.amountOffCents = Math.round(Number(discountAmountOffDollars) * 100);
        }
      }
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string; warning?: string };
      if (!res.ok || !payload.ok) {
        setDiscountNotice(payload.error ?? "Failed to apply discount.");
        return;
      }
      closeDiscount();
      await fetchPartners(search);
    } catch {
      setDiscountNotice("Network error. Please try again.");
    } finally {
      setDiscountSubmitting(false);
    }
  };

  const submitRemoveDiscount = async () => {
    if (!activeDiscountVenueId) return;
    setDiscountSubmitting(true);
    setDiscountNotice("");
    try {
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-discount", venueId: activeDiscountVenueId }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setDiscountNotice(payload.error ?? "Failed to remove discount.");
        return;
      }
      closeDiscount();
      await fetchPartners(search);
    } catch {
      setDiscountNotice("Network error. Please try again.");
    } finally {
      setDiscountSubmitting(false);
    }
  };

  const activeDiscountPartner = partners.find((p) => p.venueId === activeDiscountVenueId) ?? null;

  const openRate = (partner: Partner) => {
    setActiveRateVenueId(partner.venueId);
    setRateAmountDollars("");
    setRatePriceId("");
    setRateUsePriceId(false);
    setRateReason("");
    setRateNotice("");
  };

  const closeRate = () => {
    setActiveRateVenueId(null);
    setRateNotice("");
  };

  const submitCustomPrice = async () => {
    if (!activeRateVenueId) return;
    setRateSubmitting(true);
    setRateNotice("");
    try {
      const body: Record<string, unknown> = {
        action: "set-custom-price",
        venueId: activeRateVenueId,
        reason: rateReason,
      };
      if (rateUsePriceId) {
        body.stripePriceId = ratePriceId.trim();
      } else {
        body.amountDollars = Number(rateAmountDollars);
      }
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setRateNotice(payload.error ?? "Failed to change the rate.");
        return;
      }
      closeRate();
      await fetchPartners(search);
    } catch {
      setRateNotice("Network error. Please try again.");
    } finally {
      setRateSubmitting(false);
    }
  };

  const activeRatePartner = partners.find((p) => p.venueId === activeRateVenueId) ?? null;

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoPanelOpen, setPromoPanelOpen] = useState(false);
  const [promoFormOpen, setPromoFormOpen] = useState(false);
  const [promoDiscountType, setPromoDiscountType] = useState<DiscountType>("percent_off");
  const [promoMonths, setPromoMonths] = useState("1");
  const [promoPercentOff, setPromoPercentOff] = useState("10");
  const [promoAmountOffDollars, setPromoAmountOffDollars] = useState("10");
  const [promoDuration, setPromoDuration] = useState<DiscountDuration>("once");
  const [promoDurationInMonths, setPromoDurationInMonths] = useState("3");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [promoMaxRedemptions, setPromoMaxRedemptions] = useState("");
  const [promoExpiresAt, setPromoExpiresAt] = useState("");
  const [promoSubmitting, setPromoSubmitting] = useState(false);
  const [promoNotice, setPromoNotice] = useState("");
  const promoLoadedRef = useRef(false);

  const fetchPromoCodes = useCallback(async () => {
    setPromoLoading(true);
    setPromoError("");
    try {
      const res = await fetch("/api/admin/billing/promo-codes", { cache: "no-store" });
      const payload = (await res.json()) as { ok?: boolean; codes?: PromoCode[]; error?: string };
      if (!res.ok || !payload.ok) {
        setPromoError(payload.error ?? "Failed to load promotion codes.");
        return;
      }
      setPromoCodes(payload.codes ?? []);
    } catch {
      setPromoError("Failed to load promotion codes.");
    } finally {
      setPromoLoading(false);
    }
  }, []);

  // Promotion codes are a rarely-opened management surface backed by a live
  // Stripe list call, so they load on first expand rather than on every mount of
  // the Billing tab. Refetches after create/deactivate go through fetchPromoCodes
  // directly, which is only reachable while the panel is open.
  useEffect(() => {
    if (!promoPanelOpen || promoLoadedRef.current) return;
    promoLoadedRef.current = true;
    void fetchPromoCodes();
  }, [promoPanelOpen, fetchPromoCodes]);

  const submitCreatePromoCode = async () => {
    setPromoSubmitting(true);
    setPromoNotice("");
    try {
      const body: Record<string, unknown> = {
        discountType: promoDiscountType,
        code: promoCodeInput,
      };
      if (promoDiscountType === "free_months") {
        body.months = Number(promoMonths);
      } else {
        body.duration = promoDuration;
        if (promoDuration === "repeating") {
          body.durationInMonths = Number(promoDurationInMonths);
        }
        if (promoDiscountType === "percent_off") {
          body.percentOff = Number(promoPercentOff);
        } else {
          body.amountOffCents = Math.round(Number(promoAmountOffDollars) * 100);
        }
      }
      if (promoMaxRedemptions.trim()) body.maxRedemptions = Number(promoMaxRedemptions);
      if (promoExpiresAt) body.expiresAt = new Date(`${promoExpiresAt}T23:59:59.000Z`).toISOString();

      const res = await fetch("/api/admin/billing/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setPromoNotice(payload.error ?? "Failed to create promotion code.");
        return;
      }
      setPromoFormOpen(false);
      setPromoCodeInput("");
      setPromoMaxRedemptions("");
      setPromoExpiresAt("");
      await fetchPromoCodes();
    } catch {
      setPromoNotice("Network error. Please try again.");
    } finally {
      setPromoSubmitting(false);
    }
  };

  const deactivatePromoCode = async (promo: PromoCode) => {
    if (!window.confirm(`Deactivate promotion code ${promo.code}?`)) return;
    try {
      const res = await fetch("/api/admin/billing/promo-codes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: promo.id }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setPromoError(payload.error ?? "Failed to deactivate promotion code.");
        return;
      }
      await fetchPromoCodes();
    } catch {
      setPromoError("Network error. Please try again.");
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Partner Billing</h2>
        <p className="text-sm text-slate-600">
          Grant Partner Dashboard access to venues that pay by check or another offline method.
          Access stays active through the paid-through date; re-grant when the next payment clears.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          className={adminField}
          placeholder="Search venue or owner email…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setSearch(searchInput);
          }}
        />
        <button
          type="button"
          onClick={() => setSearch(searchInput)}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Search
        </button>
      </div>

      {error ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : partners.length === 0 ? (
        <p className="text-sm text-slate-500">No partners found.</p>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {partners.map((partner) => {
              const badge = statusBadge(partner);
              return (
                <li key={partner.venueId}>
                  <button
                    type="button"
                    onClick={() => setDetailVenueId(partner.venueId)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{partner.venueName}</p>
                      <p className="truncate text-xs text-slate-500">{partner.ownerEmail || "No owner email"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span aria-hidden className="shrink-0 text-slate-300">
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Venue</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Paid through</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {partners.map((partner) => {
                const badge = statusBadge(partner);
                const hasLiveCard = hasLiveCardSubscription(partner);
                return (
                  <tr key={partner.venueId} className="align-middle">
                    <td className="px-3 py-2 font-medium text-slate-900">{partner.venueName}</td>
                    <td className="px-3 py-2 text-slate-600">{partner.ownerEmail || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {partner.subscription?.status === "active"
                        ? formatDate(partner.subscription.currentPeriodEnd)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openGrant(partner)}
                          disabled={hasLiveCard}
                          title={
                            hasLiveCard
                              ? "This venue has a live card subscription — cancel it (Revoke) before granting offline access."
                              : undefined
                          }
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {partner.subscription?.isManual ? "Extend / edit" : "Grant offline"}
                        </button>
                        {partner.subscription && partner.subscription.status !== "cancelled" ? (
                          <button
                            type="button"
                            onClick={() => openDiscount(partner)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            {partner.subscription.discount ? "Discount…" : "Add discount"}
                          </button>
                        ) : null}
                        {partner.subscription &&
                        partner.subscription.isStripe &&
                        partner.subscription.status !== "cancelled" ? (
                          <button
                            type="button"
                            onClick={() => openRate(partner)}
                            title="Move this partner onto a negotiated Stripe price"
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Custom rate
                          </button>
                        ) : null}
                        {partner.subscription && partner.subscription.status !== "cancelled" ? (
                          <button
                            type="button"
                            onClick={() => revoke(partner)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Revoke
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      <MobileBottomSheet
        open={Boolean(detailVenueId)}
        onClose={() => setDetailVenueId(null)}
        title={partners.find((p) => p.venueId === detailVenueId)?.venueName}
      >
        {(() => {
          const partner = partners.find((p) => p.venueId === detailVenueId);
          if (!partner) return null;
          const badge = statusBadge(partner);
          const hasLiveCard = hasLiveCardSubscription(partner);
          return (
            <div className="space-y-3 px-3 pb-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm text-slate-600">{partner.ownerEmail || "No owner email"}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
              {partner.subscription?.status === "active" ? (
                <p className="text-xs text-slate-500">
                  Paid through {formatDate(partner.subscription.currentPeriodEnd)}
                </p>
              ) : null}

              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDetailVenueId(null);
                    openGrant(partner);
                  }}
                  disabled={hasLiveCard}
                  className="min-h-[44px] w-full rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {partner.subscription?.isManual ? "Extend / edit" : "Grant offline"}
                </button>
                {hasLiveCard ? (
                  <p className="text-xs text-slate-500">
                    This venue has a live card subscription — cancel it (Revoke) before granting
                    offline access.
                  </p>
                ) : null}
                {partner.subscription && partner.subscription.status !== "cancelled" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailVenueId(null);
                      openDiscount(partner);
                    }}
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                  >
                    {partner.subscription.discount ? "Discount…" : "Add discount"}
                  </button>
                ) : null}
                {partner.subscription && partner.subscription.isStripe && partner.subscription.status !== "cancelled" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailVenueId(null);
                      openRate(partner);
                    }}
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                  >
                    Custom rate
                  </button>
                ) : null}
                {partner.subscription && partner.subscription.status !== "cancelled" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailVenueId(null);
                      void revoke(partner);
                    }}
                    className="min-h-[44px] w-full rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            </div>
          );
        })()}
      </MobileBottomSheet>

      <AdminModalSheet open={activeVenueId !== null} onClose={closeGrant} titleId="grant-modal-title">
        <h3 id="grant-modal-title" className="text-base font-semibold text-slate-900">
          Grant offline access
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          {partners.find((p) => p.venueId === activeVenueId)?.venueName}
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <label className={adminLabel}>Paid through</label>
            <input
              type="date"
              className={adminField}
              value={paidThroughDate}
              onChange={(e) => setPaidThroughDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Access stays active through this date, then reverts to no access.
            </p>
          </div>
          <div>
            <label className={adminLabel}>Monthly rate before discount (USD)</label>
            <input
              type="number"
              min="0"
              step="1"
              className={adminField}
              value={amountDollars}
              onChange={(e) => {
                setAmountDollars(e.target.value);
                if (!receivedEdited) setAmountReceivedDollars(e.target.value);
              }}
            />
            <p className="mt-1 text-xs text-slate-500">
              The venue&apos;s full list rate. Record any discount separately with the Discount
              button — the partner sees the discounted total on their billing page.
            </p>
          </div>
          <div>
            <label className={adminLabel}>Amount received on this payment (USD)</label>
            <input
              type="number"
              min="0"
              step="1"
              className={adminField}
              value={amountReceivedDollars}
              onChange={(e) => {
                setReceivedEdited(true);
                setAmountReceivedDollars(e.target.value);
              }}
            />
            <p className="mt-1 text-xs text-slate-500">
              What the check was actually for. Shows in the partner&apos;s payment history.
              Leave it matching the rate above if there&apos;s no discount.
            </p>
          </div>
          <div>
            <label className={adminLabel}>Memo (check #, note)</label>
            <input
              className={adminField}
              placeholder="Check #1234"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>
        </div>

        {notice ? (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {notice}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeGrant}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitGrant}
            disabled={submitting}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Grant access"}
          </button>
        </div>
      </AdminModalSheet>

      <AdminModalSheet
        open={activeDiscountVenueId !== null}
        onClose={closeDiscount}
        titleId="discount-modal-title"
      >
        <h3 id="discount-modal-title" className="text-base font-semibold text-slate-900">
          Discount
        </h3>
        <p className="mt-1 text-sm text-slate-600">{activeDiscountPartner?.venueName}</p>

        {activeDiscountPartner?.subscription?.discount ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Active discount: <strong>{activeDiscountPartner.subscription.discount.label}</strong>
              {activeDiscountPartner.subscription.discount.endsAt
                ? ` — ends ${formatDate(activeDiscountPartner.subscription.discount.endsAt)}`
                : ""}
            </div>
            {discountReplacing ? null : (
              <button
                type="button"
                onClick={() => setDiscountReplacing(true)}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-500"
              >
                Apply a different discount instead →
              </button>
            )}
            <p className="text-xs text-slate-500">
              Stripe allows only one discount per subscription, so applying a different one
              replaces this — it does not stack. Removing clears it entirely.
              {activeDiscountPartner.subscription.isManual
                ? " Free months already granted to an offline partner stay granted; their paid-through date has already moved."
                : ""}
            </p>
          </div>
        ) : null}

        {!activeDiscountPartner?.subscription?.discount || discountReplacing ? (
          <div className="mt-4 space-y-4">
            <div>
              <label className={adminLabel}>Type</label>
              <AdminSelect
                ariaLabel="Discount type"
                className={adminSelectField}
                value={discountType}
                onChange={setDiscountType}
                options={[
                  { value: "free_months", label: "Free months" },
                  { value: "percent_off", label: "Percent off" },
                  { value: "amount_off", label: "Dollar amount off" },
                ]}
              />
            </div>

            {discountType === "free_months" ? (
              <div>
                <label className={adminLabel}>Months free</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className={adminField}
                  value={discountMonths}
                  onChange={(e) => setDiscountMonths(e.target.value)}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className={adminLabel}>
                    {discountType === "percent_off" ? "Percent off" : "Amount off (USD)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={adminField}
                    value={discountType === "percent_off" ? discountPercentOff : discountAmountOffDollars}
                    onChange={(e) =>
                      discountType === "percent_off"
                        ? setDiscountPercentOff(e.target.value)
                        : setDiscountAmountOffDollars(e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className={adminLabel}>Duration</label>
                  {activeDiscountPartner?.subscription?.isManual ? (
                    <>
                      <p className="text-sm text-slate-700">Forever</p>
                      <p className="mt-1 text-xs text-slate-500">
                        An offline partner has no billing cycle for a discount to expire on, so
                        it runs until you remove it. For a time-limited credit use Free months.
                      </p>
                    </>
                  ) : (
                    <AdminSelect
                      ariaLabel="Discount duration"
                      className={adminSelectField}
                      value={discountDuration}
                      onChange={setDiscountDuration}
                      options={[
                        { value: "once", label: "Once (next bill only)" },
                        { value: "repeating", label: "For a number of months" },
                        { value: "forever", label: "Forever" },
                      ]}
                    />
                  )}
                </div>
                {discountDuration === "repeating" ? (
                  <div>
                    <label className={adminLabel}>Number of months</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={adminField}
                      value={discountDurationInMonths}
                      onChange={(e) => setDiscountDurationInMonths(e.target.value)}
                    />
                  </div>
                ) : null}
              </>
            )}

            <div>
              <label className={adminLabel}>Reason (optional)</label>
              <input
                className={adminField}
                placeholder="Why this discount is being granted"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
              />
            </div>

            {activeDiscountPartner?.subscription?.isManual ? (
              <p className="text-xs text-slate-500">
                This partner is billed offline, so nothing is charged automatically — the
                discount is recorded against their rate and shown on their billing page. Their
                list rate is unchanged; use Grant offline / Extend to record what they actually
                paid.
              </p>
            ) : null}
          </div>
        ) : null}

        {discountNotice ? (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {discountNotice}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeDiscount}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          {activeDiscountPartner?.subscription?.discount && !discountReplacing ? (
            <button
              type="button"
              onClick={submitRemoveDiscount}
              disabled={discountSubmitting}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
            >
              {discountSubmitting ? "Removing…" : "Remove discount"}
            </button>
          ) : activeDiscountPartner?.subscription?.discount ? (
            <button
              type="button"
              onClick={submitApplyDiscount}
              disabled={discountSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {discountSubmitting ? "Replacing…" : "Replace discount"}
            </button>
          ) : (
            <button
              type="button"
              onClick={submitApplyDiscount}
              disabled={discountSubmitting}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {discountSubmitting ? "Saving…" : "Apply discount"}
            </button>
          )}
        </div>
      </AdminModalSheet>

      <AdminModalSheet open={activeRateVenueId !== null} onClose={closeRate} titleId="rate-modal-title">
        <h3 id="rate-modal-title" className="text-base font-semibold text-slate-900">
          Custom rate
        </h3>
        <p className="mt-1 text-sm text-slate-600">{activeRatePartner?.venueName}</p>

        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Current rate:{" "}
            <strong>{formatUsd(activeRatePartner?.subscription?.amountCents ?? 0)}</strong> per cycle
          </div>
          {rateUsePriceId ? (
            <div>
              <label className={adminLabel}>Stripe price ID</label>
              <input
                className={adminField}
                placeholder="price_1A2b3C…"
                value={ratePriceId}
                onChange={(e) => setRatePriceId(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                For a legacy non-round rate or a price already built by hand at Stripe.
              </p>
              <button
                type="button"
                onClick={() => setRateUsePriceId(false)}
                className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-500"
              >
                ← Use a dollar amount instead
              </button>
            </div>
          ) : (
            <div>
              <label className={adminLabel}>Monthly rate (USD)</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-500">
                  $
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="75"
                  className={`${adminField} pl-6 pr-16`}
                  value={rateAmountDollars}
                  onChange={(e) => {
                    const digitsOnly = e.target.value.replace(/[^0-9]/g, "");
                    setRateAmountDollars(digitsOnly);
                  }}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
                  /month
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Whole dollars only, no cents. Must be between ${MIN_CUSTOM_PRICE_DOLLARS} and $
                {MAX_CUSTOM_PRICE_DOLLARS.toLocaleString("en-US")}.
              </p>
              <button
                type="button"
                onClick={() => setRateUsePriceId(true)}
                className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-500"
              >
                Use a Stripe price ID instead →
              </button>
            </div>
          )}
          <div>
            <label className={adminLabel}>Reason (optional)</label>
            <input
              className={adminField}
              placeholder="Why this partner is on a negotiated rate"
              value={rateReason}
              onChange={(e) => setRateReason(e.target.value)}
            />
          </div>
          <p className="text-xs text-slate-500">
            This is not a discount — the partner moves onto a different price and every screen will
            report the new amount. It takes effect at their next billing cycle; nothing is charged or
            credited now.
          </p>
        </div>

        {rateNotice ? (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {rateNotice}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={closeRate}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitCustomPrice}
            disabled={
              rateSubmitting || (rateUsePriceId ? !ratePriceId.trim() : !rateAmountDollars.trim())
            }
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {rateSubmitting ? "Saving…" : "Change rate"}
          </button>
        </div>
      </AdminModalSheet>

      <div className="space-y-3 border-t border-slate-200 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Promotion codes</h3>
            <p className="text-sm text-slate-600">
              Codes a new partner can type into Checkout at signup (e.g. LAUNCH50). Has no effect
              on an existing subscriber — use Discount above for that.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {promoPanelOpen ? (
              <button
                type="button"
                onClick={() => {
                  setPromoFormOpen((open) => !open);
                  setPromoNotice("");
                }}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                {promoFormOpen ? "Cancel" : "New code"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setPromoPanelOpen((open) => !open);
                setPromoFormOpen(false);
                setPromoNotice("");
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100"
            >
              {promoPanelOpen ? "Hide" : "Manage"}
            </button>
          </div>
        </div>

        {!promoPanelOpen ? null : (
          <>
        {promoError ? (
          <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{promoError}</div>
        ) : null}

        {promoFormOpen ? (
          <div className="space-y-4 rounded-lg border border-slate-200 p-4">
            <div>
              <label className={adminLabel}>Type</label>
              <AdminSelect
                ariaLabel="Promo code discount type"
                className={adminSelectField}
                value={promoDiscountType}
                onChange={setPromoDiscountType}
                options={[
                  { value: "free_months", label: "Free months" },
                  { value: "percent_off", label: "Percent off" },
                  { value: "amount_off", label: "Dollar amount off" },
                ]}
              />
            </div>

            {promoDiscountType === "free_months" ? (
              <div>
                <label className={adminLabel}>Months free</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className={adminField}
                  value={promoMonths}
                  onChange={(e) => setPromoMonths(e.target.value)}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className={adminLabel}>
                    {promoDiscountType === "percent_off" ? "Percent off" : "Amount off (USD)"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={adminField}
                    value={promoDiscountType === "percent_off" ? promoPercentOff : promoAmountOffDollars}
                    onChange={(e) =>
                      promoDiscountType === "percent_off"
                        ? setPromoPercentOff(e.target.value)
                        : setPromoAmountOffDollars(e.target.value)
                    }
                  />
                </div>
                <div>
                  <label className={adminLabel}>Duration</label>
                  <AdminSelect
                    ariaLabel="Promo code duration"
                    className={adminSelectField}
                    value={promoDuration}
                    onChange={setPromoDuration}
                    options={[
                      { value: "once", label: "Once (first bill only)" },
                      { value: "repeating", label: "For a number of months" },
                      { value: "forever", label: "Forever" },
                    ]}
                  />
                </div>
                {promoDuration === "repeating" ? (
                  <div>
                    <label className={adminLabel}>Number of months</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      className={adminField}
                      value={promoDurationInMonths}
                      onChange={(e) => setPromoDurationInMonths(e.target.value)}
                    />
                  </div>
                ) : null}
              </>
            )}

            <div>
              <label className={adminLabel}>Code (optional — Stripe generates one if blank)</label>
              <input
                className={adminField}
                placeholder="LAUNCH50"
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value)}
              />
            </div>
            <div>
              <label className={adminLabel}>Max redemptions (optional)</label>
              <input
                type="number"
                min="1"
                step="1"
                className={adminField}
                value={promoMaxRedemptions}
                onChange={(e) => setPromoMaxRedemptions(e.target.value)}
              />
            </div>
            <div>
              <label className={adminLabel}>Expires (optional)</label>
              <input
                type="date"
                className={adminField}
                value={promoExpiresAt}
                onChange={(e) => setPromoExpiresAt(e.target.value)}
              />
            </div>

            {promoNotice ? (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{promoNotice}</div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={submitCreatePromoCode}
                disabled={promoSubmitting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {promoSubmitting ? "Creating…" : "Create code"}
              </button>
            </div>
          </div>
        ) : null}

        {promoLoading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : promoCodes.length === 0 ? (
          <p className="text-sm text-slate-500">No promotion codes yet.</p>
        ) : (
          <>
          <ul className="space-y-2 md:hidden">
            {promoCodes.map((promo) => (
              <li key={promo.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-900">{promo.code}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      promo.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {promo.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{promo.label ?? promo.couponId}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Redeemed {promo.timesRedeemed}
                  {promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""} · Expires{" "}
                  {formatDate(promo.expiresAt)}
                </p>
                {promo.active ? (
                  <button
                    type="button"
                    onClick={() => void deactivatePromoCode(promo)}
                    className="mt-2 min-h-[40px] w-full rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                  >
                    Deactivate
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Discount</th>
                  <th className="px-3 py-2">Redeemed</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {promoCodes.map((promo) => (
                  <tr key={promo.id}>
                    <td className="px-3 py-2 font-mono font-medium text-slate-900">{promo.code}</td>
                    <td className="px-3 py-2 text-slate-600">{promo.label ?? promo.couponId}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {promo.timesRedeemed}
                      {promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{formatDate(promo.expiresAt)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          promo.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {promo.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {promo.active ? (
                        <button
                          type="button"
                          onClick={() => deactivatePromoCode(promo)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Deactivate
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
          </>
        )}
      </div>
    </div>
  );
}
