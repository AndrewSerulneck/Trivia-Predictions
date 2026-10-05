import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/pos-rewards-integration-plan.md Phase 2 — the Square routes: connect, callback,
// disconnect, locations, the guest's gift card route and the webhook. Library calls are mocked;
// the real OAuth-state signing, owner-flag reader and session binding run.

const mocks = vi.hoisted(() => ({
  requireOwnerAuth: vi.fn(),
  exchangeSquareCode: vi.fn(),
  retrieveSquareMerchant: vi.fn(),
  listSquareLocations: vi.fn(),
  saveSquareConnection: vi.fn(),
  disconnectSquare: vi.fn(),
  loadSquareTokenForSetup: vi.fn(),
  setSquareLocation: vi.fn(),
  openSquareGiftCard: vi.fn(),
  recordSquareGiftCardActivity: vi.fn(),
  maybeRequireActiveVenuePresence: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));
vi.mock("@/lib/pos/square", () => ({
  squareAuthorizeUrl: (config: { applicationId: string }, state: string) =>
    `https://connect.squareupsandbox.com/oauth2/authorize?client_id=${config.applicationId}&state=${encodeURIComponent(state)}`,
  exchangeSquareCode: mocks.exchangeSquareCode,
  retrieveSquareMerchant: mocks.retrieveSquareMerchant,
  listSquareLocations: mocks.listSquareLocations,
}));
vi.mock("@/lib/pos/squareConnection", () => ({
  saveSquareConnection: mocks.saveSquareConnection,
  disconnectSquare: mocks.disconnectSquare,
  loadSquareTokenForSetup: mocks.loadSquareTokenForSetup,
  setSquareLocation: mocks.setSquareLocation,
}));
vi.mock("@/lib/pos/squareGiftCards", () => ({ openSquareGiftCard: mocks.openSquareGiftCard }));
vi.mock("@/lib/pos/squareWebhook", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pos/squareWebhook")>()),
  recordSquareGiftCardActivity: mocks.recordSquareGiftCardActivity,
}));
vi.mock("@/lib/venuePresence", () => ({
  maybeRequireActiveVenuePresence: mocks.maybeRequireActiveVenuePresence,
  venuePresenceErrorResponse: () => null,
}));

import { GET as CONNECT } from "@/app/api/owner/pos/square/connect/route";
import { GET as CALLBACK } from "@/app/api/owner/pos/square/callback/route";
import { POST as DISCONNECT } from "@/app/api/owner/pos/square/disconnect/route";
import { GET as LOCATIONS, POST as SET_LOCATION } from "@/app/api/owner/pos/square/locations/route";
import { POST as GIFT_CARD } from "@/app/api/prizes/square-gift-card/route";
import { POST as WEBHOOK } from "@/app/api/webhooks/square/route";
import { createPosOAuthState, POS_OAUTH_COOKIE } from "@/lib/pos/oauthState";
import { createSessionCookie } from "@/lib/serverSession";

const BASE = "http://localhost";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
  vi.stubEnv("SESSION_SECRET", "test-secret");
  vi.stubEnv("SQUARE_ENVIRONMENT", "sandbox");
  vi.stubEnv("SQUARE_APPLICATION_ID", "app-id");
  vi.stubEnv("SQUARE_APPLICATION_SECRET", "app-secret");
  vi.stubEnv("POS_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
  for (const fn of Object.values(mocks)) fn.mockReset();
  mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-1", venueIds: ["venue-1"] });
  mocks.exchangeSquareCode.mockResolvedValue({ accessToken: "AT", refreshToken: "RT", expiresAt: "2026-11-04T00:00:00Z", merchantId: "M1" });
  mocks.retrieveSquareMerchant.mockResolvedValue({ id: "M1", businessName: "Pub LLC", currency: "USD" });
  mocks.listSquareLocations.mockResolvedValue([{ id: "L1", name: "Main", address: null }]);
  mocks.saveSquareConnection.mockResolvedValue({ ok: true });
});

afterEach(() => vi.unstubAllEnvs());

const posResult = (res: Response) => new URL(res.headers.get("location") ?? "", BASE).searchParams.get("posResult");

