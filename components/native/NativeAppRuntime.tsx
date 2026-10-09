"use client";

import { useEffect, useState, type ComponentType } from "react";
import { isNativeApp } from "@/lib/nativeApp";

// The native app's page-side runtime (docs/native-app-store-plan.md Phase 3),
// mounted once in app/layout.tsx. On the website this renders nothing and
// downloads nothing: the real runtime is a separate chunk fetched only inside
// the iPhone/Android app.

export const NativeAppRuntime = () => {
  const [Runtime, setRuntime] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    void import("@/components/native/NativeAppRuntimeImpl").then((module) => {
      if (!cancelled) setRuntime(() => module.NativeAppRuntimeImpl);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return Runtime ? <Runtime /> : null;
};
