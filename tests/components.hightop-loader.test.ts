// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { LOADER_DELAY_MS, LOADER_MIN_VISIBLE_MS, useLoaderVisible } from "@/lib/useLoaderVisible";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 3: the show-delay /
// minimum-visible timing, and the loader's own structure. createElement, not JSX
// (the test glob is *.test.ts).

const { HightopLoader } = await import("@/components/ui/HightopLoader");

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

describe("useLoaderVisible", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("stays hidden for the whole delay, then shows", async () => {
    const { result } = renderHook(() => useLoaderVisible(true));
    expect(result.current).toBe(false);
    await advance(LOADER_DELAY_MS - 1);
    expect(result.current).toBe(false);
    await advance(1);
    expect(result.current).toBe(true);
  });

  it("never flashes when the load finishes inside the delay", async () => {
    const { result, rerender } = renderHook(({ loading }: { loading: boolean }) => useLoaderVisible(loading), {
      initialProps: { loading: true },
    });
    await advance(LOADER_DELAY_MS - 50);
    rerender({ loading: false });
    await advance(5_000);
    expect(result.current).toBe(false);
  });

  it("once shown, stays up for the minimum visible time after loading ends", async () => {
    const { result, rerender } = renderHook(({ loading }: { loading: boolean }) => useLoaderVisible(loading), {
      initialProps: { loading: true },
    });
    await advance(LOADER_DELAY_MS);
    expect(result.current).toBe(true);
    await advance(100);
    rerender({ loading: false });
    expect(result.current).toBe(true);
    await advance(LOADER_MIN_VISIBLE_MS - 100 - 1);
    expect(result.current).toBe(true);
    await advance(1);
    expect(result.current).toBe(false);
  });

  it("hides immediately when the minimum visible time has already elapsed", async () => {
    const { result, rerender } = renderHook(({ loading }: { loading: boolean }) => useLoaderVisible(loading), {
      initialProps: { loading: true },
    });
    await advance(LOADER_DELAY_MS + LOADER_MIN_VISIBLE_MS + 10);
    rerender({ loading: false });
    await advance(0);
    expect(result.current).toBe(false);
  });

  it("shows with no delay when delayMs is 0", () => {
    const { result } = renderHook(() => useLoaderVisible(true, { delayMs: 0 }));
    expect(result.current).toBe(true);
  });
});

describe("HightopLoader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing until the default delay has passed", async () => {
    render(createElement(HightopLoader));
    expect(screen.queryByRole("status")).toBeNull();
    await advance(LOADER_DELAY_MS);
    expect(screen.getByRole("status")).not.toBeNull();
  });

  it("renders immediately with delayMs 0, announcing a hidden label by default", () => {
    render(createElement(HightopLoader, { delayMs: 0 }));
    const status = screen.getByRole("status");
    expect(status.querySelector("p")?.className).toContain("sr-only");
    expect(status.textContent).toBe("Loading…");
  });

  it("draws the label when showLabel is set", () => {
    render(createElement(HightopLoader, { delayMs: 0, showLabel: true, label: "Loading games..." }));
    const paragraph = screen.getByRole("status").querySelector("p");
    expect(paragraph?.className).not.toContain("sr-only");
    expect(paragraph?.textContent).toBe("Loading games...");
  });

  it("loads the small shared WebP logo, decorative and sized per variant", () => {
    const { container } = render(createElement(HightopLoader, { delayMs: 0, size: "lg" }));
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/brand/web/htc-logo-192.webp");
    expect(img?.getAttribute("alt")).toBe("");
    expect(img?.getAttribute("width")).toBe("64");
  });

  it("animates the hop, the spin and the shadow, and stands still under Reduce Motion", () => {
    const { container } = render(createElement(HightopLoader, { delayMs: 0 }));
    const html = container.innerHTML;
    for (const animation of ["animate-logo-loader-body", "animate-logo-loader-spin", "animate-logo-loader-shadow"]) {
      expect(html).toContain(animation);
    }
    expect(html.match(/motion-reduce:animate-none/g)).toHaveLength(2);
    expect(html).toContain("motion-reduce:animate-logo-pulse");
    expect(html).toContain("motion-reduce:hidden");
  });

  it("covers the screen only in the fullScreen variant, and panels only in card", () => {
    const { container: full } = render(createElement(HightopLoader, { delayMs: 0, variant: "fullScreen" }));
    expect(full.firstElementChild?.className).toContain("fixed inset-0");
    cleanup();
    const { container: card } = render(createElement(HightopLoader, { delayMs: 0, variant: "card" }));
    expect(card.firstElementChild?.className).toContain("bg-ht-elevated");
    cleanup();
    const { container: plain } = render(createElement(HightopLoader, { delayMs: 0 }));
    expect(plain.firstElementChild?.className).not.toContain("fixed");
    expect(plain.firstElementChild?.className).not.toContain("bg-ht-elevated");
  });
});
