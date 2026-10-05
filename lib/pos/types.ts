import type { PosProviderId } from "@/lib/pos/providers";

// POS rewards integration — the adapter contract (docs/pos-rewards-integration-plan.md §3).
//
// One adapter per provider (lib/pos/<provider>.ts, added in Phase 2 / 3) behind this one
// interface. Routes call the registry (lib/pos/registry.ts), never a provider API directly.
// Adapters talk REST with `fetch` unless an official SDK is clearly lighter — justify any SDK
// in that phase's handoff.
//
// What an adapter does NOT do: write our database, mark a coupon redeemed, or decide
// idempotency. The caller (Phase 2/3's apply service) owns the pos_reward_applications
// ledger row and the redeem RPC; the adapter only performs the provider call it is asked
// for and reports what happened. Pass `idempotencyKey` through to the provider wherever it
// accepts one (Square: every create call takes `idempotency_key`).

export type PosEnvironment = "sandbox" | "production";

/** A connection with its tokens DECRYPTED. Exists only server-side, only for one call. */
export type PosConnectionCredentials = {
  connectionId: string;
  venueId: string;
  provider: PosProviderId;
  environment: PosEnvironment;
  merchantId: string;
  locationId: string | null;
  accessToken: string;
};

/** What a prize is worth at the register, already resolved by lib/pos/prizeValue.ts. */
export type PosRewardValue = {
  amountCents: number;
  currency: "USD";
  /** Shown on the check / gift card memo, e.g. "Hightop Challenge: $25 gift card". */
  label: string;
};

export type PosApplyInput = {
  credentials: PosConnectionCredentials;
  /** The ledger row's idempotency_key — forwarded to the provider where supported. */
  idempotencyKey: string;
  /** challenge_campaign_redemptions.id — goes in the provider's reference field. */
  redemptionId: string;
  value: PosRewardValue;
  /** Clover: the open order staff picked. Square: unused (gift cards aren't order-bound). */
  targetOrderId?: string | null;
  /**
   * What `prepareReward` created, when the provider has a prepare step (Square: the unfunded
   * gift card's id). applyReward then funds THAT object instead of creating a new one.
   */
  preparedRef?: string | null;
};

export type PosPrepareInput = {
  credentials: PosConnectionCredentials;
  idempotencyKey: string;
  redemptionId: string;
};

export type PosReverseInput = {
  credentials: PosConnectionCredentials;
  idempotencyKey: string;
  /** pos_reward_applications.external_ref of the apply being undone. */
  externalRef: string;
  externalDetail: Record<string, unknown>;
};

export type PosFailure = {
  ok: false;
  /** Stable, ours: "unauthorized" | "not_found" | "rate_limited" | "invalid" | "provider_error" | "network". */
  code: PosFailureCode;
  /** Server-log detail. Never shown raw to a guest or partner. */
  message: string;
  /** True when a retry with the same idempotency key may succeed. */
  retryable: boolean;
};

export type PosFailureCode = "unauthorized" | "not_found" | "rate_limited" | "invalid" | "provider_error" | "network";

export type PosApplySuccess = {
  ok: true;
  /** Becomes pos_reward_applications.external_ref. Never a bearer secret (see the migration). */
  externalRef: string;
  amountCents: number;
  /** Non-secret extras for pos_reward_applications.external_detail. */
  detail: Record<string, unknown>;
};

export type PosApplyResult = PosApplySuccess | PosFailure;

export type PosReverseResult = { ok: true } | PosFailure;

/** What the Partner Dashboard shows for a live connection. */
export type PosConnectionDescription = {
  merchantName: string | null;
  locationName: string | null;
};

export type PosAdapter = {
  provider: PosProviderId;
  /**
   * Optional first step that creates something WORTH NOTHING at the provider (Square: a
   * PENDING gift card with no balance). It exists so the caller can claim the coupon with the
   * once-only redeem RPC BETWEEN creating and funding: whichever of "guest confirm" and "POS"
   * claims first wins, and the loser leaves behind only a worthless object. Returns the
   * object's id as `externalRef`.
   */
  prepareReward?: (input: PosPrepareInput) => Promise<PosApplyResult>;
  applyReward: (input: PosApplyInput) => Promise<PosApplyResult>;
  reverse: (input: PosReverseInput) => Promise<PosReverseResult>;
  describeConnection: (credentials: PosConnectionCredentials) => Promise<PosConnectionDescription | PosFailure>;
};

/**
 * One provider's status as the Point of Sale sheet shows it. Built server-side by
 * lib/pos/connections.ts; carries no token, no merchant id — nothing a client could reuse.
 *
 *   coming_soon     — the provider isn't connectable yet (lib/pos/providers.ts).
 *   not_connected   — connectable, no live connection.
 *   connected       — an active connection.
 *   needs_attention — the provider refused us last time; reconnect.
 */
export type PosConnectionState = "coming_soon" | "not_connected" | "connected" | "needs_attention";

export type PosConnectionStatus = {
  provider: PosProviderId;
  label: string;
  pitch: string;
  state: PosConnectionState;
  merchantName: string | null;
  connectedAt: string | null;
  /** Connected, but the partner hasn't chosen which Square location issues gift cards yet. */
  needsLocation?: boolean;
};
