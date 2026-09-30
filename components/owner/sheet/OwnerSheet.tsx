"use client";

import { useId, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { SHEET_EXIT_MS } from "@/components/owner/sheet/sheetMotion";
import { useModalOverlay } from "@/components/owner/sheet/useModalOverlay";

// The Partner Dashboard's slide-up panel (docs/partner-dashboard-app-redesign-plan.md §4d).
//
// Generalised from the Partner Manual sheet, which now renders through this:
// same scrim fade, same tp-popup-sheet-up/-down motion, same header with Close
// top-right. Two sizes:
//   - "card" — the Partner Manual's look, unchanged: a floating card with
//     rounded corners, content-height up to 90svh, bottom-aligned on phones and
//     centred from `sm`.
//   - "tall" — the flow sheets (Schedule, Rewards): 92svh on phones so the
//     dashboard peeks at the top edge as on iOS, rounded top only, a grab
//     handle, and a footer slot for WizardFooter.
//
// CONTROLLED. The host owns `open`; this component only asks to close via
// `onRequestClose` (after `closeGuard`, if given). Rendered into a portal on
// document.body so an ancestor's `backdrop-filter`/`transform` (the app bar
// has one) can never turn `position: fixed` into "fixed to that ancestor".
//
// CONTENT DURING EXIT. Children are kept mounted until the slide-down ends,
// but they are whatever the host renders NOW. A host that derives content from
// the URL must keep rendering the last content while `open` is false —
// `useOwnerSheet()` exposes `displaySheet` / `displayStep` for exactly that.

export type OwnerSheetSize = "card" | "tall";

export type OwnerSheetProps = {
  open: boolean;
  onRequestClose: () => void;
  title: ReactNode;
  /** Small cyan line above the title. The Partner Manual uses "Hightop Challenge". */
  eyebrow?: ReactNode;
  children: ReactNode;
  /** Pinned below the scrolling body — a WizardFooter, usually `variant="inline"`. */
  footer?: ReactNode;
  /** Return false to veto Escape / scrim / Close (e.g. to ask "Discard this game?"). */
  closeGuard?: () => boolean;
  /** Fired after the slide-down finishes and the sheet is unmounted. */
  onExited?: () => void;
  /** Focus target after close. Defaults to whatever was focused when it opened. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  size?: OwnerSheetSize;
  /** Padding / spacing of the scrolling body. */
  bodyClassName?: string;
  closeLabel?: string;
  /** Stable id for the title element (aria-labelledby); generated when omitted. */
  titleId?: string;
};

const SCRIM_BASE = "fixed inset-0 z-[5000] flex justify-center bg-slate-950/70";

const SCRIM_LAYOUT: Record<OwnerSheetSize, string> = {
  card: "items-end p-4 sm:items-center",
  tall: "items-end sm:items-center sm:p-4",
};

const PANEL_LAYOUT: Record<OwnerSheetSize, string> = {
  card: "tp-sheet-offset-screen max-h-[90svh] rounded-2xl",
  tall: "h-[92svh] rounded-t-2xl sm:h-auto sm:max-h-[90svh] sm:rounded-2xl",
};

export const OwnerSheet = ({
  open,
  onRequestClose,
  title,
  eyebrow,
  children,
  footer,
  closeGuard,
  onExited,
  returnFocusRef,
  size = "tall",
  bodyClassName = "p-5",
  closeLabel = "Close",
  titleId: titleIdProp,
}: OwnerSheetProps) => {
  const generatedTitleId = useId();
  const titleId = titleIdProp ?? generatedTitleId;
  const { isClient, isMounted, isClosing, panelRef, requestClose } = useModalOverlay({
    open,
    onRequestClose,
    closeGuard,
    returnFocusRef,
    onExited,
    exitMs: SHEET_EXIT_MS,
    scrollLockName: "owner-sheet",
  });

  if (!isMounted || !isClient) return null;

  const bottomSafeArea = size === "tall" && !footer ? "pb-[max(env(safe-area-inset-bottom),20px)]" : "";

  return createPortal(
    <div
      data-tp-scroll-lock="active"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className={`${SCRIM_BASE} ${SCRIM_LAYOUT[size]} ${
        isClosing ? "pointer-events-none animate-tp-fade-out" : "animate-tp-fade-in"
      }`}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${PANEL_LAYOUT[size]} flex w-full max-w-2xl flex-col overflow-hidden border border-ht-hairline bg-ht-surface shadow-ht-modal outline-none ${
          isClosing ? "animate-tp-popup-sheet-down" : "animate-tp-popup-sheet-up"
        }`}
      >
        {size === "tall" ? (
          <div aria-hidden className="flex shrink-0 justify-center pt-2 sm:hidden">
            <span className="h-1.5 w-10 rounded-full bg-ht-elevated-2" />
          </div>
        ) : null}

        <header
          className={`flex shrink-0 items-start justify-between gap-4 border-b border-ht-hairline ${
            size === "tall" ? "px-5 pb-4 pt-3 sm:pt-5" : "p-5"
          }`}
        >
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">{eyebrow}</p>
            ) : null}
            <h2 id={titleId} className={`ht-h2 ${eyebrow ? "mt-1" : ""}`}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="shrink-0 rounded-lg border border-ht-elevated-2 bg-ht-elevated px-3 py-2 text-sm font-black text-ht-primary"
          >
            {closeLabel}
          </button>
        </header>

        <div className={`min-h-0 ${size === "tall" ? "flex-1" : ""} overflow-y-auto overscroll-contain ${bodyClassName} ${bottomSafeArea}`}>
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-ht-hairline px-5 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
            {footer}
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
};
