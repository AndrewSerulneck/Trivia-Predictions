import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  requireOwnerAuth: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUserById: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
    auth: {
      admin: { updateUserById: mocks.updateUserById },
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  },
}));

vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: mocks.requireOwnerAuth }));

import { GET } from "@/app/api/owner/account/route";
import { PATCH as PATCH_EMAIL } from "@/app/api/owner/account/email/route";
import { PATCH as PATCH_PASSWORD } from "@/app/api/owner/account/password/route";
import { POST as POST_PASSWORD_RESET_EMAIL } from "@/app/api/owner/account/password-reset-email/route";
import { POST as POST_FORGOT_PASSWORD } from "@/app/api/owner/auth/forgot-password/route";

type OwnerRow = {
  id: string;
  auth_id: string | null;
  name: string | null;
  email: string | null;
};

type SupabaseError = { message: string };

const OWNER_AUTH = { ownerId: "owner-1", venueIds: ["venue-1"] };
const OWNER_ROW: OwnerRow = {
  id: "owner-1",
  auth_id: "auth-1",
  name: "Partner One",
  email: "partner@example.com",
};

const accountRequest = (path: string, body?: Record<string, unknown>) =>
  new Request(`http://localhost${path}`, {
    method: body ? "PATCH" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

const postAccountRequest = (path: string, body?: Record<string, unknown>) =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

const ownerRow = (overrides: Partial<OwnerRow>): OwnerRow => ({
  ...OWNER_ROW,
  ...overrides,
});

const mockPasswordGrant = (options: { ok: boolean; authUserId?: string }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: options.ok,
      json: vi.fn().mockResolvedValue({ user: { id: options.authUserId ?? "auth-1" } }),
    }),
  );
};

const mockVenueOwnersChains = (options: {
  ownerRow?: OwnerRow | null;
  ownerError?: SupabaseError | null;
  duplicateOwner?: { id: string } | null;
  duplicateError?: SupabaseError | null;
  ownerUpdateError?: SupabaseError | null;
}) => {
  const profileChain = {
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.ownerRow === undefined ? OWNER_ROW : options.ownerRow,
      error: options.ownerError ?? null,
    }),
  };
  profileChain.eq.mockReturnValue(profileChain);

  const duplicateChain = {
    eq: vi.fn(),
    neq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.duplicateOwner ?? null,
      error: options.duplicateError ?? null,
    }),
  };
  duplicateChain.eq.mockReturnValue(duplicateChain);
  duplicateChain.neq.mockReturnValue(duplicateChain);

  const updateEq = vi.fn().mockResolvedValue({ error: options.ownerUpdateError ?? null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });

  const select = vi.fn((columns: string) => {
    if (columns === "id, auth_id, name, email") {
      return profileChain;
    }
    if (columns === "id") {
      return duplicateChain;
    }
    throw new Error(`Unexpected venue_owners select: ${columns}`);
  });

  mocks.from.mockImplementation((table: string) => {
    if (table === "venue_owners") {
      return { select, update };
    }
    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    duplicateChain,
    profileChain,
    select,
    update,
    updateEq,
  };
};

