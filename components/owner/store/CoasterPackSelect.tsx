"use client";

import { ChevronDown } from "lucide-react";
import type { MerchPack } from "@/lib/merchCatalog";
import { formatCentsShort } from "@/lib/merchPricing";

// Pack-size dropdown for coasters (docs/join-merch-store-plan.md §3b).
//
// A NATIVE <select> on purpose: iOS shows its wheel picker, Android its sheet.
// The light store panel sets `color-scheme: light`, so the popup renders light.
// First option is "None" (value "") = not in the cart. `text-base` keeps iOS
// from zooming in on focus. Plain border utilities work because the light
// OwnerSheet is an `ht-light-surface` (no global dark `select` border there).

export type CoasterPackSelectProps = {
  id: string;
  packs: readonly MerchPack[];
  /** The chosen pack's quantity, or 0 for none. */
  value: number;
  onChange: (quantity: number) => void;
};

export const packOptionLabel = (pack: MerchPack): string =>
  `${pack.quantity.toLocaleString("en-US")} coasters — ${formatCentsShort(pack.priceCents)}`;

export const CoasterPackSelect = ({ id, packs, value, onChange }: CoasterPackSelectProps) => {
  const selected = packs.some((pack) => pack.quantity === value) ? String(value) : "";
  return (
    <div className="relative">
      <select
        id={id}
        value={selected}
        onChange={(event) => onChange(event.target.value === "" ? 0 : Number(event.target.value))}
        className={`h-11 w-full appearance-none rounded-xl border bg-white pl-3 pr-10 text-base font-bold shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
          selected ? "border-indigo-300 text-slate-900" : "border-slate-300 text-slate-500"
        }`}
      >
        <option value="" className="text-slate-900">
          None
        </option>
        {packs.map((pack) => (
          <option key={pack.sku} value={String(pack.quantity)} className="text-slate-900">
            {packOptionLabel(pack)}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      />
    </div>
  );
};