describe("GET /api/owner/pos/square/connect", () => {
  const connect = (search = "?venueId=venue-1") => CONNECT(new Request(`${BASE}/api/owner/pos/square/connect${search}`));

  it("404s with the flag off, before auth", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    expect((await connect()).status).toBe(404);
    expect(mocks.requireOwnerAuth).not.toHaveBeenCalled();
  });

  it("sends a signed-out partner to the login page and refuses another owner's venue", async () => {
    mocks.requireOwnerAuth.mockRejectedValueOnce(new Response("", { status: 401 }));
    const res = await connect();
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/owner/login");
    expect((await connect("?venueId=venue-9")).status).toBe(403);
  });

  it("fails closed to the sheet when Square or POS_TOKEN_KEY isn't configured", async () => {
    vi.stubEnv("POS_TOKEN_KEY", "");
    expect(posResult(await connect())).toBe("not_configured");
    vi.stubEnv("POS_TOKEN_KEY", Buffer.alloc(32, 7).toString("base64"));
    vi.stubEnv("SQUARE_APPLICATION_SECRET", "");
    expect(posResult(await connect())).toBe("not_configured");
  });

  it("redirects to Square with a state and sets the single-use nonce cookie", async () => {
    const res = await connect();
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin).toBe("https://connect.squareupsandbox.com");
    expect(location.searchParams.get("state")).toBeTruthy();
    expect(res.headers.get("set-cookie")).toContain(`${POS_OAUTH_COOKIE}=`);
  });
});

describe("GET /api/owner/pos/square/callback", () => {
  const started = (ownerId = "owner-1", venueId = "venue-1") => {
    const s = createPosOAuthState({ ownerId, venueId, provider: "square" });
    if (!s) throw new Error("no state");
    return { state: s.state, cookie: s.cookie.split(";")[0] };
  };
  const callback = (query: string, cookie?: string) =>
    CALLBACK(new Request(`${BASE}/api/owner/pos/square/callback?${query}`, { headers: cookie ? { cookie } : {} }));

  it("saves one location automatically and lands on 'connected', clearing the cookie", async () => {
    const { state, cookie } = started();
    const res = await callback(`code=CODE&state=${encodeURIComponent(state)}`, cookie);
    expect(posResult(res)).toBe("connected");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(mocks.exchangeSquareCode).toHaveBeenCalledWith(expect.objectContaining({ environment: "sandbox" }), "CODE");
    expect(mocks.saveSquareConnection).toHaveBeenCalledWith(
      expect.objectContaining({ venueId: "venue-1", ownerId: "owner-1", merchantName: "Pub LLC", locationId: "L1" }),
    );
  });

  it("asks the partner to choose when the account has several locations", async () => {
    mocks.listSquareLocations.mockResolvedValue([
      { id: "L1", name: "A", address: null },
      { id: "L2", name: "B", address: null },
    ]);
    const { state, cookie } = started();
    const res = await callback(`code=CODE&state=${encodeURIComponent(state)}`, cookie);
    expect(posResult(res)).toBe("choose_location");
    expect(mocks.saveSquareConnection).toHaveBeenCalledWith(expect.objectContaining({ locationId: null }));
  });

  it("never exchanges a code without the nonce cookie, for another owner, or another owner's venue", async () => {
    const { state, cookie } = started();
    expect(posResult(await callback(`code=CODE&state=${encodeURIComponent(state)}`))).toBe("expired");
    const other = started("owner-2");
    expect(posResult(await callback(`code=CODE&state=${encodeURIComponent(other.state)}`, other.cookie))).toBe("expired");
    const foreignVenue = started("owner-1", "venue-9");
    expect(posResult(await callback(`code=CODE&state=${encodeURIComponent(foreignVenue.state)}`, foreignVenue.cookie))).toBe("expired");
    expect(posResult(await callback(`code=CODE&state=tampered${encodeURIComponent(state)}`, cookie))).toBe("expired");
    expect(mocks.exchangeSquareCode).not.toHaveBeenCalled();
  });

  it("reports a Deny, a failed exchange and an account with no active location", async () => {
    let s = started();
    expect(posResult(await callback(`error=access_denied&state=${encodeURIComponent(s.state)}`, s.cookie))).toBe("denied");
    mocks.exchangeSquareCode.mockResolvedValueOnce({ ok: false, code: "invalid", message: "bad code", retryable: false });
    s = started();
    expect(posResult(await callback(`code=X&state=${encodeURIComponent(s.state)}`, s.cookie))).toBe("error");
    mocks.listSquareLocations.mockResolvedValueOnce([]);
    s = started();
    expect(posResult(await callback(`code=X&state=${encodeURIComponent(s.state)}`, s.cookie))).toBe("no_location");
    expect(mocks.saveSquareConnection).not.toHaveBeenCalled();
  });
});

