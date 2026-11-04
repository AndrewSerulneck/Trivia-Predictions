import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Social (Meta) token encryption at rest (docs/partner-social-promo-plan.md §4.6). The ONLY reader of
// SOCIAL_TOKEN_KEY. Same envelope and AAD binding as lib/pos/crypto.ts, with its own key, so a leak or
// rotation of one never touches the other.
//
// AES-256-GCM. SOCIAL_TOKEN_KEY = 32 random bytes as base64 (44 chars) or hex (64 chars):
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Envelope: "v1:<iv>:<tag>:<ciphertext>", each part base64url, 12-byte random IV per value.
//
// Every value is bound to WHERE it lives (`socialTokenContext`: provider, venue, field). A ciphertext
// copied into another venue's row — or a user token copied into the page-token slot — fails to decrypt.
//
// Rotation: new key in SOCIAL_TOKEN_KEY, old one in SOCIAL_TOKEN_KEY_PREVIOUS; decryption tries both.
// Fails CLOSED: no key, a malformed key, or a value that doesn't authenticate throws.

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class SocialCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SocialCryptoError";
  }
}

/** page_token = an active connection's Page token; user_token = a pending choose-account row's user token. */
export type SocialTokenField = "page_token" | "user_token";

export const socialTokenContext = (venueId: string, provider: string, field: SocialTokenField): string =>
  `social:${provider}:${venueId}:${field}`;

const parseKey = (raw: string | undefined, name: string): Buffer | null => {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) throw new SocialCryptoError(`${name} must be ${KEY_BYTES} bytes (base64 or hex).`);
  return key;
};

const currentKey = (): Buffer => {
  const key = parseKey(process.env.SOCIAL_TOKEN_KEY, "SOCIAL_TOKEN_KEY");
  if (!key) throw new SocialCryptoError("SOCIAL_TOKEN_KEY is not set.");
  return key;
};

/** Whether tokens can be encrypted right now. The connect route checks this before sending anyone to Meta. */
export const isSocialTokenKeyConfigured = (): boolean => {
  try {
    currentKey();
    return true;
  } catch {
    return false;
  }
};

export const encryptSocialToken = (plaintext: string, context: string): string => {
  if (!plaintext) throw new SocialCryptoError("Refusing to encrypt an empty token.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", currentKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(":");
};

export const decryptSocialToken = (envelope: string, context: string): string => {
  const parts = String(envelope ?? "").split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new SocialCryptoError("Unrecognised social token envelope.");
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
    throw new SocialCryptoError("Malformed social token envelope.");
  }
  const keys = [currentKey()];
  const previous = parseKey(process.env.SOCIAL_TOKEN_KEY_PREVIOUS, "SOCIAL_TOKEN_KEY_PREVIOUS");
  if (previous) keys.push(previous);
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(Buffer.from(context, "utf8"));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      // Wrong key or wrong context: try the next key, then fail closed below.
    }
  }
  throw new SocialCryptoError("Social token did not authenticate (wrong key or wrong row).");
};
