"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { clearLoginInProgress, readLoginInProgress } from "@/lib/authFastPath";
import { isVenueScreenPath } from "@/lib/venueScreenPaths";

const STUCK_LOGIN_TIMEOUT_MS = 5000;

export function LoginStuckStateBreaker() {
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useAuthSession();

  useEffect(() => {
    const timer = window.setInterval(() => {
      const pendingLogin = readLoginInProgress();
      if (!pendingLogin) {
        return;
      }
      const currentPath = pathname ?? "";
      if (isVenueScreenPath(currentPath)) {
        return;
      }
      // Never force redirect while user is on join/login routes.
      if (currentPath === "/" || currentPath === "/join") {
        return;
      }
      if (!state.tokenVerified) {
        return;
      }
      if (Date.now() - pendingLogin.startedAt < STUCK_LOGIN_TIMEOUT_MS) {
        return;
      }

      clearLoginInProgress();
      window.dispatchEvent(new CustomEvent("tp:global-transition-hide", { detail: { force: true } }));
      const venueId = (state.venueId || pendingLogin.venueId).trim();
      if (!venueId) {
        return;
      }
      router.replace(`/venue/${encodeURIComponent(venueId)}`);
    }, 350);

    return () => {
      window.clearInterval(timer);
    };
  }, [pathname, router, state.tokenVerified, state.venueId]);

  return null;
}
