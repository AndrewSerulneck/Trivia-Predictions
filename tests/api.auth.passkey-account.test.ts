import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const PASSKEY_CRED_ID = "cred-abc-123";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

vi.mock("@simplewebauthn/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@simplewebauthn/server")>();
  return {
    ...actual,
    generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  };
});

import { POST as optionsPOST } from "@/app/api/auth/passkey/authenticate/options/route";

function buildMaybeSingleChain<T>(result: { data: T; error: { message?: string } | null }) {
  const chain = {
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  chain.order.mockResolvedValue({ data: result.data ? [result.data] : [], error: result.error });
  return chain;
}

function buildInsertSingleChain<T>(result: { data: T; error: { message?: string } | null }) {
  const chain = {
    eq: vi.fn(),
    is: vi.fn(),
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  return chain;
}

describe("POST /api/auth/passkey/authenticate/options — account-first", () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.generateAuthenticationOptions.mockReset();
    process.env.WEBAUTHN_RP_ID = "localhost";
    process.env.WEBAUTHN_DEV_RP_ID = "localhost";
    process.env.WEBAUTHN_ORIGIN = "http://localhost:3000";
    process.env.WEBAUTHN_DEV_ORIGIN = "http://localhost:3000";
  });

  it("resolves passkeys from accounts table when username is provided (no venueId)", async () => {
    const account = {
      id: ACCOUNT_ID,
      auth_id: null,
      username: "alice",
      username_normalized: "alice",
      pin_salt: "s",
      pin_hash: "h",
      created_at: "2026-05-28T10:00:00Z",
    };
    const passkeys = [
      {
        id: "pk-1",
        user_id: "user-profile-1",
        account_id: ACCOUNT_ID,
        credential_id_b64url: PASSKEY_CRED_ID,
        public_key_b64url: "pubkey",
        sign_count: 0,
        transports: ["internal"],
        aaguid: null,
        device_type: "platform",
        backed_up: false,
        device_label: null,
        created_at: "2026-05-28T10:00:00Z",
        updated_at: "2026-05-28T10:00:00Z",
        last_used_at: null,
      },
    ];

    const accountChain = buildMaybeSingleChain({ data: account, error: null });
    const passkeyChain = {
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: passkeys, error: null }),
    };
    passkeyChain.eq.mockReturnValue(passkeyChain);

    const challengeInsert = buildInsertSingleChain({
      data: {
        id: "challenge-1",
        user_id: null,
        account_id: ACCOUNT_ID,
        flow_type: "authentication",
        challenge_b64url: "challenge-value",
        rp_id: "localhost",
        origin: "http://localhost:3000",
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        used_at: null,
        created_at: new Date().toISOString(),
      },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") return { select: vi.fn().mockReturnValue(accountChain) };
      if (table === "user_passkeys") return { select: vi.fn().mockReturnValue(passkeyChain) };
      if (table === "webauthn_challenges")
        return { insert: vi.fn().mockReturnValue(challengeInsert) };
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.generateAuthenticationOptions.mockResolvedValue({
      challenge: "challenge-value",
      rpId: "localhost",
      allowCredentials: [{ id: PASSKEY_CRED_ID, type: "public-key", transports: ["internal"] }],
      userVerification: "required",
      timeout: 60_000,
    });

    const response = await optionsPOST(
      new Request("http://localhost/api/auth/passkey/authenticate/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ username: "alice" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; challengeId?: string; options?: unknown };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.challengeId).toBe("challenge-1");
    // Verify account-level passkey lookup was used.
    expect(passkeyChain.eq).toHaveBeenCalledWith("account_id", ACCOUNT_ID);
  });

  it("returns requiresPinFallback when account has no enrolled passkeys", async () => {
    const account = {
      id: ACCOUNT_ID,
      auth_id: null,
      username: "nopk",
      username_normalized: "nopk",
      pin_salt: "s",
      pin_hash: "h",
      created_at: "2026-05-28T10:00:00Z",
    };

    const accountChain = buildMaybeSingleChain({ data: account, error: null });
    const passkeyChain = {
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    passkeyChain.eq.mockReturnValue(passkeyChain);

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") return { select: vi.fn().mockReturnValue(accountChain) };
      if (table === "user_passkeys") return { select: vi.fn().mockReturnValue(passkeyChain) };
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await optionsPOST(
      new Request("http://localhost/api/auth/passkey/authenticate/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({ username: "nopk" }),
      })
    );
    const body = (await response.json()) as {
      ok: boolean;
      requiresPinFallback?: boolean;
      reasonCode?: string;
      account?: { id: string };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.requiresPinFallback).toBe(true);
    expect(body.reasonCode).toBe("NO_PASSKEYS");
    expect(body.account?.id).toBe(ACCOUNT_ID);
  });
});
