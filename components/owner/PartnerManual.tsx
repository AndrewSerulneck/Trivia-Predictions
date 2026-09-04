"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PARTNER_MANUAL } from "@/lib/partnerManual";
import { setScrollLock } from "@/lib/scrollLock";

type PartnerManualProps = {
  className?: string;
};

// Matches .animate-tp-popup-sheet-down in app/globals.css.
const SHEET_EXIT_MS = 270;

const resolveExitMs = (): number => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : SHEET_EXIT_MS;
  } catch {
    return SHEET_EXIT_MS;
  }
};

export const PartnerManual = ({ className = "" }: PartnerManualProps) => {
  const scrollLockId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const openManual = () => {
    setIsClosing(false);
    setIsOpen(true);
  };

  const closeManual = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      triggerRef.current?.focus();
    }, resolveExitMs());
  }, [isClosing]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeManual();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeManual, isOpen]);

  useEffect(() => {
    setScrollLock(`partner-manual:${scrollLockId}`, isOpen, "popup");
    return () => setScrollLock(`partner-manual:${scrollLockId}`, false);
  }, [isOpen, scrollLockId]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openManual}
        aria-haspopup="dialog"
        className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2.5 rounded-xl border border-white/40 bg-gradient-to-br from-ht-cyan-300 via-ht-cyan-400 to-ht-indigo-500 px-4 text-sm font-black tracking-normal text-slate-950 shadow-[0_5px_0_rgba(8,47,73,0.75),0_9px_20px_rgba(34,211,238,0.35)] transition hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_6px_0_rgba(8,47,73,0.75),0_12px_24px_rgba(34,211,238,0.45)] active:translate-y-1 active:shadow-[0_1px_0_rgba(8,47,73,0.75)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ht-cyan-300 ${className}`}
      >
        <span aria-hidden className="text-lg leading-none">📖</span>
        Partner Manual
      </button>

      {isOpen ? (
        <div
          data-tp-scroll-lock="active"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeManual();
          }}
          className={`fixed inset-0 z-[5000] flex items-end justify-center bg-slate-950/70 p-4 sm:items-center ${
            isClosing ? "pointer-events-none animate-tp-fade-out" : "animate-tp-fade-in"
          }`}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-manual-title"
            className={`tp-sheet-offset-screen flex max-h-[90svh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ht-hairline bg-ht-surface shadow-ht-modal ${
              isClosing ? "animate-tp-popup-sheet-down" : "animate-tp-popup-sheet-up"
            }`}
          >
            <header className="flex items-start justify-between gap-4 border-b border-ht-hairline p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Hightop Challenge</p>
                <h2 id="partner-manual-title" className="ht-h2 mt-1">Partner Manual</h2>
              </div>
              <button
                type="button"
                onClick={closeManual}
                className="rounded-lg border border-ht-elevated-2 bg-ht-elevated px-3 py-2 text-sm font-black text-ht-primary"
              >
                Close
              </button>
            </header>

            <div className="min-h-0 space-y-6 overflow-y-auto overscroll-contain p-5">
              <section>
                <h3 className="text-lg font-black text-ht-primary">What is Hightop Challenge?</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-ht-muted">{PARTNER_MANUAL.intro}</p>
              </section>

              {PARTNER_MANUAL.sections.map((section) => (
                <section key={section.heading} className="border-t border-ht-hairline pt-5">
                  <h3 className="text-lg font-black text-ht-primary">{section.heading}</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-ht-muted">{section.body}</p>
                  {section.subsections?.length ? (
                    <div className="mt-5 space-y-4 border-l-2 border-ht-cyan-500/30 pl-4">
                      {section.subsections.map((subsection) => (
                        <section key={subsection.heading}>
                          <h4 className="font-black text-ht-secondary">{subsection.heading}</h4>
                          <p className="mt-1 text-sm font-semibold leading-6 text-ht-muted">{subsection.body}</p>
                        </section>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
};
