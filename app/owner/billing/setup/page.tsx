"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { marketingHref } from "@/lib/domainSplit";
import { OWNER_AUTH_NO_VENUE, ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";
import { isSelfServeSignupEnabled } from "@/lib/selfServeSignup";

type BillingResponse = {
  ok: boolean;
  venueIds?: string[];
  subscriptions?: Array<{ venueId: string; status: string; cancelAtPeriodEnd: boolean }>;
  error?: string;
};

const OwnerBillingSetupPage = () => {
  const router = useRouter();
  const [venueId, setVenueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  // docs/abandoned-signup-cleanup-plan.md Phase 3: "Cancel and start over" is
  // shown only when NOTHING has ever been billed for this venue. load() already
  // routes every live/scheduled-to-cancel owner away before render, so reaching
  // the priced card almost implies this — `hasSubscription` is the belt to that
  // braces, and it is what keeps the control away from a cancelled subscriber
  // whose row (deliberately kept — CLAUDE.md) is the proof they once paid.
  const [hasSubscription, setHasSubscription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A SEPARATE error slot, not the page-level `error` above. The page renders
  // `error` as an exclusive branch that REPLACES the priced card, so routing a
  // failed cancel through it would take the Subscribe button away from a partner
  // whose only problem is that they cannot cancel — a new dead end, in the plan
  // that exists to remove them. This one renders inside the card.
  const [abandonError, setAbandonError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/owner/billing");
      if (response.status === 401) {
        // Phase 3.1. A 401 here is TWO different situations, and until
        // lib/ownerAuthCodes.ts they were indistinguishable: "you are not signed
        // in" (→ login) and "you are signed in, but this account holds no venue"
        // (→ the signup flow). The second is what a purged pending signup looks
        // like from the browser, and sending it to /owner/login offered a
        // sign-in page for an account that no longer exists — the exact dead end
        // this plan exists to remove.
        const body = (await response.json().catch(() => ({}))) as { code?: string };
        router.push(ownerAuthRecoveryPath(body.code));
        return;
      }
      const data = (await response.json()) as BillingResponse;
      if (!data.ok) {
        setError("Could not load your account.");
        return;
      }
      const isLive = (s: { status: string }) => s.status === "active" || s.status === "past_due";
      const activeNotScheduled = data.subscriptions?.find((s) => s.status === "active" && !s.cancelAtPeriodEnd);
      if (activeNotScheduled) {
        router.push("/owner/dashboard");
        return;
      }
      const liveNeedsAction = data.subscriptions?.find((s) => isLive(s) && (s.cancelAtPeriodEnd || s.status === "past_due"));
      if (liveNeedsAction) {
        router.push("/owner/billing");
        return;
      }
      const firstVenue = data.subscriptions?.[0]?.venueId ?? data.venueIds?.[0] ?? null;
      if (!firstVenue) {
        // Unreachable today — requireOwnerAuth 401s an owner with no live venue
        // rather than returning an empty list, which is precisely why the card
        // that used to render here was dead code. Kept as a REDIRECT rather than
        // a UI branch so there is one answer to "signed in, no venue" instead of
        // two, and so this cannot silently become an unreachable screen again.
        router.push(ownerAuthRecoveryPath(OWNER_AUTH_NO_VENUE));
        return;
      }
      setVenueId(firstVenue);
      setHasSubscription((data.subscriptions?.length ?? 0) > 0);
    } catch {
      setError("Something went wrong loading your account.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  // Checkout is an out-of-scope navigation, and bfcache can restore this page in
  // its pre-redirect state — including the disabled "Redirecting to payment…"
  // button, which would otherwise be a dead end with no reload affordance in an
  // installed app. Re-read the webhook-driven truth on return; if it now shows a
  // live subscription, load() routes onward on its own.
  //
  // `paying` is cleared ONLY on a genuine bfcache restore (`pageshow` with
  // `persisted`), never on a bare visibility gain. A visibility gain also happens
  // while the Checkout redirect is still in flight — an app switch, a notification
  // shade, iOS re-showing the page for a beat before the sheet takes over — and
  // re-enabling the button there lets a second tap open a second Checkout session.
  // `pageshow` is filtered for the same reason it is filtered on /owner/billing:
  // unfiltered, it also fires on ordinary initial load and duplicates the mount load().
  useEffect(() => {
    const reconcile = () => {
      if (document.visibilityState !== "visible") return;
      void load();
    };
    const reconcileOnRestore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setPaying(false);
      void load();
    };
    document.addEventListener("visibilitychange", reconcile);
    window.addEventListener("pageshow", reconcileOnRestore);
    return () => {
      document.removeEventListener("visibilitychange", reconcile);
      window.removeEventListener("pageshow", reconcileOnRestore);
    };
  }, [load]);

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

  /**
   * "Cancel and start over" — docs/abandoned-signup-cleanup-plan.md Phase 3.
   *
   * The partner is on the priced card, has entered no card, and wants out. This
   * erases the signup NOW rather than leaving it for the sweep. The server route
   * re-verifies that this owner really is an unpaid, never-finished signup and
   * refuses (409) if it is not, so this control can never destroy a real account
   * even if it is rendered somewhere it should not be.
   *
   * On success the owner session cookie is cleared by the response, so the only
   * correct destination is a full navigation OFF the /owner/* app — a client-side
   * router.push would leave this page mounted holding state for rows that no
   * longer exist. `/info` is the home page, never `/` (CLAUDE.md).
   */
  const handleAbandon = async () => {
    if (
      !window.confirm("This deletes what you entered. You'll start from the beginning.")
    ) {
      return;
    }
    setAbandoning(true);
    setAbandonError(null);
    try {
      const response = await fetch("/api/owner/signup/abandon", { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setAbandonError(data.error ?? "Could not cancel this signup. Please try again.");
        setAbandoning(false);
        return;
      }
      window.location.href = marketingHref("/info");
    } catch {
      setAbandonError("Network error. Please try again.");
      setAbandoning(false);
    }
  };

  // Rendered only for a signup that could BE a pending one: the self-serve flow
  // exists (the abandon route 404s otherwise), a venue is on screen, and nothing
  // has ever been billed for it. The server decides for real — this is only about
  // not offering "cancel" to an admin-activated partner who has nothing to cancel.
  const canAbandon = isSelfServeSignupEnabled() && Boolean(venueId) && !hasSubscription;

  return (
    <OwnerShell
      title="Set Up Your Subscription"
      subtitle="Unlock the app for your venue"
      maxWidth="lg"
      variant="dark"
      backTo={{ href: "/owner/dashboard", label: "Dashboard", preferHref: true }}
      showAccountMenu
    >
      <div className="space-y-5">
        {loading ? (
          <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
        ) : error ? (
          <div className="rounded-xl bg-ht-rose-500/15 px-4 py-3 text-sm font-bold text-ht-rose-300">{error}</div>
        ) : !venueId ? (
          // load() has already redirected; this only covers the frame before the
          // router navigates. Phase 2d rendered a "Start over" card here, which
          // was unreachable — see the redirect in load().
          <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
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
            {canAbandon ? (
              <button
                type="button"
                onClick={handleAbandon}
                disabled={paying || abandoning}
                className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-ht-hairline px-4 text-sm font-bold text-ht-muted transition active:translate-y-px disabled:opacity-60"
              >
                {abandoning ? "Cancelling…" : "Cancel and start over"}
              </button>
            ) : null}
            {abandonError ? (
              <p className="mt-3 text-center text-sm font-bold text-ht-rose-300">{abandonError}</p>
            ) : null}
          </div>
        )}
      </div>
    </OwnerShell>
  );
};

export default OwnerBillingSetupPage;
