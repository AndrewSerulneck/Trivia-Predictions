"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { syncNativeStatusBar } from "@/lib/nativeStatusBar";
import { applyThemeForPath, subscribeThemePreference } from "@/lib/theme";

/**
 * Keeps <html data-theme> right after the first paint (docs/light-theme-plan.md §3.3). The inline
 * script in app/layout.tsx handles a full page load; this handles in-app navigation, so leaving a
 * light screen for Live Trivia turns dark in the same commit (layout effect = before paint), and a
 * choice made in another tab is picked up here (Phase 8.4). It also keeps
 * `<meta name="theme-color">` and the app's status bar (lib/nativeStatusBar.ts) in step. Mounted by
 * the root layout only while the light-theme flag is on (`isLightThemeEnabled`). Renders nothing.
 */
export const ThemeRouteSync = () => {
  const pathname = usePathname();

  useLayoutEffect(() => {
    syncNativeStatusBar(applyThemeForPath(pathname));
  }, [pathname]);

  useEffect(
    () => subscribeThemePreference(() => syncNativeStatusBar(applyThemeForPath(window.location.pathname))),
    [],
  );

  return null;
};
