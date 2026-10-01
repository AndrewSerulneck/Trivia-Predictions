// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { MerchCart } from "@/lib/merchPricing";
import { useVenueMerchCart } from "@/lib/useVenueMerchCart";

// docs/join-merch-store-plan.md Phase 4.1, F1: one Join Merch cart per venue.

const setup = (venueId: string | null) =>
  renderHook(({ id }: { id: string | null }) => useVenueMerchCart(id), { initialProps: { id: venueId } });

describe("useVenueMerchCart", () => {
  afterEach(cleanup);

  it("starts empty, and an unchanged update keeps the same object (no re-render churn)", () => {
    const { result } = setup("venue-a");
    const [first, setCart] = result.current;
    expect(first).toEqual({});
    act(() => setCart((prev) => prev));
    expect(result.current[0]).toBe(first);
  });

  it("switching venues never moves a cart: B starts empty, A's cart is back when switching back", () => {
    const { result, rerender } = setup("venue-a");
    act(() => result.current[1]({ "coasters-round": 250 }));
    expect(result.current[0]).toEqual({ "coasters-round": 250 });

    rerender({ id: "venue-b" });
    expect(result.current[0]).toEqual({});
    act(() => result.current[1]((prev) => ({ ...prev, "table-tents": 3 })));
    expect(result.current[0]).toEqual({ "table-tents": 3 });

    rerender({ id: "venue-a" });
    expect(result.current[0]).toEqual({ "coasters-round": 250 });
    rerender({ id: "venue-b" });
    expect(result.current[0]).toEqual({ "table-tents": 3 });
  });

  it("a setter created for venue A only ever writes A, even if called after the switch", () => {
    const { result, rerender } = setup("venue-a");
    const setForA = result.current[1];
    rerender({ id: "venue-b" });
    act(() => setForA((prev): MerchCart => ({ ...prev, "table-card-set": 2 })));
    expect(result.current[0]).toEqual({});
    rerender({ id: "venue-a" });
    expect(result.current[0]).toEqual({ "table-card-set": 2 });
  });

  it("with no venue the cart has its own bucket, which a venue that loads later does not inherit", () => {
    const { result, rerender } = setup(null);
    act(() => result.current[1]({ "table-tents": 1 }));
    expect(result.current[0]).toEqual({ "table-tents": 1 });
    rerender({ id: "venue-a" });
    expect(result.current[0]).toEqual({});
    rerender({ id: "" });
    expect(result.current[0]).toEqual({ "table-tents": 1 });
  });
});
