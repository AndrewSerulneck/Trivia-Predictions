// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// lib/useOwnerSheet.ts correctStep (docs/join-merch-store-plan.md Phase 4.2, F3),
// against jsdom's real `window.history`. The driver's pop/replace choice is pinned
// in tests/lib.owner-sheet-params.test.ts; this pins the hook's own guard: while a
// correction's pop is still on its way (history.go is asynchronous), a second call
// must not pop another entry. The Rewards wizard reports its correction from an
// effect that re-runs on every render, so the second call is real.

vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    window.addEventListener("popstate", listener);
    return () => window.removeEventListener("popstate", listener);
  };
  return {
    useSearchParams: () => {
      const search = useSyncExternalStore(subscribe, () => window.location.search);
      return useMemo(() => new URLSearchParams(search), [search]);
    },
  };
});

const { useOwnerSheet } = await import("@/lib/useOwnerSheet");

const landOn = (search: string) =>
  new Promise<void>((resolve) => {
    const onPop = () => {
      if (window.location.search !== search) return;
      window.removeEventListener("popstate", onPop);
      resolve();
    };
    window.addEventListener("popstate", onPop);
  });

describe("useOwnerSheet().correctStep", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("pops once, however often it is called before the pop lands; corrects again after", async () => {
    window.history.replaceState(null, "", "/owner/dashboard");
    window.history.pushState({ ownerSheetDepth: 1 }, "", "/owner/dashboard?sheet=rewards&step=definition");
    window.history.pushState({ ownerSheetDepth: 2 }, "", "/owner/dashboard?sheet=rewards&step=terms");
    window.history.pushState({ ownerSheetDepth: 3 }, "", "/owner/dashboard?sheet=rewards&step=prize");
    const go = vi.spyOn(window.history, "go");
    const { result } = renderHook(() => useOwnerSheet());
    expect(result.current.step).toBe("prize");

    const toTerms = landOn("?sheet=rewards&step=terms");
    await act(async () => {
      result.current.correctStep("definition");
      result.current.correctStep("definition");
      result.current.correctStep("definition");
      await toTerms;
    });
    expect(go).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.step).toBe("terms"));

    // A new entry that also lost its data is corrected in turn.
    const toDefinition = landOn("?sheet=rewards&step=definition");
    await act(async () => {
      result.current.correctStep("definition");
      await toDefinition;
    });
    expect(go).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.step).toBe("definition"));

    // On the sheet's first entry it rewrites in place instead.
    act(() => result.current.correctStep(null));
    expect(go).toHaveBeenCalledTimes(2);
    expect(window.location.search).toBe("?sheet=rewards");
    expect(window.history.state).toMatchObject({ ownerSheetDepth: 1 });
  });
});
