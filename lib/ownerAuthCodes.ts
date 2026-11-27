import { signupEntryPath } from "@/lib/selfServeSignup";

// Abandoned-signup cleanup — Phase 3.1 (docs/abandoned-signup-cleanup-plan.md).
//
// WHY A 401 NEEDS A REASON.
//
// `requireOwnerAuth` throws 401 for two completely different situations, and
// until this module they were indistinguishable to the caller:
//
//   1. NO SESSION — no cookie, a bad signature, or no SESSION_SECRET. The
//      caller is not signed in. "Sign in" is the right answer.
//   2. NO VENUE — the cookie is valid and correctly signed, but the owner it
//      names holds no venue that still exists. The caller IS signed in; there
//      is simply nothing behind the account.
//
// Case 2 is what a purged pending signup looks like from the browser (the owner
// row and its venue are gone; the cookie on the device is not), and sending it
// to /owner/login is the exact dead end this plan exists to remove: a sign-in
// page for an account that no longer exists, offered to someone who never
// believed they had one (plan §0.1). It must lead to the signup flow instead.
//
// Pure and dependency-light on purpose — NO `server-only`. `requireOwnerAuth`
// (server) writes these codes and /owner/* client pages read them, so the string
// has to be legal on both sides. Same "defined once, never re-typed at a call
// site" convention as OWNER_EMAIL_TAKEN_MESSAGE.

/** Not signed in: no cookie, or one that failed its HMAC check. */
export const OWNER_AUTH_NO_SESSION = "no_session";

/** Signed in, but the account holds no surviving venue. */
export const OWNER_AUTH_NO_VENUE = "no_venue";

export type OwnerAuthFailureCode = typeof OWNER_AUTH_NO_SESSION | typeof OWNER_AUTH_NO_VENUE;

export const OWNER_LOGIN_PATH = "/owner/login";

/**
 * Where an owner page should send someone whose request just 401'd.
 *
 * `no_venue` → the signup entry point, because there is nothing to sign in to.
 * ANYTHING ELSE → the login page. Deliberately not an exhaustive match: an
 * absent, unknown or malformed code (an older deploy, a proxy that ate the body,
 * a 401 from somewhere that is not `requireOwnerAuth`) must fall back to today's
 * behaviour rather than bounce a real, paying owner into a signup wizard.
 */
export const ownerAuthRecoveryPath = (code: unknown): string =>
  code === OWNER_AUTH_NO_VENUE ? signupEntryPath() : OWNER_LOGIN_PATH;

/**
 * A same-site path to return to after the partner signs in, or null. Only `/owner/...` paths, so an
 * attacker's `?next=` can never send a partner off our site (no scheme, no `//host`, no backslash).
 */
export const safeOwnerReturnPath = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 300) return null;
  if (!value.startsWith("/owner/")) return null;
  if (value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const parsed = new URL(value, "https://example.invalid");
    if (parsed.origin !== "https://example.invalid" || !parsed.pathname.startsWith("/owner/")) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
};

/** The sign-in page, coming back to `returnPath` afterwards. */
export const ownerLoginWithReturn = (returnPath: string): string => {
  const safe = safeOwnerReturnPath(returnPath);
  return safe ? `${OWNER_LOGIN_PATH}?next=${encodeURIComponent(safe)}` : OWNER_LOGIN_PATH;
};

export const OWNER_FORGOT_PASSWORD_PATH = "/owner/forgot-password";

/** "Forgot your password?", keeping the sign-in page's return path so "Back to sign in" can carry it on. */
export const ownerForgotPasswordWithReturn = (returnPath: unknown): string => {
  const safe = safeOwnerReturnPath(returnPath);
  return safe ? `${OWNER_FORGOT_PASSWORD_PATH}?next=${encodeURIComponent(safe)}` : OWNER_FORGOT_PASSWORD_PATH;
};
