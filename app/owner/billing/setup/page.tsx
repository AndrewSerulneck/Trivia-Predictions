"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell, ownerPrimaryButtonClass } from "@/components/owner/OwnerShell";

const SUBSCRIPTION_AMOUNT_CENTS = 14000; // $140.00 / month

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
      const response = await fetch("/api/owner/billing/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          intent: "subscribe",
          amountCents: SUBSCRIPTION_AMOUNT_CENTS,
        }),
      });
      const data = (await response.json()) as { ok: boolean; sessionUrl?: string; error?: string };
      if (!data.ok || !data.sessionUrl) {
        setError(data.error ?? "Could not start payment session. Please try again.");
        setPaying(false);
        return;
      }
      // Redirect to SlimCD's hosted payment page
      window.location.href = data.sessionUrl;
    } catch {
      setError("Network error. Please try again.");
      setPaying(false);
    }
  };

  return (
    <OwnerShell title="Set Up Your Subscription" subtitle="$140.00 / month">
      {loading ? (
        <p className="text-center text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="text-sm font-medium text-rose-600">{error}</p>
      ) : !venueId ? (
        <p className="text-sm text-slate-600">
          We couldn&apos;t find a venue linked to your account. Please contact support.
        </p>
      ) : (
        <>
          <div className="mb-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Hightop Challenge Subscription</span>
              <span className="font-semibold text-slate-900">$140.00 / mo</span>
            </div>
          </div>
          <p className="mb-5 text-sm text-slate-500">
            Clicking the button below will take you to a secure payment page to enter your card details.
          </p>
          <button
            type="button"
            onClick={handlePay}
            disabled={paying}
            className={`${ownerPrimaryButtonClass} w-full disabled:opacity-60`}
          >
            {paying ? "Redirecting to payment…" : "Subscribe — $140.00/mo"}
          </button>
        </>
      )}
    </OwnerShell>
  );
};

export default OwnerBillingSetupPage;
