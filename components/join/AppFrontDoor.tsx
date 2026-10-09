"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HightopLoader } from "@/components/ui/HightopLoader";
import {
  PARTNER_LAUNCH_PATH,
  chooseAppLaunchDestination,
  isAppLaunchEntry,
  launchedFromLink,
  readRememberedAppSide,
} from "@/lib/appFrontDoor";
import { marketingHref } from "@/lib/domainSplit";

// The native app's front door on `/` (docs/native-app-store-plan.md Phase 2E
// item 4). `app/page.tsx` renders this ONLY when the request's User-Agent is the
// app's, so the website's `/` is untouched.
//
// It holds the player sign-in (its children) back until the launch decision is
// made, so a remembered partner's dashboard hop can't race JoinFlow's own
// start-up (a venue list, a location prompt). On every visit except a cold icon
// launch with "partner" remembered, the decision is immediate and the loader's
// show-delay means nothing is ever painted.

export const AppFrontDoor = ({ children }: { children: ReactNode }) => {
  const [showFrontDoor, setShowFrontDoor] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      const rememberedSide = readRememberedAppSide();
      if (!isAppLaunchEntry() || rememberedSide === null) {
        setShowFrontDoor(true);
        return;
      }
      const destination = chooseAppLaunchDestination({
        rememberedSide,
        partnerSession: "unchecked",
        launchedFromLink: await launchedFromLink(),
      });
      if (cancelled) return;
      if (destination === "partner-dashboard") {
        // replace, not assign: keeps the history at one entry, so the dashboard
        // still counts as the launch page (lib/appFrontDoor.ts isAppLaunchEntry).
        window.location.replace(marketingHref(PARTNER_LAUNCH_PATH));
        return;
      }
      setShowFrontDoor(true);
    };
    void decide();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!showFrontDoor) return <HightopLoader variant="fullScreen" size="lg" />;
  return <>{children}</>;
};
