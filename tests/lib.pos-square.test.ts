import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/pos-rewards-integration-plan.md Phase 2 — Square: barcode, OAuth state, webhook
// signature, config, REST client, and the "never log a card number" tripwires.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

import { CODE128_PATTERNS, code128Modules, code128Values } from "@/lib/pos/code128";
import { createPosOAuthState, POS_OAUTH_COOKIE, verifyPosOAuthState } from "@/lib/pos/oauthState";
import { verifySquareSignature } from "@/lib/pos/squareWebhook";
import { isSquareConfigured, squareAppConfig, squareWebhookConfig } from "@/lib/pos/squareConfig";
import { exchangeSquareCode, isSquareGiftCardLocation, listSquareLocations, squareAdapter, squareAuthorizeUrl } from "@/lib/pos/square";
import { getPosAdapter } from "@/lib/pos/registry";

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Code 128 (lib/pos/code128.ts)", () => {
  it("has the 107 standard symbols, 11 modules each (Stop 13)", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((pattern, value) => {
      const sum = pattern.split("").reduce((a, b) => a + Number(b), 0);
      expect(sum, `symbol ${value}`).toBe(value === 106 ? 13 : 11);
    });
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it("packs an even run of digits in set C with the right checksum", () => {
    // Start C (105), "12", "34", checksum (105 + 1·12 + 2·34) mod 103 = 82, Stop.
    expect(code128Values("1234")).toEqual([105, 12, 34, 82, 106]);
    // A 16-digit GAN: start + 8 pairs + checksum + stop.
    expect(code128Values("7783320012345678")).toHaveLength(11);
  });

  it("falls back to set B for anything else, and refuses non-printables", () => {
    expect(code128Values("123")[0]).toBe(104);
    expect(code128Values("AB")).toEqual([104, 33, 34, (104 + 33 + 2 * 34) % 103, 106]);
    expect(() => code128Values("")).toThrow();
    expect(() => code128Values("a\nb")).toThrow();
  });

  it("emits bar/space widths starting and ending with a bar", () => {
    const modules = code128Modules("1234");
    expect(modules.length % 2).toBe(1);
    expect(modules.reduce((a, b) => a + b, 0)).toBe(11 * 4 + 13);
  });
});

