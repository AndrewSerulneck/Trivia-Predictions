// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// A game or prize push lands on its own Venue Home screen (away-mode plan, Phase C2).
const state = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));

import { VenuePanelFromUrl } from "@/components/venue/VenuePanelFromUrl";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("VenuePanelFromUrl", () => {
  it("shows the asked screen once and drops ?panel= (other params stay)", () => {
    state.search = "panel=prizes&message=m1";
    window.history.replaceState(null, "", "/venue/v1?panel=prizes&message=m1");
    const onPanel = vi.fn();
    render(createElement(VenuePanelFromUrl, { onPanel }));
    expect(onPanel).toHaveBeenCalledTimes(1);
    expect(onPanel).toHaveBeenCalledWith(2);
    expect(window.location.pathname + window.location.search).toBe("/venue/v1?message=m1");
  });

  it("does nothing without a known panel", () => {
    state.search = "panel=leaderboard";
    window.history.replaceState(null, "", "/venue/v1?panel=leaderboard");
    const onPanel = vi.fn();
    render(createElement(VenuePanelFromUrl, { onPanel }));
    expect(onPanel).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?panel=leaderboard");
  });
});
