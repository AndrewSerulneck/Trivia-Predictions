"use client";

import { ExternalLink } from "lucide-react";
import { marketingUrl } from "@/lib/domainSplit";
import { openInSystemBrowser } from "@/lib/nativeApp";

// The Billing page's only action inside the native app (docs/native-app-store-plan.md
// Phase 3, §5: never a Subscribe / Pay button in the app). Opens the same Billing
// page on the website, where subscribing, changing the card, resuming and
// cancelling all work as before. Fallback for an app without the browser plugin:
// /owner/billing/setup is on the shell's link-out list (it forwards a subscribed
// partner to Billing), so a plain page load to it still leaves the app.

export const MANAGE_BILLING_ON_WEB_LABEL = "Manage billing on the web";

export const ManageBillingOnWeb = ({ className = "" }: { className?: string }) => (
  <div className={className}>
    <button
      type="button"
      onClick={() => {
        void openInSystemBrowser(marketingUrl("/owner/billing")).then((opened) => {
          if (!opened) window.location.assign(marketingUrl("/owner/billing/setup"));
        });
      }}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-ht-cyan-500 px-4 font-black text-slate-950 shadow-ht-glow-cyan transition active:translate-y-px"
    >
      {MANAGE_BILLING_ON_WEB_LABEL}
      <ExternalLink aria-hidden="true" className="h-4 w-4" />
    </button>
    <p className="mt-2 text-center text-xs font-semibold text-ht-muted">
      Subscribing and payment changes happen in your browser.
    </p>
  </div>
);
