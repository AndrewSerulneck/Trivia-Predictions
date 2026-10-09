"use client";

import { useEffect, useState } from "react";
import { handleNativeBackPress } from "@/components/navigation/nativeBackButton";
import { AppUpdateRequired } from "@/components/native/AppUpdateRequired";
import { addNativeListener, callNative, compareAppVersions, nativeAppVersion, nativePlatform } from "@/lib/nativeApp";

// Only ever loaded inside the app (components/native/NativeAppRuntime.tsx).
// Two jobs (docs/native-app-store-plan.md Phase 3):
//
// 1. Android Back → components/navigation/nativeBackButton.ts, which runs what
//    the on-screen controls would do. Registering any listener also turns off the
//    plugin's own default (a bare webView.goBack()).
// 2. The minimum-version gate. Old app versions stay in use; when one is too old
//    for the live site, GET /api/app/config says so and this shows "Please update"
//    instead of a half-working app. The check FAILS OPEN: no answer, a malformed
//    answer or no version → no gate. It runs once per page load, cached for the
//    tab's session so tapping around doesn't repeat it.

type AppConfigAnswer = {
  minSupportedVersion?: unknown;
  storeUrls?: { ios?: unknown; android?: unknown };
};

const CONFIG_CACHE_KEY = "htc:app-config";
const CONFIG_CACHE_MS = 30 * 60 * 1000;

const readCachedConfig = (): AppConfigAnswer | null => {
  try {
    const raw = window.sessionStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { at?: number; config?: AppConfigAnswer };
    if (typeof cached.at !== "number" || Date.now() - cached.at > CONFIG_CACHE_MS) return null;
    return cached.config ?? null;
  } catch {
    return null;
  }
};

const writeCachedConfig = (config: AppConfigAnswer): void => {
  try {
    window.sessionStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify({ at: Date.now(), config }));
  } catch {
    // No storage: the next page load asks again (the CDN answers it).
  }
};

const loadConfig = async (): Promise<AppConfigAnswer | null> => {
  const cached = readCachedConfig();
  if (cached) return cached;
  try {
    const response = await fetch("/api/app/config");
    if (!response.ok) return null;
    const config = (await response.json()) as AppConfigAnswer;
    writeCachedConfig(config);
    return config;
  } catch {
    return null;
  }
};

/** Pure: the store link for this phone when the app is below the minimum, else null-ish "no gate". */
export const decideAppUpdate = (
  version: string | null,
  platform: "ios" | "android" | null,
  config: AppConfigAnswer | null,
): { required: false } | { required: true; storeUrl: string | null } => {
  const minimum = typeof config?.minSupportedVersion === "string" ? config.minSupportedVersion : null;
  if (!version || !minimum || compareAppVersions(version, minimum) >= 0) return { required: false };
  const url = platform ? config?.storeUrls?.[platform] : null;
  return { required: true, storeUrl: typeof url === "string" && url.startsWith("https://") ? url : null };
};

export const NativeAppRuntimeImpl = () => {
  const [update, setUpdate] = useState<{ required: false } | { required: true; storeUrl: string | null }>({
    required: false,
  });

  useEffect(
    () =>
      addNativeListener("App", "backButton", (data) => {
        const canGoBack = Boolean((data as { canGoBack?: unknown } | null)?.canGoBack);
        handleNativeBackPress(canGoBack, {
          goBack: () => window.history.back(),
          minimize: () => {
            void callNative("App", "minimizeApp").catch(() => undefined);
          },
        });
      }) ?? undefined,
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void loadConfig().then((config) => {
      if (cancelled) return;
      const decision = decideAppUpdate(nativeAppVersion(), nativePlatform(), config);
      if (decision.required) setUpdate(decision);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return update.required ? <AppUpdateRequired storeUrl={update.storeUrl} /> : null;
};
