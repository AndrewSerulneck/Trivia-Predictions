// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useDelayedFlag } from "@/lib/hooks/useDelayedFlag";

/**
 * useDelayedFlag suppresses loading affordances that would otherwise flash.
 * Its user is Category Blitz's end-of-intermission beat: with the
 * round-boundary kick in place the next round normally arrives in about one
 * round-trip, so an un-delayed "Loading categories…" would appear and vanish
 * too fast to read — a glitch, not a status.
 */

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDelayedFlag", () => {
  it("stays false while active is false", () => {
    const { result } = renderHook(() => useDelayedFlag(false, 600));
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).toBe(false);
  });

  it("stays false for the whole grace window, then flips", () => {
    const { result } = renderHook(() => useDelayedFlag(true, 600));
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(599); });
    expect(result.current).toBe(false);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });

  it("never flips when active clears inside the grace window", () => {
    // The case that matters: a fast round-boundary hand-off. The countdown hits
    // zero, the round lands ~300ms later, and the player should never have seen
    // a loading message at all.
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDelayedFlag(active, 600),
      { initialProps: { active: true } },
    );

    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe(false);

    rerender({ active: false });
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(result.current).toBe(false);
  });

  it("re-arms the full grace window on a later activation", () => {
    // A stale `true` leaking into the next intermission would make the message
    // appear instantly at the following round boundary — the exact flash this
    // hook exists to prevent.
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useDelayedFlag(active, 600),
      { initialProps: { active: true } },
    );

    act(() => { vi.advanceTimersByTime(1_000); });
    expect(result.current).toBe(true);

    rerender({ active: false });
    expect(result.current).toBe(false);

    rerender({ active: true });
    expect(result.current).toBe(false);          // not instantly true again
    act(() => { vi.advanceTimersByTime(599); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });
});
