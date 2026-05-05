"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { clearLoginInProgress, readLoginInProgress } from "@/lib/authFastPath";

const STUCK_LOGIN_TIMEOUT_MS = 5000;

export function LoginStuckStateBreaker() {
  const router = useRouter();
  const { state } = useAuthSession();

  useEffect(() => {
    const timer = window.setInterval(() => {
      const pendingLogin = readLoginInProgress();
      if (!pendingLogin) {
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
  }, [router, state.tokenVerified, state.venueId]);

  return null;
}
