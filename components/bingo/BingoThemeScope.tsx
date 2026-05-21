"use client";

import { useEffect } from "react";

const BINGO_THEME_CLASS = "tp-bingo-theme";

export function BingoThemeScope() {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.add(BINGO_THEME_CLASS);
    document.body.classList.add(BINGO_THEME_CLASS);
    return () => {
      document.documentElement.classList.remove(BINGO_THEME_CLASS);
      document.body.classList.remove(BINGO_THEME_CLASS);
    };
  }, []);

  return null;
}
