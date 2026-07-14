"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";

type Subscription = {
  id: string;
  venueId: string;
  planType: string;
  amountCents: number;
  status: "active" | "past_due" | "cancelled";
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
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
  paid: "text-ht-emerald-300",
  failed: "text-ht-rose-300",
  pending: "text-ht-amber-300",
};

const subStatus: Record<Subscription["status"], { tone: string; dot: string; label: string }> = {
  active: { tone: "bg-ht-emerald-500/15 text-ht-emerald-300", dot: "bg-ht-emerald-400", label: "Active" },
  past_due: { tone: "bg-ht-rose-500/15 text-ht-rose-300", dot: "bg-ht-rose-400", label: "Payment due" },
  cancelled: { tone: "bg-ht-elevated text-ht-muted", dot: "bg-slate-500", label: "Cancelled" },
};

const displayStatus = (subscription: Subscription): Subscription["status"] =>
  subscription.cancelAtPeriodEnd ? "cancelled" : subscription.status;

function bannerFromParams(
  success: string | null,
  error: string | null
): { text: string; kind: "success" | "error" | "warn" } | null {
  if (success === "subscribed") return { text: "Subscription activated. Welcome aboard!", kind: "success" };
  if (success === "card-updated") return { text: "Payment method updated successfully.", kind: "success" };
  if (error === "payment-declined") return { text: "Payment was declined. Please try a different card.", kind: "error" };
  if (error === "incomplete") return { text: "Payment was not completed. Please try again.", kind: "error" };
  if (error === "db&payment=ok")
    return { text: "Payment was received but there was an issue saving your subscription. Please contact support.", kind: "warn" };
  if (error) return { text: "Something went wrong with your payment. Please try again or contact support.", kind: "error" };
  return null;
}

const bannerStyles = {
  success: "bg-ht-emerald-500/15 text-ht-emerald-300",
  error: "bg-ht-rose-500/15 text-ht-rose-300",
  warn: "bg-ht-amber-500/15 text-ht-amber-300",
};

const cardLabelClass = "text-[11px] font-black uppercase tracking-wider text-ht-muted";

