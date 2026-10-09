"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { haptic } from "@/lib/haptics";
import { ButtonSpinner } from "@/components/ui/ButtonSpinner";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth";
import { hardClearAuthAndCache } from "@/lib/authFastPath";

// ─────────────────────────────────────────────────────────────────────────────
// SignOutButton — "leave your account".
//
// Deliberately NOT a top-bar control: it lives as the LAST item of the account
// drawer / sidebar footer, below a divider, so it can never sit adjacent to
// Back and be mis-tapped. It never renders an arrow — an arrow reads as Back.
//
// Phase 7 adds a static tripwire asserting that `signOut()` /
// `clearVenueSession()` / the three logout endpoints are called from this file
// and nowhere else. Add teardown here, not at the call site.
//
// Two known exceptions the tripwire has to allow, both legitimate and neither a
// sign-out: `JoinFlow.tsx` calls `signOut()` mid-login to drop a stale Supabase
// session before creating a profile, and `VenueHubClient.tsx` calls
// `clearVenueSession()` from its arrival watchdog.
//
// See docs/navigation-unification-plan.md §2c–2d.
// ─────────────────────────────────────────────────────────────────────────────

export type SignOutVariant = "player" | "partner" | "admin";

/**
 * The endpoint that expires each surface's HttpOnly session cookie.
 *
 * All three exist as of Phase 3 — `app/api/join/logout/route.ts` landed with it
 * and is the only thing that can revoke the player's 90-day `tp_sess`.
 */
const LOGOUT_ENDPOINT: Record<SignOutVariant, string> = {
  player: "/api/join/logout",
  partner: "/api/owner/auth/logout",
  admin: "/api/admin/logout",
};

const DEFAULT_REDIRECT: Record<SignOutVariant, string | null> = {
  player: "/",
  partner: "/owner/login",
  // Admin re-renders its own login state in place rather than navigating.
  admin: null,
};

/**
 * Runs the full teardown for one surface. Exported for the rare caller that
 * needs the sequence without this button's markup — prefer the component.
 *
 * Player teardown, in order:
 *   1. POST /api/join/logout   — the ONLY way to expire the HttpOnly `tp_sess`
 *      cookie (JS cannot clear it). `keepalive` so it survives the redirect.
 *   2. hardClearAuthAndCache() — aborts in-flight auth requests, then
 *      clearClientState(): memory store, managed localStorage, sessionStorage,
 *      `tp_venue_id` + `tp_user_id` cookies, and the auth-state reset events
 *      that make AuthSessionProvider drop its state.
 *   3. signOut()               — Supabase auth only; never touches app state,
 *      and is fire-and-forget because a network failure must not strand the
 *      user in a half-signed-out UI.
 *
 * The wait on the POST is capped. `keepalive` means the browser finishes the
 * request (and applies its Set-Cookie) even after we have navigated away, so
 * the await exists only to let the cookie land before a redirect re-enters the
 * gate — never to hold the UI hostage to a dead network. Without the cap, an
 * offline device would sit on a spinning Sign Out button forever.
 */
const LOGOUT_WAIT_CEILING_MS = 4000;

export async function performSignOut(variant: SignOutVariant): Promise<void> {
  const logout = fetch(LOGOUT_ENDPOINT[variant], { method: "POST", keepalive: true }).catch(() => {});

  if (variant === "player") {
    hardClearAuthAndCache();
    void signOut().catch(() => {});
  }

  await Promise.race([
    logout,
    new Promise((resolve) => setTimeout(resolve, LOGOUT_WAIT_CEILING_MS)),
  ]);
}

export type SignOutButtonProps = {
  variant: SignOutVariant;
  label?: string;
  /**
   * Where to go after teardown. `null` stays put (the caller re-renders).
   * Defaults: player `/`, partner `/owner/login`, admin `null`.
   */
  redirectTo?: string | null;
  /**
   * Runs after teardown and before any redirect — for state the button can't
   * own (JoinFlow's `venueListBuiltRef` reset and panel change, AdminShell's
   * `setAuthState("unauthenticated")`, closing the drawer).
   */
  onSignedOut?: () => void;
  /** Replaces the default danger row styling wholesale (admin/partner chrome). */
  className?: string;
  /**
   * Custom button content — e.g. an icon + text row to match a sidebar footer.
   * Falls back to `label` when omitted. The content still must not be an arrow.
   */
  children?: ReactNode;
  disabled?: boolean;
};

const DANGER_ROW_CLASS =
  "w-full rounded-ht-lg border border-rose-400/45 bg-rose-500/10 px-4 py-3 text-left text-base font-black text-rose-300 transition-colors hover:bg-rose-500/15 disabled:opacity-50";

export function SignOutButton({
  variant,
  label = "Sign Out",
  redirectTo,
  onSignedOut,
  className,
  children,
  disabled = false,
}: SignOutButtonProps) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busyRef.current || disabled) return;
    busyRef.current = true;
    if (variant === "player") haptic("warning");
    setBusy(true);
    try {
      await performSignOut(variant);
      onSignedOut?.();
      const destination = redirectTo === undefined ? DEFAULT_REDIRECT[variant] : redirectTo;
      if (destination) {
        router.push(destination);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [disabled, onSignedOut, redirectTo, router, variant]);

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={disabled || busy}
      aria-busy={busy}
      className={`${variant === "player" ? "tp-player-hit-target tp-player-pressable " : ""}${className ?? DANGER_ROW_CLASS}`}
    >
      {busy ? <><ButtonSpinner /> <span role="status">Signing out…</span></> : children ?? label}
    </button>
  );
}
