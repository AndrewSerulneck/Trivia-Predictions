"use client";

import { useId, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
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
// Two tones (docs/join-merch-store-plan.md §3a):
//   - "dark" (default) — every sheet before the store. Its markup is pinned by
//     snapshots in tests/components.owner-sheet.test.ts; don't change it here.
//   - "light" — the Join Merch store: a `bg-ht-store-paper` panel that matches
//     the product photos' white, slate hairlines/text, a white Close button
//     (the ExitBackButton tone="light" look) and `color-scheme: light` so
//     native controls (the coaster <select>) render light. The scrim stays dark.
//     The panel carries `ht-light-surface`, which opts everything inside it out
//     of app/globals.css's dark element-level form styling (bare button / input
//     / select / textarea and .tp-clean-button borders, focus border, weight).
//     Controls on the light panel are styled by their own Tailwind classes
//     alone — no `!` needed.
//
// CONTROLLED. The host owns `open`; this component only asks to close via
// `onRequestClose` (after `closeGuard`, if given). Rendered into a portal on
// document.body so an ancestor's `backdrop-filter`/`transform` (the app bar
// has one) can never turn `position: fixed` into "fixed to that ancestor".
//
// STEPS START AT THE TOP. The body is the sheet's only scroller, so a flow that
// swaps screens inside it (SlideSteps) passes `scrollKey` — usually its current
// step. A changed key scrolls the body back to the top, so a short step never
// opens wherever the previous long one was scrolled to. Adds no markup.
//
// CONTENT DURING EXIT. Children are kept mounted until the slide-down ends,
// but they are whatever the host renders NOW. A host that derives content from
// the URL must keep rendering the last content while `open` is false —
// `useOwnerSheet()` exposes `displayStepFor(sheet)` for exactly that.

export type OwnerSheetSize = "card" | "tall";

export type OwnerSheetTone = "dark" | "light";

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
  /** Palette. `dark` (default) for every existing sheet; `light` for the Join Merch store. */
  tone?: OwnerSheetTone;
  /** Padding / spacing of the scrolling body. */
  bodyClassName?: string;
  closeLabel?: string;
  /** Stable id for the title element (aria-labelledby); generated when omitted. */
  titleId?: string;
  /** When this changes, the scrolling body jumps back to the top. Pass the flow's current step. */
  scrollKey?: string;
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

/** The tone-specific classes. The dark strings are exactly what shipped before tones existed. */
type ToneClasses = {
  panel: string;
  handle: string;
  hairline: string;
  eyebrow: string;
  title: string;
  closeRadius: string;
  closeSurface: string;
  closeWeight: string;
  closeText: string;
};

const TONE: Record<OwnerSheetTone, ToneClasses> = {
  dark: {
    panel: "border-ht-hairline bg-ht-surface",
    handle: "bg-ht-elevated-2",
    hairline: "border-ht-hairline",
    eyebrow: "text-ht-cyan-300",
    title: "ht-h2",
    closeRadius: "rounded-lg",
    closeSurface: "border-ht-elevated-2 bg-ht-elevated",
    closeWeight: "font-black",
    closeText: "text-ht-primary",
  },
  light: {
    // `ht-light-surface`: see the header comment (Phase 4.4, F7).
    panel: "ht-light-surface border-slate-200 bg-ht-store-paper [color-scheme:light]",
    handle: "bg-slate-300",
    hairline: "border-slate-200",
    eyebrow: "text-cyan-700",
    // .ht-h2 is a typography class (not form CSS, so ht-light-surface leaves it alone),
    // unlayered and declared after the utilities, so only `!` beats its colour.
    title: "ht-h2 !text-slate-900",
    // Radius and weight match what the dark Close renders: there the global
    // button rule overrides its rounded-lg/font-black to 12px/600; here nothing does.
    closeRadius: "rounded-xl",
    closeSurface: "border-slate-300 bg-white shadow-sm hover:bg-slate-50",
    closeWeight: "font-semibold",
    closeText: "text-slate-700 hover:text-slate-900",
  },
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
  tone = "dark",
  bodyClassName = "p-5",
  closeLabel = "Close",
  titleId: titleIdProp,
  scrollKey,
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
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Layout effect: reset before the arriving step is painted, never after.
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [scrollKey]);

  if (!isMounted || !isClient) return null;

  const t = TONE[tone];
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
        className={`${PANEL_LAYOUT[size]} flex w-full max-w-2xl flex-col overflow-hidden border ${t.panel} shadow-ht-modal outline-none ${
          isClosing ? "animate-tp-popup-sheet-down" : "animate-tp-popup-sheet-up"
        }`}
      >
        {size === "tall" ? (
          <div aria-hidden className="flex shrink-0 justify-center pt-2 sm:hidden">
            <span className={`h-1.5 w-10 rounded-full ${t.handle}`} />
          </div>
        ) : null}

        <header
          className={`flex shrink-0 items-start justify-between gap-4 border-b ${t.hairline} ${
            size === "tall" ? "px-5 pb-4 pt-3 sm:pt-5" : "p-5"
          }`}
        >
          <div className="min-w-0">
            {eyebrow ? (
              <p className={`text-xs font-black uppercase tracking-[0.14em] ${t.eyebrow}`}>{eyebrow}</p>
            ) : null}
            <h2 id={titleId} className={`${t.title} ${eyebrow ? "mt-1" : ""}`}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className={`shrink-0 ${t.closeRadius} border ${t.closeSurface} px-3 py-2 text-sm ${t.closeWeight} ${t.closeText}`}
          >
            {closeLabel}
          </button>
        </header>

        <div ref={bodyRef} className={`min-h-0 ${size === "tall" ? "flex-1" : ""} overflow-y-auto overscroll-contain ${bodyClassName} ${bottomSafeArea}`}>
          {children}
        </div>

        {footer ? (
          <div className={`shrink-0 border-t ${t.hairline} px-5 pb-[max(env(safe-area-inset-bottom),12px)] pt-3`}>
            {footer}
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
};
