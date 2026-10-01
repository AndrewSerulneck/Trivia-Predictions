"use client";

import { useId } from "react";
import { Check } from "lucide-react";
import { CoasterPackSelect } from "@/components/owner/store/CoasterPackSelect";
import { QuantityStepper } from "@/components/owner/store/QuantityStepper";
import type { MerchProduct } from "@/lib/merchCatalog";
import { findPack, formatCents, formatCentsShort, lineTotalCents } from "@/lib/merchPricing";

// One product row on the Shop step (docs/join-merch-store-plan.md §3a–3b).
//
// THE PHOTO SITS ON THE PAPER: no card fill, no border. `mix-blend-multiply`
// makes the photo's own off-white (#FDFDFD–#FFFFFF) vanish into the panel's
// `ht-store-paper`. The photo box is painted with that same paper colour so the
// blend has the right backdrop even while a step slides in (a transformed
// ancestor is an isolated group, which would otherwise blend against
// transparent). The fixed-height box also reserves space before the lazy image
// loads, so nothing jumps.
//
// Every price comes from the catalog through lib/merchPricing.ts — no literals.

export type MerchProductCardProps = {
  product: MerchProduct;
  /** Pack size (coasters) or count (units); 0 = not in the order. */
  quantity: number;
  onQuantityChange: (quantity: number) => void;
};

export const MerchProductCard = ({ product, quantity, onQuantityChange }: MerchProductCardProps) => {
  const controlId = useId();
  const { pricing } = product;
  const inOrder = lineTotalCents(product, quantity) > 0;

  return (
    <li
      data-product={product.id}
      className="py-7 first:pt-4 last:pb-2 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-center sm:gap-6"
    >
      <div className="flex h-52 items-center justify-center bg-ht-store-paper sm:h-44">
        <img
          src={product.image.src}
          width={product.image.width}
          height={product.image.height}
          alt={product.image.alt}
          loading="lazy"
          decoding="async"
          className="h-auto max-h-full w-auto max-w-full object-contain mix-blend-multiply"
        />
      </div>

      <div className="mt-4 sm:mt-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h4 className="text-lg font-black leading-tight text-slate-900">{product.name}</h4>
          {inOrder ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700">
              <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
              In order
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{product.description}</p>

        {pricing.kind === "pack" ? (
          <div className="mt-4">
            <label htmlFor={controlId} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Pack size<span className="sr-only"> for {product.name}</span>
            </label>
            <CoasterPackSelect id={controlId} packs={pricing.packs} value={quantity} onChange={onQuantityChange} />
            <p className="mt-2 text-sm text-slate-600">
              {(() => {
                const pack = findPack(product, quantity);
                if (!pack) {
                  return `${pricing.packs.length} pack sizes, from ${formatCentsShort(pricing.packs[0]?.priceCents ?? 0)}`;
                }
                return (
                  <>
                    {pack.quantity.toLocaleString("en-US")} coasters ·{" "}
                    <span className="font-black text-slate-900">{formatCents(pack.priceCents)}</span>
                  </>
                );
              })()}
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-black text-slate-900">
                {formatCentsShort(pricing.unitPriceCents)} <span className="font-semibold text-slate-600">each</span>
              </p>
              <label htmlFor={controlId} className="sr-only">
                {product.name} quantity
              </label>
              <QuantityStepper
                inputId={controlId}
                name={product.name}
                value={quantity}
                max={pricing.maxQuantity}
                onChange={onQuantityChange}
              />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {quantity > 0 ? (
                <>
                  {quantity} × {formatCentsShort(pricing.unitPriceCents)} ={" "}
                  <span className="font-black text-slate-900">{formatCents(lineTotalCents(product, quantity))}</span>
                </>
              ) : (
                `Up to ${pricing.maxQuantity} per order`
              )}
            </p>
          </div>
        )}
      </div>
    </li>
  );
};
