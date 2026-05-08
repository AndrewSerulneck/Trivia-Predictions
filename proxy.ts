import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
  if (pathname === "/faqs" || pathname.startsWith("/faqs/")) {
    return true;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
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
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
