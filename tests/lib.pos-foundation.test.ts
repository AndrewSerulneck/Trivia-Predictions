import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { visibleOwnerMenuItems } from "@/components/owner/menu/ownerMenuItems";
import {
  PosCryptoError,
  decryptPosToken,
  encryptPosToken,
  isPosTokenKeyConfigured,
  posTokenContext,
} from "@/lib/pos/crypto";
import { parsePosValueDollars, prizeNeedsPosValue, prizePosValueCents, type PosValuePrize } from "@/lib/pos/prizeValue";
import { POS_PROVIDERS, POS_PROVIDER_IDS, isPosIntegrationsEnabled, isPosProviderId } from "@/lib/pos/providers";
import { getPosAdapter } from "@/lib/pos/registry";

// docs/pos-rewards-integration-plan.md Phase 1 — the POS foundation's tripwires.

const read = (path: string): string => readFileSync(join(__dirname, "..", path), "utf8");
const key = () => randomBytes(32).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POS token encryption (lib/pos/crypto.ts)", () => {
  const ctx = posTokenContext("venue-1", "square", "access_token");

  it("round-trips, with a fresh IV every time", () => {
    vi.stubEnv("POS_TOKEN_KEY", key());
    const a = encryptPosToken("EAAA-secret", ctx);
    const b = encryptPosToken("EAAA-secret", ctx);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toContain("EAAA-secret");
    expect(decryptPosToken(a, ctx)).toBe("EAAA-secret");
  });

  it("accepts a 64-char hex key", () => {
    vi.stubEnv("POS_TOKEN_KEY", randomBytes(32).toString("hex"));
    expect(decryptPosToken(encryptPosToken("t", ctx), ctx)).toBe("t");
  });

  it("refuses a token moved to another venue, provider or field", () => {
    vi.stubEnv("POS_TOKEN_KEY", key());
    const sealed = encryptPosToken("t", ctx);
    for (const other of [
      posTokenContext("venue-2", "square", "access_token"),
      posTokenContext("venue-1", "clover", "access_token"),
      posTokenContext("venue-1", "square", "refresh_token"),
    ]) {
      expect(() => decryptPosToken(sealed, other)).toThrow(PosCryptoError);
    }
  });

  it("refuses a tampered envelope", () => {
    vi.stubEnv("POS_TOKEN_KEY", key());
    const [v, iv, tag, data] = encryptPosToken("token-value", ctx).split(":");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 1;
    expect(() => decryptPosToken([v, iv, tag, flipped.toString("base64url")].join(":"), ctx)).toThrow(PosCryptoError);
    expect(() => decryptPosToken("plaintext-token", ctx)).toThrow(PosCryptoError);
  });

  it("fails closed with no key or a wrong-sized key", () => {
    vi.stubEnv("POS_TOKEN_KEY", "");
    expect(isPosTokenKeyConfigured()).toBe(false);
    expect(() => encryptPosToken("t", ctx)).toThrow(PosCryptoError);
    vi.stubEnv("POS_TOKEN_KEY", randomBytes(16).toString("base64"));
    expect(isPosTokenKeyConfigured()).toBe(false);
    expect(() => encryptPosToken("t", ctx)).toThrow(PosCryptoError);
  });

  it("decrypts with POS_TOKEN_KEY_PREVIOUS during a rotation", () => {
    const oldKey = key();
    vi.stubEnv("POS_TOKEN_KEY", oldKey);
    const sealed = encryptPosToken("t", ctx);
    vi.stubEnv("POS_TOKEN_KEY", key());
    expect(() => decryptPosToken(sealed, ctx)).toThrow(PosCryptoError);
    vi.stubEnv("POS_TOKEN_KEY_PREVIOUS", oldKey);
    expect(decryptPosToken(sealed, ctx)).toBe("t");
  });
});

describe("POS provider catalog + registry", () => {
  it("lists Square, Clover, Toast in that order", () => {
    expect(POS_PROVIDERS.map((p) => p.id)).toEqual(["square", "clover", "toast"]);
    expect([...POS_PROVIDER_IDS]).toEqual(["square", "clover", "toast"]);
    expect(isPosProviderId("square")).toBe(true);
    expect(isPosProviderId("lightspeed")).toBe(false);
  });

  it("every provider marked available has an adapter registered (flip both in one change)", () => {
    for (const provider of POS_PROVIDERS) {
      if (provider.availability === "available") expect(getPosAdapter(provider.id)).not.toBeNull();
    }
  });

  it("Toast stays coming soon (deferred, plan §1a)", () => {
    expect(POS_PROVIDERS.find((p) => p.id === "toast")?.availability).toBe("coming_soon");
  });

  it("reads the master flag from NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED only", () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    expect(isPosIntegrationsEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
    expect(isPosIntegrationsEnabled()).toBe(true);
    const offenders = ["app", "components", "lib"].flatMap((dir) => {
      const out = execSync(`grep -rl "process.env.NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED" ${dir} || true`, { cwd: join(__dirname, "..") })
        .toString()
        .trim();
      return out ? out.split("\n") : [];
    });
    expect(offenders).toEqual(["lib/pos/providers.ts"]);
  });
});

