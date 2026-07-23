"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminField, adminLabel } from "@/lib/adminStyles";

type PartnerSubscription = {
  status: string;
  planType: string;
  amountCents: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  isManual: boolean;
  isStripe: boolean;
  cancelAtPeriodEnd: boolean;
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

export function BillingSection() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);
  const [paidThroughDate, setPaidThroughDate] = useState("");
  const [amountDollars, setAmountDollars] = useState("100");
  const [memo, setMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  // True when a scheduled-but-not-yet-finalized Stripe cancellation must be
  // force-completed as part of this grant (see openGrant).
  const [forceGrant, setForceGrant] = useState(false);

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
    setAmountDollars(
      partner.subscription ? String(Math.round(partner.subscription.amountCents / 100)) : "100"
    );
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

  return (
    <div className="space-y-4">
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
        <div className="overflow-x-auto rounded-lg border border-slate-200">
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
                // Disable "Grant offline" for any non-cancelled Stripe row, not just
                // an active one — a past_due card sub is still live at Stripe and
                // converting it to offline would orphan it (server enforces this too).
                // Exception: once a cancellation is already scheduled
                // (cancelAtPeriodEnd), the admin has expressed intent to move off
                // Stripe — unlock the button and let openGrant force-finalize it.
                const hasLiveCard =
                  partner.subscription?.isStripe &&
                  partner.subscription.status !== "cancelled" &&
                  !partner.subscription.cancelAtPeriodEnd;
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
      )}

      {activeVenueId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-slate-900">Grant offline access</h3>
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
                <label className={adminLabel}>Amount received (USD)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={adminField}
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                />
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
