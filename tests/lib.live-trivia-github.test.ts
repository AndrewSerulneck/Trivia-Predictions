import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4c.2 GitHub reads for Live Publish (docs/speed-trivia-backlog-and-quality-plan.md): the open-PR guard and the
// PR check. fetch is faked; nothing leaves the process.
vi.mock("server-only", () => ({}));
import { findOpenPublishPr, findPublishPrsByClaim, mergePublishPr, openPublishPr, readPrState, readPublishRecord } from "@/lib/liveTriviaGithub";
import type { PublishRecord } from "@/lib/liveTriviaGithub";

const urls: string[] = [];
let reply: unknown;
let status = 200;

beforeEach(() => {
  urls.length = 0;
  status = 200;
  vi.stubEnv("GITHUB_TOKEN", "test-token");
  vi.stubEnv("GITHUB_REPOSITORY", "Owner/Repo");
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify(reply), { status, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("findOpenPublishPr", () => {
  it("finds an open Publish PR to main in one call, and ignores other PRs", async () => {
    reply = [{ html_url: "https://github.com/Owner/Repo/pull/2", number: 2, head: { ref: "feature/x" } },
      { html_url: "https://github.com/Owner/Repo/pull/5", number: 5, head: { ref: "live-trivia-publish-20261117-abc" } }];
    expect(await findOpenPublishPr()).toEqual({ url: "https://github.com/Owner/Repo/pull/5", number: 5 });
    expect(urls).toEqual(["https://api.github.com/repos/Owner/Repo/pulls?state=open&base=main&per_page=100"]);
    reply = [{ html_url: "https://github.com/Owner/Repo/pull/2", number: 2, head: { ref: "feature/x" } }];
    expect(await findOpenPublishPr()).toBeNull();
  });

  it("fails closed when GitHub fails", async () => {
    status = 502;
    reply = {};
    await expect(findOpenPublishPr()).rejects.toThrow(/GitHub request failed/);
  });
});

describe("readPrState", () => {
  it("reads merged, closed and open with one GET", async () => {
    reply = { state: "closed", merged: true };
    expect(await readPrState("https://github.com/owner/repo/pull/9")).toBe("merged");
    expect(urls).toEqual(["https://api.github.com/repos/Owner/Repo/pulls/9"]);
    reply = { state: "closed", merged: false, merged_at: null };
    expect(await readPrState("https://github.com/Owner/Repo/pull/9")).toBe("closed");
    reply = { state: "open", merged: false };
    expect(await readPrState("https://github.com/Owner/Repo/pull/9")).toBe("open");
  });

  it("never asks about another repo's PR", async () => {
    expect(await readPrState("https://github.com/someone/else/pull/9")).toBeNull();
    expect(await readPrState("https://github.com/Owner/Repo/pull/9/files")).toBeNull();
    expect(urls).toEqual([]);
  });
});

// Phase 7g (second review R2 #20.1, #20.3). A scripted fake GitHub: one reply per call, in order.
describe("Phase 7g: Publish PRs", () => {
  type Call = { url: string; method: string; body: unknown };
  let calls: Call[] = [];
  let replies: { status: number; body: unknown }[] = [];
  const CLAIM = "abcdef12-3456-4789-8abc-def012345678";
  const ID = (n: number) => `85000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const RECORD: PublishRecord = {
    claim: CLAIM,
    published: [{ id: ID(1), slug: "which-band-played-x" }],
    already: [{ id: ID(2), slug: "old-entry" }],
    refused: [{ id: ID(3), reason: "expired" }],
  };
  const PR = { url: "https://github.com/Owner/Repo/pull/9", number: 9, branch: "live-trivia-publish-x-abcdef12", commitSha: "c0ffee" };

  beforeEach(() => {
    calls = [];
    replies = [];
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : null });
      const next = replies.shift() ?? { status: 200, body: {} };
      return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
    }));
  });
  afterEach(() => { vi.useRealTimers(); });

  const merge = async () => {
    const result = mergePublishPr(PR);
    await vi.runAllTimersAsync();
    return result;
  };

  it("a 409 (the head moved) returns at once and never requests auto-merge", async () => {
    replies = [{ status: 409, body: { message: "Head branch was modified" } }];
    expect(await merge()).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls.some((c) => c.url.endsWith("/graphql"))).toBe(false);
  });

  it("a 409 after a 405 still never requests auto-merge", async () => {
    replies = [{ status: 405, body: {} }, { status: 409, body: {} }];
    expect(await merge()).toBe(false);
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.url.endsWith("/graphql"))).toBe(false);
  });

  it("405/422 (not mergeable yet) requests auto-merge pinned to the PR's commit", async () => {
    replies = [{ status: 405, body: {} }, { status: 422, body: {} }, { status: 405, body: {} }, { status: 200, body: { node_id: "PR_node" } }];
    expect(await merge()).toBe(false);
    const graphql = calls.find((c) => c.url.endsWith("/graphql"));
    expect(graphql?.body).toMatchObject({ variables: { id: "PR_node", sha: "c0ffee" } });
    expect(String((graphql?.body as { query: string }).query)).toContain("expectedHeadOid:$sha");
    expect(calls.filter((c) => c.method === "PUT").every((c) => (c.body as { sha: string }).sha === "c0ffee")).toBe(true);
  });

  it("a merge at the pinned commit deletes the branch and returns true", async () => {
    replies = [{ status: 200, body: { merged: true } }, { status: 200, body: {} }];
    expect(await merge()).toBe(true);
    expect(calls[1]).toMatchObject({ method: "DELETE" });
  });

  it("openPublishPr names the branch after the claim and carries the record in the body", async () => {
    replies = [
      { status: 200, body: { tree: { sha: "t0" } } },
      { status: 201, body: { sha: "b1" } },
      { status: 201, body: { sha: "t1" } },
      { status: 201, body: { sha: "c1" } },
      { status: 201, body: {} },
      { status: 201, body: { html_url: PR.url, number: 9 } },
    ];
    const opened = await openPublishPr("base", [{ path: "data/live-trivia/categories/music.v1.json", content: "{}", created: false, added: 1 }], "Adds 1", RECORD);
    expect(opened.branch).toMatch(/^live-trivia-publish-\d{14}-abcdef12$/);
    const body = (calls[5].body as { body: string }).body;
    expect(readPublishRecord(body, CLAIM)).toEqual(RECORD);
    expect(readPublishRecord(body, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("readPublishRecord refuses a malformed or tampered record", () => {
    const mark = (value: unknown) => `text\n<!-- live-publish-record ${JSON.stringify(value)} -->`;
    expect(readPublishRecord(mark({ claim: CLAIM, published: [[ID(1), "ok-slug"]], already: [], refused: [] }), CLAIM)).not.toBeNull();
    expect(readPublishRecord(mark({ claim: CLAIM, published: [["not-a-uuid", "ok-slug"]], already: [], refused: [] }), CLAIM)).toBeNull();
    expect(readPublishRecord(mark({ claim: CLAIM, published: [[ID(1), "Bad Slug; drop"]], already: [], refused: [] }), CLAIM)).toBeNull();
    expect(readPublishRecord(mark({ claim: CLAIM, published: [], already: [], refused: [] }), CLAIM)).toBeNull();
    expect(readPublishRecord(mark({ claim: CLAIM, published: [[ID(1), "ok"]] }), CLAIM)).toBeNull();
    expect(readPublishRecord(null, CLAIM)).toBeNull();
  });

  it("findPublishPrsByClaim finds a claim's PR and its state in one list call", async () => {
    const body = `Adds 1\n\n<!-- live-publish-record ${JSON.stringify({ claim: CLAIM, published: [[ID(1), "which-band-played-x"]], already: [], refused: [] })} -->`;
    replies = [{ status: 200, body: [
      { html_url: "https://github.com/Owner/Repo/pull/8", number: 8, state: "open", head: { ref: "feature/abcdef12" }, body },
      { html_url: "https://github.com/Owner/Repo/pull/7", number: 7, state: "closed", merged_at: "2026-11-20T00:00:00Z", head: { ref: "live-trivia-publish-20261120000000-abcdef12" }, body },
      { html_url: "https://github.com/Owner/Repo/pull/6", number: 6, state: "closed", merged_at: null, head: { ref: "live-trivia-publish-20261119000000-99999999" }, body },
    ] }];
    const found = await findPublishPrsByClaim([CLAIM, "99999999-0000-4000-8000-000000000000"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.github.com/repos/Owner/Repo/pulls?state=all&base=main&sort=created&direction=desc&per_page=50");
    expect([...found.keys()]).toEqual([CLAIM]); // PR 6's branch matches the other claim, but its record is for CLAIM
    expect(found.get(CLAIM)).toMatchObject({ url: "https://github.com/Owner/Repo/pull/7", state: "merged", record: { published: [{ id: ID(1) }] } });
    expect(await findPublishPrsByClaim([])).toEqual(new Map());
    expect(calls).toHaveLength(1);
  });
});