describe("POST disconnect + locations", () => {
  const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
    handler(new Request(`${BASE}/x`, { method: "POST", body: JSON.stringify(body) }));

  it("disconnect is venue-scoped", async () => {
    mocks.disconnectSquare.mockResolvedValue({ ok: true, revokedAtSquare: true });
    expect((await post(DISCONNECT, { venueId: "venue-9" })).status).toBe(403);
    expect((await post(DISCONNECT, { venueId: "venue-1" })).status).toBe(200);
    expect(mocks.disconnectSquare).toHaveBeenCalledWith("venue-1");
  });

  it("only accepts a location that Square lists for this account", async () => {
    mocks.loadSquareTokenForSetup.mockResolvedValue({ ok: true, environment: "sandbox", accessToken: "AT", merchantId: "M1" });
    mocks.listSquareLocations.mockResolvedValue([{ id: "L1", name: "Main", address: null }]);
    mocks.setSquareLocation.mockResolvedValue({ ok: true });
    const list = await LOCATIONS(new Request(`${BASE}/x?venueId=venue-1`));
    expect(await list.json()).toEqual({ ok: true, locations: [{ id: "L1", name: "Main", address: null }] });
    expect((await post(SET_LOCATION, { venueId: "venue-1", locationId: "L-OTHER" })).status).toBe(400);
    expect(mocks.setSquareLocation).not.toHaveBeenCalled();
    expect((await post(SET_LOCATION, { venueId: "venue-1", locationId: "L1" })).status).toBe(200);
    expect(mocks.setSquareLocation).toHaveBeenCalledWith("venue-1", "L1");
  });
});

describe("POST /api/prizes/square-gift-card", () => {
  const call = (body: unknown, cookieUser: string | null = "user-1") =>
    GIFT_CARD(
      new Request(`${BASE}/api/prizes/square-gift-card`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: cookieUser ? { cookie: createSessionCookie(cookieUser).split(";")[0] } : {},
      }),
    );

  it("binds the guest to the signed session", async () => {
    expect((await call({ userId: "user-2", venueId: "venue-1", redemptionId: "r" })).status).toBe(403);
    expect((await call({ venueId: "venue-1" })).status).toBe(400);
    expect(mocks.openSquareGiftCard).not.toHaveBeenCalled();
  });

  it("returns the card with no-store, and maps refusals to statuses", async () => {
    mocks.openSquareGiftCard.mockResolvedValueOnce({ ok: true, giftCard: { gan: "7783 0000 1111 2222", amountCents: 2500, balanceCents: 2500, state: "ACTIVE" } });
    const ok = await call({ userId: "user-1", venueId: "venue-1", redemptionId: "r" });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(mocks.openSquareGiftCard).toHaveBeenCalledWith({ userId: "user-1", venueId: "venue-1", redemptionId: "r" });
    expect(mocks.maybeRequireActiveVenuePresence).toHaveBeenCalledWith({ userId: "user-1", venueId: "venue-1" });

    for (const [code, status] of [["already_redeemed", 409], ["not_found", 404], ["expired", 410], ["unavailable", 503], ["square_error", 502]] as const) {
      mocks.openSquareGiftCard.mockResolvedValueOnce({ ok: false, code, message: "m" });
      const res = await call({ userId: "user-1", venueId: "venue-1", redemptionId: "r" });
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ ok: false, code, error: "m" });
    }
  });
});

describe("POST /api/webhooks/square", () => {
  const url = "https://hightopchallenge.com/api/webhooks/square";
  const send = (body: string, signature?: string) =>
    WEBHOOK(new Request(`${BASE}/api/webhooks/square`, { method: "POST", body, headers: signature ? { "x-square-hmacsha256-signature": signature } : {} }));
  const sign = (body: string) => createHmac("sha256", "sig-key").update(url + body).digest("base64");

  beforeEach(() => {
    vi.stubEnv("SQUARE_WEBHOOK_SIGNATURE_KEY", "sig-key");
    vi.stubEnv("SQUARE_WEBHOOK_NOTIFICATION_URL", url);
  });

  it("503s when unconfigured and 401s on a bad signature, doing no work", async () => {
    const body = JSON.stringify({ type: "gift_card.activity.created" });
    expect((await send(body, "nope")).status).toBe(401);
    vi.stubEnv("SQUARE_WEBHOOK_SIGNATURE_KEY", "");
    expect((await send(body, sign(body))).status).toBe(503);
    expect(mocks.recordSquareGiftCardActivity).not.toHaveBeenCalled();
  });

  it("works with the POS flag off (issued cards keep being recorded)", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    mocks.recordSquareGiftCardActivity.mockResolvedValue({ ok: true, matched: false });
    const body = JSON.stringify({ type: "gift_card.activity.created", data: { object: { gift_card_activity: { id: "a", type: "REDEEM", gift_card_id: "g" } } } });
    expect((await send(body, sign(body))).status).toBe(200);
    expect(mocks.recordSquareGiftCardActivity).toHaveBeenCalledWith({ id: "a", type: "REDEEM", gift_card_id: "g" });
  });

  it("200s other event types without recording, and 500s a database failure so Square retries", async () => {
    const other = JSON.stringify({ type: "payment.created" });
    expect((await send(other, sign(other))).status).toBe(200);
    expect(mocks.recordSquareGiftCardActivity).not.toHaveBeenCalled();
    mocks.recordSquareGiftCardActivity.mockResolvedValue({ ok: false });
    const body = JSON.stringify({ type: "gift_card.activity.created", data: { object: { gift_card_activity: { id: "a", gift_card_id: "g" } } } });
    expect((await send(body, sign(body))).status).toBe(500);
  });
});
