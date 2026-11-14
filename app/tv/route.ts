import { NextResponse } from "next/server";
import { marketingUrl } from "@/lib/domainSplit";

// Bare /tv has no page: a display is set up only by its Display URL
// (hightopchallenge.com/tv/<code>, app/tv/[code]/route.ts). Code pairing was
// removed (docs/live-trivia-pregame-and-display-cleanup-plan.md D4). Anyone who
// still types the old address lands on the home page. A route handler, not a page,
// so it is a real 307 rather than a streamed client-side redirect.
export const dynamic = "force-dynamic";

export const GET = () => {
  const response = NextResponse.redirect(marketingUrl("/info"), 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};
