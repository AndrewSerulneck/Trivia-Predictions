import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isVenueScreenPath } from "@/lib/venueScreenPaths";
import { decideDomainSplit } from "@/lib/domainSplit";

export { isVenueScreenPath };

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  if (pathname === "/join" || pathname.startsWith("/join/")) {
    return true;
  }
  if (pathname === "/advertise" || pathname.startsWith("/advertise/")) {
    return true;
  }
  if (pathname === "/info" || pathname.startsWith("/info/")) {
    return true;
  }
  if (pathname === "/faqs" || pathname.startsWith("/faqs/")) {
    return true;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return true;
  }
  // Venue owner portal — not venue-scoped; guarded by its own tp_owner_sess auth.
  if (pathname === "/owner" || pathname.startsWith("/owner/")) {
    return true;
  }
  if (isVenueScreenPath(pathname)) {
    return true;
  }
  // Public TV pairing page (Phase 5b) — a TV browser has no auth cookies. Its
  // pairing APIs live under /api/tv-pair/* and are already covered by the /api/
  // rule below.
  if (pathname === "/tv" || pathname.startsWith("/tv/")) {
    return true;
  }
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return true;
  }
  if (pathname.startsWith("/_next/")) {
    return true;
  }
  if (pathname === "/favicon.ico") {
    return true;
  }
  if (pathname.startsWith("/brand/")) {
    return true;
  }
  if (/\.[a-z0-9]+$/i.test(pathname)) {
    return true;
  }
  return false;
}

function getVenueIdFromPath(pathname: string): string {
  const match = pathname.match(/^\/venue\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]).trim() : "";
}

function hasValidEntryHandoff(request: NextRequest, venueId: string): boolean {
  const entryUser = (request.nextUrl.searchParams.get("entryUser") ?? "").trim();
  const entryVenue = (request.nextUrl.searchParams.get("entryVenue") ?? "").trim();
  const entryAt = Number(request.nextUrl.searchParams.get("entryAt") ?? "");
  if (!entryUser || !entryVenue || !venueId) {
    return false;
  }
  if (entryVenue !== venueId) {
    return false;
  }
  if (!Number.isFinite(entryAt)) {
    return false;
  }
  return Date.now() - entryAt <= 60_000;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Phase 6 — domain split (flag-gated; no-op when NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED
  // is off or the host is unknown/preview). Runs before the auth gate so a game
  // route hit on the apex is bounced to `play.` regardless of session state.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const split = decideDomainSplit(host, pathname);
  if (split.action === "rewrite") {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = split.path;
    return NextResponse.rewrite(rewriteUrl);
  }
  if (split.action === "redirect") {
    const redirectUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${split.host}`);
    return NextResponse.redirect(redirectUrl, 308);
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const venueIdFromPath = getVenueIdFromPath(pathname);
  if (venueIdFromPath && hasValidEntryHandoff(request, venueIdFromPath)) {
    return NextResponse.next();
  }

  const venueId = request.cookies.get("tp_venue_id")?.value?.trim();
  const userId = request.cookies.get("tp_user_id")?.value?.trim();
  if (venueId && userId) {
    return NextResponse.next();
  }

  const redirectUrl = new URL("/", request.url);
  if (venueIdFromPath) {
    redirectUrl.searchParams.set("v", venueIdFromPath);
  }
  console.warn(`[Middleware] Redirecting unauthenticated request: ${pathname} → / (hasEntryHandoff=false, hasCookies=false)`);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
