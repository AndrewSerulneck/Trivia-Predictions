"use client";

import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { CATEGORY_BLITZ_RULES } from "@/lib/categoryBlitzHowToPlay";

/** The in-game "How to play" popup. Reads the one rules list the tutorial cards share. */
export const CategoryBlitzRulesSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <OwnerSheet open={open} onRequestClose={onClose} size="card" eyebrow="Category Blitz" title="How to play">
    <ol className="list-decimal space-y-3 pl-5 text-xl leading-snug text-slate-100 marker:font-black marker:text-emerald-300">
      {CATEGORY_BLITZ_RULES.map((rule) => (
        <li key={rule}>{rule}</li>
      ))}
    </ol>
  </OwnerSheet>
);

/** "How to play" button that sits directly under a countdown. */
export const HowToPlayButton = ({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    className={`tp-player-hit-target mx-auto ${compact ? "mt-1" : "mt-3"} inline-flex items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-500/15 px-4 text-sm font-black text-emerald-200`}
  >
    How to play
  </button>
);
