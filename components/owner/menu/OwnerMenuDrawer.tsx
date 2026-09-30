"use client";

import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { DRAWER_EXIT_MS } from "@/components/owner/sheet/sheetMotion";
import { useModalOverlay } from "@/components/owner/sheet/useModalOverlay";

// The Partner Dashboard's left-hand menu (docs/partner-dashboard-app-redesign-plan.md §4b).
//
// Same dialog mechanics as OwnerSheet (shared useModalOverlay: controlled
// `open`, Escape on the topmost overlay only, Tab trap, focus return, popup
// scroll lock, portal) with a slide-in-from-the-left entrance.
//
// Phase 1 ships the empty shell. Phase 2 fills `children` (inside a <nav>) with the six rows in
// §4b's order (Venue Display, Billing, Partner Manual, Game Settings, Account
// Settings, then a divider and SignOutButton LAST) and adds this file's host to
// the SignOutButton allowlist in tests/navigation-controls-contract.test.ts.
//
// Opening another overlay from a row (Partner Manual): close the drawer, and
// pass the logo button as the sheet's `returnFocusRef` — the drawer row that
// had focus is gone by the time the sheet closes.

export type OwnerMenuDrawerProps = {
  open: boolean;
  onRequestClose: () => void;
  /** Accessible name for the dialog, e.g. "Menu". */
  label: string;
  children: ReactNode;
  /** Focus target after close. Defaults to whatever was focused when it opened (the logo). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  onExited?: () => void;
};

export const OwnerMenuDrawer = ({
  open,
  onRequestClose,
  label,
  children,
  returnFocusRef,
  onExited,
}: OwnerMenuDrawerProps) => {
  const { isClient, isMounted, isClosing, panelRef, requestClose } = useModalOverlay({
    open,
    onRequestClose,
    returnFocusRef,
    onExited,
    exitMs: DRAWER_EXIT_MS,
    scrollLockName: "owner-menu-drawer",
  });

  if (!isMounted || !isClient) return null;

  return createPortal(
    <div
      data-tp-scroll-lock="active"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
      className={`fixed inset-0 z-[5000] flex justify-start bg-slate-950/70 ${
        isClosing ? "pointer-events-none animate-tp-fade-out" : "animate-tp-fade-in"
      }`}
    >
      <div
        ref={panelRef as RefObject<HTMLDivElement | null>}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`flex h-full w-[82vw] max-w-xs flex-col overflow-y-auto overscroll-contain border-r border-ht-hairline bg-ht-surface pb-[max(env(safe-area-inset-bottom),16px)] pt-[max(env(safe-area-inset-top),16px)] shadow-ht-modal outline-none ${
          isClosing ? "animate-tp-drawer-out" : "animate-tp-drawer-in"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};