describe("owner account API", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.from.mockReset();
    mocks.requireOwnerAuth.mockReset();
    mocks.resetPasswordForEmail.mockReset();
    mocks.updateUserById.mockReset();
    mocks.requireOwnerAuth.mockResolvedValue(OWNER_AUTH);
    mocks.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    mocks.updateUserById.mockResolvedValue({ data: { user: { id: "auth-1" } }, error: null });
    process.env.NEXT_PUBLIC_SITE_URL = "https://partners.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  describe("GET /api/owner/account", () => {
    it("returns current owner data for an authenticated owner", async () => {
      mockVenueOwnersChains({});

      const response = await GET(accountRequest("/api/owner/account"));
      const body = (await response.json()) as {
        ok: boolean;
        owner: { id: string; name: string; email: string };
      };

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ok: true,
        owner: { id: "owner-1", name: "Partner One", email: "partner@example.com" },
      });
      expect(mocks.requireOwnerAuth).toHaveBeenCalledOnce();
    });

    it("returns 401 through the owner auth guard when unauthenticated", async () => {
      mocks.requireOwnerAuth.mockRejectedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      );

      const response = await GET(accountRequest("/api/owner/account"));

      expect(response.status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /api/owner/account/email", () => {
    it("rejects invalid email", async () => {
      const response = await PATCH_EMAIL(
        accountRequest("/api/owner/account/email", {
          email: "not-an-email",
          currentPassword: "password123",
        }),
      );
      const body = (await response.json()) as { ok: boolean; error: string };

      expect(response.status).toBe(400);
      expect(body).toEqual({ ok: false, error: "Enter a valid email address." });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.updateUserById).not.toHaveBeenCalled();
    });

    it("rejects wrong current password", async () => {
      mockVenueOwnersChains({});
      mockPasswordGrant({ ok: false });

      const response = await PATCH_EMAIL(
        accountRequest("/api/owner/account/email", {
          email: "new@example.com",
          currentPassword: "wrong-password",
        }),
      );
      const body = (await response.json()) as { ok: boolean; error: string };

      expect(response.status).toBe(401);
      expect(body).toEqual({ ok: false, error: "Current password is incorrect." });
      expect(mocks.updateUserById).not.toHaveBeenCalled();
    });

    it("rejects duplicate email", async () => {
      const chains = mockVenueOwnersChains({ duplicateOwner: { id: "owner-2" } });
      mockPasswordGrant({ ok: true });

      const response = await PATCH_EMAIL(
        accountRequest("/api/owner/account/email", {
          email: " TAKEN@Example.com ",
          currentPassword: "password123",
        }),
      );
      const body = (await response.json()) as { ok: boolean; error: string };

      expect(response.status).toBe(409);
      expect(body).toEqual({ ok: false, error: "That email address is unavailable." });
      expect(chains.duplicateChain.eq).toHaveBeenCalledWith("email", "taken@example.com");
      expect(chains.duplicateChain.neq).toHaveBeenCalledWith("id", "owner-1");
      expect(mocks.updateUserById).not.toHaveBeenCalled();
    });

    it("updates Supabase Auth and venue_owners.email on success", async () => {
      const chains = mockVenueOwnersChains({});
      mockPasswordGrant({ ok: true });

      const response = await PATCH_EMAIL(
        accountRequest("/api/owner/account/email", {
          email: " NEW@Example.com ",
          currentPassword: "password123",
        }),
      );
      const body = (await response.json()) as {
        ok: boolean;
        owner: { id: string; name: string; email: string };
      };

      expect(response.status).toBe(200);
      expect(body).toEqual({
        ok: true,
        owner: { id: "owner-1", name: "Partner One", email: "new@example.com" },
      });
      expect(fetch).toHaveBeenCalledWith(
        "https://example.supabase.co/auth/v1/token?grant_type=password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "partner@example.com", password: "password123" }),
        }),
      );
      expect(mocks.updateUserById).toHaveBeenCalledWith("auth-1", {
        email: "new@example.com",
        email_confirm: true,
      });
      expect(chains.update).toHaveBeenCalledWith({ email: "new@example.com" });
      expect(chains.updateEq).toHaveBeenCalledWith("id", "owner-1");
    });
  });

  describe("PATCH /api/owner/account/password", () => {
    it("rejects short new password", async () => {
      const response = await PATCH_PASSWORD(
        accountRequest("/api/owner/account/password", {
          currentPassword: "password123",
          newPassword: "short",
        }),
      );
      const body = (await response.json()) as { ok: boolean; error: string };

      expect(response.status).toBe(400);
      expect(body).toEqual({ ok: false, error: "Password must be at least 8 characters." });
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.updateUserById).not.toHaveBeenCalled();
    });

    it("rejects wrong current password", async () => {
      mockVenueOwnersChains({});
      mockPasswordGrant({ ok: false });

      const response = await PATCH_PASSWORD(
        accountRequest("/api/owner/account/password", {
          currentPassword: "wrong-password",
          newPassword: "new-password-123",
        }),
      );
      const body = (await response.json()) as { ok: boolean; error: string };

      expect(response.status).toBe(401);
      expect(body).toEqual({ ok: false, error: "Current password is incorrect." });
      expect(mocks.updateUserById).not.toHaveBeenCalled();
    });

    it("updates the Supabase Auth password on success", async () => {
      mockVenueOwnersChains({});
      mockPasswordGrant({ ok: true });

      const response = await PATCH_PASSWORD(
        accountRequest("/api/owner/account/password", {
          currentPassword: "password123",
          newPassword: "new-password-123",
        }),
      );
      const body = (await response.json()) as { ok: boolean };

      expect(response.status).toBe(200);
      expect(body).toEqual({ ok: true });
      expect(fetch).toHaveBeenCalledWith(
        "https://example.supabase.co/auth/v1/token?grant_type=password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "partner@example.com", password: "password123" }),
        }),
      );
      expect(mocks.updateUserById).toHaveBeenCalledWith("auth-1", {
        password: "new-password-123",
      });
    });
  });

  describe("POST /api/owner/account/password-reset-email", () => {
    it("uses the production apex Partner Dashboard reset URL for authenticated reset emails", async () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://hightopchallenge.com";
      mockVenueOwnersChains({
        ownerRow: ownerRow({ id: "owner-reset-production-url", email: "partner@example.com" }),
      });
      mocks.requireOwnerAuth.mockResolvedValue({
        ownerId: "owner-reset-production-url",
        venueIds: ["venue-1"],
      });

      const response = await POST_PASSWORD_RESET_EMAIL(
        postAccountRequest("/api/owner/account/password-reset-email"),
      );

      expect(response.status).toBe(200);
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("partner@example.com", {
        redirectTo: "https://hightopchallenge.com/owner/reset-password",
      });
    });

    it("sends a reset email to the authenticated owner's saved email", async () => {
      const chains = mockVenueOwnersChains({
        ownerRow: ownerRow({ id: "owner-reset-1", email: "partner@example.com" }),
      });
      mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-reset-1", venueIds: ["venue-1"] });

      const response = await POST_PASSWORD_RESET_EMAIL(
        postAccountRequest("/api/owner/account/password-reset-email"),
      );
      const body = (await response.json()) as { ok: boolean };

      expect(response.status).toBe(200);
      expect(body).toEqual({ ok: true });
      expect(chains.profileChain.eq).toHaveBeenCalledWith("id", "owner-reset-1");
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("partner@example.com", {
        redirectTo: "https://partners.example.com/owner/reset-password",
      });
    });

    it("ignores a request body email and sends only to venue_owners.email", async () => {
      mockVenueOwnersChains({
        ownerRow: ownerRow({ id: "owner-reset-2", email: "owner-on-file@example.com" }),
      });
      mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-reset-2", venueIds: ["venue-1"] });

      const response = await POST_PASSWORD_RESET_EMAIL(
        postAccountRequest("/api/owner/account/password-reset-email", {
          email: "attacker@example.com",
        }),
      );

      expect(response.status).toBe(200);
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledOnce();
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("owner-on-file@example.com", {
        redirectTo: "https://partners.example.com/owner/reset-password",
      });
      expect(mocks.resetPasswordForEmail).not.toHaveBeenCalledWith(
        "attacker@example.com",
        expect.anything(),
      );
    });

    it("returns 401 through the owner auth guard when unauthenticated", async () => {
      mocks.requireOwnerAuth.mockRejectedValue(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
      );

      const response = await POST_PASSWORD_RESET_EMAIL(
        postAccountRequest("/api/owner/account/password-reset-email"),
      );

      expect(response.status).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    });

    it("returns a generic failure when the owner profile is missing", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockVenueOwnersChains({ ownerRow: null });
      mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-reset-missing", venueIds: ["venue-1"] });

      const response = await POST_PASSWORD_RESET_EMAIL(
        postAccountRequest("/api/owner/account/password-reset-email"),
      );
      const body = (await response.json()) as { ok: boolean; error: string };

      expect(response.status).toBe(500);
      expect(body).toEqual({ ok: false, error: "Something went wrong. Please try again." });
      expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it("logs Supabase reset failures and returns a generic failure", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      mockVenueOwnersChains({
        ownerRow: ownerRow({ id: "owner-reset-failure", email: "failure@example.com" }),
      });
      mocks.requireOwnerAuth.mockResolvedValue({ ownerId: "owner-reset-failure", venueIds: ["venue-1"] });
      mocks.resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: "SMTP unavailable" } });

      const response = await POST_PASSWORD_RESET_EMAIL(
        postAccountRequest("/api/owner/account/password-reset-email"),
      );
      const body = (await response.json()) as { ok: boolean; error: string };

      expect(response.status).toBe(500);
      expect(body).toEqual({ ok: false, error: "Something went wrong. Please try again." });
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("failure@example.com", {
        redirectTo: "https://partners.example.com/owner/reset-password",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "Failed to send owner password reset email.",
        expect.objectContaining({
          ownerId: "owner-reset-failure",
          destinationEmail: "failure@example.com",
          error: "SMTP unavailable",
        }),
      );

      consoleError.mockRestore();
    });

    it("rate-limits repeat reset email requests for the same owner", async () => {
      mockVenueOwnersChains({
        ownerRow: ownerRow({ id: "owner-reset-rate-limit", email: "rate-limit@example.com" }),
      });
      mocks.requireOwnerAuth.mockResolvedValue({
        ownerId: "owner-reset-rate-limit",
        venueIds: ["venue-1"],
      });

      const firstResponse = await POST_PASSWORD_RESET_EMAIL(
        postAccountRequest("/api/owner/account/password-reset-email"),
      );
      const secondResponse = await POST_PASSWORD_RESET_EMAIL(
        postAccountRequest("/api/owner/account/password-reset-email"),
      );
      const secondBody = (await secondResponse.json()) as { ok: boolean; error: string };

      expect(firstResponse.status).toBe(200);
      expect(secondResponse.status).toBe(429);
      expect(secondBody).toEqual({
        ok: false,
        error: "Please wait a few minutes before requesting another reset email.",
      });
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledOnce();
    });
  });

  describe("POST /api/owner/auth/forgot-password", () => {
    it("uses the production apex Partner Dashboard reset URL for public forgot-password emails", async () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://hightopchallenge.com";

      const response = await POST_FORGOT_PASSWORD(
        postAccountRequest("/api/owner/auth/forgot-password", {
          email: " Partner@Example.com ",
        }),
      );
      const body = (await response.json()) as { ok: boolean };

      expect(response.status).toBe(200);
      expect(body).toEqual({ ok: true });
      expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("partner@example.com", {
        redirectTo: "https://hightopchallenge.com/owner/reset-password",
      });
    });
  });
});
