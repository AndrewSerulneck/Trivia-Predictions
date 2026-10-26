import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getExpectedPasskeyOrigins } from "@/lib/webauthn";

// Synthetic authenticator fixtures exercise the real verifier, including the
// signature, RP hash and user-verification flags. They are not device captures.
const rpId = "hightopchallenge.com";
const challengeValue = Buffer.alloc(32, 0x42).toString("base64url");
const challenge = { origin: "https://play.hightopchallenge.com", rp_id: rpId };
const appOrigin = `android:apk-key-hash:${Buffer.alloc(32, 0xab).toString("base64url")}`;
const credentialId = Buffer.from("native-passkey-regression");
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = publicKey.export({ format: "jwk" });
const coseKey = isoCBOR.encode(new Map<number, number | Uint8Array>([
  [1, 2], [3, -7], [-1, 1],
  [-2, new Uint8Array(Buffer.from(jwk.x!, "base64url"))],
  [-3, new Uint8Array(Buffer.from(jwk.y!, "base64url"))],
]));
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest();
const clientData = (origin: string, type: string, value = challengeValue) =>
  Buffer.from(JSON.stringify({ type, origin, challenge: value, crossOrigin: false }));

function authentication(origin: string, overrides: { rpId?: string; verified?: boolean; challenge?: string } = {}): AuthenticationResponseJSON {
  const client = clientData(origin, "webauthn.get", overrides.challenge);
  const authData = Buffer.concat([
    hash(overrides.rpId ?? rpId), Buffer.from([overrides.verified === false ? 0x01 : 0x05, 0, 0, 0, 1]),
  ]);
  return {
    id: credentialId.toString("base64url"), rawId: credentialId.toString("base64url"), type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: client.toString("base64url"), authenticatorData: authData.toString("base64url"),
      signature: sign("sha256", Buffer.concat([authData, hash(client)]), privateKey).toString("base64url"),
    },
  };
}

function registration(origin: string): RegistrationResponseJSON {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(credentialId.length);
  const authData = Buffer.concat([
    hash(rpId), Buffer.from([0x45, 0, 0, 0, 0]), Buffer.alloc(16), length, credentialId, coseKey,
  ]);
  const attestation = isoCBOR.encode(new Map<string, string | Map<string, never> | Uint8Array>([
    ["fmt", "none"], ["attStmt", new Map<string, never>()], ["authData", new Uint8Array(authData)],
  ]));
  return {
    id: credentialId.toString("base64url"), rawId: credentialId.toString("base64url"), type: "public-key",
    clientExtensionResults: {},
    response: {
      clientDataJSON: clientData(origin, "webauthn.create").toString("base64url"),
      attestationObject: Buffer.from(attestation).toString("base64url"), transports: ["internal"],
    },
  };
}

const verifyAuth = (response: AuthenticationResponseJSON) => verifyAuthenticationResponse({
  response, expectedChallenge: challengeValue, expectedOrigin: getExpectedPasskeyOrigins(challenge),
  expectedRPID: rpId, requireUserVerification: true,
  credential: { id: credentialId.toString("base64url"), publicKey: coseKey, counter: 0 },
});
const verifyRegistration = (origin: string) => verifyRegistrationResponse({
  response: registration(origin), expectedChallenge: challengeValue,
  expectedOrigin: getExpectedPasskeyOrigins(challenge), expectedRPID: rpId, requireUserVerification: true,
});

describe("real WebAuthn verification with native app origins", () => {
  beforeEach(() => {
    vi.stubEnv("WEBAUTHN_RP_ID", rpId);
    vi.stubEnv("WEBAUTHN_ALLOWED_ORIGINS", challenge.origin);
    vi.stubEnv("ANDROID_APP_CERT_SHA256", Array(32).fill("AB").join(":"));
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([challenge.origin, appOrigin])("registers and signs in using the same RP/key with %s", async (origin) => {
    expect((await verifyRegistration(origin)).verified).toBe(true);
    expect((await verifyAuth(authentication(origin))).verified).toBe(true);
  });

  it("rejects an unconfigured app certificate even with a valid credential signature", async () => {
    const other = `android:apk-key-hash:${Buffer.alloc(32, 0xcd).toString("base64url")}`;
    await expect(verifyAuth(authentication(other))).rejects.toThrow(/origin/);
    await expect(verifyRegistration(other)).rejects.toThrow(/origin/);
  });

  it("rejects the trusted app when its certificate is removed from configuration", async () => {
    vi.stubEnv("ANDROID_APP_CERT_SHA256", "");
    await expect(verifyAuth(authentication(appOrigin))).rejects.toThrow(/origin/);
    expect((await verifyAuth(authentication(challenge.origin))).verified).toBe(true);
  });

  it("still requires the issued challenge, correct RP and user verification", async () => {
    await expect(verifyAuth(authentication(appOrigin, { challenge: "wrong-challenge" }))).rejects.toThrow(/challenge/);
    await expect(verifyAuth(authentication(appOrigin, { rpId: "attacker.example" }))).rejects.toThrow(/RP ID/);
    await expect(verifyAuth(authentication(appOrigin, { verified: false }))).rejects.toThrow(/verification/);
  });

  it("still rejects a tampered authenticator signature", async () => {
    const response = authentication(appOrigin);
    const signature = Buffer.from(response.response.signature, "base64url");
    signature[signature.length - 1] ^= 1;
    response.response.signature = signature.toString("base64url");
    expect((await verifyAuth(response)).verified).toBe(false);
  });
});
