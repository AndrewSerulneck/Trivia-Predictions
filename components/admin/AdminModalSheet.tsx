"use client";

import { useEffect, useRef, type ReactNode } from "react";

type AdminModalSheetProps = {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: ReactNode;
};

// Shared chrome for BillingSection's form modals (Grant, Discount, Custom
// rate): bottom sheet under `md`, centered modal at `md:` — layout is
// unchanged from the original hand-rolled markup, this only adds dialog
// semantics, Escape/backdrop dismiss, and a body-scroll lock. These modals
// are conditionally mounted ({activeXVenueId ? … : null}), not permanently
// mounted like MobileBottomSheet, so there is no `inert` prop here — they
// simply aren't in the DOM when closed.
export function AdminModalSheet({ open, onClose, titleId, children }: AdminModalSheetProps) {
  const previousOverflowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (previousOverflowRef.current === null) {
      previousOverflowRef.current = document.body.style.overflow;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflowRef.current ?? "";
      previousOverflowRef.current = null;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-xl md:max-w-md md:rounded-2xl md:border md:pb-5"
      >
        {children}
      </div>
    </div>
  );
}
