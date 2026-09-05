// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GlobalTransitionOverlay } from "@/components/ui/GlobalTransitionOverlay";
import { runVenueGameOpenTransition, runVenueGameReturnTransition } from "@/lib/venueGameTransition";

vi.mock("next/navigation", () => ({ usePathname: () => "/venue/test" }));
vi.mock("framer-motion", () => ({
  useReducedMotion: () => true,
  motion: { div: ({ children, initial, animate, transition, onAnimationComplete, ...rest }: any) => React.createElement("div", rest, children) },
}));
vi.mock("@/components/ui/BouncingBallLoader", () => ({ BouncingBallLoader: () => React.createElement("div", null, "Transition loader") }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("finalizes the global overlay immediately and emits its hidden lifecycle event", () => {
  window.history.replaceState({}, "", "/venue/test");
  const hidden = vi.fn();
  window.addEventListener("tp:global-transition-overlay-hidden", hidden);
  render(React.createElement(GlobalTransitionOverlay));
  act(() => { window.dispatchEvent(new CustomEvent("tp:global-transition-show", { detail: { targetPath: "/bingo" } })); });
  expect(screen.getByText("Transition loader")).toBeTruthy();
  act(() => { window.dispatchEvent(new CustomEvent("tp:global-transition-hide")); });
  expect(screen.queryByText("Transition loader")).toBeNull();
  expect(hidden).toHaveBeenCalledOnce();
  window.removeEventListener("tp:global-transition-overlay-hidden", hidden);
});

it("navigates both directions without measuring, cloning or animating a card", async () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  const source = document.createElement("button");
  const measure = vi.spyOn(source, "getBoundingClientRect");
  const clone = vi.spyOn(source, "cloneNode");
  const navigate = vi.fn();
  await runVenueGameOpenTransition({ gameKey: "bingo", sourceElement: source, targetPath: "/bingo", navigate });
  await runVenueGameReturnTransition({ gameKey: "bingo", navigate });
  expect(navigate).toHaveBeenCalledTimes(2);
  expect(measure).not.toHaveBeenCalled();
  expect(clone).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("tp:venue:entry-snapshot:v1")).toBeTruthy();
  expect(document.querySelector("[data-venue-transition-overlay]")).toBeNull();
});
