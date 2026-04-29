"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

type GlobalTransitionShowDetail = {
  targetPath?: string;
};

type GlobalTransitionHideDetail = {
  force?: boolean;
};

const TARGET_PATH_MATCH_TIMEOUT_MS = 12000;
const OVERLAY_HARD_TIMEOUT_MS = 16000;

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

  const clearSafetyTimers = useCallback(() => {
    if (pathMatchSafetyTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(pathMatchSafetyTimerRef.current);
      pathMatchSafetyTimerRef.current = null;
    }
    if (hardSafetyTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(hardSafetyTimerRef.current);
      hardSafetyTimerRef.current = null;
    }
  }, []);

  const startFadeOut = useCallback(() => {
    if (isFadingOutRef.current) {
      return;
    }
    clearSafetyTimers();
    isFadingOutRef.current = true;
    setIsFadingOut(true);
  }, [clearSafetyTimers]);

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
  const overlayLabel = useMemo(() => "Hightop Sports: Game On", []);

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
      }}
      className="pointer-events-auto fixed inset-0 z-[6500] flex items-center justify-center bg-[#030712] will-change-[opacity] [transform:translateZ(0)]"
    >
      <div className="relative flex w-full max-w-sm flex-col items-center justify-center px-8 [perspective:1000px]">
        <div className="absolute inset-x-10 top-1/2 h-24 -translate-y-1/2 rounded-full bg-cyan-400/25 blur-3xl" />
        <motion.div
          animate={{ rotateY: 360 }}
          transition={{ duration: 1.15, ease: "linear", repeat: Infinity }}
          className="relative h-40 w-40 rounded-full border border-white/35 p-3 shadow-[0_0_45px_rgba(56,189,248,0.22)] will-change-transform [transform-style:preserve-3d]"
        >
          <div className="absolute inset-0 rounded-full border border-white/20" />
          <div className="relative h-full w-full overflow-hidden rounded-full bg-white/95 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/hightop-logo.svg"
              alt="Hightop Sports"
              className="h-full w-full object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.28)]"
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
            <motion.div
              aria-hidden="true"
              animate={{ x: ["-140%", "260%"] }}
              transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity }}
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 rotate-[16deg] bg-gradient-to-r from-transparent via-white/70 to-transparent mix-blend-screen"
            />
          </div>
        </motion.div>
        <p className="mt-3 text-center text-[1.06rem] font-black tracking-[0.05em] text-white [font-family:'Kalam','Bree_Serif','Nunito',cursive]">
          {overlayLabel}
        </p>
      </div>
    </motion.div>
  );
}
