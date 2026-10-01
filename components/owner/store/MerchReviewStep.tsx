"use client";

import { Info, MapPin } from "lucide-react";
import { getMerchProduct, MERCH_ORDER_CONTACT, MERCH_ORDERING_NOTE } from "@/lib/merchCatalog";
import { formatCents, formatCentsShort, type MerchOrderDraft, type MerchOrderLine } from "@/lib/merchPricing";

// The Review step (docs/join-merch-store-plan.md §3b). Renders ONLY from the
// order draft (buildMerchOrderDraft), never from UI state, so what the partner
// sees here is exactly what a future checkout / 3PL call will receive (§4).
//
// Look-only: the footer's final button is disabled ("Ordering opens soon") and
// the note below the total says so in words, so it doesn't read as broken.

export type MerchReviewStepProps = {
  draft: MerchOrderDraft;
  venueName: string;
};

const lineDetail = (line: MerchOrderLine): string => {
  const pricing = getMerchProduct(line.productId)?.pricing;
  if (pricing?.kind === "unit") return `${line.quantity} × ${formatCentsShort(pricing.unitPriceCents)}`;
  return `Pack of ${line.quantity.toLocaleString("en-US")}`;
};

export const MerchReviewStep = ({ draft, venueName }: MerchReviewStepProps) => (
  <div>
    <h3 data-step-heading className="text-lg font-black text-slate-900 outline-none">
      Review your order
    </h3>

    <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
      {draft.lines.map((line) => {
        const product = getMerchProduct(line.productId);
        return (
          <li key={line.sku} data-line={line.sku} className="flex items-center gap-3 py-3">
            {product ? (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-ht-store-paper">
                <img
                  src={product.image.src}
                  width={product.image.width}
                  height={product.image.height}
                  alt=""
                  decoding="async"
                  className="h-auto max-h-full w-auto max-w-full object-contain mix-blend-multiply"
                />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="font-black leading-tight text-slate-900">{product?.name ?? line.sku}</p>
              <p className="mt-0.5 text-sm text-slate-600">{lineDetail(line)}</p>
            </div>
            <p className="shrink-0 font-black tabular-nums text-slate-900">{formatCents(line.lineTotalCents)}</p>
          </li>
        );
      })}
    </ul>

    <dl className="mt-4 space-y-2 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-slate-600">Subtotal</dt>
        <dd className="font-bold tabular-nums text-slate-900">{formatCents(draft.subtotalCents)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <dt className="text-slate-600">Shipping &amp; tax</dt>
        <dd className="text-slate-600">Calculated at checkout</dd>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-slate-200 pt-3">
        <dt className="text-base font-black text-slate-900">Estimated total</dt>
        <dd className="text-xl font-black tabular-nums text-slate-900">{formatCents(draft.subtotalCents)}</dd>
      </div>
    </dl>

    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ships to</p>
        <p className="mt-0.5 break-words font-black text-slate-900">{venueName}</p>
      </div>
    </div>

    <div className="mt-3 flex items-start gap-3 rounded-2xl bg-indigo-50 p-4">
      <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" />
      <p className="text-sm leading-relaxed text-indigo-900">
        {MERCH_ORDERING_NOTE}
        {MERCH_ORDER_CONTACT ? <> {MERCH_ORDER_CONTACT}</> : null}
      </p>
    </div>
  </div>
);
