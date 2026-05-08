"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { forceRecoverDocumentScroll, hasActiveScrollLocks } from "@/lib/scrollLock";

function recoverScrollableState() {
  if (typeof document === "undefined") {
    return;
  }
  forceRecoverDocumentScroll();
}

function hasVisibleScrollLockUI(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return Boolean(document.querySelector("[data-tp-scroll-lock='active']"));
}

function hasResidualScrollLockStyles(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const root = document.documentElement;
  const body = document.body;
  return (
    root.classList.contains("tp-modal-open") ||
    root.classList.contains("tp-popup-open") ||
    body.classList.contains("tp-modal-open") ||
    body.classList.contains("tp-popup-open") ||
    body.style.position === "fixed" ||
    body.style.overflow === "hidden" ||
    root.style.overflow === "hidden"
  );
}

function auditAndRecoverStaleLocks(): void {
  const hasVisibleUI = hasVisibleScrollLockUI();
  const hasLockState = hasActiveScrollLocks();
  if (hasVisibleUI) {
    return;
  }
  if (!hasLockState) {
    if (!hasResidualScrollLockStyles()) {
      return;
    }
    recoverScrollableState();
    return;
  }
  recoverScrollableState();
}

export function ScrollRecoverySentinel() {
  const pathname = usePathname();

  useEffect(() => {
    auditAndRecoverStaleLocks();
    const timer = window.setTimeout(() => {
      auditAndRecoverStaleLocks();
    }, 120);
    const secondTimer = window.setTimeout(() => {
      auditAndRecoverStaleLocks();
    }, 900);
    const intervalId = window.setInterval(() => {
      auditAndRecoverStaleLocks();
    }, 1800);
    const onPageShow = () => {
      auditAndRecoverStaleLocks();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        auditAndRecoverStaleLocks();
      }
    };
    const onFocus = () => {
      auditAndRecoverStaleLocks();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(secondTimer);
      window.clearInterval(intervalId);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

  return null;
}
