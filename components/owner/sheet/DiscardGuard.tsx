"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SHEET_EXIT_MS } from "@/components/owner/sheet/sheetMotion";
import { useModalOverlay } from "@/components/owner/sheet/useModalOverlay";
import { restoreSheetEntry } from "@/lib/ownerSheetParams";

// "Discard this game?" (plan decision 5). A flow sheet passes `closeGuard` to
// OwnerSheet; when the partner has entered something, Escape / Close / a scrim
// tap ask this question instead of closing. Nothing is saved as a draft.
//
// THE PHONE'S BACK GESTURE ASKS TOO (Andrew, 2026-09-30 — overruling Phase 6's
// "Back never asks"). Back that stays inside the sheet (one question back) keeps
// the answers, so it never asks. Back that LEAVES the sheet has already moved the
// URL by the time we hear of it, so we put the sheet's entry back
// (`restoreSheetEntry`) and ask. Keep editing = stay; Discard = finish the Back
// the partner asked for (`history.back()`), not a full close — after the
// Rewards → Schedule swap that lands on the Rewards sheet, as Back always did.
//
// WHY NOT A popstate LISTENER: Next's router listener is registered first and
// re-renders synchronously; that render (sheet closed → not dirty) removes a
// component's listener mid-dispatch, before it runs — capture phase included
// (verified in Chromium). So the Back is detected at RENDER time instead: the
// sheet went open → closed while it held answers, and the flow did not close it.
// The flow's OWN departures (Discard, a save, the wizard's Cancel, the swap to
// Schedule) go through `closeWithoutAsking`, which marks the next close as ours.

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

const currentHref = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

/**
 * `closeGuard` for OwnerSheet, the dialog to render next to it, and
 * `closeWithoutAsking` for the flow's own departures. `onDiscard` should close
 * the sheet (it bypasses the guard).
 */
export const useDiscardGuard = ({
  open,
  dirty,
  title,
  message,
  onDiscard,
}: {
  /** Whether this flow's sheet is open (the URL says so). */
  open: boolean;
  dirty: boolean;
  title: string;
  message: string;
  onDiscard: () => void;
}): {
  closeGuard: () => boolean;
  dialog: ReactNode;
  /** Leave the sheet without asking — `leave` defaults to `onDiscard` (close). */
  closeWithoutAsking: (leave?: () => void) => void;
} => {
  const [asking, setAsking] = useState(false);
  // The dialog came from a Back gesture: Discard finishes that Back.
  const [backPending, setBackPending] = useState(false);
  // The flow is leaving on its own: the next close is not the partner's Back.
  const [selfClosing, setSelfClosing] = useState(false);
  // `dirty` as of the last render with the sheet open (a closed sheet reads not-dirty).
  const [dirtyWhileOpen, setDirtyWhileOpen] = useState(dirty);
  const [wasOpen, setWasOpen] = useState(open);
  // Bumped when a Back left with answers: the effect below puts the entry back.
  const [restoreCount, setRestoreCount] = useState(0);
  // The sheet's URL as of the last render with it open.
  const sheetHref = useRef<string | null>(null);

  // Adjust-during-render (react-hooks/set-state-in-effect).
  if (open && dirty !== dirtyWhileOpen) setDirtyWhileOpen(dirty);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open && selfClosing) setSelfClosing(false);
    else if (!open && dirtyWhileOpen) {
      setRestoreCount((n) => n + 1);
      setBackPending(true);
      setAsking(true);
    }
  }

  useEffect(() => {
    if (open) sheetHref.current = currentHref();
  });

  useEffect(() => {
    if (restoreCount > 0 && sheetHref.current) restoreSheetEntry(window.history, sheetHref.current);
  }, [restoreCount]);

  const closeGuard = useCallback(() => {
    if (!dirty) return true;
    setBackPending(false);
    setAsking(true);
    return false;
  }, [dirty]);

  const closeWithoutAsking = useCallback(
    (leave: () => void = onDiscard) => {
      setSelfClosing(true);
      leave();
    },
    [onDiscard]
  );

  const dialog = (
    <DiscardDialog
      open={asking}
      title={title}
      message={message}
      onKeep={() => {
        setBackPending(false);
        setAsking(false);
      }}
      onDiscard={() => {
        setAsking(false);
        setBackPending(false);
        setSelfClosing(true);
        if (backPending) window.history.back();
        else onDiscard();
      }}
    />
  );

  return { closeGuard, dialog, closeWithoutAsking };
};
