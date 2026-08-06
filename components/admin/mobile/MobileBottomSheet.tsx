"use client";

import { useEffect, type ReactNode } from "react";

type MobileBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

// Mobile convention (admin-mobile Phase 3): bottom sheets replace centered
// modals on the mobile shell. Reused by later phases (e.g. Phase 5's billing
// grant sheet) — don't fork a second implementation.
export function MobileBottomSheet({ open, onClose, title, children }: MobileBottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!open}
        onClick={onClose}
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl transition-transform duration-200 ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300" />
        {title && (
          <div className="px-5 pb-1 pt-3 text-sm font-semibold text-slate-800">{title}</div>
        )}
        <div className="px-2 pb-3 pt-2">{open ? children : null}</div>
      </div>
    </>
  );
}
