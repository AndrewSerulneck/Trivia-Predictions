import "server-only";
import type { PosProviderId } from "@/lib/pos/providers";
import { squareAdapter } from "@/lib/pos/square";
import type { PosAdapter } from "@/lib/pos/types";

// POS rewards integration — provider adapter registry (docs/pos-rewards-integration-plan.md §3).
//
// The ONE place a route gets a provider adapter. Phase 2 registered Square
// (lib/pos/square.ts); Phase 3 adds `clover: cloverAdapter`. Toast stays absent (deferred,
// plan §1a).
//
// Registering an adapter here and flipping the provider's `availability` in
// lib/pos/providers.ts belong in the same change — tests/lib.pos-foundation.test.ts pins
// that every "available" provider has an adapter.

const ADAPTERS: Partial<Record<PosProviderId, PosAdapter>> = {
  square: squareAdapter,
};

/** The adapter for a provider, or null when that provider isn't built yet. */
export const getPosAdapter = (provider: PosProviderId): PosAdapter | null => ADAPTERS[provider] ?? null;

export const registeredPosProviders = (): PosProviderId[] => Object.keys(ADAPTERS) as PosProviderId[];
