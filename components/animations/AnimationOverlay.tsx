"use client";

import { useEffect } from "react";
import { useReducedMotion } from "framer-motion";
import { ANIMATION_REGISTRY } from "@/components/animations/animationRegistry";
import { useAnimationOverlayState } from "@/components/animations/AnimationTriggerProvider";

export function AnimationOverlay() {
  const { active, completeAnimation } = useAnimationOverlayState();

  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion && active) completeAnimation(active.id);
  }, [active, completeAnimation, reducedMotion]);

  if (!active || reducedMotion) {
    return null;
  }

  const AnimationComponent = ANIMATION_REGISTRY[active.type];

  return (
    <div
      data-animation-overlay
      className="pointer-events-none fixed inset-0 z-[1200] overflow-hidden"
      aria-hidden="true"
    >
      <AnimationComponent
        key={active.id}
        payload={active.payload}
        onComplete={() => {
          completeAnimation(active.id);
        }}
      />
    </div>
  );
}
