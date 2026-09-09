import { afterEach, describe, expect, it } from "vitest";

import {
  OWNER_AUTH_NO_SESSION,
  OWNER_AUTH_NO_VENUE,
  OWNER_LOGIN_PATH,
  ownerAuthRecoveryPath,
} from "@/lib/ownerAuthCodes";

/**
 * Abandoned-signup cleanup — Phase 3.1 (docs/abandoned-signup-cleanup-plan.md).
 *
 * The whole point of this module is that ONE of the two 401 reasons leads away
 * from the login page. Everything else — an absent code, an unknown one, a
 * malformed body — must still land on login, because the cost of getting that
 * wrong is bouncing a real paying owner into a signup wizard.
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("ownerAuthRecoveryPath", () => {
  it("sends a signed-in owner with no venue to the signup flow, never to login", () => {
    process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED = "true";
    expect(ownerAuthRecoveryPath(OWNER_AUTH_NO_VENUE)).toBe("/owner/signup");
  });

  it("follows the flag: with self-serve off, no_venue goes to /owner/register", () => {
    // signupEntryPath() is the single home of "where does someone go to get a
    // venue". This must not pin /owner/signup, which 404s when the flag is off.
    delete process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED;
    expect(ownerAuthRecoveryPath(OWNER_AUTH_NO_VENUE)).toBe("/owner/register");
  });

  it("sends every other reason to login", () => {
    process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED = "true";
    for (const code of [
      OWNER_AUTH_NO_SESSION,
      undefined,
      null,
      "",
      "NO_VENUE",
      "no_venue ",
      0,
      {},
    ]) {
      expect(ownerAuthRecoveryPath(code), `${String(code)} must fall back to login`).toBe(
        OWNER_LOGIN_PATH,
      );
    }
  });

  it("the two codes are distinct", () => {
    expect(OWNER_AUTH_NO_SESSION).not.toBe(OWNER_AUTH_NO_VENUE);
  });
});
