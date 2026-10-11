"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  interpretAddVenueReply,
  interpretQuoteReply,
  isStripeHostedUrl,
  newAttemptKey,
  type AddVenueQuoteResult,
} from "@/lib/addVenueFlow";
import {
  breakdownLabel,
  changeDoneMessage,
  formatLeaveDate,
  interpretVenueChangeReply,
  removeConfirmText,
  venueAction,
} from "@/lib/billAccountView";
import { formatCents } from "@/lib/merchPricing";
import type { BillAccount, BillAccountVenue } from "@/lib/multiVenueBilling";

/**
 * The Billing page's "Venues on this bill" card (docs/multi-venue-volume-billing-plan.md §4.5,
 * Phase 5): every venue on the bill with Remove (end of month) / Undo / Add back, the band line
 * "1 × $100 · 3 × $75" and the next renewal's total. Every number comes from the server; this
 * component prices nothing. Rendered only when `GET /api/owner/billing` returns `account` (the
 * multi-venue billing flag is on).
 */

type Props = {
  account: BillAccount;
  /** A venue on this bill — the anchor — so the add quote / add pick this bill. */
  billVenueId: string;
  bill: { isManual: boolean; cancelAtPeriodEnd: boolean; status: string };
  /** The paid period's end (ISO) — when a venue removed now would leave. */
  periodEnd: string | null;
  /** Re-read the page after a change. */
  onChanged: (message: string) => Promise<void> | void;
};

const stateLabel = (venue: BillAccountVenue): string | null => {
  if (venue.state === "leaving") {
    const until = formatLeaveDate(venue.removeAt);
    return until ? `Leaving ${until}` : "Leaving at the end of this month";
  }
  if (venue.state === "removed") return "Not on your bill";
  return null;
};

const actionButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-black transition active:translate-y-px disabled:opacity-50";

/** Re-asks of one Add back while Stripe confirms the payment. */
const MAX_AUTO_CHECKS = 6;

type AddBackState =
  | { phase: "quoting" }
  | { phase: "quoted"; quote: AddVenueQuoteResult }
  | { phase: "paying" }
  | { phase: "waiting"; message: string; hostedInvoiceUrl: string | null };

