// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// Phase 7i (R2 #20.6): a player with no stored user id still gets the hidden-category list, so a hidden Current Events
// tab stays hidden and a visible one shows. Only the quota is skipped.

const mocks = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/storage", () => ({ getUserId: () => mocks.userId }));
vi.mock("@/components/trivia/TriviaGame", () => ({ TriviaGame: () => null }));
vi.mock("@/components/trivia/TriviaThemeScope", () => ({ TriviaThemeScope: () => null }));
vi.mock("@/components/venue/GameLandingExperience", () => ({
  GameLandingExperience: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/trivia/CategorySelect", () => ({
  CategorySelect: ({ hiddenCategories }: { hiddenCategories: ReadonlySet<string> }) =>
    createElement("p", null, `hidden:${[...hiddenCategories].join(",")}`),
}));

import { TriviaAppFrame } from "@/components/trivia/TriviaAppFrame";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TriviaAppFrame hidden categories", () => {
  it("fetches them without a stored user id", async () => {
    mocks.userId = null;
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, quota: null, hiddenCategories: [] }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(TriviaAppFrame));
    await screen.findByText("hidden:");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe("/api/trivia/quota");
  });

  it("stays hidden until the response says otherwise", async () => {
    mocks.userId = null;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(createElement(TriviaAppFrame));
    await waitFor(() => expect(screen.getByText("hidden:Current Events")).toBeTruthy());
  });

  it("sends the user id when there is one", async () => {
    mocks.userId = "u 1";
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, quota: null, hiddenCategories: [] }) }) as Response);
    vi.stubGlobal("fetch", fetchMock);
    render(createElement(TriviaAppFrame));
    await screen.findByText("hidden:");
    expect((fetchMock.mock.calls[0] as unknown[])[0]).toBe("/api/trivia/quota?userId=u%201");
  });
});
