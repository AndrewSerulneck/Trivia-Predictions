"use client";

import { useRef, useState, type RefObject } from "react";
import { PARTNER_MANUAL } from "@/lib/partnerManual";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";

type PartnerManualProps = {
  className?: string;
  /**
   * Controlled mode (the Phase 2 menu drawer opens the manual). Omit for the
   * self-contained trigger button + sheet the dashboard has always used.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Render the "Partner Manual" trigger button. Off when a menu row opens it instead. */
  showTrigger?: boolean;
  /** Focus target after close in controlled mode (e.g. the logo menu button). */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export const PartnerManual = ({
  className = "",
  open: openProp,
  onOpenChange,
  showTrigger = true,
  returnFocusRef,
}: PartnerManualProps) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const isOpen = isControlled ? openProp : uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <>
      {showTrigger ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2.5 rounded-xl border border-white/40 bg-gradient-to-br from-ht-cyan-300 via-ht-cyan-400 to-ht-indigo-500 px-4 text-sm font-black tracking-normal text-slate-950 shadow-[0_5px_0_rgba(8,47,73,0.75),0_9px_20px_rgba(34,211,238,0.35)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_6px_0_rgba(8,47,73,0.75),0_12px_24px_rgba(34,211,238,0.45)] active:translate-y-1 active:shadow-[0_1px_0_rgba(8,47,73,0.75)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ht-cyan-300 ${className}`}
        >
          <span aria-hidden className="text-lg leading-none">📖</span>
          Partner Manual
        </button>
      ) : null}

      <OwnerSheet
        open={isOpen}
        onRequestClose={() => setOpen(false)}
        size="card"
        eyebrow="Hightop Challenge"
        title="Partner Manual"
        titleId="partner-manual-title"
        bodyClassName="space-y-6 p-5"
        returnFocusRef={returnFocusRef ?? (showTrigger ? triggerRef : undefined)}
      >
        <section>
          <h3 className="text-lg font-black text-ht-primary">What is Hightop Challenge?</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-ht-muted">{PARTNER_MANUAL.intro}</p>
        </section>

        {PARTNER_MANUAL.sections.map((section) => (
          <section key={section.heading} className="border-t border-ht-hairline pt-5">
            <h3 className="text-lg font-black text-ht-primary">{section.heading}</h3>
            {section.body ? <p className="mt-2 text-sm font-semibold leading-6 text-ht-muted">{section.body}</p> : null}
            {section.subsections?.length ? (
              <div className="mt-5 space-y-4 border-l-2 border-ht-cyan-500/30 pl-4">
                {section.subsections.map((subsection) => (
                  <section key={subsection.heading}>
                    <h4 className="font-black text-ht-secondary">{subsection.heading}</h4>
                    {subsection.body ? (
                      <p className="mt-1 text-sm font-semibold leading-6 text-ht-muted">{subsection.body}</p>
                    ) : null}
                    {subsection.steps?.length ? (
                      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm font-semibold leading-6 text-ht-muted">
                        {subsection.steps.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : null}
                  </section>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </OwnerSheet>
    </>
  );
};
