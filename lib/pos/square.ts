import "server-only";
import { SQUARE_API_VERSION, SQUARE_OAUTH_SCOPES, squareApiBase, type SquareAppConfig } from "@/lib/pos/squareConfig";
import type { SquareDiscountInput } from "@/lib/pos/squareDiscountSpec";
import type {
  PosAdapter,
  PosApplyResult,
  PosConnectionCredentials,
  PosEnvironment,
  PosFailure,
  PosFailureCode,
} from "@/lib/pos/types";

// Square REST client + PosAdapter (docs/pos-rewards-integration-plan.md Phase 2).
//
// Plain `fetch`, no SDK: we call nine endpoints, and Square's Node SDK is a large dependency
// for that. Every call pins Square-Version (lib/pos/squareConfig.ts) and times out after 10 s.
//
// What Square can do for us (verified in the sandbox, 2026-10-05 — Phase 2 handoff §5): it
// can't edit an open ticket rung up on the register, but it can create a real DIGITAL gift card
// and fund it without the Orders API. So a gift-card prize becomes a Square gift card the
// register takes like any other.
//
// NEVER log or persist a GAN (the gift card number): it is spendable money. Only the gift card
// ID (`gftc:…`) goes in our ledger; the number is fetched from Square when the guest opens it.

const TIMEOUT_MS = 10_000;

/** What a funded card says it was paid with: "a promotion", not a real tender. */
const PROMO_PAYMENT_INSTRUMENT = "hightop-challenge-prize";

type SquareErrorBody = { errors?: Array<{ category?: string; code?: string; detail?: string }> };

type SquareOk<T> = { ok: true; data: T };

const failure = (code: PosFailureCode, message: string, retryable: boolean): PosFailure => ({
  ok: false,
  code,
  message,
  retryable,
});

const failureForStatus = (status: number, body: SquareErrorBody | null): PosFailure => {
  const detail = (body?.errors ?? [])
    .map((error) => [error.code, error.detail].filter(Boolean).join(": "))
    .join("; ")
    .slice(0, 300);
  const message = `Square ${status}${detail ? ` — ${detail}` : ""}`;
  if (status === 401 || status === 403) return failure("unauthorized", message, false);
  if (status === 404) return failure("not_found", message, false);
  if (status === 429) return failure("rate_limited", message, true);
  if (status >= 500) return failure("provider_error", message, true);
  return failure("invalid", message, false);
};

type RequestOptions = {
  environment: PosEnvironment;
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** `Bearer <token>` for API calls; `Client <secret>` for RevokeToken. */
  authorization?: string;
};

const squareRequest = async <T>(options: RequestOptions): Promise<SquareOk<T> | PosFailure> => {
  try {
    const res = await fetch(`${squareApiBase(options.environment)}${options.path}`, {
      method: options.method,
      headers: {
        "Square-Version": SQUARE_API_VERSION,
        Accept: "application/json",
        ...(options.authorization ? { Authorization: options.authorization } : {}),
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => null)) as (T & SquareErrorBody) | null;
    if (res.ok && json) return { ok: true, data: json };
    // Square's sandbox has answered a 2xx with an EMPTY body (Phase 2b and 2c handoffs). We can't
    // tell what happened, so it is retryable; every create call carries an idempotency key, so
    // the retry returns the same object instead of a second one.
    if (res.ok) return failure("provider_error", `Square ${res.status} with an empty body`, true);
    return failureForStatus(res.status, json);
  } catch (error) {
    return failure("network", `Square unreachable — ${error instanceof Error ? error.name : "error"}`, true);
  }
};

const bearer = (token: string): string => `Bearer ${token}`;

// ── OAuth ─────────────────────────────────────────────────────────────────────────────────

/** Where "Connect Square" sends the partner. `session=false` is mandatory for production apps. */
export const squareAuthorizeUrl = (config: SquareAppConfig, state: string): string => {
  const params = new URLSearchParams({
    client_id: config.applicationId,
    scope: SQUARE_OAUTH_SCOPES.join(" "),
    session: "false",
    state,
  });
  return `${squareApiBase(config.environment)}/oauth2/authorize?${params.toString()}`;
};

export type SquareTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  merchantId: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  merchant_id?: string;
};

const tokensFrom = (data: TokenResponse): SquareTokens | PosFailure => {
  if (!data.access_token || !data.merchant_id) return failure("provider_error", "Square token response incomplete.", false);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_at ?? null,
    merchantId: data.merchant_id,
  };
};

