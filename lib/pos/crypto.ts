import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// POS OAuth token encryption at rest (docs/pos-rewards-integration-plan.md §3).
//
// AES-256-GCM. The key is `POS_TOKEN_KEY`: 32 random bytes, written as base64 (44 chars)
// or hex (64 chars). Generate one with
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// Envelope: "v1:<iv>:<tag>:<ciphertext>", each part base64url. 12-byte random IV per value.
//
// Every value is bound to WHERE it lives through GCM's additional authenticated data
// (`posTokenContext`): venue, provider and field. A ciphertext copied into another venue's
// row, or from refresh_token_enc into access_token_enc, fails to decrypt instead of quietly
// handing one merchant's credentials to another venue.
//
// Rotation: set the new key as POS_TOKEN_KEY and the old one as POS_TOKEN_KEY_PREVIOUS.
// Decryption tries both; encryption always uses POS_TOKEN_KEY. Re-encrypting old rows is a
// one-off script (not built — no rows exist yet).
//
// Fails CLOSED: no key, a malformed key, or a value that doesn't authenticate throws. A
// caller must never fall back to storing or using plaintext.

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class PosCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosCryptoError";
  }
}

export type PosTokenField = "access_token" | "refresh_token";

/** The AAD string for one stored token. Exported so tests and callers build it one way. */
export const posTokenContext = (venueId: string, provider: string, field: PosTokenField): string =>
  `pos:${provider}:${venueId}:${field}`;

const parseKey = (raw: string | undefined, name: string): Buffer | null => {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== KEY_BYTES) {
    throw new PosCryptoError(`${name} must be ${KEY_BYTES} bytes (base64 or hex).`);
  }
  return key;
};

const currentKey = (): Buffer => {
  const key = parseKey(process.env.POS_TOKEN_KEY, "POS_TOKEN_KEY");
  if (!key) throw new PosCryptoError("POS_TOKEN_KEY is not set.");
  return key;
};

/** Whether tokens can be encrypted right now. Connect routes check this before redirecting to a provider. */
export const isPosTokenKeyConfigured = (): boolean => {
  try {
    currentKey();
    return true;
  } catch {
    return false;
  }
};

export const encryptPosToken = (plaintext: string, context: string): string => {
  if (!plaintext) throw new PosCryptoError("Refusing to encrypt an empty token.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", currentKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
};

const decryptWith = (key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer, context: string): string => {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};

export const decryptPosToken = (envelope: string, context: string): string => {
  const parts = String(envelope ?? "").split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new PosCryptoError("Unrecognised POS token envelope.");
  }
  const [, ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const tag = Buffer.from(tagPart, "base64url");
  const ciphertext = Buffer.from(dataPart, "base64url");
  if (iv.length !== IV_BYTES || tag.length !== 16 || ciphertext.length === 0) {
    throw new PosCryptoError("Malformed POS token envelope.");
  }

  const keys = [currentKey()];
  const previous = parseKey(process.env.POS_TOKEN_KEY_PREVIOUS, "POS_TOKEN_KEY_PREVIOUS");
  if (previous) keys.push(previous);

  for (const key of keys) {
    try {
      return decryptWith(key, iv, tag, ciphertext, context);
    } catch {
      // Wrong key or wrong context — try the next key, then fail closed below.
    }
  }
  throw new PosCryptoError("POS token did not authenticate (wrong key or wrong row).");
};
