"use client";

import { useEffect } from "react";
import { ownerRecoveryRedirectHref } from "@/lib/ownerRecoveryRedirect";

export const OwnerRecoveryRedirectGuard = () => {
  useEffect(() => {
    const redirectHref = ownerRecoveryRedirectHref(window.location.pathname, window.location.hash);
    if (redirectHref) {
      window.location.replace(redirectHref);
    }
  }, []);

  return null;
};
