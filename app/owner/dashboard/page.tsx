"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";

type Subscription = {
  id: string;
  venueId: string;
  planType: string;
  amountCents: number;
  status: "active" | "past_due" | "cancelled";
  currentPeriodEnd: string | null;
};

const statusStyles: Record<Subscription["status"], string> = {
  active: "bg-emerald-100 text-emerald-700",
  past_due: "bg-amber-100 text-amber-700",
  cancelled: "bg-slate-200 text-slate-600",
};

const statusLabels: Record<Subscription["status"], string> = {
  active: "Active",
  past_due: "Past Due",
  cancelled: "Cancelled",
};

const formatAmount = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—";

const OwnerDashboardPage = () => {
  const router = useRouter();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/owner/billing");
        if (response.status === 401) {
          router.push("/owner/login");
          return;
        }
        const data = (await response.json()) as { ok: boolean; subscriptions?: Subscription[] };
        const active = data.subscriptions?.[0] ?? null;
        if (!active) {
          router.push("/owner/billing/setup");
          return;
        }
        setSubscription(active);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/owner/auth/logout", { method: "POST" });
    router.push("/owner/login");
  };

  return (
    <OwnerShell title="Owner Dashboard" maxWidth="lg">
      {loading ? (
        <p className="text-center text-sm text-slate-500">Loading…</p>
      ) : subscription ? (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Subscription</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[subscription.status]}`}>
                {statusLabels[subscription.status]}
              </span>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Plan</dt>
                <dd className="font-medium text-slate-900 capitalize">{subscription.planType}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Amount</dt>
                <dd className="font-medium text-slate-900">{formatAmount(subscription.amountCents)} / mo</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">
                  {subscription.status === "cancelled" ? "Access ends" : "Next billing date"}
                </dt>
                <dd className="font-medium text-slate-900">{formatDate(subscription.currentPeriodEnd)}</dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/owner/billing"
              className="rounded-xl border border-slate-200 p-4 text-center text-sm font-semibold text-indigo-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50"
            >
              Manage Billing & Invoices
            </Link>
            <a
              href="mailto:support@hightopchallenge.com"
              className="rounded-xl border border-slate-200 p-4 text-center text-sm font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              Contact Support
            </a>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full text-center text-sm text-slate-400 hover:text-slate-600"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </OwnerShell>
  );
};

export default OwnerDashboardPage;
