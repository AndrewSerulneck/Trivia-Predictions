import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  deleteAuthUser: vi.fn(),
}));

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: mocks.from,
    auth: { admin: { deleteUser: mocks.deleteAuthUser } },
  },
}));

vi.mock("@/lib/ownerSession", () => ({
  createOwnerSessionCookie: (ownerId: string) => `tp_owner_sess=session-${ownerId}; Path=/; HttpOnly`,
}));

import { POST } from "@/app/api/owner/auth/login/route";

type OwnerRow = { id: string; name: string; email: string } | null;
type VenueLinkRow = { venue_id: string };

const mockAuthSuccess = (authUserId = "auth-1") => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ user: { id: authUserId } }),
    })
  );
};

const mockOwnerLoginChains = (options: {
  ownerRow: OwnerRow;
  ownerError?: { message: string } | null;
  venueLinks?: VenueLinkRow[];
  venueLinksError?: { message: string } | null;
  liveVenues?: Array<{ id: string }>;
  liveVenuesError?: { message: string } | null;
  linkDeleteError?: { message: string } | null;
  ownerDeleteError?: { message: string } | null;
}) => {
  const ownerMaybeSingle = vi.fn().mockResolvedValue({
    data: options.ownerRow,
    error: options.ownerError ?? null,
  });
  const ownerEq = vi.fn().mockReturnValue({ maybeSingle: ownerMaybeSingle });
  const ownerSelect = vi.fn().mockReturnValue({ eq: ownerEq });

  const linkLimit = vi.fn().mockResolvedValue({
    data: options.venueLinks ?? [],
    error: options.venueLinksError ?? null,
  });
  const linkEq = vi.fn().mockReturnValue({ limit: linkLimit });
  const linkSelect = vi.fn().mockReturnValue({ eq: linkEq });
  const linkDeleteEq = vi.fn().mockResolvedValue({ error: options.linkDeleteError ?? null });
  const linkDelete = vi.fn().mockReturnValue({ eq: linkDeleteEq });

  const liveVenueLimit = vi.fn().mockResolvedValue({
    data: options.liveVenues ?? [],
    error: options.liveVenuesError ?? null,
  });
  const liveVenueIn = vi.fn().mockReturnValue({ limit: liveVenueLimit });
  const liveVenueSelect = vi.fn().mockReturnValue({ in: liveVenueIn });

  const ownerDeleteEq = vi.fn().mockResolvedValue({ error: options.ownerDeleteError ?? null });
  const ownerDelete = vi.fn().mockReturnValue({ eq: ownerDeleteEq });

  mocks.from.mockImplementation((table: string) => {
    if (table === "venue_owners") return { select: ownerSelect, delete: ownerDelete };
    if (table === "venue_owner_venues") return { select: linkSelect, delete: linkDelete };
    if (table === "venues") return { select: liveVenueSelect };
    throw new Error(`Unexpected table ${table}`);
  });

  return { linkDelete, ownerDelete };
};

const loginRequest = () =>
  new Request("http://localhost/api/owner/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "partner@example.com", password: "password123" }),
  });

describe("POST /api/owner/auth/login", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.from.mockReset();
    mocks.deleteAuthUser.mockReset();
    mocks.deleteAuthUser.mockResolvedValue({ data: { user: null }, error: null });
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("creates an owner session when the owner still has a venue link", async () => {
    mockAuthSuccess();
    mockOwnerLoginChains({
      ownerRow: { id: "owner-1", name: "Partner One", email: "partner@example.com" },
      venueLinks: [{ venue_id: "venue-1" }],
      liveVenues: [{ id: "venue-1" }],
    });

    const response = await POST(loginRequest());
    const payload = (await response.json()) as { ok: boolean; owner?: { id: string } };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, owner: { id: "owner-1", name: "Partner One", email: "partner@example.com" } });
    expect(response.headers.get("set-cookie")).toContain("tp_owner_sess=session-owner-1");
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("rejects and cleans up an orphaned owner login with no venue links", async () => {
    mockAuthSuccess("auth-orphan");
    const { linkDelete, ownerDelete } = mockOwnerLoginChains({
      ownerRow: { id: "owner-orphan", name: "Old Partner", email: "old@example.com" },
      venueLinks: [],
    });

    const response = await POST(loginRequest());
    const payload = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(payload).toEqual({ ok: false, error: "Invalid email or password." });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(linkDelete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("auth-orphan");
    expect(ownerDelete).toHaveBeenCalledTimes(1);
  });

  it("rejects and cleans up an owner whose links point only at deleted venues", async () => {
    mockAuthSuccess("auth-stale");
    const { linkDelete, ownerDelete } = mockOwnerLoginChains({
      ownerRow: { id: "owner-stale", name: "Stale Partner", email: "stale@example.com" },
      venueLinks: [{ venue_id: "deleted-venue" }],
      liveVenues: [],
    });

    const response = await POST(loginRequest());
    const payload = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(payload).toEqual({ ok: false, error: "Invalid email or password." });
    expect(linkDelete).toHaveBeenCalledTimes(1);
    expect(mocks.deleteAuthUser).toHaveBeenCalledWith("auth-stale");
    expect(ownerDelete).toHaveBeenCalledTimes(1);
  });

  it("does not reveal when auth succeeds but no owner profile exists", async () => {
    mockAuthSuccess("auth-without-owner");
    mockOwnerLoginChains({ ownerRow: null });

    const response = await POST(loginRequest());
    const payload = (await response.json()) as { ok: boolean; error?: string };

    expect(response.status).toBe(401);
    expect(payload).toEqual({ ok: false, error: "Invalid email or password." });
    expect(mocks.deleteAuthUser).not.toHaveBeenCalled();
  });
});
