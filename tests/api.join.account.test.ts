import { beforeEach, describe, expect, it, vi } from "vitest";
import { scryptSync } from "node:crypto";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

import { GET, POST } from "@/app/api/join/account/route";

function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, 64).toString("hex");
}

function buildAccountSelectChain<T>(result: { data: T; error: { message?: string; code?: string } | null }) {
  const chain = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  return chain;
}

function buildInsertChain<T>(result: { data: T; error: { message?: string; code?: string } | null }) {
  const chain = {
    select: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
  };
  chain.select.mockReturnValue(chain);
  return chain;
}

function buildUpdateChain(result: { error: { message?: string } | null }) {
  const chain = {
    eq: vi.fn(),
    is: vi.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  chain.is.mockReturnValue(chain);
  return chain;
}

describe("POST /api/join/account", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("creates a new account when username does not exist", async () => {
    const selectChain = buildAccountSelectChain({ data: null, error: null });
    const insertChain = buildInsertChain({
      data: { id: "acct-new", username: "freshplayer", auth_id: null },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") {
        return {
          select: vi.fn().mockReturnValue(selectChain),
          insert: vi.fn().mockReturnValue(insertChain),
          update: vi.fn().mockReturnValue(buildUpdateChain({ error: null })),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "freshplayer", pin: "4321" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; account?: { id: string; username: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.account?.id).toBe("acct-new");
    expect(body.account?.username).toBe("freshplayer");
  });

  it("authenticates a returning user with correct PIN", async () => {
    const salt = "saltvalue";
    const existingAccount = {
      id: "acct-existing",
      auth_id: null,
      username: "returner",
      username_normalized: "returner",
      pin_salt: salt,
      pin_hash: hashPin("1234", salt),
      created_at: "2026-05-28T10:00:00Z",
    };
    const selectChain = buildAccountSelectChain({ data: existingAccount, error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") {
        return { select: vi.fn().mockReturnValue(selectChain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "returner", pin: "1234" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; account?: { id: string } };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.account?.id).toBe("acct-existing");
  });

  it("returns 401 when PIN is incorrect for existing account", async () => {
    const salt = "saltvalue";
    const existingAccount = {
      id: "acct-existing",
      auth_id: null,
      username: "returner",
      username_normalized: "returner",
      pin_salt: salt,
      pin_hash: hashPin("1234", salt),
      created_at: "2026-05-28T10:00:00Z",
    };
    const selectChain = buildAccountSelectChain({ data: existingAccount, error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") {
        return { select: vi.fn().mockReturnValue(selectChain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await POST(
      new Request("http://localhost/api/join/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "returner", pin: "9999" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Incorrect PIN.");
  });

  it("returns 400 when PIN is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/join/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "someone" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("PIN");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns 400 when username is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/join/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "1234" }),
      })
    );
    const body = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("Username");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("GET /api/join/account", () => {
  beforeEach(() => {
    mocks.from.mockReset();
  });

  it("returns exists=true, hasPin=true for a registered account with PIN", async () => {
    const selectChain = buildAccountSelectChain({
      data: { id: "acct-1", pin_salt: "s1", pin_hash: "h1" },
      error: null,
    });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") {
        return { select: vi.fn().mockReturnValue(selectChain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await GET(
      new Request("http://localhost/api/join/account?username=KnownUser")
    );
    const body = (await response.json()) as {
      ok: boolean; exists: boolean; hasPin: boolean; isReturningUser: boolean;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.exists).toBe(true);
    expect(body.hasPin).toBe(true);
    expect(body.isReturningUser).toBe(true);
    expect(selectChain.eq).toHaveBeenCalledWith("username_normalized", "knownuser");
  });

  it("returns exists=false for a username not in accounts", async () => {
    const selectChain = buildAccountSelectChain({ data: null, error: null });

    mocks.from.mockImplementation((table: string) => {
      if (table === "accounts") {
        return { select: vi.fn().mockReturnValue(selectChain) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const response = await GET(
      new Request("http://localhost/api/join/account?username=Ghost")
    );
    const body = (await response.json()) as { ok: boolean; exists: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.exists).toBe(false);
  });
});
