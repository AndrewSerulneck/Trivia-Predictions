"use client";

import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createFxEngine, type FxEngine } from "@/components/venue-screen/fx/fxEngine";

// <FxProvider> mounts the venue display's single effects canvas (docs/venue-display-hype-and-intro-stinger-plan.md
// §4 Phase 0). Mount it once around the whole screen in VenueScreenClient, so the canvas sits OUTSIDE the scaled
// 2304×1296 stage and particles stay sharp at 4K. Panels fire effects with useFx().
//
// `armed`: pass `!introPlaying`. Keys fired before the gate arms (the page's first render, a reload mid-reveal,
// anything under the intro stinger) are remembered but never played; the gate arms FX_ARM_SETTLE_MS after
// `armed` turns true.

/** Grace after `armed` turns true, so panels' first-render keys are swallowed even with `intro=0`. */
export const FX_ARM_SETTLE_MS = 1_000;

/** Above the stage and the go-live takeover, below the intro stinger (z 80). */
export const FX_CANVAS_Z_INDEX = 60;

export const FxContext = createContext<FxEngine | null>(null);

export function FxProvider({ armed, children }: { armed: boolean; children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Creating the engine touches no browser API (safe on the server); attach() does, in an effect.
  const [engine] = useState(createFxEngine);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    return engine.attach(canvas);
  }, [engine]);

  useEffect(() => {
    if (!armed) return undefined;
    const id = window.setTimeout(engine.arm, FX_ARM_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [armed, engine]);

  return (
    <FxContext.Provider value={engine}>
      {children}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        data-testid="fx-canvas"
        className="pointer-events-none fixed left-0 top-0 block"
        style={{ zIndex: FX_CANVAS_Z_INDEX, visibility: "hidden", width: 0, height: 0 }}
        width={1}
        height={1}
      />
    </FxContext.Provider>
  );
}
