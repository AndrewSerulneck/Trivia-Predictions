"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { OwnerShell, ownerPrimaryButtonClass } from "@/components/owner/OwnerShell";

type Subscription = {
  id: string;
  venueId: string;
  planType: string;
  amountCents: number;
  status: "active" | "past_due" | "cancelled";
  currentPeriodEnd: string | null;
  hasPaymentMethod: boolean;
};

type Invoice = {
  id: string;
  description: string;
  amountCents: number;
  status: "paid" | "failed" | "pending";
  chargedAt: string;
};

const formatAmount = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

const invoiceStatusStyles: Record<Invoice["status"], string> = {
  paid: "text-emerald-600",
  failed: "text-rose-600",
  pending: "text-amber-600",
};

function bannerFromParams(
  success: string | null,
  error: string | null
): { text: string; kind: "success" | "error" | "warn" } | null {
  if (success === "subscribed") return { text: "Subscription activated. Welcome aboard!", kind: "success" };
  if (success === "card-updated") return { text: "Payment method updated successfully.", kind: "success" };
  if (success === "subscribed" && error === "invoice=pending")
    return { text: "Payment received. Invoice is being recorded — check back shortly.", kind: "warn" };
  if (error === "payment-declined") return { text: "Payment was declined. Please try a different card.", kind: "error" };
  if (error === "incomplete") return { text: "Payment was not completed. Please try again.", kind: "error" };
  if (error === "db&payment=ok")
    return { text: "Payment was received but there was an issue saving your subscription. Please contact support.", kind: "warn" };
  if (error) return { text: "Something went wrong with your payment. Please try again or contact support.", kind: "error" };
  return null;
}

const bannerStyles = {
  success: "bg-emerald-50 text-emerald-800",
  error: "bg-rose-50 text-rose-800",
  warn: "bg-amber-50 text-amber-800",
};

const OwnerBillingPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const banner = bannerFromParams(searchParams.get("success"), searchParams.get("error"));

  const refresh = useCallback(async () => {
    const response = await fetch("/api/owner/billing");
    if (response.status === 401) {
      router.push("/owner/login");
      return;
    }
    const data = (await response.json()) as { ok: boolean; subscriptions?: Subscription[]; invoices?: Invoice[] };
    setSubscription(data.subscriptions?.[0] ?? null);
    setInvoices(data.invoices ?? []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch("/api/owner/billing");
      if (cancelled) return;
      if (response.status === 401) { router.push("/owner/login"); return; }
      const data = (await response.json()) as { ok: boolean; subscriptions?: Subscription[]; invoices?: Invoice[] };
      if (cancelled) return;
      setSubscription(data.subscriptions?.[0] ?? null);
      setInvoices(data.invoices ?? []);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [router]);

  const handleUpdateCard = async () => {
    if (!subscription) return;
    setUpdatingCard(true);
    setActionMessage(null);
    try {
      const response = await fetch("/api/owner/billing/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: subscription.venueId, intent: "update_card" }),
      });
      const data = (await response.json()) as { ok: boolean; sessionUrl?: string; error?: string };
      if (!data.ok || !data.sessionUrl) {
        setActionMessage(data.error ?? "Could not start card update. Please try again.");
        setUpdatingCard(false);
        return;
      }
      window.location.href = data.sessionUrl;
    } catch {
      setActionMessage("Network error. Please try again.");
      setUpdatingCard(false);
    }
  };

  const handleCancel = async () => {
    if (!subscription) return;
    if (!window.confirm("Cancel your subscription? You'll keep access until the end of your current billing period, but won't be charged again.")) return;
    const response = await fetch("/api/owner/billing/subscription", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venueId: subscription.venueId }),
    });
    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!response.ok || !data.ok) {
      setActionMessage(data.error ?? "Failed to cancel.");
      return;
    }
    setActionMessage("Subscription cancelled.");
    await refresh();
  };

  return (
    <OwnerShell title="Billing" maxWidth="lg">
      {loading ? (
        <p className="text-center text-sm text-slate-500">Loading…</p>
      ) : !subscription ? (
        <div className="space-y-4">
          {banner ? (
            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${bannerStyles[banner.kind]}`}>
              {banner.text}
            </div>
          ) : null}
          <div className="space-y-4 text-center">
            <p className="text-sm text-slate-600">You don&apos;t have a subscription yet.</p>
            <Link href="/owner/billing/setup" className={ownerPrimaryButtonClass}>
              Set Up Subscription
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Return-URL banner (success/error from SlimCD redirect) */}
          {banner ? (
            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${bannerStyles[banner.kind]}`}>
              {banner.text}
            </div>
          ) : actionMessage ? (
            <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
              {actionMessage}
            </div>
          ) : null}

          {/* Current Plan */}
          <section className="rounded-xl border border-slate-200 p-5">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Current Plan</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Plan</dt>
                <dd className="font-medium capitalize text-slate-900">{subscription.planType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Amount</dt>
                <dd className="font-medium text-slate-900">{formatAmount(subscription.amountCents)} / mo</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-medium capitalize text-slate-900">{subscription.status.replace("_", " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">
                  {subscription.status === "cancelled" ? "Access ends" : "Next billing date"}
                </dt>
                <dd className="font-medium text-slate-900">{formatDate(subscription.currentPeriodEnd)}</dd>
              </div>
            </dl>
          </section>

          {/* Payment Method */}
          <section className="rounded-xl border border-slate-200 p-5">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Payment Method</h2>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">
                {subscription.hasPaymentMethod ? "Card on file" : "No card on file"}
              </span>
              <button
                type="button"
                onClick={handleUpdateCard}
                disabled={updatingCard}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                {updatingCard ? "Redirecting…" : "Update Card"}
              </button>
            </div>
          </section>

          {/* Invoice History */}
          <section className="rounded-xl border border-slate-200 p-5">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Invoice History</h2>
            {invoices.length === 0 ? (
              <p className="text-sm text-slate-500">No invoices yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2 text-right">Amount</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-slate-100">
                      <td className="py-2 text-slate-600">{formatDate(invoice.chargedAt)}</td>
                      <td className="py-2 text-slate-900">{invoice.description}</td>
                      <td className="py-2 text-right font-medium text-slate-900">{formatAmount(invoice.amountCents)}</td>
                      <td className={`py-2 text-right font-semibold capitalize ${invoiceStatusStyles[invoice.status]}`}>
                        {invoice.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="flex items-center justify-between">
            <Link href="/owner/dashboard" className="text-sm text-slate-500 hover:text-slate-700">
              ← Back to dashboard
            </Link>
            {subscription.status !== "cancelled" ? (
              <button type="button" onClick={handleCancel} className="text-sm font-semibold text-rose-600 hover:text-rose-800">
                Cancel Subscription
              </button>
            ) : null}
          </div>
        </div>
      )}
    </OwnerShell>
  );
};

export default OwnerBillingPage;
