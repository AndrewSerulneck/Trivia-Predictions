"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { StepHeading } from "@/components/owner/sheet/StepHeading";
import {
  formatPeriodEnd,
  type AddVenueDraft,
  type AddVenueQuoteResult,
  type AddVenueRefusalLink,
} from "@/lib/addVenueFlow";
import type { AddVenueQuote } from "@/lib/multiVenueBilling";
import { formatCents } from "@/lib/merchPricing";

// "Review & pay" — the last screen of Add a venue (docs/multi-venue-volume-billing-plan.md §4.5).
// Presentational only: it shows the answers, the server's quote and where the payment stands. Every
// number comes from the quote (Stripe's own preview for "charged today") — nothing is priced here.

/** The quote for this visit to Review. `loading` until the answer lands. */
export type AddVenueQuoteState =
  | { status: "loading" }
  | { status: "ready"; quote: AddVenueQuote }
  | { status: "error"; result: Extract<AddVenueQuoteResult, { ok: false }> };

/** Where the payment stands after Confirm. `idle` = not pressed yet (or a refusal freed the partner to retry). */
export type AddVenueSubmitState =
  | { status: "idle" }
  | { status: "action"; hostedInvoiceUrl: string | null }
  | { status: "processing"; checks: number }
  | { status: "unconfirmed"; message: string }
  | { status: "refused"; message: string; link: AddVenueRefusalLink; hostedInvoiceUrl: string | null };

/** After this many automatic checks "Confirming…" stops polling and offers a button instead. */
export const MAX_AUTO_CHECKS = 6;

const CARD_CLASS = "rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3";
const LINK_CLASS = "inline-flex min-h-11 items-center font-black text-ht-cyan-300 underline";

const Row = ({ label, value, detail }: { label: string; value: string; detail?: string | null }) => (
  <div className="flex items-start justify-between gap-3 py-3">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-ht-muted">{label}</p>
      {detail ? <p className="mt-0.5 text-footnote font-semibold text-ht-muted">{detail}</p> : null}
    </div>
    <p className="shrink-0 text-right text-base font-black text-ht-primary">{value}</p>
  </div>
);

const Notice = ({ tone, children }: { tone: "info" | "warn"; children: ReactNode }) => (
  <div
    role={tone === "warn" ? "alert" : "status"}
    className={`rounded-xl border px-3 py-3 text-sm font-bold ${
      tone === "warn"
        ? "border-ht-amber-500/30 bg-ht-amber-500/10 text-ht-amber-200"
        : "border-ht-cyan-500/30 bg-ht-cyan-500/10 text-ht-cyan-200"
    }`}
  >
    {children}
  </div>
);

/** The refusal that stopped the add, with the one place that fixes it. Shared by Review and the up-front check. */
export const AddVenueRefusalNotice = ({
  message,
  link,
  hostedInvoiceUrl,
}: {
  message: string;
  link: AddVenueRefusalLink;
  hostedInvoiceUrl: string | null;
}) => (
  <Notice tone="warn">
    <p>{message}</p>
    {link === "billing" ? (
      <p>
        <Link href="/owner/billing" className={LINK_CLASS}>
          Go to Billing
        </Link>
      </p>
    ) : null}
    {hostedInvoiceUrl ? (
      <p>
        <a href={hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          Finish that payment
        </a>
      </p>
    ) : null}
  </Notice>
);

export const AddVenueReviewStep = ({
  draft,
  quote,
  submit,
  onRetryQuote,
}: {
  draft: AddVenueDraft;
  quote: AddVenueQuoteState;
  submit: AddVenueSubmitState;
  onRetryQuote: () => void;
}) => {
  const periodEnd = quote.status === "ready" ? formatPeriodEnd(quote.quote.currentPeriodEnd) : null;

  return (
    <div className="space-y-4">
      <StepHeading hint="One last look. Your card on file is charged now for the rest of this billing period.">
        Review &amp; pay
      </StepHeading>

      <div className={`divide-y divide-ht-hairline ${CARD_CLASS}`}>
        <div className="py-3">
          <p className="text-sm font-semibold text-ht-muted">New venue</p>
          <p className="mt-0.5 text-base font-black text-ht-primary">{draft.venueName.trim()}</p>
          <p className="mt-0.5 text-sm font-semibold text-ht-muted">
            {draft.street.trim()}, {draft.city.trim()}, {draft.state.trim().toUpperCase()} {draft.zipCode.trim()}
          </p>
          <p className="mt-0.5 text-footnote font-semibold text-ht-muted">Players within {draft.radius} m can play.</p>
        </div>
      </div>

      {quote.status === "loading" ? (
        <p role="status" className="py-3 text-sm font-bold text-ht-muted">
          Getting your price from Stripe…
        </p>
      ) : null}

      {quote.status === "error" ? (
        <div className="space-y-2">
          <AddVenueRefusalNotice message={quote.result.message} link={quote.result.link} hostedInvoiceUrl={quote.result.hostedInvoiceUrl} />
          <button
            type="button"
            onClick={onRetryQuote}
            className="min-h-11 rounded-xl border border-ht-soft px-4 text-sm font-black text-ht-secondary"
          >
            Try again
          </button>
        </div>
      ) : null}

      {quote.status === "ready" ? (
        <div className={`divide-y divide-ht-hairline ${CARD_CLASS}`}>
          <Row label={`Venue number ${quote.quote.venueNumber}`} value={`${formatCents(quote.quote.thisVenueCents)}/mo`} />
          <Row
            label="New monthly total"
            value={`${formatCents(quote.quote.newMonthlyTotalCents)}/mo`}
            detail={quote.quote.discountLabel ? `Includes your discount: ${quote.quote.discountLabel}` : null}
          />
          <Row
            label="Charged today"
            value={formatCents(quote.quote.dueTodayCents)}
            detail={periodEnd ? `The rest of this billing period, through ${periodEnd}` : "The rest of this billing period"}
          />
        </div>
      ) : null}

      {submit.status === "idle" && quote.status === "ready" ? (
        <p className="text-footnote font-semibold text-ht-muted">
          The venue goes live for players the moment the payment goes through. If your card is declined, nothing is added
          and nothing is charged.
        </p>
      ) : null}

      {submit.status === "action" ? (
        <Notice tone="info">
          <p>Your bank needs to confirm this payment before the venue goes live.</p>
          {submit.hostedInvoiceUrl ? (
            <p>
              <a href={submit.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
                Open the secure payment page
              </a>
            </p>
          ) : null}
          <p className="font-semibold">Come back here when you&apos;re done — we&apos;ll check automatically.</p>
        </Notice>
      ) : null}

      {submit.status === "processing" ? (
        <Notice tone="info">
          {submit.checks >= MAX_AUTO_CHECKS
            ? "Still confirming your payment. Tap “Check again”, or close this — the venue appears on your dashboard as soon as it goes through."
            : "Confirming your payment…"}
        </Notice>
      ) : null}

      {submit.status === "unconfirmed" ? <Notice tone="warn">{submit.message}</Notice> : null}

      {submit.status === "refused" ? (
        <AddVenueRefusalNotice message={submit.message} link={submit.link} hostedInvoiceUrl={submit.hostedInvoiceUrl} />
      ) : null}
    </div>
  );
};
