import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// docs/partner-social-promo-plan.md Phase 4 — Meta deauthorize / data-deletion callbacks.

vi.mock("server-only", () => ({}));
// Phase 5: the callbacks really remove connections now; the database side is tested in lib.social-publish.test.ts.
const removeMetaUserSocialConnections = vi.fn(async (_metaUserId: string) => 1);
vi.mock("@/lib/social/socialConnections", () => ({
  removeMetaUserSocialConnections: (metaUserId: string) => removeMetaUserSocialConnections(metaUserId),
}));

import { handleMetaCallback } from "@/lib/social/metaCallbacks";
import { metaDeletionConfirmationCode, verifyMetaSignedRequest } from "@/lib/social/metaSignedRequest";

const SECRET = "test-app-secret";
const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");
const sign = (payload: object, secret = SECRET): string => {
  const encoded = b64url(JSON.stringify(payload));
  return `${b64url(createHmac("sha256", secret).update(encoded).digest())}.${encoded}`;
};
const good = () => sign({ algorithm: "HMAC-SHA256", user_id: "1234567890", issued_at: 1 });
const post = (signed: string | null) => {
  const body = new URLSearchParams();
  if (signed !== null) body.set("signed_request", signed);
  return new Request("https://example.test/api/social/meta/data-deletion", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
};

afterEach(() => vi.unstubAllEnvs());

describe("verifyMetaSignedRequest", () => {
  it("accepts a correctly signed request and returns the user id", () => {
    expect(verifyMetaSignedRequest(good(), SECRET)).toEqual({ userId: "1234567890", issuedAt: 1 });
  });
  it("rejects a wrong secret, tampered payload, wrong algorithm, bad user id and junk", () => {
    expect(verifyMetaSignedRequest(good(), "other")).toBeNull();
    const [sig] = good().split(".");
    const forged = b64url(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" }));
    expect(verifyMetaSignedRequest(`${sig}.${forged}`, SECRET)).toBeNull();
    expect(verifyMetaSignedRequest(sign({ algorithm: "none", user_id: "1" }), SECRET)).toBeNull();
    expect(verifyMetaSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "../x" }), SECRET)).toBeNull();
    for (const junk of ["", "abc", "a.b.c", "!!.!!", null, undefined]) {
      expect(verifyMetaSignedRequest(junk, SECRET)).toBeNull();
    }
    expect(verifyMetaSignedRequest(good(), "")).toBeNull();
  });
  it("makes a stable confirmation code that does not contain the id", () => {
    const code = metaDeletionConfirmationCode("1234567890", SECRET);
    expect(code).toBe(metaDeletionConfirmationCode("1234567890", SECRET));
    expect(code).toMatch(/^[0-9a-f]{20}$/);
    expect(code).not.toContain("1234567890");
    expect(code).not.toBe(metaDeletionConfirmationCode("1234567891", SECRET));
  });
});

describe("handleMetaCallback", () => {
  it("answers 503 when the app secret is not configured", async () => {
    vi.stubEnv("META_PARTNER_APP_SECRET", "");
    expect((await handleMetaCallback(post(good()), "deauthorize")).status).toBe(503);
  });
  it("answers 401 for a bad signature and 400 for a body that is not a form", async () => {
    vi.stubEnv("META_PARTNER_APP_SECRET", SECRET);
    expect((await handleMetaCallback(post("nope"), "deauthorize")).status).toBe(401);
    expect((await handleMetaCallback(post(null), "data-deletion")).status).toBe(401);
    const notForm = new Request("https://example.test/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect((await handleMetaCallback(notForm, "deauthorize")).status).toBe(400);
  });
  it("deauthorize answers ok; data-deletion answers { url, confirmation_code }", async () => {
    vi.stubEnv("META_PARTNER_APP_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hightopchallenge.com/");
    const deauth = await handleMetaCallback(post(good()), "deauthorize");
    expect(deauth.status).toBe(200);
    expect(await deauth.json()).toEqual({ ok: true });

    expect(removeMetaUserSocialConnections).toHaveBeenLastCalledWith("1234567890");

    const deletion = await handleMetaCallback(post(good()), "data-deletion");
    const body = (await deletion.json()) as { url: string; confirmation_code: string };
    expect(body.confirmation_code).toBe(metaDeletionConfirmationCode("1234567890", SECRET));
    expect(body.url).toBe(`https://hightopchallenge.com/delete-account?code=${body.confirmation_code}#partner-social`);
  });
  it("answers 500 (so Meta retries) when removing the connections fails, and removes nothing for a bad signature", async () => {
    vi.stubEnv("META_PARTNER_APP_SECRET", SECRET);
    removeMetaUserSocialConnections.mockClear();
    await handleMetaCallback(post("bad.value"), "deauthorize");
    expect(removeMetaUserSocialConnections).not.toHaveBeenCalled();
    removeMetaUserSocialConnections.mockRejectedValueOnce(new Error("db down"));
    expect((await handleMetaCallback(post(good()), "data-deletion")).status).toBe(500);
  });
  it("never logs the signed request or the Meta user id", async () => {
    vi.stubEnv("META_PARTNER_APP_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://hightopchallenge.com");
    const spies = [vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    await handleMetaCallback(post(good()), "data-deletion");
    await handleMetaCallback(post("bad.value"), "deauthorize");
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain("1234567890");
    expect(logged).not.toContain(good().split(".")[0]);
    spies.forEach((spy) => spy.mockRestore());
  });
});

describe("Phase 4 wiring", () => {
  const read = (path: string) => readFileSync(join(__dirname, "..", path), "utf8");
  it("routes use the shared handler and the secret has one reader", () => {
    expect(read("app/api/social/meta/deauthorize/route.ts")).toContain('handleMetaCallback(request, "deauthorize")');
    expect(read("app/api/social/meta/data-deletion/route.ts")).toContain('handleMetaCallback(request, "data-deletion")');
    for (const file of ["lib/social/metaCallbacks.ts", "lib/social/metaSignedRequest.ts"]) {
      expect(read(file), file).not.toContain("META_PARTNER_APP_SECRET");
    }
  });
  it("the partner app ID is set and is never the player app's ID (D27)", async () => {
    const { META_PARTNER_APP_ID } = await import("@/lib/social/metaConfig");
    const native = JSON.parse(read("native/capacitor.config.json")) as {
      plugins?: { InstagramStories?: { facebookAppId?: string } };
    };
    const playerAppId = native.plugins?.InstagramStories?.facebookAppId ?? "";
    expect(META_PARTNER_APP_ID).toMatch(/^\d{10,20}$/);
    expect(playerAppId).toMatch(/^\d{10,20}$/);
    expect(META_PARTNER_APP_ID).not.toBe(playerAppId);
  });
  it("the privacy policy and deletion page cover Instagram/Facebook, and the deletion URL target exists", () => {
    expect(read("app/privacy/page.tsx")).toContain("Instagram and Facebook (Share to social)");
    expect(read("app/delete-account/page.tsx")).toContain('id="partner-social"');
  });
});
