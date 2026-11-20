"use client";

import { useEffect, useSyncExternalStore } from "react";

// Keeps a TV (Fire TV, Google TV, smart-TV browsers) from dimming or starting its screensaver
// while the venue display is up.
//
// 1. Screen Wake Lock API where the browser has it; taken again whenever the page becomes visible
//    or the system drops it.
// 2. Otherwise (unsupported, or the request is refused): a 1 KB silent, muted, looping video. TV
//    platforms treat playing media as activity, which is what holds the screensaver off.
//
// Skipped when the page is embedded (the owner dashboard's preview iframes) so an owner's phone
// isn't held awake by a thumbnail. No network beyond the immutable-cached 1 KB video, once.
//
// `enabled` lets a page run it only while needed (the owner dashboard's Expand overlay: the frame
// inside is embedded, so the parent page holds the lock). `useKeepAwakeStatus` feeds the hidden
// `?awake=debug` readout; updated on events only, never polled.

export const KEEP_AWAKE_VIDEO_SRC = "/brand/web/keep-awake-v1.mp4";

type WakeLockHandle = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
};
type WakeLockSource = { request: (type: "screen") => Promise<WakeLockHandle> };

export type KeepAwakeStatus = {
  method: "wake-lock" | "video" | "none";
  wakeLockSupported: boolean;
  wakeLockHeld: boolean;
  releaseCount: number;
  lastError: string;
  videoPlaying: boolean;
  visibility: string;
  sinceMs: number;
};

const INITIAL_STATUS: KeepAwakeStatus = {
  method: "none",
  wakeLockSupported: false,
  wakeLockHeld: false,
  releaseCount: 0,
  lastError: "",
  videoPlaying: false,
  visibility: "unknown",
  sinceMs: 0,
};

let status: KeepAwakeStatus = INITIAL_STATUS;
let startedAt = 0;
const listeners = new Set<() => void>();

const setStatus = (patch: Partial<KeepAwakeStatus>) => {
  status = { ...status, ...patch, sinceMs: startedAt ? Date.now() - startedAt : 0 };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useKeepAwakeStatus = (): KeepAwakeStatus =>
  useSyncExternalStore(
    subscribe,
    () => status,
    () => INITIAL_STATUS,
  );

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const isEmbedded = (): boolean => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

export const useKeepScreenAwake = (enabled = true): void => {
  useEffect(() => {
    if (!enabled || isEmbedded()) return;
    startedAt = Date.now();
    status = INITIAL_STATUS;
    setStatus({ visibility: document.visibilityState });
    let cancelled = false;
    let handle: WakeLockHandle | null = null;
    let acquiring = false;
    let video: HTMLVideoElement | null = null;

    const playVideo = () => {
      if (cancelled) return;
      if (!video) {
        video = document.createElement("video");
        video.src = KEEP_AWAKE_VIDEO_SRC;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.setAttribute("muted", "");
        video.setAttribute("playsinline", "");
        video.setAttribute("aria-hidden", "true");
        video.tabIndex = -1;
        Object.assign(video.style, {
          position: "fixed",
          left: "0",
          bottom: "0",
          width: "1px",
          height: "1px",
          opacity: "0.01",
          pointerEvents: "none",
        });
        video.addEventListener("playing", () => setStatus({ videoPlaying: true }));
        video.addEventListener("pause", () => setStatus({ videoPlaying: false }));
        document.body.appendChild(video);
      }
      setStatus({ method: "video" });
      try {
        void video.play().catch((error: unknown) => setStatus({ lastError: errorMessage(error) }));
      } catch {
        // No media support — nothing else to try.
      }
    };

    const acquire = async () => {
      if (cancelled || handle || acquiring || document.visibilityState !== "visible") return;
      const source = (navigator as Navigator & { wakeLock?: WakeLockSource }).wakeLock;
      setStatus({ wakeLockSupported: Boolean(source) });
      if (!source) {
        playVideo();
        return;
      }
      acquiring = true;
      try {
        const next = await source.request("screen");
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        handle = next;
        setStatus({ method: "wake-lock", wakeLockHeld: true });
        // The system can drop the lock (power saving); take it again while still visible.
        next.addEventListener?.("release", () => {
          if (handle === next) handle = null;
          setStatus({ wakeLockHeld: false, releaseCount: status.releaseCount + 1 });
          if (!cancelled && document.visibilityState === "visible") void acquire();
        });
      } catch (error) {
        setStatus({ lastError: errorMessage(error) });
        playVideo();
      } finally {
        acquiring = false;
      }
    };

    // The browser drops the lock and may pause media while the page is hidden.
    const onVisibility = () => {
      setStatus({ visibility: document.visibilityState });
      if (document.visibilityState !== "visible") return;
      if (video) playVideo();
      void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      startedAt = 0;
      status = INITIAL_STATUS;
      listeners.forEach((listener) => listener());
      const held = handle;
      handle = null;
      if (held) {
        try {
          void held.release().catch(() => undefined);
        } catch {
          // Already released.
        }
      }
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        video = null;
      }
    };
  }, [enabled]);
};
