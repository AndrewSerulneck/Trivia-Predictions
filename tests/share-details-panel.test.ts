// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShareDetailsPanel } from "@/components/owner/share/ShareDetailsPanel";
import type { VenueShareDetails } from "@/lib/venueShareDetails";

// docs/native-app-store-plan.md Phase 9f.5 (R10-R12): the partner's "On shared pictures" box.

const details = (over: Partial<VenueShareDetails> = {}): VenueShareDetails => ({
  instagramHandle: "oldbar",
  showName: true,
  showAddress: true,
  showInstagram: true,
  ...over,
});

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[];
let getReplies: Record<string, VenueShareDetails | "fail">;

const json = (body: unknown) => ({ json: async () => body }) as Response;

beforeEach(() => {
  calls = [];
  getReplies = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ url, method, body });
      if (method === "PATCH") {
        return json({
          ok: true,
          details: details({
            instagramHandle: (body?.instagramHandle as string | null) ?? null,
            showName: Boolean(body?.showName),
            showAddress: Boolean(body?.showAddress),
            showInstagram: Boolean(body?.showInstagram),
          }),
        });
      }
      const id = new URL(url, "http://x").searchParams.get("venueId") ?? "";
      const reply = getReplies[id];
      return reply && reply !== "fail" ? json({ ok: true, details: reply }) : json({ ok: false, error: "boom" });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const gets = () => calls.filter((c) => c.method === "GET");

describe("ShareDetailsPanel (9f.5)", () => {
  it("R10: a failed first load offers Try again, which re-runs the GET", async () => {
    getReplies["r10"] = "fail";
    render(createElement(ShareDetailsPanel, { venueId: "r10" }));
    await screen.findByText("Couldn't load this setting.");
    getReplies["r10"] = details();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Name, address and @oldbar");
    expect(gets()).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("R11: A → B → A shows A's details, and a draft started on A is gone on B", async () => {
    getReplies["a"] = details({ showName: false });
    getReplies["b"] = details({ instagramHandle: "barb" });
    const view = render(createElement(ShareDetailsPanel, { venueId: "a" }));
    await screen.findByText("Address and @oldbar");
    fireEvent.click(screen.getByRole("button", { name: /Change what shared pictures show/ }));
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();

    view.rerender(createElement(ShareDetailsPanel, { venueId: "b" }));
    await screen.findByText("Name, address and @barb");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    view.rerender(createElement(ShareDetailsPanel, { venueId: "a" }));
    expect(screen.getByText("Address and @oldbar")).toBeTruthy();
    expect(screen.queryByText("…")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(gets()).toHaveLength(2);
  });

  it("R11: a message from venue A is not shown on venue B", async () => {
    getReplies["ma"] = details();
    getReplies["mb"] = details();
    const view = render(createElement(ShareDetailsPanel, { venueId: "ma" }));
    await screen.findByText("Name, address and @oldbar");
    fireEvent.click(screen.getByRole("button", { name: /Change what shared pictures show/ }));
    fireEvent.change(screen.getByPlaceholderText("@yourbar"), { target: { value: "my bar!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    view.rerender(createElement(ShareDetailsPanel, { venueId: "mb" }));
    await screen.findByText("Name, address and @oldbar");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("R12: with the handle off, a bad draft handle is not checked and the saved handle is sent unchanged", async () => {
    getReplies["r12"] = details();
    render(createElement(ShareDetailsPanel, { venueId: "r12" }));
    await screen.findByText("Name, address and @oldbar");
    fireEvent.click(screen.getByRole("button", { name: /Change what shared pictures show/ }));
    fireEvent.change(screen.getByPlaceholderText("@yourbar"), { target: { value: "my bar!" } });
    fireEvent.click(screen.getByRole("button", { name: /^Instagram handle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toMatchObject({ venueId: "r12", instagramHandle: "oldbar", showInstagram: false });
  });

  it("R12: with the handle on, an invalid handle is still refused", async () => {
    getReplies["r12b"] = details();
    render(createElement(ShareDetailsPanel, { venueId: "r12b" }));
    await screen.findByText("Name, address and @oldbar");
    fireEvent.click(screen.getByRole("button", { name: /Change what shared pictures show/ }));
    fireEvent.change(screen.getByPlaceholderText("@yourbar"), { target: { value: "my bar!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });
});
