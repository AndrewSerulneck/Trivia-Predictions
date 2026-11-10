"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onPushTapped, onPushTokenChanged, syncPushRegistration } from "@/lib/nativePush";
import { savePlayerPanel } from "@/lib/playerViewState";
import { venuePushLanding } from "@/lib/pushLanding";

// The app's push runtime (docs/native-app-store-plan.md Phase 5.1). Rendered by PlayerRuntime only
// inside the app, so the website never downloads it. It
//   - opens the page a tapped push points to (the plugin keeps the tap that launched the app until this
//     listener attaches, so a cold start lands on the right page too);
//   - re-registers when Firebase rotates the token;
//   - refreshes an opted-in phone's registration on navigation (a no-op, no request, once it is done for
//     the day — lib/nativePush.ts).
export const NativePushRuntime = (): null => {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const stopTaps = onPushTapped((path) => {
      // A game/prize push picks its Venue Home screen first, so it survives a redirect via the sign-in list.
      const landing = venuePushLanding(path);
      if (landing) savePlayerPanel(landing.venueId, landing.panel);
      router.push(path);
    });
    const stopTokens = onPushTokenChanged(() => void syncPushRegistration({ force: true }));
    return () => {
      stopTaps?.();
      stopTokens?.();
    };
  }, [router]);

  useEffect(() => {
    void syncPushRegistration();
  }, [pathname]);

  return null;
};