/** ObtainToken, code flow. The code is single-use and short-lived. */
export const exchangeSquareCode = async (config: SquareAppConfig, code: string): Promise<SquareTokens | PosFailure> => {
  const result = await squareRequest<TokenResponse>({
    environment: config.environment,
    method: "POST",
    path: "/oauth2/token",
    body: {
      client_id: config.applicationId,
      client_secret: config.applicationSecret,
      code,
      grant_type: "authorization_code",
    },
  });
  return result.ok ? tokensFrom(result.data) : result;
};

/**
 * ObtainToken, refresh. Code-flow refresh tokens don't expire and can be reused (Square docs,
 * re-checked 2026-10-05), so two concurrent refreshes are harmless — unlike Clover's.
 */
export const refreshSquareAccessToken = async (
  config: SquareAppConfig,
  refreshToken: string,
): Promise<SquareTokens | PosFailure> => {
  const result = await squareRequest<TokenResponse>({
    environment: config.environment,
    method: "POST",
    path: "/oauth2/token",
    body: {
      client_id: config.applicationId,
      client_secret: config.applicationSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    },
  });
  return result.ok ? tokensFrom(result.data) : result;
};

/** RevokeToken: ends our access to this merchant. Authorised with the app secret, not the token. */
export const revokeSquareToken = async (config: SquareAppConfig, accessToken: string): Promise<{ ok: true } | PosFailure> => {
  const result = await squareRequest<{ success?: boolean }>({
    environment: config.environment,
    method: "POST",
    path: "/oauth2/revoke",
    authorization: `Client ${config.applicationSecret}`,
    body: { client_id: config.applicationId, access_token: accessToken },
  });
  return result.ok ? { ok: true } : result;
};

// ── Merchant + locations ─────────────────────────────────────────────────────────────────

export type SquareMerchant = { id: string; businessName: string | null; currency: string | null };

export const retrieveSquareMerchant = async (
  environment: PosEnvironment,
  accessToken: string,
): Promise<SquareMerchant | PosFailure> => {
  const result = await squareRequest<{ merchant?: { id?: string; business_name?: string; currency?: string } }>({
    environment,
    method: "GET",
    path: "/v2/merchants/me",
    authorization: bearer(accessToken),
  });
  if (!result.ok) return result;
  const merchant = result.data.merchant;
  if (!merchant?.id) return failure("provider_error", "Square merchant response incomplete.", false);
  return { id: merchant.id, businessName: merchant.business_name ?? null, currency: merchant.currency ?? null };
};

export type SquareLocation = {
  id: string;
  name: string;
  address: string | null;
  /** ISO 4217, e.g. "USD". Null if Square didn't say. */
  currency: string | null;
  /** ISO 3166 alpha-2, e.g. "US". Null if Square didn't say. */
  country: string | null;
};

type LocationRow = {
  id?: string;
  name?: string;
  status?: string;
  currency?: string;
  country?: string;
  address?: { address_line_1?: string; locality?: string };
};

/**
 * Can this location issue OUR gift cards? Prize amounts are US dollars, so only a US location
 * that works in USD (plan Phase 2c). Fails closed: a location Square didn't give a currency or
 * country for is not eligible.
 */
export const isSquareGiftCardLocation = (location: Pick<SquareLocation, "currency" | "country">): boolean =>
  location.currency === "USD" && location.country === "US";

/** ACTIVE locations only — gift cards can't be issued at an inactive one. */
export const listSquareLocations = async (
  environment: PosEnvironment,
  accessToken: string,
): Promise<SquareLocation[] | PosFailure> => {
  const result = await squareRequest<{ locations?: LocationRow[] }>({
    environment,
    method: "GET",
    path: "/v2/locations",
    authorization: bearer(accessToken),
  });
  if (!result.ok) return result;
  return (result.data.locations ?? [])
    .filter((row): row is LocationRow & { id: string } => Boolean(row.id) && row.status === "ACTIVE")
    .map((row) => ({
      id: row.id,
      name: row.name?.trim() || "Location",
      address: [row.address?.address_line_1, row.address?.locality].filter(Boolean).join(", ") || null,
      currency: row.currency?.trim().toUpperCase() || null,
      country: row.country?.trim().toUpperCase() || null,
    }));
};

// ── Gift cards ───────────────────────────────────────────────────────────────────────────

export type SquareGiftCard = {
  id: string;
  /** The card number. Return it to the card's owner only; never log or store it. */
  gan: string;
  state: string;
  balanceCents: number;
  /** ISO 4217 of the card's balance, e.g. "USD". */
  currency: string | null;
};

type GiftCardRow = { id?: string; gan?: string; state?: string; balance_money?: { amount?: number; currency?: string } };

