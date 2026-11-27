// Hightop Challenge TV app: connecting a TV to a venue (docs/fire-tv-app-plan.md Phase 3).
//
// Pure and client-safe: used by the TV's /tv-app page, the partner's phone page and the API routes.
// The server side (rows, claims, lookups) is lib/tvConnect.ts.

import { DISPLAY_CODE_ALPHABET, DISPLAY_CODE_LENGTH } from "@/lib/displayCode";
import { marketingUrl } from "@/lib/domainSplit";
import { safeOwnerReturnPath } from "@/lib/ownerAuthCodes";

/** A connect code lives this long; the TV then shows "Press OK for a new code". */
export const TV_PAIR_TTL_MS = 10 * 60_000;
/** The TV asks "has anyone connected me?" this often, only while the Connect screen is visible. */
export const TV_PAIR_POLL_MS = 3_000;
/** Same alphabet as the 4-character display code (Crockford base32), 6 characters. */
export const TV_PAIR_CODE_LENGTH = 6;
const PAIR_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/** The TV sends its secret in this header, never in the URL. */
export const TV_PAIR_SECRET_HEADER = "x-tv-pair-secret";

/** Where the TV remembers its venue (the native app's bridge is preferred when present, lib/tvApp.ts). */
export const TV_VENUE_STORAGE_KEY = "tp_tv_venue_id";

/** The partner's phone page. On the apex (an /owner page), which the phone app never claims as an app link. */
export const TV_CONNECT_PATH = "/owner/display/connect";

/**
 * "TV mode" (plan D40, Phase AZ1): the sign-in pages were reached from a TV's Connect QR, because their `?next=`
 * returns to the Connect page. In TV mode they offer sign-in, password reset and Connect only: no signup, pricing,
 * billing or home link (Amazon's "consumption only" rule for the TV app). No separate query parameter.
 */
export const isTvConnectReturn = (next: unknown): boolean => {
  const safe = safeOwnerReturnPath(next);
  return safe !== null && new URL(safe, "https://example.invalid").pathname === TV_CONNECT_PATH;
};

/**
 * Uppercase, drop spaces and hyphens, and read look-alikes the Crockford way: O → 0, I and L → 1.
 * Does not validate (U, symbols and wrong lengths stay as typed).
 */
export const normalizeTvCode = (input: string): string =>
  String(input ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

/** A well-formed 4-character display code after tolerant normalizing, or null. */
export const parseTypedDisplayCode = (input: string): string | null => {
  const code = normalizeTvCode(input);
  return code.length === DISPLAY_CODE_LENGTH && [...code].every((ch) => DISPLAY_CODE_ALPHABET.includes(ch))
    ? code
    : null;
};

/** A well-formed 6-character connect code after tolerant normalizing, or null. */
export const parsePairCode = (input: unknown): string | null => {
  const code = normalizeTvCode(typeof input === "string" ? input : "");
  return PAIR_CODE_PATTERN.test(code) ? code : null;
};

/** The URL in the TV's QR code. */
export const tvConnectUrl = (pairCode: string): string =>
  marketingUrl(`${TV_CONNECT_PATH}?c=${encodeURIComponent(pairCode)}`);

export type TvPairingCreated = { ok: true; pairCode: string; pollSecret: string; expiresAt: string };
export type TvPairingStatus =
  | { ok: true; state: "waiting"; expiresAt: string }
  | { ok: true; state: "connected"; venueId: string }
  | { ok: true; state: "expired" };
export type TvDisplayCodeResult = { ok: true; venueId: string } | { ok: false; error: string };
export type TvConnectResult =
  | { ok: true }
  | { ok: false; code: "expired" | "not_your_venue" | "invalid" | "rate_limited" | "unavailable"; error: string };

/** Partner-facing copy, one home (product copy rule: fewest words). */
export const TV_CONNECT_COPY = {
  connected: "Connected.",
  expired: "Code expired. Scan the new one on your TV.",
  codeNotFound: "Code not found.",
} as const;
