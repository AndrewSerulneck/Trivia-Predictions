"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const DEBUG_PREFIX = "[tp-debug]";

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (process.env.NODE_ENV !== "development") {
    return false;
  }
  try {
    const search = new URLSearchParams(window.location.search);
    // Query param only: prevents stale localStorage from accidentally enabling noisy logging.
    return search.get("tpDebug") === "1";
  } catch {
    return false;
  }
}

function collectSnapshot() {
  const root = document.documentElement;
  const body = document.body;
  const appShell = document.querySelector(".tp-app-shell") as HTMLElement | null;
  const pageShell = document.querySelector(".tp-page-shell") as HTMLElement | null;
  const gameSurface = document.querySelector("[data-venue-game-surface]") as HTMLElement | null;
  const vv = window.visualViewport;

  return {
    path: window.location.pathname,
    ts: Date.now(),
    win: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollY: window.scrollY,
    },
    vv: vv
      ? {
          width: Math.round(vv.width),
          height: Math.round(vv.height),
          scale: Number(vv.scale.toFixed(3)),
          offsetTop: Math.round(vv.offsetTop),
          offsetLeft: Math.round(vv.offsetLeft),
        }
      : null,
    cssVarVh: root.style.getPropertyValue("--tp-vh") || "(unset)",
    root: {
      className: root.className,
      overflow: root.style.overflow || "(inline-unset)",
    },
    body: {
      className: body.className,
      overflow: body.style.overflow || "(inline-unset)",
      position: body.style.position || "(inline-unset)",
      top: body.style.top || "(inline-unset)",
      width: body.style.width || "(inline-unset)",
    },
    appShell: appShell
      ? {
          clientHeight: appShell.clientHeight,
          scrollHeight: appShell.scrollHeight,
          overflowX: getComputedStyle(appShell).overflowX,
          overflowY: getComputedStyle(appShell).overflowY,
        }
      : null,
    pageShell: pageShell
      ? {
          clientHeight: pageShell.clientHeight,
          scrollHeight: pageShell.scrollHeight,
          overflowX: getComputedStyle(pageShell).overflowX,
          overflowY: getComputedStyle(pageShell).overflowY,
        }
      : null,
    gameSurface: gameSurface
      ? {
          clientHeight: gameSurface.clientHeight,
          scrollHeight: gameSurface.scrollHeight,
          overflowX: getComputedStyle(gameSurface).overflowX,
          overflowY: getComputedStyle(gameSurface).overflowY,
        }
      : null,
  };
}

export function LayoutDebugProbe() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isDebugEnabled()) {
      return;
    }

    const logSnapshot = (reason: string) => {
      // eslint-disable-next-line no-console
      console.log(`${DEBUG_PREFIX} ${reason}`, collectSnapshot());
    };

    let rafId: number | null = null;
    const scheduleSnapshot = (reason: string) => {
      if (rafId !== null) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        logSnapshot(reason);
      });
    };

    logSnapshot("mounted");
    logSnapshot(`route:${pathname ?? "(unknown)"}`);

    const onResize = () => scheduleSnapshot("window.resize");
    const onOrientation = () => scheduleSnapshot("window.orientationchange");
    const onScroll = () => scheduleSnapshot("window.scroll");
    const onVvResize = () => scheduleSnapshot("visualViewport.resize");
    const onVvScroll = () => scheduleSnapshot("visualViewport.scroll");

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onOrientation, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", onVvResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", onVvScroll, { passive: true });

    const targetNodes: Array<{ name: string; node: HTMLElement }> = [
      { name: "html", node: document.documentElement },
      { name: "body", node: document.body },
    ];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== "attributes") {
          continue;
        }
        const element = record.target as HTMLElement;
        const attrName = record.attributeName ?? "unknown";
        // eslint-disable-next-line no-console
        console.log(`${DEBUG_PREFIX} mutation:${element.tagName.toLowerCase()}.${attrName}`, {
          className: element.className,
          style: element.getAttribute("style"),
        });
      }
      scheduleSnapshot("mutation");
    });
    for (const target of targetNodes) {
      observer.observe(target.node, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      // eslint-disable-next-line no-console
      console.log(`${DEBUG_PREFIX} observing:${target.name}`);
    }

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      window.removeEventListener("scroll", onScroll);
      window.visualViewport?.removeEventListener("resize", onVvResize);
      window.visualViewport?.removeEventListener("scroll", onVvScroll);
      // eslint-disable-next-line no-console
      console.log(`${DEBUG_PREFIX} unmounted`);
    };
  }, [pathname]);

  return null;
}
