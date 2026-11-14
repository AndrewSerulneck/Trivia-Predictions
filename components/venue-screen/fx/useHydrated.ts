"use client";

import { useSyncExternalStore } from "react";

// False on the server and during hydration, true after: for text that depends on the device (time zone, locale),
// which the server can't know. Same pattern as useReducedMotionAfterHydration.

const subscribe = () => () => undefined;

export const useHydrated = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
