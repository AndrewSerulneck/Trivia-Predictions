"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { AlertTriangle, Camera } from "lucide-react";

export type CameraViewportState =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unsupported"
  | "error";

interface CameraViewportProps {
  stream: MediaStream | null;
  state: CameraViewportState;
  title?: string;
  subtitle?: string;
  errorMessage?: string | null;
  mirror?: boolean;
  className?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  children?: ReactNode;
}

function getStateLabel(state: CameraViewportState, errorMessage?: string | null): string {
  if (state === "requesting") return "Opening camera";
  if (state === "active") return "";
  if (state === "denied") return "Camera access is off";
  if (state === "unsupported") return "Camera unavailable";
  if (state === "error") return errorMessage ?? "Camera failed";
  return "Ready for your victory shot";
}

export function CameraViewport({
  stream,
  state,
  title = "Victory story",
  subtitle = "Hightop Challenge",
  errorMessage,
  mirror = true,
  className = "",
  videoRef,
  children,
}: CameraViewportProps) {
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const activeVideoRef = videoRef ?? internalVideoRef;
  const isActive = state === "active" && stream !== null;
  const stateLabel = getStateLabel(state, errorMessage);

  useEffect(() => {
    const video = activeVideoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;
    if (stream) {
      void video.play().catch(() => {
        // Mobile browsers may defer playback until layout/user activation settles.
      });
    }

    return () => {
      video.srcObject = null;
    };
  }, [activeVideoRef, stream]);

  return (
    <section className={`tp-story-camera-viewport ${className}`} aria-label="Story camera preview">
      <video
        ref={activeVideoRef}
        className={`tp-story-camera-video ${mirror ? "tp-story-camera-video-mirrored" : ""} ${
          isActive ? "opacity-100" : "opacity-0"
        }`}
        playsInline
        muted
        autoPlay
      />

      {!isActive ? (
        <div className="absolute inset-0 z-[1] flex flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/30 bg-cyan-300/10 text-cyan-100">
            {state === "denied" || state === "unsupported" || state === "error" ? (
              <AlertTriangle className="h-7 w-7" aria-hidden="true" />
            ) : (
              <Camera className="h-7 w-7" aria-hidden="true" />
            )}
          </div>
          <p className="text-base font-black text-white">{stateLabel}</p>
          {state === "requesting" ? (
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-300" />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-[2]">
        <div className="tp-story-preview-top-card absolute inset-x-5 top-5 rounded-2xl border px-4 py-3 text-white shadow-[0_12px_28px_rgba(0,0,0,0.34)] backdrop-blur-md">
          <p className="tp-story-preview-kicker text-[11px] font-black uppercase leading-none tracking-[0.14em]">
            {subtitle}
          </p>
          <h2 className="mt-1 text-2xl font-black leading-none text-white">{title}</h2>
        </div>
        {children ? null : (
          <div className="absolute inset-x-7 bottom-7 h-24 rounded-[24px] border border-dashed border-white/[0.22] bg-white/[0.04]" />
        )}
        <div className="absolute inset-0 rounded-[32px] ring-1 ring-inset ring-white/[0.12]" />
        {children}
      </div>
    </section>
  );
}
