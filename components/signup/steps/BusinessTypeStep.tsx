"use client";

import { SignupQuestion } from "@/components/signup/SignupQuestion";
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, type BusinessType } from "@/lib/partnerBusinessType";

// Step 1 of 7 — "What kind of business are you?". One tap answers and advances.
// Copy is the question and the five labels, nothing else (docs/partner-business-type-plan.md).

type BusinessTypeStepProps = {
  value: BusinessType | "";
  onSelect: (value: BusinessType) => void;
};

export function BusinessTypeStep({ value, onSelect }: BusinessTypeStepProps) {
  return (
    <SignupQuestion eyebrow="Your account" title="What kind of business are you?">
      <div role="radiogroup" aria-label="Business type" className="flex flex-col gap-2">
        {BUSINESS_TYPES.map((type) => {
          const selected = value === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(type)}
              className={`inline-flex min-h-14 w-full items-center rounded-ht-md border px-4 text-left font-black active:translate-y-px ${
                selected ? "border-ht-cyan-400 bg-ht-surface text-ht-primary" : "border-ht-soft text-ht-secondary"
              }`}
            >
              {BUSINESS_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
    </SignupQuestion>
  );
}
