"use client";

import { useEffect, useRef } from "react";
import { isNativeApp } from "@/lib/nativeApp";

// ─────────────────────────────────────────────────────────────────────────────
// Android's hardware/gesture Back, inside the app (docs/native-app-store-plan.md
// Phase 3). The shell's @capacitor/app plugin hands every press to the page
// (components/native/NativeAppRuntime.tsx subscribes); the page decides here.
//
// No navigation logic lives in this file or in the shell. The controls that are
// already on screen register what THEY would do when tapped, and Back runs the
// most specific one:
//
//   1. "overlay" — the topmost open sheet/drawer (useModalOverlay): the same close
//      Escape does, so DiscardGuard still asks before throwing answers away.
//   2. "step"    — a multi-step flow's StepBackButton (WizardFooter's onBack).
//   3. "exit"    — the screen's ExitBackButton: useExitNavigation, unchanged.
//
// Same rank → the most recently registered wins (a sheet opened over a sheet).
// Nothing registered → the web view's own history, and at the very first page,
// put the app in the background (Android's convention) rather than doing nothing.
//
// Website: every hook below is inert (no app, no listener, nothing registered).
// ─────────────────────────────────────────────────────────────────────────────

export type NativeBackPriority = "overlay" | "step" | "exit";

const RANK: Record<NativeBackPriority, number> = { exit: 1, step: 2, overlay: 3 };

type Entry = { id: number; rank: number; run: () => void };

let entries: Entry[] = [];
let nextId = 0;

/** Register a Back action. Returns the unregister function. */
export const registerNativeBackHandler = (priority: NativeBackPriority, run: () => void): (() => void) => {
  nextId += 1;
  const entry: Entry = { id: nextId, rank: RANK[priority], run };
  entries = [...entries, entry];
  return () => {
    entries = entries.filter((candidate) => candidate !== entry);
  };
};

const pickHandler = (): Entry | null =>
  entries.reduce<Entry | null>((best, entry) => {
    if (!best) return entry;
    if (entry.rank !== best.rank) return entry.rank > best.rank ? entry : best;
    return entry.id > best.id ? entry : best;
  }, null);

export type NativeBackFallbacks = {
  /** The web view's history.back(). */
  goBack: () => void;
  /** Move the app to the background (App.minimizeApp). */
  minimize: () => void;
};

/** One Back press. `canGoBack` comes from the shell (WebView.canGoBack()). */
export const handleNativeBackPress = (canGoBack: boolean, fallbacks: NativeBackFallbacks): void => {
  const handler = pickHandler();
  if (handler) {
    handler.run();
    return;
  }
  if (canGoBack) {
    fallbacks.goBack();
    return;
  }
  fallbacks.minimize();
};

/** Test-only: forget every registration. */
export const resetNativeBackHandlersForTest = (): void => {
  entries = [];
};

/**
 * Register `run` as this component's Back action while it is mounted and
 * `run` is non-null. Always calls the latest `run` without re-registering
 * (so a control's position in the stack is its mount order, not its last render).
 */
export const useNativeBackHandler = (priority: NativeBackPriority, run: (() => void) | null): void => {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  const active = run !== null;
  useEffect(() => {
    if (!active || !isNativeApp()) return;
    return registerNativeBackHandler(priority, () => latest.current?.());
  }, [active, priority]);
};
