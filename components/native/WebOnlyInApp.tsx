import { headers } from "next/headers";
import type { ReactNode } from "react";
import { WebOnlyNotice } from "@/components/native/WebOnlyNotice";
import { isNativeUserAgent } from "@/lib/nativeApp";
import type { WebOnlyPagePath } from "@/lib/nativeLinkOut";

// Server gate for a web-only page (lib/nativeLinkOut.ts APP_WEB_ONLY_PAGES),
// used from that page's layout. Inside the app it renders "this is on our
// website — Open in browser" INSTEAD of the page, so the page's own code (Stripe
// checkout, signup, admin fetches) never runs in the app — not even for a Next
// router navigation, which the shell's link-out list can't see. The website
// renders the page exactly as before. Decided by the request's User-Agent, so
// there is no flash of the real page.

export const WebOnlyInApp = async ({ path, children }: { path: WebOnlyPagePath; children: ReactNode }) => {
  const inNativeApp = isNativeUserAgent((await headers()).get("user-agent"));
  return inNativeApp ? <WebOnlyNotice path={path} /> : <>{children}</>;
};
