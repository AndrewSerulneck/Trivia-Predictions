import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
  chooseUserAndVenueFromRequest: vi.fn(),
  createChallenge: vi.fn(),
  findUserByIdAndVenue: vi.fn(),
  findUserByUsernameAndVenue: vi.fn(),
  getCredentialTransportList: vi.fn(),
  isPasskeyFeatureEnabled: vi.fn(),
  listPasskeysForUser: vi.fn(),
  mapUserForResponse: vi.fn(),
  normalizeUsername: vi.fn(),
  normalizeVenueId: vi.fn(),
  resolveAllowedOriginAndRpId: vi.fn(),
  getWebAuthnRpName: vi.fn(),
  encodePublicKeyToBase64Url: vi.fn(),
  extractChallengeFromResponse: vi.fn(),
  getActiveChallengeById: vi.fn(),
  markChallengeUsed: vi.fn(),
  sanitizeUserId: vi.fn(),
  decodePublicKeyFromBase64Url: vi.fn(),
  getGenericAuthFailureMessage: vi.fn(),
  sanitizeCredentialId: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: mocks.generateRegistrationOptions,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
}));

vi.mock("@/lib/webauthn", () => ({
  chooseUserAndVenueFromRequest: mocks.chooseUserAndVenueFromRequest,
  createChallenge: mocks.createChallenge,
  findUserByIdAndVenue: mocks.findUserByIdAndVenue,
  findUserByUsernameAndVenue: mocks.findUserByUsernameAndVenue,
  getCredentialTransportList: mocks.getCredentialTransportList,
  isPasskeyFeatureEnabled: mocks.isPasskeyFeatureEnabled,
  listPasskeysForUser: mocks.listPasskeysForUser,
  mapUserForResponse: mocks.mapUserForResponse,
  normalizeUsername: mocks.normalizeUsername,
  normalizeVenueId: mocks.normalizeVenueId,
  resolveAllowedOriginAndRpId: mocks.resolveAllowedOriginAndRpId,
  getWebAuthnRpName: mocks.getWebAuthnRpName,
  encodePublicKeyToBase64Url: mocks.encodePublicKeyToBase64Url,
  extractChallengeFromResponse: mocks.extractChallengeFromResponse,
  getActiveChallengeById: mocks.getActiveChallengeById,
  markChallengeUsed: mocks.markChallengeUsed,
  sanitizeUserId: mocks.sanitizeUserId,
  decodePublicKeyFromBase64Url: mocks.decodePublicKeyFromBase64Url,
  getGenericAuthFailureMessage: mocks.getGenericAuthFailureMessage,
  sanitizeCredentialId: mocks.sanitizeCredentialId,
}));

import { POST as postAuthOptions } from "@/app/api/auth/passkey/authenticate/options/route";
import { POST as postAuthVerify } from "@/app/api/auth/passkey/authenticate/verify/route";
import { POST as postRegisterVerify } from "@/app/api/auth/passkey/register/verify/route";