const ExitPill = () => (
  <Link
    href="/owner/dashboard"
    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ht-exit-border bg-gradient-to-br from-ht-exit-from via-ht-exit-via to-ht-exit-to px-4 text-sm font-black text-ht-exit-text"
  >
    ← Dashboard
  </Link>
);

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
      const response = await fetch("/api/owner/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: subscription.venueId }),
      });
      const data = (await response.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) {
        setActionMessage(data.error ?? "Could not open billing portal. Please try again.");
        setUpdatingCard(false);
        return;
      }
      window.location.href = data.url;
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
    setActionMessage("Subscription will cancel at the end of your billing period.");
    // Reflect it immediately — don't make the owner wait on a webhook round-trip
    // (or a manual page refresh) to see the cancellation took effect.
    setSubscription((prev) => (prev ? { ...prev, cancelAtPeriodEnd: true } : prev));
    await refresh();
  };

  return (
    <OwnerShell title="Billing" subtitle="Subscription, payment & invoices" maxWidth="lg" variant="dark">
      {loading ? (
        <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
      ) : !subscription ? (
        <div className="space-y-5">
          <ExitPill />
          {banner ? (
            <div className={`rounded-xl px-4 py-3 text-sm font-bold ${bannerStyles[banner.kind]}`}>{banner.text}</div>
          ) : null}
          <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ht-game-billing text-2xl">
              💳
            </div>
            <p className="ht-h2 mt-4">No subscription yet</p>
            <p className="mt-2 text-sm font-semibold text-ht-muted">
              Subscribe to unlock the geofenced app for your venue and let your guests play.
            </p>
            <Link
              href="/owner/billing/setup"
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-ht-cyan-500 px-4 font-black text-slate-950 shadow-ht-glow-cyan transition active:translate-y-px"
            >
              Set up subscription
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ExitPill />

          {banner ? (
            <div className={`rounded-xl px-4 py-3 text-sm font-bold ${bannerStyles[banner.kind]}`}>{banner.text}</div>
          ) : actionMessage ? (
            <div className="rounded-xl bg-ht-cyan-500/15 px-4 py-3 text-sm font-bold text-ht-cyan-300">{actionMessage}</div>
          ) : null}

          {/* Subscription card — indigo glow */}
          <div className="relative overflow-hidden rounded-2xl border border-indigo-400/40 bg-ht-surface p-5 shadow-ht-card">
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-ht-game-billing opacity-20 blur-2xl" />
            <div className="relative">
              <div className="mb-2 flex items-start justify-between">
                <span className="text-[22px] font-black uppercase tracking-wider text-ht-indigo-300">
                  {subscription.planType}
                </span>
                <div className="flex flex-col items-end gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[21px] font-black uppercase tracking-wider ${subStatus[displayStatus(subscription)].tone}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${subStatus[displayStatus(subscription)].dot}`} />
                    {subStatus[displayStatus(subscription)].label}
                  </span>
                  {subscription.status === "cancelled" || subscription.cancelAtPeriodEnd ? (
                    <Link
                      href="/owner/billing/setup"
                      className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ht-cyan-500 px-3 py-1 text-[24px] font-black text-slate-950 shadow-ht-glow-cyan transition active:translate-y-px"
                    >
                      Resubscribe
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="font-black text-ht-primary">
                <span className="text-4xl">{`$${Math.round(subscription.amountCents / 100)}`}</span>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ht-muted">
                    {subscription.status === "cancelled" || subscription.cancelAtPeriodEnd
                      ? "Access ends"
                      : "Next billing date"}
                  </dt>
                  <dd className="font-bold text-ht-primary">{formatDate(subscription.currentPeriodEnd)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ht-muted">Billing cycle</dt>
                  <dd className="font-bold text-ht-primary">Monthly Subscription</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <p className={`${cardLabelClass} mb-2`}>Payment method</p>
            <div className="flex items-center gap-3 rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card">
              <div className="h-8 w-12 shrink-0 rounded-md bg-ht-elevated" />
              <span className="flex-1 text-sm font-bold text-ht-secondary">
                {subscription.hasPaymentMethod ? "Card on file" : "No card on file"}
              </span>
              <button
                type="button"
                onClick={handleUpdateCard}
                disabled={updatingCard}
                className="text-sm font-black text-ht-cyan-300 transition hover:text-ht-cyan-200 disabled:opacity-50"
              >
                {updatingCard ? "Opening…" : "Update"}
              </button>
            </div>
          </div>

          {/* Invoices */}
          <div>
            <p className={`${cardLabelClass} mb-2`}>Invoices</p>
            <div className="rounded-2xl border border-ht-hairline bg-ht-surface px-4 shadow-ht-card">
              {invoices.length === 0 ? (
                <p className="py-5 text-center text-sm font-semibold text-ht-muted">No invoices yet.</p>
              ) : (
                invoices.map((invoice, i) => (
                  <div
                    key={invoice.id}
                    className={`flex items-center justify-between py-3 ${i > 0 ? "border-t border-ht-hairline" : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-ht-primary">{formatDate(invoice.chargedAt)}</div>
                      <div className="truncate text-xs font-semibold text-ht-muted">{invoice.description}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-sm font-bold text-ht-primary">
                        {formatAmount(invoice.amountCents)}
                      </span>
                      <span className={`text-xs font-black capitalize ${invoiceStatusStyles[invoice.status]}`}>
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {subscription.status !== "cancelled" && !subscription.cancelAtPeriodEnd ? (
            <button
              type="button"
              onClick={handleCancel}
              className="w-full py-2 text-center text-sm font-black text-ht-rose-400 transition hover:text-ht-rose-300"
            >
              Cancel subscription
            </button>
          ) : subscription.cancelAtPeriodEnd ? (
            <p className="text-center text-sm font-semibold text-ht-muted">
              You'll keep access until {formatDate(subscription.currentPeriodEnd)}.
            </p>
          ) : null}
        </div>
      )}
    </OwnerShell>
  );
};

export default OwnerBillingPage;