describe("POS reads never touch a token", () => {
  it("lib/pos/connections.ts selects no token column", () => {
    const src = read("lib/pos/connections.ts");
    const select = src.match(/PUBLIC_CONNECTION_COLUMNS = "([^"]+)"/)?.[1] ?? "";
    // Phase 2 added location_id (non-secret) to answer "location chosen?"; it never leaves
    // the server — the status carries a boolean.
    expect(select).toBe("provider, status, merchant_name, connected_at, location_id, environment");
    expect(src).not.toMatch(/token_enc|merchant_id/);
    expect(src).not.toMatch(/locationId:/);
    expect(src).not.toContain('select("*")');
  });

  it("only lib/pos/crypto.ts reads POS_TOKEN_KEY", () => {
    const out = execSync('grep -rl "process.env.POS_TOKEN_KEY" app components lib || true', { cwd: join(__dirname, "..") })
      .toString()
      .trim();
    expect(out.split("\n")).toEqual(["lib/pos/crypto.ts"]);
  });
});

describe("prize value at the register (lib/pos/prizeValue.ts)", () => {
  const base: PosValuePrize = {
    prizeKind: null,
    prizeDiscountKind: null,
    prizeDiscountValue: null,
    prizeGiftCertificateAmount: null,
    prizePosValueCents: null,
  };

  it("gift card = its amount; dollar off = the discount; percent off = the cap", () => {
    expect(prizePosValueCents({ ...base, prizeKind: "gift_card", prizeGiftCertificateAmount: 25 })).toBe(2500);
    expect(prizePosValueCents({ ...base, prizeKind: "menu_item", prizeDiscountKind: "dollar", prizeDiscountValue: 5.5 })).toBe(550);
    expect(
      prizePosValueCents({ ...base, prizeKind: "menu_item", prizeDiscountKind: "percent", prizeDiscountValue: 50, prizePosValueCents: 1200 }),
    ).toBe(1200);
  });

  it("percent off without a cap can't go on a POS", () => {
    expect(prizePosValueCents({ ...base, prizeKind: "menu_item", prizeDiscountKind: "percent", prizeDiscountValue: 100 })).toBeNull();
    expect(prizePosValueCents(base)).toBeNull();
  });

  it("only percent-off menu items ask", () => {
    expect(prizeNeedsPosValue("menu_item", "percent")).toBe(true);
    expect(prizeNeedsPosValue("menu_item", "dollar")).toBe(false);
    expect(prizeNeedsPosValue("gift_card", null)).toBe(false);
  });

  it("parses the wizard's dollar box", () => {
    expect(parsePosValueDollars("12")).toBe(1200);
    expect(parsePosValueDollars(" $12.5 ")).toBe(1250);
    expect(parsePosValueDollars("12.50")).toBe(1250);
    for (const bad of ["", "0", "-3", "abc", "12.505", "10001"]) expect(parsePosValueDollars(bad)).toBeNull();
  });
});

describe("Partner Dashboard menu: Point of Sale row", () => {
  it("shows only while the flag is on, after Billing, opening the pos sheet", () => {
    expect(visibleOwnerMenuItems(false).some((item) => item.id === "pos")).toBe(false);
    const on = visibleOwnerMenuItems(true);
    const labels = on.map((item) => item.label);
    expect(labels.indexOf("Point of Sale")).toBe(labels.indexOf("Billing") + 1);
    expect(on.find((item) => item.id === "pos")?.sheet).toBe("pos");
  });
});

describe("migration 20261004192844_pos_foundation.sql", () => {
  const sql = read("supabase/migrations/20261004192844_pos_foundation.sql");

  it("locks both tables to the server", () => {
    for (const table of ["pos_connections", "pos_reward_applications"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`alter table public.${table} force row level security;`);
      expect(sql).toContain(`revoke all on table public.${table} from anon, authenticated;`);
      expect(sql).toContain(`grant select, insert, update, delete on table public.${table} to service_role;`);
      expect(sql).not.toMatch(new RegExp(`grant[^;]*on table public\\.${table} to (anon|authenticated)`));
    }
    expect(sql).toContain("idempotency_key text not null unique");
  });

  it("re-creates award_cycle_winner identically except for the snapshotted cap", () => {
    const body = (text: string) =>
      (text.match(/as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "")
        .replace(/--.*$/gm, "")
        .replace(/\s+/g, " ")
        .trim();
    const before = body(read("supabase/migrations/20260726120100_award_cycle_winner_prize_snapshot.sql"));
    const after = body(sql);
    expect(after).not.toBe("");
    expect(
      after
        .replace(", prize_discount_value, prize_pos_value_cents", ", prize_discount_value")
        .replace(", c.prize_discount_value, c.prize_pos_value_cents", ", c.prize_discount_value"),
    ).toBe(before);
  });
});
