"use client";

import { useEffect, useRef } from "react";
import { forceRecoverDocumentScroll, hasActiveScrollLocks } from "@/lib/scrollLock";

function hasVisibleScrollLockUI(): boolean {
  return Boolean(document.querySelector("[data-tp-scroll-lock='active']"));
}

function isScrollableY(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY.trim().toLowerCase();
  const allowsScroll = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
  return allowsScroll && element.scrollHeight > element.clientHeight + 1;
}

function canScrollElementInDirection(element: HTMLElement, deltaY: number): boolean {
  if (deltaY > 0) {
    return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
  }
  if (deltaY < 0) {
    return element.scrollTop > 1;
  }
  return false;
}

function findBestScrollableAncestor(target: EventTarget | null, deltaY: number): HTMLElement | null {
  let node = target instanceof HTMLElement ? target : null;
  while (node) {
    if (isScrollableY(node) && canScrollElementInDirection(node, deltaY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function canScrollDocumentInDirection(deltaY: number): boolean {
  const doc = document.documentElement;
  const maxScrollY = Math.max(0, doc.scrollHeight - window.innerHeight);
  if (deltaY > 0) {
    return window.scrollY < maxScrollY - 1;
  }
  if (deltaY < 0) {
    return window.scrollY > 1;
  }
  return false;
}

function normalizeDeltaYFromTouch(previousY: number, nextY: number): number {
  // Finger moves down => content should move up (negative scroll direction),
  // so invert to browser-like delta semantics.
  return previousY - nextY;
}

export function ScrollRescueGuard() {
  const touchTrackingRef = useRef<{
    active: boolean;
    x: number;
    y: number;
  }>({ active: false, x: 0, y: 0 });

  useEffect(() => {
    const ensureUnlockedWhenAppropriate = () => {
      if (!hasActiveScrollLocks()) {
        return;
      }
      if (hasVisibleScrollLockUI()) {
        return;
      }
      forceRecoverDocumentScroll();
    };

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 0.5) {
        return;
      }

      ensureUnlockedWhenAppropriate();
      if (hasActiveScrollLocks() && hasVisibleScrollLockUI()) {
        return;
      }

      const deltaY = event.deltaY;
      const scrollableAncestor = findBestScrollableAncestor(event.target, deltaY);
      if (scrollableAncestor) {
        return;
      }

      if (canScrollDocumentInDirection(deltaY)) {
        const before = window.scrollY;
        window.scrollBy({ top: deltaY, left: 0, behavior: "auto" });
        if (Math.abs(window.scrollY - before) > 0.5 && event.cancelable) {
          event.preventDefault();
        }
      }
    };

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        touchTrackingRef.current.active = false;
        return;
      }
      touchTrackingRef.current.active = true;
      touchTrackingRef.current.x = touch.clientX;
      touchTrackingRef.current.y = touch.clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !touchTrackingRef.current.active) {
        return;
      }

      const previousX = touchTrackingRef.current.x;
      const previousY = touchTrackingRef.current.y;
      touchTrackingRef.current.x = touch.clientX;
      touchTrackingRef.current.y = touch.clientY;

      const deltaX = touch.clientX - previousX;
      const deltaY = normalizeDeltaYFromTouch(previousY, touch.clientY);

      // Respect horizontal swipes/carousels.
      if (Math.abs(deltaY) < 1 || Math.abs(deltaX) > Math.abs(deltaY)) {
        return;
      }

      ensureUnlockedWhenAppropriate();
      if (hasActiveScrollLocks() && hasVisibleScrollLockUI()) {
        return;
      }

      const scrollableAncestor = findBestScrollableAncestor(event.target, deltaY);
      if (scrollableAncestor) {
        return;
      }

      if (canScrollDocumentInDirection(deltaY)) {
        const before = window.scrollY;
        window.scrollBy({ top: deltaY, left: 0, behavior: "auto" });
        if (Math.abs(window.scrollY - before) > 0.5 && event.cancelable) {
          event.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      touchTrackingRef.current.active = false;
    };

    const handlePointerCancel = () => {
      touchTrackingRef.current.active = false;
    };

    window.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true, capture: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false, capture: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true, capture: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true, capture: true });
    window.addEventListener("pointercancel", handlePointerCancel, { passive: true, capture: true });
    window.addEventListener("blur", handlePointerCancel);

    return () => {
      window.removeEventListener("wheel", handleWheel, { capture: true } as EventListenerOptions);
      window.removeEventListener("touchstart", handleTouchStart, { capture: true } as EventListenerOptions);
      window.removeEventListener("touchmove", handleTouchMove, { capture: true } as EventListenerOptions);
      window.removeEventListener("touchend", handleTouchEnd, { capture: true } as EventListenerOptions);
      window.removeEventListener("touchcancel", handleTouchEnd, { capture: true } as EventListenerOptions);
      window.removeEventListener("pointercancel", handlePointerCancel, { capture: true } as EventListenerOptions);
      window.removeEventListener("blur", handlePointerCancel);
    };
  }, []);

  return null;
}
