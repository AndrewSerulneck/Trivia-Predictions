"use client";

import { ChevronRight } from "lucide-react";
import { formatCents, type MerchCartSummary } from "@/lib/merchPricing";

// The Shop step's footer (docs/join-merch-store-plan.md §3b): item count +
// subtotal on the left, "Review order" on the right. Lives in OwnerSheet's
// footer slot, so it stays pinned while the products scroll.
//
// Not a WizardFooter: this is a cart summary with a button, not step-back /
// next, and WizardFooter's Next is full-width. The button borrows the light
// NextButton's indigo so the two steps' primaries match. Its classes are the
// whole story: the light OwnerSheet is an `ht-light-surface`, so the global
// `button:not(:disabled)` rule (weight 600, white/12% border) stays out.
//
// `unavailableReason` (no venue yet, or none on the account — plan Phase 4.1,
// F2) keeps Review off and says why, in the same live region as the subtotal.

export type MerchOrderBarProps = {
  summary: MerchCartSummary;
  /** Set when Review can't open whatever the cart holds; shown in place of / under the subtotal. */
  unavailableReason?: string;
  onReview: () => void;
};

export const MerchOrderBar = ({ summary, unavailableReason, onReview }: MerchOrderBarProps) => {
  const empty = summary.lineCount === 0;
  return (
    <div className="flex items-center gap-3">
      <div aria-live="polite" className="min-w-0 flex-1">
        {empty ? (
          <p className="text-sm font-semibold text-slate-600">
            {unavailableReason ?? "Choose a quantity to start an order"}
          </p>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {summary.lineCount} {summary.lineCount === 1 ? "item" : "items"} · Subtotal
            </p>
            <p className="text-xl font-black tabular-nums text-slate-900">{formatCents(summary.subtotalCents)}</p>
            {unavailableReason ? (
              <p data-order-unavailable className="text-xs font-semibold text-slate-600">
                {unavailableReason}
              </p>
            ) : null}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onReview}
        disabled={empty || unavailableReason !== undefined}
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-3 text-base font-black text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      >
        Review order
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
};
