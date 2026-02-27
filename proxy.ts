import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  if (pathname === "/join" || pathname.startsWith("/join/")) {
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
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const venueId = request.cookies.get("tp_venue_id")?.value?.trim();
  const userId = request.cookies.get("tp_user_id")?.value?.trim();
  if (venueId && userId) {
    return NextResponse.next();
  }

  const redirectUrl = new URL("/", request.url);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
