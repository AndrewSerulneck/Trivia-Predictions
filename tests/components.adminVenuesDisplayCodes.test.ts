// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// docs/fire-tv-app-plan.md Phase CR2.3 (F48): a failed display-codes load says so, with Retry.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/admin" }));

import { VenuesSection } from "@/components/admin/sections/VenuesSection";
import type { Venue } from "@/types";

const venue = { id: "venue-1", name: "Test Tavern", screenEnabled: true } as Venue;
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

let codeReplies: Array<() => Promise<Response>> = [];
const codeCalls = () =>
  vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("venue-display-codes")).length;

const mount = async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("venue-display-codes")) {
        const next = codeReplies.shift();
        return next ? next() : json({ ok: true, codes: { "venue-1": "ABC123" } });
      }
      return json({ ok: true, items: [] });
    }),
  );
  await act(async () => {
    render(
      createElement(VenuesSection, {
        venues: [venue],
        onVenueCreated: vi.fn(),
        onVenueUpdated: vi.fn(),
        onVenueDeleted: vi.fn(),
      }),
    );
  });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  codeReplies = [];
});

describe("Admin Venues display codes (F48)", () => {
  it("a rejected load shows \"Codes didn't load.\"; Retry loads the codes", async () => {
    codeReplies = [() => Promise.reject(new Error("offline"))];
    await mount();
    expect(screen.queryByText("Codes didn't load.")).not.toBeNull();
    expect(screen.queryByText("ABC123")).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    expect(codeCalls()).toBe(2);
    expect(screen.queryByText("Codes didn't load.")).toBeNull();
    expect(screen.queryByText("ABC123")).not.toBeNull();
  });

  it("an expired admin session (401) also says so", async () => {
    codeReplies = [async () => new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 })];
    await mount();
    expect(screen.queryByText("Codes didn't load.")).not.toBeNull();
  });

  it("a good load shows the code and no message", async () => {
    await mount();
    expect(screen.queryByText("ABC123")).not.toBeNull();
    expect(screen.queryByText("Codes didn't load.")).toBeNull();
  });
});
