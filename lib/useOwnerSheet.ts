"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  closeSheet as closeSheetInHistory,
  normalizeLandedSheet,
  parseSheetParam,
  parseStepParam,
  pushSheet,
  pushStep,
  replaceStep,
  SHEET_PARAM,
  STEP_PARAM,
  stepBack,
  type OwnerSheetId,
} from "@/lib/ownerSheetParams";

// The Partner Dashboard's open sheet + step, read from `?sheet=&step=`.
// See lib/ownerSheetParams.ts for why this lives in the URL.
//
// NEXT 16: useSearchParams() opts the page out of static rendering up to the
// nearest <Suspense>. The host must render the component that calls this hook
// inside a <Suspense> boundary (Phase 3 wraps the dashboard body in one), or
// `next build` fails with "useSearchParams() should be wrapped in a suspense
// boundary".
//
// Writes go through the native history API, which Next.js patches to keep
// useSearchParams in sync — not router.push — because the depth counter has to
// ride in history.state (router.push offers no way to attach it). Native
// pushState never scrolls, which is what `{ scroll: false }` was for.
//
// `sheet` / `step` are the URL right now; `displaySheet` / `displayStep` hold
// their last non-null values so a closing sheet keeps showing its content
// while it slides down (the URL is already clean by then).
//
// `step` is the RAW parsed slug. The flow resolves it against its own step
// list with `resolveStep()` and calls `replaceStep()` if it had to correct it.

export type UseOwnerSheetResult = {
  sheet: OwnerSheetId | null;
  step: string | null;
  displaySheet: OwnerSheetId | null;
  displayStep: string | null;
  /** Open a sheet (new history entry). */
  openSheet: (sheet: OwnerSheetId, step?: string | null) => void;
  /** Advance to a step inside the open sheet (new history entry). */
  goToStep: (step: string) => void;
  /** Rewrite the current step in place (skip rules, invalid-step correction). */
  replaceCurrentStep: (step: string | null) => void;
  /**
   * The in-sheet StepBack button. Pops history when the sheet pushed the
   * previous entry, so it matches the phone's Back; otherwise rewrites to
   * `previous` in place.
   */
  goBack: (previous: string) => void;
  /** Close the sheet, popping every entry it pushed. */
  closeSheet: () => void;
};

const browserLocation = () => ({
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
});

export const useOwnerSheet = (): UseOwnerSheetResult => {
  const searchParams = useSearchParams();
  const sheet = parseSheetParam(searchParams.get(SHEET_PARAM));
  const step = sheet ? parseStepParam(searchParams.get(STEP_PARAM)) : null;

  // Hold the last open sheet/step through the close animation.
  const [display, setDisplay] = useState<{ sheet: OwnerSheetId | null; step: string | null }>({ sheet, step });
  if (sheet !== null && (sheet !== display.sheet || step !== display.step)) {
    setDisplay({ sheet, step });
  }

  // Once, on landing: a deep-linked sheet gets a clean dashboard entry under it.
  useEffect(() => {
    normalizeLandedSheet(window.history, browserLocation());
  }, []);

  const openSheet = useCallback((target: OwnerSheetId, targetStep?: string | null) => {
    pushSheet(window.history, browserLocation(), target, targetStep);
  }, []);

  const goToStep = useCallback(
    (targetStep: string) => {
      if (!sheet) return;
      pushStep(window.history, browserLocation(), sheet, targetStep);
    },
    [sheet]
  );

  const replaceCurrentStep = useCallback(
    (targetStep: string | null) => {
      if (!sheet) return;
      replaceStep(window.history, browserLocation(), sheet, targetStep);
    },
    [sheet]
  );

  const goBack = useCallback(
    (previous: string) => {
      if (!sheet) return;
      stepBack(window.history, browserLocation(), sheet, previous);
    },
    [sheet]
  );

  const closeSheet = useCallback(() => {
    closeSheetInHistory(window.history, browserLocation());
  }, []);

  return {
    sheet,
    step,
    displaySheet: sheet ?? display.sheet,
    displayStep: sheet ? step : display.step,
    openSheet,
    goToStep,
    replaceCurrentStep,
    goBack,
    closeSheet,
  };
};