describe("OAuth state (lib/pos/oauthState.ts)", () => {
  beforeEach(() => vi.stubEnv("SESSION_SECRET", "test-secret"));

  const requestWithCookie = (cookie: string | null) =>
    new Request("http://localhost/api/owner/pos/square/callback", { headers: cookie ? { cookie } : {} });

  const start = () => {
    const started = createPosOAuthState({ ownerId: "owner-1", venueId: "venue-1", provider: "square" }, 1_000);
    if (!started) throw new Error("no state");
    const nonce = started.cookie.split(";")[0].split("=")[1];
    return { ...started, nonce };
  };

  it("round-trips with its own nonce cookie", () => {
    const { state, cookie, nonce } = start();
    expect(cookie).toContain(`${POS_OAUTH_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/owner/pos");
    expect(verifyPosOAuthState(requestWithCookie(`${POS_OAUTH_COOKIE}=${nonce}`), state, 2_000)).toEqual({
      ownerId: "owner-1",
      venueId: "venue-1",
      provider: "square",
      nonce,
    });
  });

  it("refuses without the nonce cookie (replay / someone else's browser)", () => {
    const { state } = start();
    expect(verifyPosOAuthState(requestWithCookie(null), state, 2_000)).toBeNull();
    expect(verifyPosOAuthState(requestWithCookie(`${POS_OAUTH_COOKIE}=other`), state, 2_000)).toBeNull();
  });

  it("refuses an expired, tampered or foreign-signed state", () => {
    const { state, nonce } = start();
    const req = requestWithCookie(`${POS_OAUTH_COOKIE}=${nonce}`);
    expect(verifyPosOAuthState(req, state, 1_000 + 11 * 60 * 1000)).toBeNull();
    const [payload, sig] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), v: "venue-9" })).toString("base64url");
    expect(verifyPosOAuthState(req, `${forged}.${sig}`, 2_000)).toBeNull();
    vi.stubEnv("SESSION_SECRET", "another-secret");
    expect(verifyPosOAuthState(req, state, 2_000)).toBeNull();
  });

  it("fails closed with no SESSION_SECRET", () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect(createPosOAuthState({ ownerId: "o", venueId: "v", provider: "square" })).toBeNull();
  });
});

describe("Square webhook signature", () => {
  const key = "sig-key";
  const url = "https://hightopchallenge.com/api/webhooks/square";
  const body = '{"type":"gift_card.activity.created"}';
  const good = createHmac("sha256", key).update(url + body).digest("base64");

  it("accepts HMAC-SHA256(key, url + body) and nothing else", () => {
    expect(verifySquareSignature({ rawBody: body, signatureHeader: good, signatureKey: key, notificationUrl: url })).toBe(true);
    expect(verifySquareSignature({ rawBody: body + " ", signatureHeader: good, signatureKey: key, notificationUrl: url })).toBe(false);
    expect(verifySquareSignature({ rawBody: body, signatureHeader: good, signatureKey: key, notificationUrl: `${url}/` })).toBe(false);
    expect(verifySquareSignature({ rawBody: body, signatureHeader: null, signatureKey: key, notificationUrl: url })).toBe(false);
    expect(verifySquareSignature({ rawBody: body, signatureHeader: "short", signatureKey: key, notificationUrl: url })).toBe(false);
  });
});

describe("Square config (lib/pos/squareConfig.ts)", () => {
  it("is off unless environment, id and secret are all set", () => {
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
    vi.stubEnv("SQUARE_APPLICATION_ID", "sandbox-sq0idb-x");
    vi.stubEnv("SQUARE_APPLICATION_SECRET", "");
    expect(isSquareConfigured()).toBe(false);
    vi.stubEnv("SQUARE_APPLICATION_SECRET", "secret");
    expect(squareAppConfig()).toEqual({ environment: "sandbox", applicationId: "sandbox-sq0idb-x", applicationSecret: "secret" });
    vi.stubEnv("SQUARE_ENVIRONMENT", "staging");
    expect(isSquareConfigured()).toBe(false);
  });

  it("accepts SQUARE_SANDBOX_* names in sandbox mode only, and the plain names win", () => {
    vi.stubEnv("SQUARE_APPLICATION_ID", "");
    vi.stubEnv("SQUARE_APPLICATION_SECRET", "");
    vi.stubEnv("SQUARE_SANDBOX_APPLICATION_ID", "sandbox-sq0idb-y");
    vi.stubEnv("SQUARE_SANDBOX_APPLICATION_SECRET", "sandbox-secret");
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
    expect(squareAppConfig()).toEqual({ environment: "sandbox", applicationId: "sandbox-sq0idb-y", applicationSecret: "sandbox-secret" });
    vi.stubEnv("SQUARE_ENVIRONMENT", "production");
    expect(squareAppConfig()).toBeNull();
    vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
    vi.stubEnv("SQUARE_APPLICATION_ID", "plain-id");
    vi.stubEnv("SQUARE_APPLICATION_SECRET", "plain-secret");
    expect(squareAppConfig()).toEqual({ environment: "sandbox", applicationId: "plain-id", applicationSecret: "plain-secret" });
  });

  it("derives the webhook URL from NEXT_PUBLIC_APP_URL unless set explicitly", () => {
    vi.stubEnv("SQUARE_WEBHOOK_SIGNATURE_KEY", "k");
    vi.stubEnv("SQUARE_WEBHOOK_NOTIFICATION_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hightopchallenge.com/");
    expect(squareWebhookConfig()).toEqual({ signatureKey: "k", notificationUrl: "https://hightopchallenge.com/api/webhooks/square" });
    vi.stubEnv("SQUARE_WEBHOOK_NOTIFICATION_URL", "https://example.test/hook");
    expect(squareWebhookConfig()?.notificationUrl).toBe("https://example.test/hook");
    vi.stubEnv("SQUARE_WEBHOOK_SIGNATURE_KEY", "");
    expect(squareWebhookConfig()).toBeNull();
  });

  it("is the only reader of SQUARE_* app variables", () => {
    const out = execSync(`grep -rlE "process\\.env\\.SQUARE_|process\\.env\\[\\"SQUARE_" app components lib || true`, { cwd: ROOT })
      .toString()
      .trim();
    expect(out ? out.split("\n") : []).toEqual([]);
    // squareConfig reads through a helper; the names live only there.
    const names = execSync(`grep -rl "SQUARE_APPLICATION_SECRET" app components lib || true`, { cwd: ROOT }).toString().trim();
    expect(names.split("\n")).toEqual(["lib/pos/squareConfig.ts"]);
  });
});

describe("Square REST client (lib/pos/square.ts)", () => {
  const config = { environment: "sandbox" as const, applicationId: "app-id", applicationSecret: "app-secret" };

  it("builds the consent URL with our scopes, session=false and the state", () => {
    const url = new URL(squareAuthorizeUrl(config, "STATE"));
    expect(url.origin).toBe("https://connect.squareupsandbox.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("app-id");
    // Phase 2d added the catalog pair for the ready-made menu-prize discounts.
    expect(url.searchParams.get("scope")).toBe("MERCHANT_PROFILE_READ GIFTCARDS_READ GIFTCARDS_WRITE ITEMS_READ ITEMS_WRITE");
    expect(url.searchParams.get("session")).toBe("false");
    expect(url.searchParams.get("state")).toBe("STATE");
  });

  it("exchanges a code with the pinned Square-Version and maps the tokens", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_at: "2026-11-04T00:00:00Z", merchant_id: "M1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await exchangeSquareCode(config, "CODE")).toEqual({ accessToken: "AT", refreshToken: "RT", expiresAt: "2026-11-04T00:00:00Z", merchantId: "M1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://connect.squareupsandbox.com/oauth2/token");
    expect((init.headers as Record<string, string>)["Square-Version"]).toBe("2025-01-23");
    expect(JSON.parse(String(init.body))).toEqual({ client_id: "app-id", client_secret: "app-secret", code: "CODE", grant_type: "authorization_code" });
  });

  it("maps Square failures to stable codes, retryable only when a retry can help", async () => {
    const respond = (status: number) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ code: "X" }] }), { status })));
    respond(401);
    expect(await exchangeSquareCode(config, "c")).toMatchObject({ ok: false, code: "unauthorized", retryable: false });
    respond(429);
    expect(await exchangeSquareCode(config, "c")).toMatchObject({ ok: false, code: "rate_limited", retryable: true });
    respond(503);
    expect(await exchangeSquareCode(config, "c")).toMatchObject({ ok: false, code: "provider_error", retryable: true });
    respond(400);
    expect(await exchangeSquareCode(config, "c")).toMatchObject({ ok: false, code: "invalid", retryable: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await exchangeSquareCode(config, "c")).toMatchObject({ ok: false, code: "network", retryable: true });
  });

  it("prepare creates a DIGITAL card with a derived idempotency key; apply needs it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ gift_card: { id: "gftc:1", gan: "7783000011112222", state: "PENDING" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const credentials = { connectionId: "c", venueId: "v", provider: "square" as const, environment: "sandbox" as const, merchantId: "M", locationId: "L1", accessToken: "AT", scopes: [] as string[] };
    const prepared = await squareAdapter.prepareReward!({ credentials, idempotencyKey: "r1:square:apply", redemptionId: "r1" });
    expect(prepared).toEqual({ ok: true, externalRef: "gftc:1", amountCents: 0, detail: { location_id: "L1", environment: "sandbox", currency: null } });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toEqual({ idempotency_key: "r1:square:apply:create", location_id: "L1", gift_card: { type: "DIGITAL" } });
    expect(JSON.stringify(prepared)).not.toContain("7783000011112222");

    const noRef = await squareAdapter.applyReward({ credentials, idempotencyKey: "k", redemptionId: "r1", value: { amountCents: 100, currency: "USD", label: "x" } });
    expect(noRef).toMatchObject({ ok: false, code: "invalid" });
    const noLocation = await squareAdapter.prepareReward!({ credentials: { ...credentials, locationId: null }, idempotencyKey: "k", redemptionId: "r1" });
    expect(noLocation).toMatchObject({ ok: false, code: "invalid" });
  });

  it("Phase 2c: a 2xx with an empty body is a retryable failure, not a success or a hard refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    expect(await exchangeSquareCode(config, "c")).toMatchObject({ ok: false, code: "provider_error", retryable: true });
  });

  it("Phase 2c: locations carry currency + country, and only a US location in USD can issue our cards", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      locations: [
        { id: "L1", name: "Main", status: "ACTIVE", currency: "USD", country: "US" },
        { id: "L2", name: "Toronto", status: "ACTIVE", currency: "cad", country: "ca" },
        { id: "L3", name: "Closed", status: "INACTIVE", currency: "USD", country: "US" },
      ],
    }), { status: 200 })));
    const locations = await listSquareLocations("sandbox", "AT");
    expect(locations).toEqual([
      { id: "L1", name: "Main", address: null, currency: "USD", country: "US" },
      { id: "L2", name: "Toronto", address: null, currency: "CAD", country: "CA" },
    ]);
    expect(isSquareGiftCardLocation({ currency: "USD", country: "US" })).toBe(true);
    expect(isSquareGiftCardLocation({ currency: "CAD", country: "CA" })).toBe(false);
    expect(isSquareGiftCardLocation({ currency: "USD", country: null })).toBe(false);
    expect(isSquareGiftCardLocation({ currency: null, country: "US" })).toBe(false);
  });

  it("Phase 2c: prepare reports the new card's currency; apply recovers a funded card after an empty-body reply", async () => {
    const credentials = { connectionId: "c", venueId: "v", provider: "square" as const, environment: "sandbox" as const, merchantId: "M", locationId: "L1", accessToken: "AT", scopes: [] as string[] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ gift_card: { id: "gftc:1", gan: "7783000011112222", state: "PENDING", balance_money: { amount: 0, currency: "USD" } } }), { status: 200 })));
    expect(await squareAdapter.prepareReward!({ credentials, idempotencyKey: "k", redemptionId: "r1" })).toMatchObject({ ok: true, detail: { currency: "USD" } });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ gift_card: { id: "gftc:1", gan: "7783000011112222", state: "ACTIVE", balance_money: { amount: 2500, currency: "USD" } } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const applied = await squareAdapter.applyReward({ credentials, idempotencyKey: "k", redemptionId: "r1", preparedRef: "gftc:1", value: { amountCents: 2500, currency: "USD", label: "x" } });
    expect(applied).toMatchObject({ ok: true, detail: { balance_cents: 2500, activate_recovered: true } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is registered, and never logs or stores a card number", () => {
    expect(getPosAdapter("square")).toBe(squareAdapter);
    for (const file of ["lib/pos/square.ts", "lib/pos/squareGiftCards.ts", "lib/pos/squareWebhook.ts", "lib/pos/squareConnection.ts", "app/api/webhooks/square/route.ts", "app/api/prizes/square-gift-card/route.ts", "lib/pos/squareStuckClaims.ts", "lib/pos/squareDiscounts.ts", "app/api/prizes/square-discount/route.ts"]) {
      const src = read(file);
      const logLines = src.split("\n").filter((line) => /console\.(log|info|warn|error)/.test(line));
      for (const line of logLines) expect(line, `${file}: ${line.trim()}`).not.toMatch(/\bgan\b|giftCard\b|rawBody|card\.gan/i);
    }
    // The ledger stores the gift card ID, never the number.
    expect(read("lib/pos/squareGiftCards.ts")).not.toMatch(/external_ref:\s*\w*\.gan/);
  });
});
