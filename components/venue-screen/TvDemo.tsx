"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { VenueScreenClient } from "@/components/venue-screen/VenueScreenClient";
import { useHydrated } from "@/components/venue-screen/fx/useHydrated";
import { TV_DEMO_STEP_MS, TV_DEMO_STEPS, TV_DEMO_VENUE, tvDemoStepAfter } from "@/lib/tvAppDemo";

// Try demo for the Hightop Challenge TV app (docs/fire-tv-app-plan.md Phase 3). Steps through lib/tvAppDemo.ts's
// fake screens, 15 s each, on the real display renderer with polling off: no requests, no database, no venue.
// Remote: Right / OK next, Left back a screen, Back (or Escape) leaves the demo.

const EXIT_KEYS = new Set(["Escape", "Backspace", "GoBack", "BrowserBack"]);
const NEXT_KEYS = new Set(["ArrowRight", "Enter", " "]);

export const TvDemo = () => {
  const router = useRouter();
  // Client-only render: every countdown is built from the moment its step starts, which the server can't know.
  const hydrated = useHydrated();
  const [step, setStep] = useState(() => ({ index: 0, startedAt: Date.now() }));

  const move = useCallback((delta: number) => {
    setStep((current) => ({ index: tvDemoStepAfter(current.index, delta), startedAt: Date.now() }));
  }, []);

  const exit = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.replace("/tv-app");
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => move(1), TV_DEMO_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [move, step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (EXIT_KEYS.has(event.key)) {
        event.preventDefault();
        exit();
      } else if (NEXT_KEYS.has(event.key)) {
        event.preventDefault();
        move(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit, move]);

  const state = useMemo(() => TV_DEMO_STEPS[step.index].build(step.startedAt), [step]);
  if (!hydrated) return <div className="fixed inset-0 bg-black" />;

  return (
    <>
      <VenueScreenClient
        venueId={TV_DEMO_VENUE.id}
        initialState={state}
        previewSlide={TV_DEMO_STEPS[step.index].slide ?? null}
        poll={false}
      />
      <div
        className="pointer-events-none fixed bottom-4 left-4 z-[60] rounded-full border border-white/25 bg-black/60 px-4 py-1 text-base font-black uppercase tracking-[0.16em] text-white/80"
        data-testid="tv-demo-tag"
      >
        Demo
      </div>
    </>
  );
};
