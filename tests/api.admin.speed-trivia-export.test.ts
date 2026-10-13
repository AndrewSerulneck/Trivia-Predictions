import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), auth: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.auth }));
import { POST } from "@/app/api/admin/trivia/questions/export-speed-json/route";

describe("approved Speed export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GITHUB_TOKEN", "synthetic-export-token");
    vi.stubEnv("GITHUB_REPOSITORY", "fixture/repository");
    mocks.auth.mockResolvedValue({ ok: true });
    mocks.rpc.mockResolvedValue({ data: { revision: "42" }, error: null });
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
    query.range.mockResolvedValue({ data: [{ slug: "fixture-question", question: "A fixture question?", options: ["A", "B", "C", "D"], correct_answer: 0, category: "Science", difficulty: "easy", status: "active", question_pool: "anytime_blitz", answer_format: "multiple_choice" }], error: null });
    mocks.from.mockReturnValue(query);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("removes retired-only category files and binds all reads to one base commit", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      let body: unknown = {};
      if (url.endsWith("/git/ref/heads/main")) body = { object: { sha: "immutable-base" } };
      else if (url.includes("/contents/data/trivia/categories?")) body = [
        { type: "file", path: "data/trivia/categories/science.v1.json" },
        { type: "file", path: "data/trivia/categories/empty.v1.json" },
        { type: "file", path: "data/trivia/categories/README.md" },
        { type: "file", path: "data/live-trivia/categories/history.v1.json" },
      ];
      else if (url.includes("/contents/data/trivia/categories/science.v1.json")) body = { encoding: "base64", content: Buffer.from("[]\n").toString("base64") };
      else if (url.includes("/git/commits/immutable-base")) body = { sha: "immutable-base", tree: { sha: "base-tree" } };
      else if (url.endsWith("/git/blobs")) body = { sha: "new-blob" };
      else if (url.endsWith("/git/trees")) body = { sha: "new-tree" };
      else if (url.endsWith("/git/commits")) body = { sha: "new-commit" };
      else if (url.endsWith("/pulls")) body = { number: 123, html_url: "https://example.invalid/pr/123" };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("https://example.invalid/export", { method: "POST" }));
    expect(response.status).toBe(200);
    const treeCall = calls.find(call => call.url.endsWith("/git/trees"));
    const tree = JSON.parse(String(treeCall?.init?.body));
    expect(tree.tree).toEqual([
      { path: "data/trivia/categories/science.v1.json", mode: "100644", type: "blob", sha: "new-blob" },
      { path: "data/trivia/categories/empty.v1.json", mode: "100644", type: "blob", sha: null },
    ]);
    expect(calls.filter(call => call.url.includes("/contents/")).every(call => call.url.endsWith("ref=immutable-base"))).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("refuses an inconsistent paginated bank before writing to GitHub", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { revision: "42" }, error: null }).mockResolvedValueOnce({ data: { revision: "43" }, error: null });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("https://example.invalid/export", { method: "POST" }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain("changed during export");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires admin authorization before reading questions", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401, error: "Admin login required." });
    const response = await POST(new Request("https://example.invalid/export", { method: "POST" }));
    expect(response.status).toBe(401); expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
