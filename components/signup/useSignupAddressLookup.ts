"use client";

import {
  useAddressLookup,
  type AddressLookup,
  type AddressLookupEndpoints,
} from "@/components/admin/useAddressLookup";

// Partner Self-Serve Signup — Phase 1.
//
// The public wizard's address step uses the SAME hook the admin venue form uses
// (request sequencing, 300ms debounce, Places session-token accounting), pointed
// at the flag-gated, rate-limited public route instead of the admin-gated ones.
// Do not fork useAddressLookup — see docs/partner-self-serve-signup-plan.md §4
// Phase 1.

/**
 * Both halves of the lookup hit one route; /api/signup/places discriminates on
 * the body (`query` → autocomplete, `placeId` → details) and rate-limits each
 * half separately, because Google bills them differently.
 */
export const SIGNUP_ADDRESS_LOOKUP_ENDPOINTS: AddressLookupEndpoints = {
  predict: "/api/signup/places",
  details: "/api/signup/places",
};

/** Public-signup flavour of useAddressLookup. Identical surface. */
export const useSignupAddressLookup = (): AddressLookup =>
  useAddressLookup(SIGNUP_ADDRESS_LOOKUP_ENDPOINTS);