const giftCardFrom = (row: GiftCardRow | undefined): SquareGiftCard | PosFailure => {
  if (!row?.id || !row.gan) return failure("provider_error", "Square gift card response incomplete.", false);
  return {
    id: row.id,
    gan: row.gan,
    state: row.state ?? "UNKNOWN",
    balanceCents: Number(row.balance_money?.amount ?? 0),
    currency: row.balance_money?.currency?.trim().toUpperCase() || null,
  };
};

export const retrieveSquareGiftCard = async (
  credentials: PosConnectionCredentials,
  giftCardId: string,
): Promise<SquareGiftCard | PosFailure> => {
  const result = await squareRequest<{ gift_card?: GiftCardRow }>({
    environment: credentials.environment,
    method: "GET",
    path: `/v2/gift-cards/${encodeURIComponent(giftCardId)}`,
    authorization: bearer(credentials.accessToken),
  });
  return result.ok ? giftCardFrom(result.data.gift_card) : result;
};

const requireLocation = (credentials: PosConnectionCredentials): string | PosFailure =>
  credentials.locationId ?? failure("invalid", "This Square connection has no location chosen.", false);

/**
 * Prepare: a DIGITAL card in state PENDING, balance $0 — worth nothing until activated.
 * `detail.currency` is the card's own currency (its $0 balance carries it, verified in the
 * sandbox 2026-10-06), which the caller checks BEFORE claiming the coupon (Phase 2c).
 */
const prepareReward: NonNullable<PosAdapter["prepareReward"]> = async ({ credentials, idempotencyKey }) => {
  const locationId = requireLocation(credentials);
  if (typeof locationId !== "string") return locationId;
  const result = await squareRequest<{ gift_card?: GiftCardRow }>({
    environment: credentials.environment,
    method: "POST",
    path: "/v2/gift-cards",
    authorization: bearer(credentials.accessToken),
    body: {
      idempotency_key: `${idempotencyKey}:create`,
      location_id: locationId,
      gift_card: { type: "DIGITAL" },
    },
  });
  if (!result.ok) return result;
  const card = result.data.gift_card;
  if (!card?.id) return failure("provider_error", "Square gift card response incomplete.", false);
  return {
    ok: true,
    externalRef: card.id,
    amountCents: 0,
    detail: {
      location_id: locationId,
      environment: credentials.environment,
      currency: card.balance_money?.currency?.trim().toUpperCase() || null,
    },
  };
};

/**
 * Apply: ACTIVATE the prepared card with the prize amount. Not processed through Square's
 * Orders API, so Square requires `buyer_payment_instrument_ids` (we name the promotion) and
 * accepts our `reference_id` (the coupon's redemption id).
 *
 * If the call fails in any way but "unauthorized" — Square refusing because the card is already
 * active (a retry after Square's idempotency window, when our first ACTIVATE succeeded but our
 * ledger update didn't land), or a 2xx with an empty body — re-read the card and treat an ACTIVE
 * card as success rather than leaving the guest stuck. Only this path ever activates our cards,
 * so ACTIVE means we funded it.
 */
const applyReward: PosAdapter["applyReward"] = async ({ credentials, idempotencyKey, redemptionId, value, preparedRef }) => {
  const locationId = requireLocation(credentials);
  if (typeof locationId !== "string") return locationId;
  if (!preparedRef) return failure("invalid", "Square applyReward needs the prepared gift card id.", false);

  const result = await squareRequest<{ gift_card_activity?: { id?: string; gift_card_balance_money?: { amount?: number } } }>({
    environment: credentials.environment,
    method: "POST",
    path: "/v2/gift-cards/activities",
    authorization: bearer(credentials.accessToken),
    body: {
      idempotency_key: `${idempotencyKey}:activate`,
      gift_card_activity: {
        type: "ACTIVATE",
        location_id: locationId,
        gift_card_id: preparedRef,
        activate_activity_details: {
          amount_money: { amount: value.amountCents, currency: value.currency },
          buyer_payment_instrument_ids: [PROMO_PAYMENT_INSTRUMENT],
          reference_id: redemptionId,
        },
      },
    },
  });

  if (result.ok) {
    const activity = result.data.gift_card_activity;
    return {
      ok: true,
      externalRef: preparedRef,
      amountCents: value.amountCents,
      detail: {
        activate_activity_id: activity?.id ?? null,
        balance_cents: Number(activity?.gift_card_balance_money?.amount ?? value.amountCents),
      },
    } satisfies PosApplyResult;
  }

  if (result.code !== "unauthorized") {
    const card = await retrieveSquareGiftCard(credentials, preparedRef);
    if (!("ok" in card) && card.state === "ACTIVE") {
      return { ok: true, externalRef: preparedRef, amountCents: value.amountCents, detail: { balance_cents: card.balanceCents, activate_recovered: true } };
    }
  }
  return result;
};

