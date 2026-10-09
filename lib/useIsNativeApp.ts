"use client";

import { useSyncExternalStore } from "react";
import { isNativeApp } from "@/lib/nativeApp";

// `isNativeApp()` for render output (a link's href, which button to show).
// Hydration-safe: the server and the hydrating render both see `false` (the
// website), and React re-renders with the real answer straight after. Code that
// runs on a tap can call `isNativeApp()` directly instead.

const subscribe = (): (() => void) => () => {};
const serverSnapshot = (): boolean => false;

export const useIsNativeApp = (): boolean => useSyncExternalStore(subscribe, isNativeApp, serverSnapshot);
