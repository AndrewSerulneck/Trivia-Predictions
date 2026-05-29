import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { decodeClientDataJSON, isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbError = {
  code?: string;
  message?: string;
};

export type WebAuthnFlowType = "registration" | "authentication";

export type UserRow = {
  id: string;
  auth_id: string | null;
  username: string;
  username_normalized?: string | null;
  venue_id: string;
  points: number;
  created_at: string;
  pin_salt?: string | null;
  pin_hash?: string | null;
};

export type UserPasskeyRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  credential_id_b64url: string;
  public_key_b64url: string;
  sign_count: number;
  transports: string[] | null;
  aaguid: string | null;
  device_type: string | null;
  backed_up: boolean | null;
  device_label: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

export type AccountRow = {
  id: string;
  auth_id: string | null;
  username: string;
  username_normalized: string;
  pin_salt: string | null;
  pin_hash: string | null;
  created_at: string;
};

export type WebAuthnChallengeRow = {
  id: string;
  user_id: string | null;
  account_id: string | null;
  flow_type: WebAuthnFlowType;
  challenge_b64url: string;
  rp_id: string;
  origin: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

const PROD_ORIGIN_DEFAULT = "https://hightopchallenge.com";
const DEV_ORIGIN_DEFAULT = "http://localhost:3000";
const PROD_RP_ID_DEFAULT = "hightopchallenge.com";
const DEV_RP_ID_DEFAULT = "localhost";
const RP_NAME_DEFAULT = "Hightop Challenge";

const COOKIE_USER_ID = "tp_user_id";
const COOKIE_VENUE_ID = "tp_venue_id";

const USERNAME_UPDATE_MIN_SECONDS = 30;
const USERNAME_UPDATE_MAX_SECONDS = 60 * 60 * 24 * 30;
const CHALLENGE_TTL_MIN_MS = 60_000;
const CHALLENGE_TTL_MAX_MS = 10 * 60_000;

function normalizeEnvValue(value: string | undefined): string {
  return String(value ?? "").trim();
}

function normalizeBooleanEnv(value: string | undefined): boolean {
  const normalized = normalizeEnvValue(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizePositiveInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const rounded = Math.floor(parsed);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function parseCsvEnv(value: string | undefined): string[] {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeOrigin(origin: string): string {
  const raw = origin.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const dbError = error as DbError | null;
  const message = String(dbError?.message ?? "").toLowerCase();
  return dbError?.code === "42703" || message.includes(columnName.toLowerCase());
}

function parseCookieHeader(cookieHeader: string): Map<string, string> {
  const values = new Map<string, string>();
  const chunks = cookieHeader.split(";");
  for (const chunk of chunks) {
    const [rawKey, ...rawValueParts] = chunk.trim().split("=");
    if (!rawKey) continue;
    const value = rawValueParts.join("=");
    try {
      values.set(decodeURIComponent(rawKey), decodeURIComponent(value));
    } catch {
      values.set(rawKey, value);
    }
  }
  return values;
}

function readCookieValue(request: Request, cookieName: string): string {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader) return "";
  const parsed = parseCookieHeader(cookieHeader);
  return (parsed.get(cookieName) ?? "").trim();
}

export function normalizeUsername(value: string): string {
  return value.trim();
}

export function normalizeUsernameForLookup(value: string): string {
  return normalizeUsername(value).toLowerCase();
}

export function normalizeVenueId(value: string): string {
  return value.trim();
}

export function getWebAuthnRpName(): string {
  return normalizeEnvValue(process.env.WEBAUTHN_RP_NAME) || RP_NAME_DEFAULT;
}

export function getUsernameUpdateCooldownSeconds(): number {
  return normalizePositiveInteger(
    process.env.USERNAME_UPDATE_COOLDOWN_SECONDS,
    3600,
    USERNAME_UPDATE_MIN_SECONDS,
    USERNAME_UPDATE_MAX_SECONDS
  );
}

export function getChallengeTtlMs(): number {
  return normalizePositiveInteger(
    process.env.WEBAUTHN_CHALLENGE_TTL_MS,
    5 * 60_000,
    CHALLENGE_TTL_MIN_MS,
    CHALLENGE_TTL_MAX_MS
  );
}

export function getAllowedOrigins(): string[] {
  const configured = parseCsvEnv(process.env.WEBAUTHN_ALLOWED_ORIGINS).map(normalizeOrigin).filter(Boolean);
  if (configured.length > 0) {
    return configured;
  }

  const prodOrigin = normalizeOrigin(process.env.WEBAUTHN_ORIGIN || PROD_ORIGIN_DEFAULT);
  const devOrigin = normalizeOrigin(process.env.WEBAUTHN_DEV_ORIGIN || DEV_ORIGIN_DEFAULT);
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? [prodOrigin] : [prodOrigin, devOrigin];
}

export function getAllowedRpIds(): string[] {
  const configured = parseCsvEnv(process.env.WEBAUTHN_ALLOWED_RP_IDS);
  if (configured.length > 0) {
    return configured;
  }
  const prodRpId = normalizeEnvValue(process.env.WEBAUTHN_RP_ID) || PROD_RP_ID_DEFAULT;
  const devRpId = normalizeEnvValue(process.env.WEBAUTHN_DEV_RP_ID) || DEV_RP_ID_DEFAULT;
  const isProd = process.env.NODE_ENV === "production";
  return isProd ? [prodRpId] : [prodRpId, devRpId];
}

export function deriveRequestOrigin(request: Request): string {
  const fromOriginHeader = normalizeOrigin(request.headers.get("origin") ?? "");
  if (fromOriginHeader) {
    return fromOriginHeader;
  }

  const forwardedProto = normalizeEnvValue(request.headers.get("x-forwarded-proto") ?? "");
  const forwardedHost = normalizeEnvValue(request.headers.get("x-forwarded-host") ?? "");
  const host = forwardedHost || normalizeEnvValue(request.headers.get("host") ?? "");
  if (host) {
    const proto = forwardedProto || (process.env.NODE_ENV === "production" ? "https" : "http");
    return normalizeOrigin(`${proto}://${host}`);
  }

  return "";
}

export function isOriginAllowed(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  return getAllowedOrigins().includes(normalized);
}

export function resolveRpIdForOrigin(origin: string): string {
  const normalized = normalizeOrigin(origin);
  const prodOrigin = normalizeOrigin(process.env.WEBAUTHN_ORIGIN || PROD_ORIGIN_DEFAULT);
  const devOrigin = normalizeOrigin(process.env.WEBAUTHN_DEV_ORIGIN || DEV_ORIGIN_DEFAULT);
  const prodRpId = normalizeEnvValue(process.env.WEBAUTHN_RP_ID) || PROD_RP_ID_DEFAULT;
  const devRpId = normalizeEnvValue(process.env.WEBAUTHN_DEV_RP_ID) || DEV_RP_ID_DEFAULT;

  if (normalized === devOrigin) {
    return devRpId;
  }
  if (normalized === prodOrigin) {
    return prodRpId;
  }

  // Fallback for explicitly configured custom origin lists.
  if (normalized.includes("localhost")) {
    return devRpId;
  }
  return prodRpId;
}

export function resolveAllowedOriginAndRpId(request: Request): { origin: string; rpId: string } {
  const origin = deriveRequestOrigin(request);
  if (!origin || !isOriginAllowed(origin)) {
    throw new Error("Origin is not allowed for WebAuthn.");
  }

  const rpId = resolveRpIdForOrigin(origin);
  if (!getAllowedRpIds().includes(rpId)) {
    throw new Error("RP ID is not allowed for WebAuthn.");
  }

  return { origin, rpId };
}

export function getSessionHintsFromCookies(request: Request): { userId: string; venueId: string } {
  return {
    userId: readCookieValue(request, COOKIE_USER_ID),
    venueId: readCookieValue(request, COOKIE_VENUE_ID),
  };
}

export function parseBearerToken(request: Request): string {
  const header = normalizeEnvValue(request.headers.get("authorization") ?? "");
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice("bearer ".length).trim();
}

export async function resolveSupabaseAuthUserId(
  supabaseAdmin: SupabaseClient | null,
  request: Request
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const token = parseBearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  const authUserId = String(data.user?.id ?? "").trim();
  return isUuid(authUserId) ? authUserId : null;
}

export function sanitizeUserId(value: unknown): string {
  const normalized = String(value ?? "").trim();
  return isUuid(normalized) ? normalized : "";
}

export function sanitizeCredentialId(value: unknown): string {
  return String(value ?? "").trim();
}

export function getCredentialTransportList(transports: unknown): AuthenticatorTransportFuture[] {
  if (!Array.isArray(transports)) return [];
  return transports
    .map((transport) => String(transport ?? "").trim())
    .filter((transport): transport is AuthenticatorTransportFuture =>
      ["ble", "cable", "hybrid", "internal", "nfc", "smart-card", "usb"].includes(transport)
    );
}

export function extractChallengeFromResponse(
  response: RegistrationResponseJSON | AuthenticationResponseJSON
): string {
  const clientDataJSON = response.response.clientDataJSON;
  const decoded = decodeClientDataJSON(clientDataJSON);
  return String(decoded.challenge ?? "").trim();
}

export function encodePublicKeyToBase64Url(publicKey: Uint8Array): string {
  return isoBase64URL.fromBuffer(new Uint8Array(publicKey));
}

export function decodePublicKeyFromBase64Url(publicKeyB64Url: string): Uint8Array {
  return new Uint8Array(isoBase64URL.toBuffer(publicKeyB64Url));
}

export function toWebAuthnUserIdBytes(userId: string): Uint8Array {
  return new Uint8Array(isoUint8Array.fromUTF8String(userId));
}

export function getGenericAuthFailureMessage(): string {
  return "Authentication failed. Please try again or use your PIN.";
}

export async function findUserByUsernameAndVenue(
  supabaseAdmin: SupabaseClient,
  params: { username: string; venueId: string }
): Promise<UserRow | null> {
  const username = normalizeUsername(params.username);
  const venueId = normalizeVenueId(params.venueId);
  if (!username || !venueId) {
    return null;
  }

  const normalizedUsername = normalizeUsernameForLookup(username);
  const withNormalized = await supabaseAdmin
    .from("users")
    .select("id, auth_id, username, username_normalized, venue_id, points, created_at, pin_salt, pin_hash")
    .eq("venue_id", venueId)
    .eq("username_normalized", normalizedUsername)
    .maybeSingle<UserRow>();

  if (!withNormalized.error) {
    return withNormalized.data ?? null;
  }

  if (!isMissingColumnError(withNormalized.error, "username_normalized")) {
    throw new Error(withNormalized.error.message);
  }

  // Backward-compatible fallback for environments where migration has not run yet.
  const fallback = await supabaseAdmin
    .from("users")
    .select("id, auth_id, username, venue_id, points, created_at, pin_salt, pin_hash")
    .eq("venue_id", venueId)
    .limit(200);

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  const row =
    ((fallback.data ?? []) as UserRow[]).find(
      (candidate) => normalizeUsernameForLookup(candidate.username) === normalizedUsername
    ) ?? null;
  if (!row) return null;
  return {
    ...row,
    username_normalized: normalizeUsernameForLookup(row.username),
  };
}

export async function findUserByIdAndVenue(
  supabaseAdmin: SupabaseClient,
  params: { userId: string; venueId: string }
): Promise<UserRow | null> {
  const userId = sanitizeUserId(params.userId);
  const venueId = normalizeVenueId(params.venueId);
  if (!userId || !venueId) {
    return null;
  }

  const query = await supabaseAdmin
    .from("users")
    .select("id, auth_id, username, username_normalized, venue_id, points, created_at, pin_salt, pin_hash")
    .eq("id", userId)
    .eq("venue_id", venueId)
    .maybeSingle<UserRow>();

  if (query.error) {
    if (!isMissingColumnError(query.error, "username_normalized")) {
      throw new Error(query.error.message);
    }
    const fallback = await supabaseAdmin
      .from("users")
      .select("id, auth_id, username, venue_id, points, created_at, pin_salt, pin_hash")
      .eq("id", userId)
      .eq("venue_id", venueId)
      .maybeSingle<UserRow>();
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    if (!fallback.data) return null;
    return {
      ...fallback.data,
      username_normalized: normalizeUsernameForLookup(fallback.data.username),
    };
  }

  return query.data ?? null;
}

export async function listPasskeysForUser(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<UserPasskeyRow[]> {
  const query = await supabaseAdmin
    .from("user_passkeys")
    .select(
      "id, user_id, credential_id_b64url, public_key_b64url, sign_count, transports, aaguid, device_type, backed_up, device_label, created_at, updated_at, last_used_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (query.error) {
    throw new Error(query.error.message);
  }

  return (query.data ?? []) as UserPasskeyRow[];
}

export async function createChallenge(
  supabaseAdmin: SupabaseClient,
  params: {
    userId?: string | null;
    accountId?: string | null;
    flowType: WebAuthnFlowType;
    challengeB64Url: string;
    rpId: string;
    origin: string;
    ttlMs?: number;
  }
): Promise<WebAuthnChallengeRow> {
  const ttlMs = Math.max(CHALLENGE_TTL_MIN_MS, Math.min(CHALLENGE_TTL_MAX_MS, params.ttlMs ?? getChallengeTtlMs()));
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const insert = await supabaseAdmin
    .from("webauthn_challenges")
    .insert({
      user_id: params.userId ?? null,
      account_id: params.accountId ?? null,
      flow_type: params.flowType,
      challenge_b64url: params.challengeB64Url,
      rp_id: params.rpId,
      origin: params.origin,
      expires_at: expiresAt,
    })
    .select("id, user_id, account_id, flow_type, challenge_b64url, rp_id, origin, expires_at, used_at, created_at")
    .single<WebAuthnChallengeRow>();

  if (insert.error || !insert.data) {
    throw new Error(insert.error?.message ?? "Failed to persist WebAuthn challenge.");
  }

  return insert.data;
}

export async function getActiveChallengeById(
  supabaseAdmin: SupabaseClient,
  params: { challengeId: string; flowType: WebAuthnFlowType }
): Promise<WebAuthnChallengeRow | null> {
  const challengeId = sanitizeUserId(params.challengeId);
  if (!challengeId) return null;

  const query = await supabaseAdmin
    .from("webauthn_challenges")
    .select("id, user_id, account_id, flow_type, challenge_b64url, rp_id, origin, expires_at, used_at, created_at")
    .eq("id", challengeId)
    .eq("flow_type", params.flowType)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<WebAuthnChallengeRow>();

  if (query.error) {
    throw new Error(query.error.message);
  }

  return query.data ?? null;
}

export async function markChallengeUsed(
  supabaseAdmin: SupabaseClient,
  challengeId: string
): Promise<void> {
  const id = sanitizeUserId(challengeId);
  if (!id) return;

  const update = await supabaseAdmin
    .from("webauthn_challenges")
    .update({ used_at: new Date().toISOString() })
    .eq("id", id)
    .is("used_at", null);

  if (update.error) {
    throw new Error(update.error.message);
  }
}

export function mapUserForResponse(user: UserRow) {
  return {
    id: user.id,
    authId: user.auth_id ?? undefined,
    username: user.username,
    venueId: user.venue_id,
    points: user.points,
    createdAt: user.created_at,
  };
}

export function chooseUserAndVenueFromRequest(request: Request, body: { userId?: unknown; venueId?: unknown }) {
  const fromBodyUserId = sanitizeUserId(body.userId);
  const fromBodyVenueId = normalizeVenueId(String(body.venueId ?? ""));
  if (fromBodyUserId && fromBodyVenueId) {
    return { userId: fromBodyUserId, venueId: fromBodyVenueId };
  }

  const cookieHints = getSessionHintsFromCookies(request);
  return {
    userId: sanitizeUserId(cookieHints.userId),
    venueId: normalizeVenueId(cookieHints.venueId),
  };
}

export function isPasskeyFeatureEnabled(): boolean {
  if (normalizeBooleanEnv(process.env.WEBAUTHN_DISABLED)) {
    return false;
  }
  return true;
}

export async function findAccountByUsername(
  supabaseAdmin: SupabaseClient,
  username: string
): Promise<AccountRow | null> {
  const normalized = normalizeUsernameForLookup(normalizeUsername(username));
  if (!normalized) return null;

  const query = await supabaseAdmin
    .from("accounts")
    .select("id, auth_id, username, username_normalized, pin_salt, pin_hash, created_at")
    .eq("username_normalized", normalized)
    .maybeSingle<AccountRow>();

  if (query.error) {
    throw new Error(query.error.message);
  }

  return query.data ?? null;
}

export async function findAccountById(
  supabaseAdmin: SupabaseClient,
  accountId: string
): Promise<AccountRow | null> {
  const id = sanitizeUserId(accountId);
  if (!id) return null;

  const query = await supabaseAdmin
    .from("accounts")
    .select("id, auth_id, username, username_normalized, pin_salt, pin_hash, created_at")
    .eq("id", id)
    .maybeSingle<AccountRow>();

  if (query.error) {
    throw new Error(query.error.message);
  }

  return query.data ?? null;
}

export async function listPasskeysForAccount(
  supabaseAdmin: SupabaseClient,
  accountId: string
): Promise<UserPasskeyRow[]> {
  const id = sanitizeUserId(accountId);
  if (!id) return [];

  const query = await supabaseAdmin
    .from("user_passkeys")
    .select(
      "id, user_id, account_id, credential_id_b64url, public_key_b64url, sign_count, transports, aaguid, device_type, backed_up, device_label, created_at, updated_at, last_used_at"
    )
    .eq("account_id", id)
    .order("created_at", { ascending: false });

  if (query.error) {
    throw new Error(query.error.message);
  }

  return (query.data ?? []) as UserPasskeyRow[];
}

export function mapAccountForResponse(account: AccountRow) {
  return {
    id: account.id,
    authId: account.auth_id ?? undefined,
    username: account.username,
  };
}
