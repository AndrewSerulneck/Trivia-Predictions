"use client";

import { useState } from "react";

type Phase = "burst" | "idle" | "pressed" | "releasing";

interface ExplodingLogoProps {
  width?: number;
  /** Background color variant to match the parent container */
  variant?: "canvas" | "slate";
}

export const ExplodingLogo = ({ width = 320, variant = "canvas" }: ExplodingLogoProps) => {
  const [phase, setPhase] = useState<Phase>("burst");

  const handlePointerDown = () => {
    if (phase !== "idle") return;
    setPhase("pressed");
  };

  const handlePointerUp = () => {
    if (phase !== "pressed") return;
    setPhase("releasing");
  };

  const handleAnimationEnd = () => {
    if (phase === "burst" || phase === "releasing") setPhase("idle");
  };

  const animationClass =
    phase === "burst"
      ? "animate-logo-burst"
      : phase === "pressed"
        ? "animate-logo-press"
        : phase === "releasing"
          ? "animate-logo-release"
          : "";

  const bgClass = variant === "slate" ? "bg-slate-900" : "bg-ht-canvas";

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full ${bgClass} isolate`}
      style={{ width: width, height: width }}
    >
      <img
        src={width > 120 ? "/brand/web/htc-logo-512.webp" : "/brand/web/htc-logo-192.webp"}
        alt="Hightop Challenge"
        width={width}
        className={`h-auto max-w-full select-none cursor-pointer ${animationClass}`}
        draggable={false}
        loading="eager"
        decoding="async"
        fetchPriority="high"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onAnimationEnd={handleAnimationEnd}
      />
    </div>
  );
};
