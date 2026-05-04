"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function readViewportHeight(): number {
  if (typeof window === "undefined") {
    return 0;
  }
  const vv = window.visualViewport;
  const value = vv?.height ?? window.innerHeight;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function ViewportHeightSync() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname?.startsWith("/venue/")) {
      return;
    }
    let rafId: number | null = null;
    let timeoutId: number | null = null;
    let lastAppliedHeight = 0;

    const applyWithThreshold = () => {
      const next = readViewportHeight();
      if (next <= 0) {
        return;
      }
      if (lastAppliedHeight > 0 && Math.abs(next - lastAppliedHeight) < 6) {
        return;
      }
      lastAppliedHeight = next;
      document.documentElement.style.setProperty("--tp-vh", `${next}px`);
    };

    const schedule = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        if (rafId !== null) {
          return;
        }
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          applyWithThreshold();
        });
      }, 100);
    };

    const scheduleImmediate = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        applyWithThreshold();
      });
    };

    scheduleImmediate();

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [pathname]);

  return null;
}
