import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decideAppLinkDestination } from "@/lib/appDownloadLink";
import { apexBaseUrl, gameBaseUrl } from "@/lib/domainSplit";

// hightopchallenge.com/app — docs/native-app-store-plan.md Phase 9a. One 302 from the
// User-Agent; no database, no cookies. `private, no-store` because the answer depends on
// the device. The path is permanent (printed on shared pictures).
export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) => {
  const destination = decideAppLinkDestination(request.headers.get("user-agent"));
  const target =
    destination.kind === "external"
      ? destination.url
      : `${destination.host === "play" ? gameBaseUrl() : apexBaseUrl()}${destination.path}`;
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};
