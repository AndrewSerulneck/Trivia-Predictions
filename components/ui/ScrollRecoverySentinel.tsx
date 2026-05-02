"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function recoverScrollableState() {
  if (typeof document === "undefined") {
    return;
  }

  const body = document.body;
  const root = document.documentElement;

  body.classList.remove("tp-modal-open", "tp-popup-open");
  root.classList.remove("tp-modal-open", "tp-popup-open");

  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  body.style.overflow = "auto";
  root.style.overflow = "auto";
}

export function ScrollRecoverySentinel() {
  const pathname = usePathname();

  useEffect(() => {
    recoverScrollableState();
    const timer = window.setTimeout(() => {
      recoverScrollableState();
    }, 120);
    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
