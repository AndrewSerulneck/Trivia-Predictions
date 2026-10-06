"use client";

import { OwnerShell } from "@/components/owner/OwnerShell";
import { isPosIntegrationsEnabled } from "@/lib/pos/providers";
import {
  STAFF_DISCOUNT_STEPS,
  STAFF_FALLBACK_TEXT,
  STAFF_GIFT_CARD_STEPS,
  STAFF_SHEET_INTRO,
  STAFF_SHEET_PRINT_LABEL,
  STAFF_SHEET_TITLE,
} from "@/lib/posStaffInstructions";

// A one-page, big-type staff sheet to tape by the register (Phase 2e). Static copy, no data
// calls. The dark app bar is hidden when printing (`print:hidden` on OwnerAppBar), so the paper
// shows only the white sheet.

const Steps = ({ heading, steps }: { heading: string; steps: readonly string[] }) => (
  <section className="space-y-3">
    <h2 className="text-2xl font-black">{heading}</h2>
    <ol className="list-decimal space-y-2 pl-7 text-xl font-semibold leading-snug">
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  </section>
);

const PosStaffSheetPage = () => {
  if (!isPosIntegrationsEnabled()) {
    return (
      <OwnerShell variant="dark" title={STAFF_SHEET_TITLE} backTo={{ href: "/owner/dashboard", label: "Dashboard", preferHref: true }}>
        <p className="text-sm font-semibold text-ht-muted">This page isn&apos;t available yet.</p>
      </OwnerShell>
    );
  }
  return (
    <OwnerShell
      variant="dark"
      title={STAFF_SHEET_TITLE}
      backTo={{ href: "/owner/dashboard?sheet=pos", label: "Point of Sale", preferHref: true }}
    >
      <button
        type="button"
        onClick={() => window.print()}
        className="mb-4 rounded-full bg-ht-cyan-300 px-4 py-2 text-sm font-black text-slate-950 print:hidden"
      >
        {STAFF_SHEET_PRINT_LABEL}
      </button>
      <article className="space-y-6 rounded-2xl bg-white p-6 text-slate-900 print:rounded-none print:p-0">
        <header className="space-y-1">
          <h2 className="text-3xl font-black">{STAFF_SHEET_TITLE}</h2>
          <p className="text-lg font-semibold text-slate-700">{STAFF_SHEET_INTRO}</p>
        </header>
        <Steps heading="Square gift card" steps={STAFF_GIFT_CARD_STEPS} />
        <Steps heading="Green box: Square discount" steps={STAFF_DISCOUNT_STEPS} />
        <p className="rounded-xl border-2 border-slate-900 p-4 text-lg font-bold">{STAFF_FALLBACK_TEXT}</p>
      </article>
    </OwnerShell>
  );
};

export default PosStaffSheetPage;
