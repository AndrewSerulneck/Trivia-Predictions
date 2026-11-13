"use client";

import { useEffect } from "react";
import { useFx } from "@/components/venue-screen/fx/useFx";

// The faint twinkle field behind every venue-display screen (plan §4 Phase 3). Mount inside <FxProvider>.
// Ambient and unkeyed: it stops on unmount; the engine halves it in `lite` and drops it in `off` / reduced motion.

const STAGE_TWINKLE_COUNT = 14;

export const StageTwinkles = () => {
  const fx = useFx();
  useEffect(() => fx.twinkles({ count: STAGE_TWINKLE_COUNT }), [fx]);
  return null;
};
