import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/serverSession";

// POST /api/join/logout — the player-side counterpart to
// `app/api/admin/logout` and `app/api/owner/auth/logout`.
//
// `tp_sess` is HttpOnly (set by `app/api/join/profile`), so the client teardown
// in `clearClientState()` physically cannot revoke it. Before this route
// existed, "Leave Venue" and JoinFlow's sign out left a 90-day server session
// alive on the device. `components/navigation/SignOutButton.tsx` POSTs here
// first — before the client state is wiped — so the request still carries the
// cookie it is expiring.
//
// `tp_venue_id` / `tp_user_id` are readable from JS and are cleared client-side
// too; they are expired here as well so a sign-out still lands even if the page
// unloads mid-teardown. See docs/navigation-unification-plan.md §2c–2d.

/**
 * Mirror of `lib/storage.ts`'s `setCookie` attributes — no HttpOnly, Path=/,
 * SameSite=Lax, plus the split-domain attr when configured. A browser matches a
 * cookie deletion on name + Domain + Path only, so the Domain has to be here or
 * the delete silently misses the real cookie once the domain split is live.
 */
function clearIdentityCookie(name: string): string {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  const domainAttr = domain ? `; Domain=${domain}` : "";
  return `${name}=; Max-Age=0; Path=/; SameSite=Lax${domainAttr}`;
}

export async function POST() {
  // Built as raw headers rather than via `response.cookies.set` on purpose:
  // `NextResponse`'s cookie helper snapshots the Set-Cookie header at
  // construction and rewrites it wholesale, which drops any header appended
  // alongside it.
  const headers = new Headers();
  headers.append("Set-Cookie", clearSessionCookie());
  headers.append("Set-Cookie", clearIdentityCookie("tp_venue_id"));
  headers.append("Set-Cookie", clearIdentityCookie("tp_user_id"));
  return NextResponse.json({ ok: true }, { headers });
}
