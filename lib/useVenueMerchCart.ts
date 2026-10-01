"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { MerchCart } from "@/lib/merchPricing";

// Join Merch carts, ONE PER VENUE (docs/join-merch-store-plan.md Phase 4.1, F1).
//
// The Partner Dashboard page owns this, above `DashboardBody key={venueId}`, so a
// cart survives the store closing and reopening. Keying it by venue is what stops
// a venue switch from silently re-addressing the cart: coasters picked for Venue A
// stay with A ("Ships to A", A's order draft), B starts empty, and switching back
// shows A's cart again. A reload empties every cart (plan §1 default).
//
// The setter is bound to the venue that was selected when it was created, so a
// functional update can only ever write that venue's cart.
//
// With no venue (still loading, or an account with none) the Shop still works,
// so its picks go in their own bucket. They do not follow a venue that loads
// afterwards: moving a cart between venues is exactly what F1 removed.

/** The cart bucket used while no venue is selected. */
export const NO_VENUE_CART_KEY = "";

const EMPTY_CART: MerchCart = Object.freeze({});

export const useVenueMerchCart = (
  venueId: string | null
): [cart: MerchCart, setCart: Dispatch<SetStateAction<MerchCart>>] => {
  const [carts, setCarts] = useState<Record<string, MerchCart>>({});
  const key = venueId || NO_VENUE_CART_KEY;

  const setCart = useCallback<Dispatch<SetStateAction<MerchCart>>>(
    (action) =>
      setCarts((prev) => {
        const current = prev[key] ?? EMPTY_CART;
        const next = typeof action === "function" ? action(current) : action;
        return next === current ? prev : { ...prev, [key]: next };
      }),
    [key]
  );

  return [carts[key] ?? EMPTY_CART, setCart];
};
