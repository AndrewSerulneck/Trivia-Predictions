"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";

type BillingResponse = {
  ok: boolean;
  venueIds?: string[];
  subscriptions?: Array<{ venueId: string; status: string }>;
  error?: string;
};

const OwnerBillingSetupPage = () => {
  const router = useRouter();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/owner/billing");
        if (response.status === 401) {
          router.push("/owner/login");
          return;
        }
        const data = (await response.json()) as BillingResponse;
        if (!data.ok) {
          setError("Could not load your account.");
          return;
        }
        const active = data.subscriptions?.find((s) => s.status === "active");
        if (active) {
          router.push("/owner/dashboard");
          return;
        }
        const firstVenue = data.subscriptions?.[0]?.venueId ?? data.venueIds?.[0] ?? null;
        setVenueId(firstVenue);
      } catch {
        setError("Something went wrong loading your account.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const handlePay = async () => {
    if (!venueId) return;
    setPaying(true);
    setError(null);
    try {
      const response = await fetch("/api/owner/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId }),
      });
      const data = (await response.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) {
        setError(data.error ?? "Could not start payment session. Please try again.");
        setPaying(false);
        return;
      }
      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch {
      setError("Network error. Please try again.");
      setPaying(false);
    }
  };

  return (
    <OwnerShell title="Set Up Your Subscription" subtitle="Unlock the app for your venue" maxWidth="lg" variant="dark">
      <div className="space-y-5">
        <Link
          href="/owner/dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ht-exit-border bg-gradient-to-br from-ht-exit-from via-ht-exit-via to-ht-exit-to px-4 text-sm font-black text-ht-exit-text"
        >
          ← Dashboard
        </Link>

        {loading ? (
          <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
        ) : error ? (
          <div className="rounded-xl bg-ht-rose-500/15 px-4 py-3 text-sm font-bold text-ht-rose-300">{error}</div>
        ) : !venueId ? (
          <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-6 text-center text-sm font-semibold text-ht-muted shadow-ht-card">
            We couldn&apos;t find a venue linked to your account. Please contact support.
          </div>
        ) : (
          <div className="rounded-2xl border border-indigo-400/40 bg-ht-surface p-6 shadow-ht-card">
            <p className="text-[11px] font-black uppercase tracking-wider text-ht-indigo-300">Venue Pro</p>
            <div className="mt-1 font-black text-ht-primary">
              <span className="text-4xl">$100</span>
              <span className="text-base text-ht-muted"> /mo</span>
            </div>
            <p className="mt-4 text-sm font-semibold text-ht-muted">
              You&apos;ll be taken to Stripe&apos;s secure checkout to enter your card. Cancel anytime.
            </p>
            <button
              type="button"
              onClick={handlePay}
              disabled={paying}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-ht-cyan-500 px-4 font-black text-slate-950 shadow-ht-glow-cyan transition active:translate-y-px disabled:opacity-60"
            >
              {paying ? "Redirecting to payment…" : "Subscribe — $100/mo"}
            </button>
          </div>
        )}
      </div>
    </OwnerShell>
  );
};

export default OwnerBillingSetupPage;
