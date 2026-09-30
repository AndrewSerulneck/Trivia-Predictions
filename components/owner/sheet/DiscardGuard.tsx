"use client";

import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SHEET_EXIT_MS } from "@/components/owner/sheet/sheetMotion";
import { useModalOverlay } from "@/components/owner/sheet/useModalOverlay";

// "Discard this game?" (plan decision 5). A flow sheet passes `closeGuard` to
// OwnerSheet; when the partner has entered something, Escape / Close / a scrim
// tap ask this question instead of closing. Nothing is saved as a draft.
//
// NOT covered, by decision: the phone's Back gesture. The URL has already moved
// by the time React sees it, so it steps back or closes without asking. That is
// the platform's own behaviour and the partner can reopen the flow; intercepting
// popstate would fight Next's router for a prompt iOS users never see elsewhere.

type DiscardDialogProps = {
  open: boolean;
  title: string;
  message: string;
  onKeep: () => void;
  onDiscard: () => void;
};

const DiscardDialog = ({ open, title, message, onKeep, onDiscard }: DiscardDialogProps) => {
  const { isClient, isMounted, isClosing, panelRef } = useModalOverlay({
    open,
    onRequestClose: onKeep,
    exitMs: SHEET_EXIT_MS,
    scrollLockName: "owner-discard",
  });
  if (!isMounted || !isClient) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[5100] flex items-center justify-center bg-slate-950/70 p-4 ${
        isClosing ? "pointer-events-none animate-tp-fade-out" : "animate-tp-fade-in"
      }`}
    >
      <section
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="owner-discard-title"
        aria-describedby="owner-discard-message"
        tabIndex={-1}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-ht-hairline bg-ht-surface p-5 shadow-ht-modal outline-none"
      >
        <div className="space-y-1">
          <h2 id="owner-discard-title" className="ht-h2">
            {title}
          </h2>
          <p id="owner-discard-message" className="text-sm font-semibold text-ht-muted">
            {message}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="min-h-12 w-full rounded-xl bg-ht-cyan-500 px-4 text-sm font-black text-slate-950"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-12 w-full rounded-xl border border-ht-rose-500/40 px-4 text-sm font-black text-ht-rose-300"
          >
            Discard
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
};

/**
 * `closeGuard` for OwnerSheet plus the dialog to render next to it.
 * `onDiscard` should close the sheet (it bypasses the guard).
 */
export const useDiscardGuard = ({
  dirty,
  title,
  message,
  onDiscard,
}: {
  dirty: boolean;
  title: string;
  message: string;
  onDiscard: () => void;
}): { closeGuard: () => boolean; dialog: ReactNode } => {
  const [asking, setAsking] = useState(false);

  const closeGuard = useCallback(() => {
    if (!dirty) return true;
    setAsking(true);
    return false;
  }, [dirty]);

  const dialog = (
    <DiscardDialog
      open={asking}
      title={title}
      message={message}
      onKeep={() => setAsking(false)}
      onDiscard={() => {
        setAsking(false);
        onDiscard();
      }}
    />
  );

  return { closeGuard, dialog };
};
