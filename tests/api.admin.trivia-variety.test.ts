import { beforeEach, describe, expect, it, vi } from "vitest";

// Admin -> Variety route (Phase 4a). Fake server client; no database.
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), inserts: [] as Record<string, unknown>[], insertError: null as unknown, updates: [] as unknown[] }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.auth }));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: () => {
      const q = {
        select: () => q, eq: () => q, order: () => q,
        limit: async () => ({ data: [{ position: 4 }], error: null }),
        insert: async (row: Record<string, unknown>) => { mocks.inserts.push(row); return { error: mocks.insertError }; },
        update: (patch: unknown) => { mocks.updates.push(patch); return { eq: () => ({ eq: () => ({ select: async () => ({ data: [{ id: "x" }], error: null }) }) }) }; },
      };
      return q;
    },
  },
}));
import { GET, POST } from "@/app/api/admin/trivia/variety/route";

const post = (body: unknown) => POST(new Request("https://example.invalid/api/admin/trivia/variety", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserts = [];
  mocks.updates = [];
  mocks.insertError = null;
  mocks.auth.mockResolvedValue({ ok: true, adminUsername: "andrew" });
  mocks.rpc.mockResolvedValue({ data: { areas: [], tagged: 0, unmapped: 0, untagged: 3, topSubjects: [], top5Share: null }, error: null });
});

describe("Variety route", () => {
  it("requires an admin", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401, error: "Admin login required." });
    expect((await GET(new Request("https://example.invalid/api/admin/trivia/variety"))).status).toBe(401);
    expect((await post({ action: "add" })).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reads one category with one RPC, defaulting bad input", async () => {
    const response = await GET(new Request("https://example.invalid/api/admin/trivia/variety?game=nope&category=Nope"));
    const body = await response.json();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("question_variety_report", { p_game: "speed", p_category: "Animals" });
    expect(body.categories.speed).toContain("Current Events");
    expect(body.categories.live).toContain("History & Government");
    expect(body.report.eraSet).toEqual(["Timeless"]);
  });

  it("shows Current Events by month", async () => {
    const body = await (await GET(new Request("https://example.invalid/api/admin/trivia/variety?game=speed&category=Current%20Events"))).json();
    expect(body.columns.every((c: string) => /^\d{4}-\d{2}$/.test(c))).toBe(true);
  });

  it("adds an area with checked eras, positioned last", async () => {
    expect((await post({ action: "add", game: "speed", category: "Music", name: "Yacht rock", eras: ["1980s", "1970s"], note: "" })).status).toBe(200);
    expect(mocks.inserts).toEqual([{ game: "speed", category: "Music", name: "Yacht rock", eras: ["1970s", "1980s"], note: null, position: 5, created_by: "admin:andrew" }]);
    expect((await post({ action: "add", game: "speed", category: "Music", name: "Yacht rock", eras: ["1880s"] })).status).toBe(400);
    expect((await post({ action: "add", game: "speed", category: "Poetry", name: "X", eras: ["1980s"] })).status).toBe(400);
    mocks.insertError = { code: "23505" };
    const dup = await post({ action: "add", game: "speed", category: "Music", name: "Pop", eras: ["1980s"] });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe("That area already exists.");
  });

  it("switches an area on or off and refuses anything else", async () => {
    expect((await post({ action: "toggle", game: "speed", id: "00000000-0000-4000-8000-000000000001", active: false })).status).toBe(200);
    expect(mocks.updates).toEqual([{ active: false }]);
    expect((await post({ action: "toggle", game: "speed", id: "x", active: false })).status).toBe(400);
    expect((await post({ action: "toggle", game: "speed", id: "00000000-0000-4000-8000-000000000001", active: "no" })).status).toBe(400);
    expect((await post({ action: "delete", game: "speed" })).status).toBe(400);
  });
});
