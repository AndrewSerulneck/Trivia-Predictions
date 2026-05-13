"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BouncingBallLoader } from "@/components/ui/BouncingBallLoader";

type GlobalTransitionShowDetail = {
  targetPath?: string;
};

type GlobalTransitionHideDetail = {
  force?: boolean;
};

const TARGET_PATH_MATCH_TIMEOUT_MS = 18000;
const OVERLAY_HARD_TIMEOUT_MS = 25000;
const OVERLAY_FADE_OUT_MS = 620;

function pathMatches(expectedPath: string, candidatePath: string): boolean {
  if (!expectedPath) {
    return true;
  }
  return candidatePath === expectedPath || candidatePath.startsWith(`${expectedPath}/`);
}

export function GlobalTransitionOverlay() {
  const [visible, setVisible] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const targetPathRef = useRef<string>("");
  const visibleRef = useRef(false);
  const isFadingOutRef = useRef(false);
  const pathMatchSafetyTimerRef = useRef<number | null>(null);
  const hardSafetyTimerRef = useRef<number | null>(null);
  const fadeOutSafetyTimerRef = useRef<number | null>(null);

  const clearSafetyTimers = useCallback(() => {
    if (pathMatchSafetyTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(pathMatchSafetyTimerRef.current);
      pathMatchSafetyTimerRef.current = null;
    }
    if (hardSafetyTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(hardSafetyTimerRef.current);
      hardSafetyTimerRef.current = null;
    }
    if (fadeOutSafetyTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(fadeOutSafetyTimerRef.current);
      fadeOutSafetyTimerRef.current = null;
    }
  }, []);

  const finalizeOverlay = useCallback(() => {
    clearSafetyTimers();
    visibleRef.current = false;
    isFadingOutRef.current = false;
    setVisible(false);
    setIsFadingOut(false);
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
    window.dispatchEvent(
      new CustomEvent("tp:global-transition-overlay-hidden", {
        detail: { path: currentPath },
      })
    );
  }, [clearSafetyTimers]);

  const startFadeOut = useCallback(() => {
    if (isFadingOutRef.current) {
      return;
    }
    clearSafetyTimers();
    isFadingOutRef.current = true;
    setIsFadingOut(true);
    if (typeof window !== "undefined") {
      fadeOutSafetyTimerRef.current = window.setTimeout(() => {
        if (!visibleRef.current) {
          return;
        }
        finalizeOverlay();
      }, OVERLAY_FADE_OUT_MS + 350);
    }
  }, [clearSafetyTimers, finalizeOverlay]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const preload = new Image();
    preload.src = "/brand/hightop-logo.svg";
    try {
      preload.decode?.().catch(() => {
        // Ignore decode failures.
      });
    } catch {
      // Ignore preload failures.
    }
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    isFadingOutRef.current = isFadingOut;
  }, [isFadingOut]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onShow = (event: Event) => {
      const detail = (event as CustomEvent<GlobalTransitionShowDetail | undefined>).detail;
      targetPathRef.current = String(detail?.targetPath ?? "").trim();
      clearSafetyTimers();
      visibleRef.current = true;
      isFadingOutRef.current = false;
      setIsFadingOut(false);
      setVisible(true);
      pathMatchSafetyTimerRef.current = window.setTimeout(() => {
        if (!visibleRef.current || isFadingOutRef.current) {
          return;
        }
        const currentPath = window.location.pathname;
        if (pathMatches(targetPathRef.current, currentPath)) {
          startFadeOut();
        }
      }, TARGET_PATH_MATCH_TIMEOUT_MS);
      hardSafetyTimerRef.current = window.setTimeout(() => {
        if (!visibleRef.current || isFadingOutRef.current) {
          return;
        }
        startFadeOut();
      }, OVERLAY_HARD_TIMEOUT_MS);
    };

    const onHide = (event: Event) => {
      const detail = (event as CustomEvent<GlobalTransitionHideDetail | undefined>).detail;
      if (!visibleRef.current) {
        return;
      }
      if (detail?.force) {
        targetPathRef.current = "";
      }
      startFadeOut();
    };

    const onVenueReady = (event: Event) => {
      if (!visibleRef.current) {
        return;
      }
      const detail = (event as CustomEvent<{ path?: string } | undefined>).detail;
      const readyPath = String(detail?.path ?? "").trim();
      if (!pathMatches(targetPathRef.current, readyPath)) {
        return;
      }
      startFadeOut();
    };

    window.addEventListener("tp:global-transition-show", onShow as EventListener);
    window.addEventListener("tp:global-transition-hide", onHide as EventListener);
    window.addEventListener("tp:venue-home-ready", onVenueReady as EventListener);

    return () => {
      window.removeEventListener("tp:global-transition-show", onShow as EventListener);
      window.removeEventListener("tp:global-transition-hide", onHide as EventListener);
      window.removeEventListener("tp:venue-home-ready", onVenueReady as EventListener);
      clearSafetyTimers();
    };
  }, [clearSafetyTimers, startFadeOut]);

  const shouldRender = visible;
  const overlayLabel = useMemo(() => "Hightop Challenge: Game On", []);

  if (!shouldRender) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/brand/hightop-logo.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: isFadingOut ? 0 : 1 }}
      transition={{ duration: 0.62, ease: "easeInOut" }}
      onAnimationComplete={() => {
        if (!isFadingOut) {
          return;
        }
        finalizeOverlay();
      }}
      className={`fixed inset-0 z-[6500] flex items-center justify-center bg-[#030712] will-change-[opacity] [transform:translateZ(0)] ${
        isFadingOut ? "pointer-events-none" : "pointer-events-auto"
      }`}
    >
      <BouncingBallLoader label={overlayLabel} size="lg" dark />
    </motion.div>
  );
}
