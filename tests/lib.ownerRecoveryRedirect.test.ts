import { describe, expect, it } from "vitest";
import { ownerRecoveryRedirectHref } from "@/lib/ownerRecoveryRedirect";

describe("ownerRecoveryRedirectHref", () => {
  it("redirects Supabase recovery fragments from the apex root to the owner reset page", () => {
    expect(ownerRecoveryRedirectHref("/", "#access_token=token-1&type=recovery&refresh_token=refresh-1")).toBe(
      "/owner/reset-password#access_token=token-1&type=recovery&refresh_token=refresh-1",
    );
  });

  it("redirects recovery fragments from rewritten marketing pages", () => {
    expect(ownerRecoveryRedirectHref("/info", "access_token=token-1&type=recovery")).toBe(
      "/owner/reset-password#access_token=token-1&type=recovery",
    );
  });

  it("does not redirect when already on the reset page", () => {
    expect(ownerRecoveryRedirectHref("/owner/reset-password", "#access_token=token-1&type=recovery")).toBeNull();
  });

  it("ignores non-recovery fragments", () => {
    expect(ownerRecoveryRedirectHref("/", "#access_token=token-1&type=email")).toBeNull();
    expect(ownerRecoveryRedirectHref("/", "#type=recovery")).toBeNull();
    expect(ownerRecoveryRedirectHref("/", "")).toBeNull();
  });
});
