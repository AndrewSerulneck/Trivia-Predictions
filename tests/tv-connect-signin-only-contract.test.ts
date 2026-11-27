// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OWNER_AUTH_NO_SESSION, OWNER_AUTH_NO_VENUE } from "@/lib/ownerAuthCodes";
import { signupEntryPath } from "@/lib/selfServeSignup";
import { isTvConnectReturn } from "@/lib/tvConnectShared";

// docs/fire-tv-app-plan.md Phase AZ1 (D40). Amazon rejected the TV app because the Connect QR's sign-in page led to
// paid partner signup. Every page reached from that QR ("TV mode": `?next=` returns to /owner/display/connect) offers
// sign-in, password reset and Connect only. No signup, pricing, billing or home link, and a signed-in partner with no
// venue is told so instead of being sent to signup. The normal sign-in page is unchanged.
// createElement, not JSX (*.test.ts glob).

const replace = vi.fn();
const push = vi.fn();
// One router object, as in Next: the Connect page's load effect depends on it.
const router = { push, replace, refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const { default: LoginPage } = await import("@/app/owner/login/page");
const { default: ForgotPasswordPage } = await import("@/app/owner/forgot-password/page");
const { default: ConnectPage } = await import("@/app/owner/display/connect/page");

const CONNECT_RETURN = "/owner/display/connect?c=ABCDEF";
const ENCODED_RETURN = encodeURIComponent(CONNECT_RETURN);

type PageProps = { searchParams: Promise<Record<string, string | undefined>> };
type AnyPage = (props: PageProps) => ReactElement | Promise<ReactElement>;

/** Opens `url` and renders the page: an async server page is awaited first, a client page is rendered as is. */
const openPage = async (Page: unknown, url: string) => {
  window.history.replaceState(null, "", url);
  const params = Object.fromEntries(new URL(url, "https://example.invalid").searchParams);
  const page = Page as AnyPage;
  const element =
    page.constructor.name === "AsyncFunction"
      ? await page({ searchParams: Promise.resolve(params) })
      : createElement(page, { searchParams: Promise.resolve(params) });
  render(element);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const hrefs = () => Array.from(document.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");

const FORBIDDEN = (href: string) =>
  href === signupEntryPath() ||
  href.startsWith("/owner/signup") ||
  href.startsWith("/owner/register") ||
  href.startsWith("/owner/billing") ||
  href.startsWith("/owner/dashboard") ||
  href.startsWith("/owner/display?") ||
  href === "/owner/display" ||
  href === "/" ||
  /\/info(\?|#|$)/.test(href) ||
  /^https?:/.test(href);

describe("isTvConnectReturn", () => {
  it("is true only when `next` returns to the TV Connect page", () => {
    expect(isTvConnectReturn(CONNECT_RETURN)).toBe(true);
    expect(isTvConnectReturn("/owner/display/connect")).toBe(true);
    expect(isTvConnectReturn("/owner/display")).toBe(false);
    expect(isTvConnectReturn("/owner/display/connect/x")).toBe(false);
    expect(isTvConnectReturn("/owner/dashboard")).toBe(false);
    expect(isTvConnectReturn("https://evil.example/owner/display/connect")).toBe(false);
    expect(isTvConnectReturn(null)).toBe(false);
    expect(isTvConnectReturn(undefined)).toBe(false);
  });
});

describe("TV mode sign-in pages (Connect QR) offer sign-in only", () => {
  beforeEach(() => {
    replace.mockClear();
    push.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("login from the Connect QR: no signup, billing or home link; Forgot keeps `next`", async () => {
    await openPage(LoginPage, `/owner/login?next=${ENCODED_RETURN}`);

    expect(hrefs().filter(FORBIDDEN)).toEqual([]);
    expect(screen.queryByText(/create an account/i)).toBeNull();
    expect(screen.queryByText(/subscription|billing|pricing/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /home/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /home/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Forgot your password?" }).getAttribute("href")).toBe(
      `/owner/forgot-password?next=${ENCODED_RETURN}`,
    );
    expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
  });

  it("login reached any other way still offers Create an account", async () => {
    await openPage(LoginPage, "/owner/login");
    const link = screen.getByRole("link", { name: "Create an account" });
    expect(link.getAttribute("href")).toBe(signupEntryPath());
  });

  it("forgot password from the Connect QR: Back to sign in keeps `next`, nothing else leaves the flow", async () => {
    await openPage(ForgotPasswordPage, `/owner/forgot-password?next=${ENCODED_RETURN}`);
    expect(hrefs().filter(FORBIDDEN)).toEqual([]);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /back to sign in/i }));
    });
    const targets = [...push.mock.calls, ...replace.mock.calls].map(([href]) => String(href));
    expect(targets).toEqual([`/owner/login?next=${ENCODED_RETURN}`]);
  });

  it("connect page, signed in with no venue: says so and never sends the phone to signup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Unauthorized", code: OWNER_AUTH_NO_VENUE }, 401)));
    await act(async () => {
      await openPage(ConnectPage, CONNECT_RETURN);
    });

    await waitFor(() => expect(screen.getByText("No venue found for this account.")).toBeTruthy());
    const targets = replace.mock.calls.map(([href]) => String(href));
    expect(targets.filter(FORBIDDEN)).toEqual([]);
    expect(targets.some((href) => href.startsWith("/owner/signup") || href.startsWith("/owner/register"))).toBe(false);
  });

  it("connect page, signed out: goes to sign-in and comes back with the code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Unauthorized", code: OWNER_AUTH_NO_SESSION }, 401)));
    await act(async () => {
      await openPage(ConnectPage, CONNECT_RETURN);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/owner/login?next=${ENCODED_RETURN}`));
  });

  it("connect page, signed in: no back link to the dashboard and no partner menu", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true, venues: [{ id: "v1", name: "The Taproom" }] })));
    await act(async () => {
      await openPage(ConnectPage, CONNECT_RETURN);
    });
    await waitFor(() => expect(screen.getByText("The Taproom")).toBeTruthy());
    expect(hrefs().filter(FORBIDDEN)).toEqual([]);
    expect(screen.queryByRole("button", { name: /venue display|back|open menu/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Connect" })).toBeTruthy();
  });
});
