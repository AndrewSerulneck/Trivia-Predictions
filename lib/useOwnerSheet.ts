"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  closeSheet as closeSheetInHistory,
  correctStep as correctStepInHistory,
  normalizeLandedSheet,
  parseSheetParam,
  parseStepParam,
  pushSheet,
  pushStep,
  readSheetDepth,
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
// `sheet` / `step` are the URL right now; `displayStepFor(id)` is that sheet's
// step, or the last one it showed, so a closing sheet keeps showing its content
// while it slides down (the URL is already clean by then). It is PER SHEET: when
// Rewards swaps straight to Schedule, the Rewards sheet slides away still on its
// own step instead of borrowing Schedule's (or none, which is its list).
//
// `step` is the RAW parsed slug. The flow resolves it against its own step
// list with `resolveStep()` and calls `correctStep()` if it had to correct it.

export type UseOwnerSheetResult = {
  sheet: OwnerSheetId | null;
  step: string | null;
  /** `id`'s step while it is open, else the last step it showed (null = never shown). */
  displayStepFor: (id: OwnerSheetId) => string | null;
  /** Open a sheet (new history entry). */
  openSheet: (sheet: OwnerSheetId, step?: string | null) => void;
  /** Advance to a step inside the open sheet (new history entry). */
  goToStep: (step: string) => void;
  /**
   * The URL's step can't be shown (a reload lost its data, a skip rule, an
   * invalid slug): land on `step` instead (null = the sheet's first screen).
   * Pops back to the screen under it when this sheet pushed one, else rewrites
   * in place, so a correction never leaves a duplicate history entry
   * (lib/ownerSheetParams.ts correctStep).
   */
  correctStep: (step: string | null) => void;
  /**
   * The in-sheet StepBack button. Pops history when the sheet pushed the
   * previous entry, so it matches the phone's Back; otherwise rewrites to
   * `previous` in place (null = the sheet's first screen, no `step`).
   */
  goBack: (previous: string | null) => void;
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

  // Hold each sheet's last step through its close animation.
  const [lastSteps, setLastSteps] = useState<Partial<Record<OwnerSheetId, string | null>>>(() =>
    sheet ? { [sheet]: step } : {}
  );
  if (sheet !== null && lastSteps[sheet] !== step) {
    setLastSteps((prev) => ({ ...prev, [sheet]: step }));
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

  // The entry a correction is popping away from, until the pop lands. history.go()
  // is asynchronous (it ends in popstate), so in between, a re-run of the flow's
  // correction effect (its deps changed, e.g. venues finished loading) must not
  // pop a second entry. Keyed by URL + depth (the entry popped to always has a
  // smaller depth). Cleared on that popstate, so a later visit to the same entry
  // (the browser's Forward) is corrected again.
  const poppingFrom = useRef<string | null>(null);

  const correctStep = useCallback(
    (targetStep: string | null) => {
      if (!sheet) return;
      const here = `${window.location.href}|${readSheetDepth(window.history.state)}`;
      if (poppingFrom.current === here) return;
      if (correctStepInHistory(window.history, browserLocation(), sheet, targetStep) !== "popped") return;
      poppingFrom.current = here;
      window.addEventListener(
        "popstate",
        () => {
          poppingFrom.current = null;
        },
        { once: true }
      );
    },
    [sheet]
  );

  const goBack = useCallback(
    (previous: string | null) => {
      if (!sheet) return;
      stepBack(window.history, browserLocation(), sheet, previous);
    },
    [sheet]
  );

  const closeSheet = useCallback(() => {
    closeSheetInHistory(window.history, browserLocation());
  }, []);

  const displayStepFor = useCallback(
    (id: OwnerSheetId): string | null => (sheet === id ? step : (lastSteps[id] ?? null)),
    [sheet, step, lastSteps]
  );

  return {
    sheet,
    step,
    displayStepFor,
    openSheet,
    goToStep,
    correctStep,
    goBack,
    closeSheet,
  };
};
