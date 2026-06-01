"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  endCurrentGameSession,
  gameTypeForPath,
  initializeAnalyticsRuntime,
  startGameSession,
} from "@/lib/analytics";

export function AnalyticsRuntime() {
  const pathname = usePathname();

  useEffect(() => {
    initializeAnalyticsRuntime();
  }, []);

  useEffect(() => {
    const gameType = gameTypeForPath(pathname);
    if (gameType) {
      startGameSession(gameType, pathname ?? window.location.pathname);
      return;
    }
    endCurrentGameSession("abandoned");
  }, [pathname]);

  return null;
}
