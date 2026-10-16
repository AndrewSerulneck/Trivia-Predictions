import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// The opaque `entry` token on a Results standings row (docs/partner-results-page-plan.md §5d).
// It lets the partner open ONE player's breakdown without the page ever holding a player id.
//
// token = base64url(HMAC-SHA256(SESSION_SECRET, "results-entry:v1|venueId|competitionId|gameKey|userId")),
// cut to 22 characters (132 bits). The prefix keeps these MACs apart from every other use of the
// secret (the tp_sess cookie signs base64url JSON, never a "results-entry:" string). Because the
// venue and the game are inside the MAC, a token works only for that venue and that game, and it
// tells nothing about the player across games.
//
// No SESSION_SECRET → no tokens (`entry: null` everywhere) and the breakdown route answers 503:
// it fails closed, as account deletion does, because dev shares the production database.

const TOKEN_LENGTH = 22;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const DOMAIN = "results-entry:v1";

export type ResultsEntryScope = { venueId: string; competitionId: string; gameKey: string };

const secret = (): string => process.env.SESSION_SECRET?.trim() ?? "";

/** Tokens can be made (SESSION_SECRET is set). */
export const resultsEntryTokensEnabled = (): boolean => secret().length > 0;

const mac = (key: string, scope: ResultsEntryScope, userId: string): string =>
  createHmac("sha256", key)
    .update([DOMAIN, scope.venueId, scope.competitionId, scope.gameKey, userId].join("|"))
    .digest("base64url")
    .slice(0, TOKEN_LENGTH);

/** One token per user id for this venue's game; null for each when tokens are off. */
export const makeResultsEntryTokens = (scope: ResultsEntryScope, userIds: readonly string[]): Map<string, string> => {
  const key = secret();
  const tokens = new Map<string, string>();
  if (!key) return tokens;
  for (const userId of userIds) tokens.set(userId, mac(key, scope, userId));
  return tokens;
};

/** Is `entry` shaped like a token at all? (Checked before any read.) */
export const isResultsEntryToken = (entry: unknown): entry is string => typeof entry === "string" && TOKEN_PATTERN.test(entry);

/**
 * The user id among `candidates` whose token for this game is `entry`, or null. Compares every
 * candidate in constant time per comparison. Tokens off → always null.
 */
export const findResultsEntry = (scope: ResultsEntryScope, candidates: readonly string[], entry: string): string | null => {
  const key = secret();
  if (!key || !isResultsEntryToken(entry)) return null;
  const wanted = Buffer.from(entry);
  let found: string | null = null;
  for (const userId of candidates) {
    if (timingSafeEqual(Buffer.from(mac(key, scope, userId)), wanted) && found === null) found = userId;
  }
  return found;
};
