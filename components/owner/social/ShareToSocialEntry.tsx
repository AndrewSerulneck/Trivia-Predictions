"use client";

import { ChevronRight, Share2 } from "lucide-react";
import { SHARE_SOCIAL_COPY as COPY } from "@/lib/promo/promoCopy";

// The dashboard's way into Share to social (docs/partner-social-promo-plan.md Phase 1): one row under
// Active Prizes that opens `?sheet=social`. Same card surface as the dashboard sections.
export const ShareToSocialEntry = ({ onOpen }: { onOpen: () => void }) => (
  <button
    type="button"
    onClick={onOpen}
    className="flex w-full items-center gap-3 rounded-2xl border border-ht-hairline bg-ht-surface p-4 text-left shadow-ht-card transition active:translate-y-px"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ht-cyan-500/15 text-ht-cyan-300">
      <Share2 aria-hidden="true" className="h-5 w-5" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-dashboard-heading font-extrabold text-ht-primary">{COPY.entryLabel}</span>
      <span className="block text-xs font-semibold text-ht-muted">{COPY.entryHint}</span>
    </span>
    <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0 text-ht-muted" />
  </button>
);
