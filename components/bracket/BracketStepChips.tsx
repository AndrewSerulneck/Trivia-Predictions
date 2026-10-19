"use client";

import { Check } from "lucide-react";
import { bracketFinishStepId, bracketStepProgress, type BracketStep } from "@/lib/bracketsView";

// The row of steps above a bracket: one chip per region, the Final Four, and Finish. A chip shows how
// many of its picks are made and a check once they all are. The row scrolls sideways inside itself
// (the page never scrolls sideways).

export function BracketStepChips({
  steps,
  index,
  picks,
  onSelect,
  showFinish,
}: {
  steps: readonly BracketStep[];
  index: number;
  picks: ReadonlyArray<number | null>;
  onSelect: (index: number) => void;
  /** The read-only view has no Finish step. */
  showFinish: boolean;
}) {
  return (
    <div role="tablist" aria-label="Bracket steps" className="-mx-2 flex gap-1.5 overflow-x-auto px-2 pb-1">
      {steps.map((step, stepIndex) => {
        if (step.id === bracketFinishStepId && !showFinish) return null;
        const active = stepIndex === index;
        const progress = bracketStepProgress(step, picks);
        const complete = progress.total > 0 && progress.done === progress.total;
        return (
          <button
            key={step.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(stepIndex)}
            className={`tp-player-pressable flex min-h-[2.5rem] shrink-0 items-center gap-1.5 !rounded-full !border-0 !px-3 text-footnote !font-black ${
              active ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white"
            }`}
          >
            <span className="whitespace-nowrap">{step.title}</span>
            {progress.total > 0 ? (
              complete ? (
                <Check aria-label="Complete" className="h-4 w-4" />
              ) : (
                <span className={`text-caption tabular-nums ${active ? "text-slate-800" : "text-orange-200"}`}>
                  {progress.done}/{progress.total}
                </span>
              )
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
