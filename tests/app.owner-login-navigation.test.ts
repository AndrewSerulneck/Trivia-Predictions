// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 4, item 4 + the Phase 7
// code review: signing in raises the full-screen partner loader straight away, so the tap
// is answered — and that success path deliberately leaves `submitting` set so the button
// can't be pressed twice.
//
// The risk that creates: `router.push` is not guaranteed to land (offline chunk fetch, a
// deploy-skew RSC 404, a cancelled navigation). Without a release, the partner is stranded
// behind a pointer-events-none loader with the submit button disabled for good. These tests
// pin the release, and that it does NOT fire on the paths that already recover.
// createElement, not JSX (*.test.ts glob).

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/owner/login",
  useSearchParams: () => new URLSearchParams(""),
}));

const { default: OwnerLoginPage } = await import("@/app/owner/login/page");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const submitButton = () => screen.getByRole("button", { name: /Sign In|Signing in/ }) as HTMLButtonElement;

/**
 * Fill the form and submit it, flushing the login fetch. Queried by selector, not by
 * label: this page's `<label>`s are plain siblings of their inputs with no htmlFor/id
 * pair, so getByLabelText finds nothing. (Pre-existing, unrelated to this plan.)
 */
const field = (selector: string): HTMLInputElement => {
  const el = document.querySelector<HTMLInputElement>(selector);
  if (!el) throw new Error(`no input for ${selector}`);
  return el;
};

const signIn = async () => {
  fireEvent.change(field('input[type="email"]'), { target: { value: "partner@example.com" } });
  fireEvent.change(field('input[autocomplete="current-password"]'), { target: { value: "hunter2" } });
  await act(async () => {
    fireEvent.click(submitButton());
  });
};

const loader = () => screen.queryByRole("status");

describe("Partner sign-in: the post-success loader always releases", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    push.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("raises the loader and locks the button the moment sign-in succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true })));
    render(createElement(OwnerLoginPage));
    await signIn();

    expect(push).toHaveBeenCalledWith("/owner/dashboard");
    expect(loader()).not.toBeNull();
    expect(submitButton().disabled).toBe(true);
  });

  it("gives the form back with an explanation if the navigation never lands", async () => {
    // `push` is a no-op here, which is exactly the failure being modelled: the page is
    // still mounted long after a successful sign-in.
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true })));
    render(createElement(OwnerLoginPage));
    await signIn();
    expect(submitButton().disabled).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(12_000);
    });

    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(loader()).toBeNull();
    expect(screen.getByText(/didn't open/)).not.toBeNull();
  });

  it("holds the loader up while a real navigation is still in flight", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true })));
    render(createElement(OwnerLoginPage));
    await signIn();

    // Well short of the watchdog: a slow phone fetching the dashboard's chunks must not
    // have the form yanked back from under it.
    await act(async () => {
      vi.advanceTimersByTime(8_000);
    });
    expect(loader()).not.toBeNull();
    expect(submitButton().disabled).toBe(true);
  });

  it("a rejected sign-in needs no watchdog: the form comes straight back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: false, error: "Wrong password." }, 401)));
    render(createElement(OwnerLoginPage));
    await signIn();

    expect(push).not.toHaveBeenCalled();
    expect(loader()).toBeNull();
    expect(submitButton().disabled).toBe(false);
    expect(screen.getByText("Wrong password.")).not.toBeNull();
  });
});
