// POS rewards integration — the provider catalog and master flag
// (docs/pos-rewards-integration-plan.md §3, Phase 1).
//
// Pure and client-safe: no `server-only`, no Node built-ins, only a NEXT_PUBLIC_*
// `process.env` read (inlined at build time). The Partner Dashboard's Point of Sale
// sheet and the server's status route both read this list, so the two can't disagree
// about which providers exist or which are connectable.
//
// Server-only pieces live beside it: lib/pos/crypto.ts (token encryption),
// lib/pos/registry.ts (provider adapters), lib/pos/connections.ts (DB reads).

export const POS_PROVIDER_IDS = ["square", "clover", "toast"] as const;

export type PosProviderId = (typeof POS_PROVIDER_IDS)[number];

/**
 * "available"   = the connect flow exists; the sheet shows "Connect".
 * "coming_soon" = listed, not connectable yet.
 *
 * Square became "available" in Phase 2 together with app/api/owner/pos/square/connect and
 * its registry adapter. Phase 3 does the same for Clover. Toast stays coming_soon (deferred,
 * plan §1a). "available" here means BUILT; a server without the Square app's env vars still
 * shows Square as coming soon (lib/pos/connections.ts asks lib/pos/squareConfig.ts).
 */
export type PosProviderAvailability = "available" | "coming_soon";

export type PosProviderInfo = {
  id: PosProviderId;
  label: string;
  /** One line for the partner: what connecting does for them. */
  pitch: string;
  availability: PosProviderAvailability;
};

export const POS_PROVIDERS: readonly PosProviderInfo[] = [
  {
    id: "square",
    label: "Square",
    pitch: "Gift card prizes become real Square gift cards your register accepts.",
    availability: "available",
  },
  {
    id: "clover",
    label: "Clover",
    pitch: "Staff put a guest's prize straight onto their open Clover check.",
    availability: "coming_soon",
  },
  {
    id: "toast",
    label: "Toast",
    pitch: "Redeem prizes from Toast's own Rewards button.",
    availability: "coming_soon",
  },
];

export const isPosProviderId = (value: unknown): value is PosProviderId =>
  typeof value === "string" && (POS_PROVIDER_IDS as readonly string[]).includes(value);

export const getPosProviderInfo = (id: PosProviderId): PosProviderInfo => {
  const info = POS_PROVIDERS.find((provider) => provider.id === id);
  if (!info) throw new Error(`Unknown POS provider: ${id}`);
  return info;
};

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag, `NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED`. Off (the default) = the Partner
 * Dashboard shows no "Point of Sale" row and `/api/owner/pos*` routes 404 — fully inert,
 * same reversible convention as NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED. It is a NEXT_PUBLIC_*
 * value, so changing it needs a redeploy. This is the single reader.
 */
export const isPosIntegrationsEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED);