const AddBackPanel = ({
  venue,
  billVenueId,
  onDone,
  onClose,
}: {
  venue: BillAccountVenue;
  billVenueId: string;
  onDone: (message: string) => void;
  onClose: () => void;
}) => {
  const [state, setState] = useState<AddBackState>({ phase: "quoting" });
  const [error, setError] = useState<string | null>(null);
  // One key per Confirm; every re-ask of that attempt re-sends it (never a second charge).
  const keyRef = useRef<string | null>(null);
  const checksRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The auto re-ask calls the latest `send` through this ref (a callback can't name itself).
  const resendRef = useRef<() => void>(() => undefined);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/owner/venues/add/quote?venueId=${encodeURIComponent(billVenueId)}`);
        const body: unknown = await response.json().catch(() => null);
        if (!cancelled) setState({ phase: "quoted", quote: interpretQuoteReply(response.status, body) });
      } catch {
        if (!cancelled) setState({ phase: "quoted", quote: interpretQuoteReply(503, null) });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [billVenueId]);

  const send = useCallback(
    async (prorationDate: number | null) => {
      const key = keyRef.current ?? newAttemptKey();
      keyRef.current = key;
      setError(null);
      setState({ phase: "paying" });
      let status = 503;
      let body: unknown = null;
      try {
        const response = await fetch("/api/owner/venues/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: key,
            venueId: billVenueId,
            readdVenueId: venue.id,
            ...(prorationDate !== null ? { prorationDate } : {}),
          }),
        });
        status = response.status;
        body = await response.json().catch(() => null);
      } catch {
        body = null;
      }
      const outcome = interpretAddVenueReply(status, body);
      if (outcome.kind === "paid") {
        keyRef.current = null;
        onDone(`${venue.name} is back on your bill and live for players.`);
        return;
      }
      if (outcome.kind === "requires_action") {
        setState({
          phase: "waiting",
          message: "Your bank wants to confirm this payment. Finish it on Stripe's secure page, then check again.",
          hostedInvoiceUrl: outcome.hostedInvoiceUrl,
        });
        return;
      }
      if (outcome.kind === "processing") {
        if (checksRef.current < MAX_AUTO_CHECKS) {
          checksRef.current += 1;
          timerRef.current = setTimeout(() => resendRef.current(), 5000);
          setState({ phase: "paying" });
          return;
        }
        setState({ phase: "waiting", message: "We're still confirming the payment.", hostedInvoiceUrl: null });
        return;
      }
      if (outcome.kind === "unconfirmed") {
        setState({ phase: "waiting", message: outcome.message, hostedInvoiceUrl: null });
        return;
      }
      // A definitive refusal: nothing was charged; the next press is a new attempt.
      keyRef.current = null;
      setError(outcome.message);
      setState({ phase: "quoted", quote: { ok: false, code: outcome.code, message: outcome.message, link: outcome.link, hostedInvoiceUrl: outcome.hostedInvoiceUrl } });
    },
    [billVenueId, venue.id, venue.name, onDone]
  );

  useEffect(() => {
    resendRef.current = () => void send(null);
  }, [send]);

  const checkAgain = () => {
    checksRef.current = 0;
    void send(null);
  };

  return (
    <div className="mt-3 rounded-xl border border-ht-hairline bg-ht-elevated p-4">
      <p className="text-sm font-black text-ht-primary">Add {venue.name} back</p>
      {state.phase === "quoting" ? (
        <p className="mt-2 text-sm font-semibold text-ht-muted">Checking the price…</p>
      ) : state.phase === "paying" ? (
        <p className="mt-2 text-sm font-semibold text-ht-muted">Confirming the payment…</p>
      ) : state.phase === "waiting" ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm font-semibold text-ht-secondary">{state.message}</p>
          {isStripeHostedUrl(state.hostedInvoiceUrl) ? (
            <a
              href={state.hostedInvoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ht-cyan-500 px-3 text-sm font-black text-slate-950"
            >
              Open Stripe&apos;s secure page
            </a>
          ) : null}
          <button type="button" onClick={checkAgain} className={`${actionButtonClass} bg-ht-surface text-ht-cyan-300`}>
            Check again
          </button>
        </div>
      ) : state.quote.ok ? (
        <div className="mt-2 space-y-3">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ht-muted">Venue number {state.quote.quote.venueNumber}</dt>
              <dd className="font-bold text-ht-primary">{formatCents(state.quote.quote.thisVenueCents)}/mo</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ht-muted">New monthly total</dt>
              <dd className="font-bold text-ht-primary">{formatCents(state.quote.quote.newMonthlyTotalCents)}/mo</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ht-muted">Charged today (rest of this month)</dt>
              <dd className="font-bold text-ht-primary">{formatCents(state.quote.quote.dueTodayCents)}</dd>
            </div>
          </dl>
          {error ? <p className="text-sm font-bold text-ht-rose-300">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => state.quote.ok && void send(state.quote.quote.prorationDate)}
              className={`${actionButtonClass} bg-ht-cyan-500 text-slate-950 shadow-ht-glow-cyan`}
            >
              Add back — pay {formatCents(state.quote.quote.dueTodayCents)} now
            </button>
            <button type="button" onClick={onClose} className={`${actionButtonClass} text-ht-muted`}>
              Not now
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm font-bold text-ht-rose-300">{state.quote.message}</p>
          <button type="button" onClick={onClose} className={`${actionButtonClass} text-ht-muted`}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export const BillVenuesPanel = ({ account, billVenueId, bill, periodEnd, onChanged }: Props) => {
  const [busyVenueId, setBusyVenueId] = useState<string | null>(null);
  const [addBackVenueId, setAddBackVenueId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const change = async (venue: BillAccountVenue, action: "remove" | "undo") => {
    if (action === "remove" && !window.confirm(removeConfirmText(venue.name, periodEnd))) return;
    setBusyVenueId(venue.id);
    setError(null);
    let status = 503;
    let body: unknown = null;
    try {
      const response = await fetch("/api/owner/venues/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId: venue.id, action, idempotencyKey: newAttemptKey() }),
      });
      status = response.status;
      body = await response.json().catch(() => null);
    } catch {
      body = null;
    }
    const reply = interpretVenueChangeReply(status, body);
    setBusyVenueId(null);
    if (reply.kind === "done") {
      await onChanged(changeDoneMessage(venue.name, reply.change));
      return;
    }
    setError(reply.message);
  };

  return (
    <div>
      <p className="mb-2 text-caption font-black uppercase tracking-wider text-ht-muted">Venues on this bill</p>
      <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-ht-secondary">{breakdownLabel(account)}</span>
          <span className="text-sm font-black text-ht-primary">
            {formatCents(account.nextMonthlyTotalCents)}/mo
            {account.nextMonthlyTotalCents !== account.nextMonthlyListCents ? (
              <span className="ml-2 font-bold text-ht-muted line-through">{formatCents(account.nextMonthlyListCents)}</span>
            ) : null}
          </span>
        </div>
        <p className="mt-1 text-caption font-semibold text-ht-muted">
          {account.billedVenueCount === 1 ? "1 venue" : `${account.billedVenueCount} venues`} on your next bill
        </p>
        {error ? <p className="mt-3 rounded-xl bg-ht-rose-500/15 px-3 py-2 text-sm font-bold text-ht-rose-300">{error}</p> : null}
        <ul className="mt-3">
          {account.venues.map((venue, index) => {
            const action = venueAction(venue, account, bill);
            const label = stateLabel(venue);
            return (
              <li key={venue.id} className={`py-3 ${index > 0 ? "border-t border-ht-hairline" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-bold ${venue.state === "removed" ? "text-ht-muted" : "text-ht-primary"}`}>
                      {venue.name}
                    </p>
                    {label ? (
                      <p className={`text-caption font-bold ${venue.state === "leaving" ? "text-ht-amber-300" : "text-ht-muted"}`}>{label}</p>
                    ) : null}
                  </div>
                  {action === "remove" ? (
                    <button
                      type="button"
                      disabled={busyVenueId !== null}
                      onClick={() => void change(venue, "remove")}
                      className={`${actionButtonClass} text-ht-rose-400 hover:text-ht-rose-300`}
                    >
                      {busyVenueId === venue.id ? "Removing…" : "Remove"}
                    </button>
                  ) : action === "undo" ? (
                    <button
                      type="button"
                      disabled={busyVenueId !== null}
                      onClick={() => void change(venue, "undo")}
                      className={`${actionButtonClass} bg-ht-elevated text-ht-cyan-300`}
                    >
                      {busyVenueId === venue.id ? "Undoing…" : "Undo"}
                    </button>
                  ) : action === "add_back" && addBackVenueId !== venue.id ? (
                    <button
                      type="button"
                      disabled={busyVenueId !== null || addBackVenueId !== null}
                      onClick={() => setAddBackVenueId(venue.id)}
                      className={`${actionButtonClass} bg-ht-elevated text-ht-cyan-300`}
                    >
                      Add back
                    </button>
                  ) : null}
                </div>
                {addBackVenueId === venue.id ? (
                  <AddBackPanel
                    venue={venue}
                    billVenueId={billVenueId}
                    onClose={() => setAddBackVenueId(null)}
                    onDone={(message) => {
                      setAddBackVenueId(null);
                      void onChanged(message);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        {account.billedVenueCount === 1 && !bill.isManual ? (
          <p className="mt-1 text-caption font-semibold text-ht-muted">
            Your only venue can&apos;t be removed — cancel your subscription below to stop paying.
          </p>
        ) : null}
      </div>
    </div>
  );
};
