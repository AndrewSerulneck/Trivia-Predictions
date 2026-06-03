"use client";

import { ANIMATION_REGISTRY } from "@/components/animations/animationRegistry";
import { useAnimationOverlayState } from "@/components/animations/AnimationTriggerProvider";

export function AnimationOverlay() {
  const { active, completeAnimation } = useAnimationOverlayState();

  if (!active) {
    return null;
  }

  const AnimationComponent = ANIMATION_REGISTRY[active.type];

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[1200] overflow-hidden"
      aria-hidden="true"
    >
      <AnimationComponent
        key={active.id}
        onComplete={() => {
          completeAnimation(active.id);
        }}
      />
    </div>
  );
}
