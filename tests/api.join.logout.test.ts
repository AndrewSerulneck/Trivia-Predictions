import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { POST } from "@/app/api/join/logout/route";
import { createSessionCookie, readSession } from "@/lib/serverSession";

const ORIGINAL_SECRET = process.env.SESSION_SECRET;
const ORIGINAL_COOKIE_DOMAIN = process.env.NEXT_PUBLIC_COOKIE_DOMAIN;

const setCookies = async (): Promise<string[]> => {
  const response = await POST();
  return response.headers.getSetCookie();
};

const findCookie = (cookies: string[], name: string): string => {
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  expect(match, `no Set-Cookie for ${name}`).toBeTruthy();
  return match as string;
};

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-for-join-logout";
  delete process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL_SECRET;
  if (ORIGINAL_COOKIE_DOMAIN === undefined) delete process.env.NEXT_PUBLIC_COOKIE_DOMAIN;
  else process.env.NEXT_PUBLIC_COOKIE_DOMAIN = ORIGINAL_COOKIE_DOMAIN;
});

describe("POST /api/join/logout", () => {
  it("expires the HttpOnly tp_sess cookie", async () => {
    const cookie = findCookie(await setCookies(), "tp_sess");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/");
  });

  it("expires the JS-readable identity cookies too", async () => {
    const cookies = await setCookies();
    expect(findCookie(cookies, "tp_venue_id")).toContain("Max-Age=0");
    expect(findCookie(cookies, "tp_user_id")).toContain("Max-Age=0");
  });

  // A browser matches a cookie deletion on name + Domain + Path only. If this
  // regresses, sign-out silently no-ops on production after the domain split
  // while still looking correct locally.
  it("carries the split-domain attribute on every cookie it clears", async () => {
    process.env.NEXT_PUBLIC_COOKIE_DOMAIN = ".hightopchallenge.com";
    const cookies = await setCookies();
    for (const name of ["tp_sess", "tp_venue_id", "tp_user_id"]) {
      expect(findCookie(cookies, name).toLowerCase()).toContain("domain=.hightopchallenge.com");
    }
  });

  it("leaves no readable session behind", async () => {
    const live = createSessionCookie("player-1").split(";")[0];
    expect(readSession(new Request("https://x.test/", { headers: { cookie: live } }))).toBe("player-1");

    const cleared = findCookie(await setCookies(), "tp_sess").split(";")[0];
    expect(readSession(new Request("https://x.test/", { headers: { cookie: cleared } }))).toBeNull();
  });
});
