"use client";

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { syncNativeStatusBar } from "@/lib/nativeStatusBar";
import { applyThemeForPath, PREFERS_LIGHT_MEDIA_QUERY, subscribeThemePreference } from "@/lib/theme";

/**
 * Keeps <html data-theme> right after the first paint (docs/light-theme-plan.md §3.3). The inline
 * script in app/layout.tsx handles a full page load; this handles in-app navigation, so leaving a
 * light screen for Live Trivia turns dark in the same commit (layout effect = before paint), and
 * "Match my phone" follows the phone switching between light and dark, and a choice made in another
 * tab is picked up here (Phase 8.4). It also keeps
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

  useEffect(() => {
    let media: MediaQueryList | null = null;
    try {
      media = window.matchMedia?.(PREFERS_LIGHT_MEDIA_QUERY) ?? null;
    } catch {
      media = null;
    }
    if (!media) return;
    const onChange = () => syncNativeStatusBar(applyThemeForPath(window.location.pathname));
    media.addEventListener("change", onChange);
    return () => media?.removeEventListener("change", onChange);
  }, []);

  return null;
};
