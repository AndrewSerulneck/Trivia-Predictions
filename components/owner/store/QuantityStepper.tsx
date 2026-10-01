"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { clampUnitQuantity } from "@/lib/merchPricing";

// − / number / + for unit-priced merch (docs/join-merch-store-plan.md §3b).
//
// The cart always holds a clamped whole number: every keystroke commits
// `clampUnitQuantity(typed)`, so the line total and order bar follow along. The
// field keeps showing what was typed until it loses focus, then snaps to the
// clamped value — a typed 150 becomes 100 on blur, with no error shown.
//
// 44px targets; `text-base` on the field so iOS doesn't zoom in on focus.
// Plain border utilities work because the light OwnerSheet is an
// `ht-light-surface` (app/globals.css's dark form styling stays out of it).

export type QuantityStepperProps = {
  /** Product name, for the control labels ("Increase Table Tents"). */
  name: string;
  value: number;
  max: number;
  onChange: (quantity: number) => void;
  /** id for the field, so the card's <label htmlFor> names it. */
  inputId: string;
};

const BUTTON_CLASS =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-900 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white";

export const QuantityStepper = ({ name, value, max, onChange, inputId }: QuantityStepperProps) => {
  // Non-null only while the partner is typing in the field.
  const [draft, setDraft] = useState<string | null>(null);

  const set = (next: number) => {
    setDraft(null);
    onChange(clampUnitQuantity(next, max));
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => set(value - 1)}
        disabled={value <= 0}
        aria-label={`Decrease ${name}`}
        className={BUTTON_CLASS}
      >
        <Minus aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        id={inputId}
        value={draft ?? String(value)}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(clampUnitQuantity(event.target.value, max));
        }}
        onFocus={(event) => event.target.select()}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-11 w-16 rounded-xl border border-slate-300 bg-white text-center text-base font-black tabular-nums text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <button
        type="button"
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label={`Increase ${name}`}
        className={BUTTON_CLASS}
      >
        <Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
};
