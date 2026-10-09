"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { setScrollLock } from "@/lib/scrollLock";
import { resolveExitMs } from "@/components/owner/sheet/sheetMotion";
import { useNativeBackHandler } from "@/components/navigation/nativeBackButton";

// The shared mechanics behind OwnerSheet (slide-up) and OwnerMenuDrawer
// (slide-in from the left). Both are the same dialog with a different entrance:
//
//   - `open` is CONTROLLED by the host. The overlay never closes itself; it asks
//     (`onRequestClose`) and the host flips `open`. That is what lets the
//     dashboard drive a sheet from the URL (`?sheet=`), where the phone's Back
//     gesture is the thing that flips it.
//   - open → false plays the exit animation, THEN unmounts (`isMounted` stays
//     true for `exitMs`), THEN returns focus. The same order PartnerManual used.
//   - Escape closes only the TOPMOST overlay (module-level stack), so a confirm
//     dialog inside a sheet — Phase 5's End reward — doesn't close both.
//   - Tab is trapped inside the panel while open.
//   - Scroll lock is "popup" mode (fixed-body lock — the iOS-safe one).

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const overlayStack: string[] = [];

const pushOverlay = (id: string) => {
  const index = overlayStack.indexOf(id);
  if (index !== -1) overlayStack.splice(index, 1);
  overlayStack.push(id);
};

const removeOverlay = (id: string) => {
  const index = overlayStack.indexOf(id);
  if (index !== -1) overlayStack.splice(index, 1);
};

const subscribeNothing = () => () => {};

/** False during SSR and the hydration pass, true after — portals need `document`. */
const useIsClient = (): boolean =>
  useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
  );

const isTopOverlay = (id: string): boolean => overlayStack[overlayStack.length - 1] === id;

const focusableWithin = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.closest("[inert]")
  );

type UseModalOverlayOptions = {
  open: boolean;
  /** Asked on Escape / scrim / Close. The host decides; `closeGuard` runs first. */
  onRequestClose: () => void;
  /** Return false to veto a user-initiated close (e.g. show "Discard this game?"). */
  closeGuard?: () => boolean;
  /** Where focus goes after the exit. Defaults to whatever was focused at open. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Fired once the exit animation has finished and the panel is unmounted. */
  onExited?: () => void;
  exitMs: number;
  /** Prefix for the scroll-lock owner key (debugging aid in __tpScrollLockState). */
  scrollLockName: string;
};

type UseModalOverlayResult = {
  /** Safe to call createPortal(…, document.body). */
  isClient: boolean;
  /** Render the overlay at all (open, or still animating out). */
  isMounted: boolean;
  /** Apply the exit animation classes. */
  isClosing: boolean;
  panelRef: RefObject<HTMLElement | null>;
  /** Escape / scrim / Close button all route through here. */
  requestClose: () => void;
};

export const useModalOverlay = ({
  open,
  onRequestClose,
  closeGuard,
  returnFocusRef,
  onExited,
  exitMs,
  scrollLockName,
}: UseModalOverlayOptions): UseModalOverlayResult => {
  const overlayId = useId();
  const isClient = useIsClient();
  const panelRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // "Adjust state when a prop changes" during render, not in an effect
  // (react-hooks/set-state-in-effect). `isMounted` rises with `open`
  // immediately; it falls only when the exit timer below fires.
  const [isMounted, setIsMounted] = useState(open);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setIsMounted(true);
  }
  const isClosing = isMounted && !open;

  // Latest callbacks without re-subscribing listeners on every host render.
  const latest = useRef({ onRequestClose, closeGuard, onExited });
  useEffect(() => {
    latest.current = { onRequestClose, closeGuard, onExited };
  });

  const requestClose = useCallback(() => {
    const { closeGuard: guard, onRequestClose: close } = latest.current;
    if (guard && !guard()) return;
    close();
  }, []);

  // Android's Back inside the app closes the topmost overlay, the same way Escape does.
  useNativeBackHandler("overlay", open ? requestClose : null);

  // Remember the opener, then move focus into the panel itself (not the first
  // button — a screen reader would announce it as if already chosen).
  useEffect(() => {
    if (!open || !isClient) return;
    if (!openerRef.current) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    panelRef.current?.focus({ preventScroll: true });
  }, [isClient, open]);

  // Exit: wait for the animation, unmount, then hand focus back — but only if
  // focus is still ours (inside this panel, or dropped to <body>). If the close
  // opened something else (Menu → Partner Manual), that overlay already took
  // focus and pulling it back behind an aria-modal dialog would strand it.
  useEffect(() => {
    if (!isClosing) return;
    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      const focusIsOurs =
        !active || active === document.body || !active.isConnected || Boolean(panelRef.current?.contains(active));
      setIsMounted(false);
      const target = returnFocusRef?.current ?? openerRef.current;
      openerRef.current = null;
      if (focusIsOurs && target && target.isConnected) target.focus({ preventScroll: true });
      latest.current.onExited?.();
    }, resolveExitMs(exitMs));
    return () => window.clearTimeout(timer);
  }, [exitMs, isClosing, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    pushOverlay(overlayId);
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isTopOverlay(overlayId)) return;
      if (event.key === "Escape") {
        // Something inside the panel (an open Dropdown) already used this Escape.
        if (event.defaultPrevented) return;
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = focusableWithin(root);
      const active = document.activeElement as HTMLElement | null;
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (active === first || active === root || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      removeOverlay(overlayId);
    };
  }, [open, overlayId, requestClose]);

  // Locked for the whole mounted life, including the exit animation, so the
  // page can't scroll under a sheet that is still sliding away.
  useEffect(() => {
    const owner = `${scrollLockName}:${overlayId}`;
    setScrollLock(owner, isMounted, "popup");
    return () => setScrollLock(owner, false);
  }, [isMounted, overlayId, scrollLockName]);

  return { isClient, isMounted, isClosing, panelRef, requestClose };
};
