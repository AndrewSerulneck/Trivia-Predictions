import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4c.2 GitHub reads for Live Publish (docs/speed-trivia-backlog-and-quality-plan.md): the open-PR guard and the
// PR check. fetch is faked; nothing leaves the process.
vi.mock("server-only", () => ({}));
import { findOpenPublishPr, readPrState } from "@/lib/liveTriviaGithub";

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