// ── Catalog discounts (Phase 2d) ─────────────────────────────────────────────────────────
//
// Menu-item prizes ("50% off an appetizer, up to $12") become ONE ready-made discount per prize
// in the partner's Square catalog, which staff tap at the register (lib/pos/squareDiscounts.ts).
// Verified in the sandbox 2026-10-06 (`npm run pos:spike -- square-discount`): a
// FIXED_PERCENTAGE discount keeps `maximum_amount_money`; an exact name search finds it,
// case-insensitively; a deleted one is no longer found. Needs ITEMS_READ + ITEMS_WRITE.

export type SquareCatalogDiscount = { id: string; name: string };

type CatalogObjectRow = { id?: string; type?: string; is_deleted?: boolean; discount_data?: { name?: string } };

const discountFrom = (row: CatalogObjectRow | undefined): SquareCatalogDiscount | null =>
  row?.id && row.type === "DISCOUNT" && !row.is_deleted && row.discount_data?.name
    ? { id: row.id, name: row.discount_data.name }
    : null;

/**
 * The live (not deleted) DISCOUNT whose name is exactly `name` (Square compares
 * case-insensitively), or null when there is none. One SearchCatalogObjects call.
 */
export const findSquareDiscountByName = async (
  credentials: PosConnectionCredentials,
  name: string,
): Promise<SquareCatalogDiscount | null | PosFailure> => {
  const result = await squareRequest<{ objects?: CatalogObjectRow[] }>({
    environment: credentials.environment,
    method: "POST",
    path: "/v2/catalog/search",
    authorization: bearer(credentials.accessToken),
    body: {
      object_types: ["DISCOUNT"],
      include_deleted_objects: false,
      query: { exact_query: { attribute_name: "name", attribute_value: name } },
      limit: 10,
    },
  });
  if (!result.ok) return result;
  const wanted = name.toLowerCase();
  for (const row of result.data.objects ?? []) {
    const discount = discountFrom(row);
    if (discount && discount.name.toLowerCase() === wanted) return discount;
  }
  return null;
};

/**
 * Create the discount at every location of the merchant (one Square account can serve two of
 * our venues). `idempotencyKey` should be fresh per attempt: replaying a key after the partner
 * deleted the discount would hand back the deleted object.
 */
export const createSquareDiscount = async (
  credentials: PosConnectionCredentials,
  input: SquareDiscountInput,
  idempotencyKey: string,
): Promise<SquareCatalogDiscount | PosFailure> => {
  const money = (cents: number) => ({ amount: cents, currency: "USD" });
  const discountData =
    input.kind === "FIXED_AMOUNT"
      ? { name: input.name, discount_type: "FIXED_AMOUNT", amount_money: money(input.amountCents ?? 0), pin_required: false }
      : {
          name: input.name,
          discount_type: "FIXED_PERCENTAGE",
          percentage: input.percentage ?? "0",
          ...(input.maxCents !== null ? { maximum_amount_money: money(input.maxCents) } : {}),
          pin_required: false,
        };
  const result = await squareRequest<{ catalog_object?: CatalogObjectRow }>({
    environment: credentials.environment,
    method: "POST",
    path: "/v2/catalog/object",
    authorization: bearer(credentials.accessToken),
    body: {
      idempotency_key: idempotencyKey,
      object: { type: "DISCOUNT", id: "#hightop-prize", present_at_all_locations: true, discount_data: discountData },
    },
  });
  if (!result.ok) return result;
  return discountFrom(result.data.catalog_object) ?? failure("provider_error", "Square discount response incomplete.", false);
};

/**
 * Not offered: Hightop never claws back a gift card a guest holds. A partner who must cancel
 * one deactivates it in their Square Dashboard (Gift Cards → the card → Deactivate).
 */
const reverse: PosAdapter["reverse"] = async () =>
  failure("invalid", "Square gift cards are not reversed by Hightop; deactivate the card in Square Dashboard.", false);

const describeConnection: PosAdapter["describeConnection"] = async (credentials) => {
  const merchant = await retrieveSquareMerchant(credentials.environment, credentials.accessToken);
  if ("ok" in merchant) return merchant;
  const locations = await listSquareLocations(credentials.environment, credentials.accessToken);
  const locationName = Array.isArray(locations)
    ? locations.find((location) => location.id === credentials.locationId)?.name ?? null
    : null;
  return { merchantName: merchant.businessName, locationName };
};

export const squareAdapter: PosAdapter = {
  provider: "square",
  prepareReward,
  applyReward,
  reverse,
  describeConnection,
};
