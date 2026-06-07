"use client";

import { useLayoutEffect } from "react";

const TRIVIA_THEME_CLASS = "tp-trivia-theme";

export function TriviaThemeScope() {
  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.classList.add(TRIVIA_THEME_CLASS);
    document.body.classList.add(TRIVIA_THEME_CLASS);
    return () => {
      document.documentElement.classList.remove(TRIVIA_THEME_CLASS);
      document.body.classList.remove(TRIVIA_THEME_CLASS);
    };
  }, []);

  return null;
}