function makeFilterChain<T>(result: { data: T; error: { message: string } | null }) {
  const chain: Record<string, any> = {
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    update: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.gt.mockReturnValue(chain);
  chain.maybeSingle.mockResolvedValue(result);
  chain.update.mockReturnValue(chain);
  chain.error = null;
  return chain;
}

describe("passkey auth API routes", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => {
      if ("mockReset" in mock) {
        mock.mockReset();
      }
    });
    mocks.isPasskeyFeatureEnabled.mockReturnValue(true);
    mocks.normalizeUsername.mockImplementation((value: string) => value.trim());
    mocks.normalizeVenueId.mockImplementation((value: string) => value.trim());
    mocks.resolveAllowedOriginAndRpId.mockReturnValue({
      origin: "http://localhost:3000",
      rpId: "localhost",
    });
    mocks.getCredentialTransportList.mockImplementation((value: string[]) => value ?? []);
    mocks.mapUserForResponse.mockImplementation((user: any) => ({
      id: user.id,
      username: user.username,
      venueId: user.venue_id ?? user.venueId,
      points: user.points ?? 0,
    }));
    mocks.getGenericAuthFailureMessage.mockReturnValue("Authentication failed. Please try again or use your PIN.");
    mocks.sanitizeUserId.mockImplementation((value: unknown) => String(value ?? "").trim());
    mocks.sanitizeCredentialId.mockImplementation((value: unknown) => String(value ?? "").trim());
  });

  it("returns PIN fallback signal when user has no passkeys", async () => {
    mocks.findUserByUsernameAndVenue.mockResolvedValue({
      id: "user-1",
      username: "player_1",
      venue_id: "venue-a",
      points: 10,
    });
    mocks.listPasskeysForUser.mockResolvedValue([]);

    const response = await postAuthOptions(
      new Request("http://localhost/api/auth/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "player_1", venueId: "venue-a" }),
      })
    );
    const body = (await response.json()) as {
      ok: boolean;
      requiresPinFallback?: boolean;
      reason?: string;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.requiresPinFallback).toBe(true);
    expect(body.reason).toBe("no-passkeys");
  });

  it("returns authentication options when passkeys are present", async () => {
    mocks.findUserByUsernameAndVenue.mockResolvedValue({
      id: "user-2",
      username: "player_2",
      venue_id: "venue-a",
      points: 20,
    });
    mocks.listPasskeysForUser.mockResolvedValue([
      {
        credential_id_b64url: "cred-1",
        transports: ["internal"],
      },
    ]);
    mocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: "challenge-1",
      rpId: "localhost",
      allowCredentials: [],
    });
    mocks.createChallenge.mockResolvedValue({
      id: "challenge-row-1",
    });

    const response = await postAuthOptions(
      new Request("http://localhost/api/auth/passkey/authenticate/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "player_2", venueId: "venue-a" }),
      })
    );
    const body = (await response.json()) as {
      ok: boolean;
      challengeId?: string;
      options?: { challenge?: string };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.challengeId).toBe("challenge-row-1");
    expect(body.options?.challenge).toBe("challenge-1");
    expect(mocks.generateAuthenticationOptions).toHaveBeenCalledTimes(1);
  });

  it("verifies authentication response and updates sign counter", async () => {
    mocks.getActiveChallengeById.mockResolvedValue({
      id: "challenge-verify-1",
      user_id: "user-verify-1",
      challenge_b64url: "expected-challenge",
      origin: "http://localhost:3000",
      rp_id: "localhost",
    });
    mocks.extractChallengeFromResponse.mockReturnValue("expected-challenge");
    mocks.decodePublicKeyFromBase64Url.mockReturnValue(new Uint8Array([1, 2, 3]));
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 42,
        credentialBackedUp: true,
        credentialDeviceType: "multiDevice",
      },
    });
    mocks.findUserByIdAndVenue.mockResolvedValue({
      id: "user-verify-1",
      username: "player_3",
      venue_id: "venue-a",
      points: 30,
    });

    const userPasskeySelectChain = makeFilterChain({
      data: {
        credential_id_b64url: "cred-verify-1",
        public_key_b64url: "pk",
        sign_count: 11,
        transports: ["internal"],
        device_type: "multiDevice",
        backed_up: false,
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "user_passkeys") {
        return {
          select: vi.fn().mockReturnValue(userPasskeySelectChain),
          update: vi.fn().mockReturnValue(userPasskeySelectChain),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await postAuthVerify(
      new Request("http://localhost/api/auth/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: "challenge-verify-1",
          response: {
            id: "cred-verify-1",
            response: {
              clientDataJSON: "client-data",
            },
          },
          venueId: "venue-a",
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; verified?: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.verified).toBe(true);
    expect(mocks.markChallengeUsed).toHaveBeenCalledWith(expect.anything(), "challenge-verify-1");
  });

  it("returns 401 when authentication verification fails", async () => {
    mocks.getActiveChallengeById.mockResolvedValue({
      id: "challenge-verify-2",
      user_id: "user-verify-2",
      challenge_b64url: "expected-challenge",
      origin: "http://localhost:3000",
      rp_id: "localhost",
    });
    mocks.extractChallengeFromResponse.mockReturnValue("expected-challenge");
    mocks.decodePublicKeyFromBase64Url.mockReturnValue(new Uint8Array([1, 2, 3]));
    mocks.verifyAuthenticationResponse.mockResolvedValue({
      verified: false,
      authenticationInfo: {
        newCounter: 12,
        credentialBackedUp: false,
        credentialDeviceType: "singleDevice",
      },
    });

    const userPasskeySelectChain = makeFilterChain({
      data: {
        credential_id_b64url: "cred-verify-2",
        public_key_b64url: "pk",
        sign_count: 11,
        transports: ["internal"],
        device_type: "singleDevice",
        backed_up: false,
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "user_passkeys") {
        return {
          select: vi.fn().mockReturnValue(userPasskeySelectChain),
          update: vi.fn().mockReturnValue(userPasskeySelectChain),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await postAuthVerify(
      new Request("http://localhost/api/auth/passkey/authenticate/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: "challenge-verify-2",
          response: {
            id: "cred-verify-2",
            response: {
              clientDataJSON: "client-data",
            },
          },
          venueId: "venue-a",
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Authentication failed");
  });

  it("stores credential after successful registration verify", async () => {
    mocks.getActiveChallengeById.mockResolvedValue({
      id: "challenge-register-1",
      user_id: "user-register-1",
      challenge_b64url: "reg-challenge",
      origin: "http://localhost:3000",
      rp_id: "localhost",
    });
    mocks.verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "cred-register-1",
          publicKey: new Uint8Array([9, 9, 9]),
          counter: 1,
          transports: ["internal"],
        },
        credentialBackedUp: true,
        credentialDeviceType: "multiDevice",
        aaguid: "00000000-0000-4000-8000-000000000001",
      },
    });
    mocks.findUserByIdAndVenue.mockResolvedValue({
      id: "user-register-1",
      username: "player_reg",
      venue_id: "venue-a",
      points: 0,
    });
    mocks.extractChallengeFromResponse.mockReturnValue("reg-challenge");
    mocks.encodePublicKeyToBase64Url.mockReturnValue("pk-encoded");

    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "user_passkeys") {
        return {
          upsert,
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await postRegisterVerify(
      new Request("http://localhost/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: "challenge-register-1",
          response: {
            id: "cred-register-1",
            response: {
              clientDataJSON: "client-data",
              transports: ["internal"],
            },
          },
          userId: "user-register-1",
          venueId: "venue-a",
        }),
      })
    );
    const body = (await response.json()) as { ok: boolean; verified?: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.verified).toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(mocks.markChallengeUsed).toHaveBeenCalledWith(expect.anything(), "challenge-register-1");
  });
});
