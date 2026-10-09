"use client";

import { useSyncExternalStore } from "react";
import { hasNativeCapability, isNativeApp, type NativeCapability } from "@/lib/nativeApp";

// `isNativeApp()` for render output (a link's href, which button to show).
// Hydration-safe: the server and the hydrating render both see `false` (the
// website), and React re-renders with the real answer straight after. Code that
// runs on a tap can call `isNativeApp()` directly instead.

const subscribe = (): (() => void) => () => {};
const serverSnapshot = (): boolean => false;

export const useIsNativeApp = (): boolean => useSyncExternalStore(subscribe, isNativeApp, serverSnapshot);

/**
 * `hasNativeCapability(name)` for render output: true only in an app build that contains the plugin.
 * Hydration-safe in the same way as `useIsNativeApp`.
 */
export const useHasNativeCapability = (name: NativeCapability): boolean =>
  useSyncExternalStore(subscribe, () => hasNativeCapability(name), serverSnapshot);
