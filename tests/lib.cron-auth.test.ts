import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isCronAuthorized } from "@/lib/cronAuth";

const originalCronSecret = process.env.CRON_SECRET;

function request(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/whatever", { headers });
}

describe("isCronAuthorized", () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    if (typeof originalCronSecret === "string") {
      process.env.CRON_SECRET = originalCronSecret;
      return;
    }
    delete process.env.CRON_SECRET;
  });

  it("fails closed when CRON_SECRET is not configured, even with the Vercel cron header", () => {
    expect(isCronAuthorized(request({ "x-vercel-cron": "*/5 * * * *" }))).toBe(false);
    expect(isCronAuthorized(request())).toBe(false);
  });

  it("accepts the exact bearer token", () => {
    process.env.CRON_SECRET = "Top-Secret-123";
    expect(isCronAuthorized(request({ authorization: "Bearer Top-Secret-123" }))).toBe(true);
  });

  it("rejects a case-folded bearer token — case must match exactly", () => {
    process.env.CRON_SECRET = "Top-Secret-123";
    expect(isCronAuthorized(request({ authorization: "bearer top-secret-123" }))).toBe(false);
    expect(isCronAuthorized(request({ authorization: "Bearer top-secret-123" }))).toBe(false);
  });

  it("accepts the exact x-cron-secret header", () => {
    process.env.CRON_SECRET = "Top-Secret-123";
    expect(isCronAuthorized(request({ "x-cron-secret": "Top-Secret-123" }))).toBe(true);
  });

  it("rejects a wrong-length or wrong-value secret on either header", () => {
    process.env.CRON_SECRET = "Top-Secret-123";
    expect(isCronAuthorized(request({ authorization: "Bearer Top-Secret-12" }))).toBe(false);
    expect(isCronAuthorized(request({ authorization: "Bearer wrong-secret-value" }))).toBe(false);
    expect(isCronAuthorized(request({ "x-cron-secret": "nope" }))).toBe(false);
    expect(isCronAuthorized(request())).toBe(false);
  });
});
