import "server-only";
import { Buffer } from "node:buffer";
import { LIVE_DIR, NEW_FILES } from "@/lib/live-trivia-quality/categories.cjs";
import type { PublishChange } from "@/lib/live-trivia-quality/publish.cjs";

// GitHub writes for Live Trivia Publish (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c step 5; D10). The same
// helper pattern as app/api/admin/trivia/questions/export-speed-json/route.ts (GITHUB_TOKEN, GITHUB_REPOSITORY):
// read the Live files from main, commit the appended files to a new branch, open a PR, merge it. The merge triggers
// the Sync Live Trivia workflow, which validates and imports. Writes only inside data/live-trivia/categories/.

type Config = { token: string; owner: string; repo: string; base: string };

export type LiveFiles = { baseSha: string; files: Map<string, string | null> };
export type LivePullRequest = { url: string; number: number; branch: string; commitSha: string };

export class LiveGithubError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/** Every Publish branch starts with this; the open-PR guard looks for it. */
export const PUBLISH_BRANCH_PREFIX = "live-trivia-publish-";

const env = (value: string | undefined) => (typeof value === "string" ? value.trim() : "");

const config = (): Config => {
  const token = env(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const full = env(process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO);
  const owner = env(process.env.GITHUB_REPO_OWNER || full.split("/")[0]);
  const repo = env(process.env.GITHUB_REPO_NAME || full.split("/")[1]);
  const base = env(process.env.GITHUB_BASE_BRANCH) || "main";
  if (!token || !owner || !repo) throw new LiveGithubError("github_unconfigured", "GitHub isn't configured.");
  return { token, owner, repo, base };
};

/** Only the Live directory's own .json files; never a nested or traversing path. */
export const assertLivePath = (filePath: string) => {
  if (!new RegExp(`^${LIVE_DIR.replace(/[/.]/g, "\\$&")}/[a-z0-9][a-z0-9.-]*\\.json$`).test(filePath) || filePath.includes("..")) {
    throw new LiveGithubError("path", "Refusing to write outside the Live Trivia JSON directory.");
  }
};

const request = async <T,>(cfg: Config, endpoint: string, init: RequestInit = {}, okStatuses: number[] = []): Promise<{ status: number; body: T }> => {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok && !okStatuses.includes(response.status)) {
    // Never echo the response body: it can be long and isn't for the page.
    throw new LiveGithubError("github", `GitHub request failed (${response.status}).`);
  }
  const body = (await response.json().catch(() => null)) as T;
  return { status: response.status, body };
};

const repoPath = (cfg: Config) => `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;

/** Every Live file on main (by blob, so size never matters), plus `extra` new-category paths (null when absent). */
export const readLiveFiles = async (extra: string[] = []): Promise<LiveFiles> => {
  const cfg = config();
  const ref = await request<{ object: { sha: string } }>(cfg, `${repoPath(cfg)}/git/ref/heads/${encodeURIComponent(cfg.base)}`);
  const baseSha = ref.body.object.sha;
  const list = await request<{ type: string; path: string; sha: string }[]>(cfg, `${repoPath(cfg)}/contents/${LIVE_DIR}?ref=${baseSha}`);
  const files = new Map<string, string | null>();
  for (const entry of list.body) {
    if (entry.type !== "file" || !entry.path.endsWith(".json")) continue;
    assertLivePath(entry.path);
    const blob = await request<{ content: string; encoding: string }>(cfg, `${repoPath(cfg)}/git/blobs/${entry.sha}`);
    if (blob.body.encoding !== "base64") throw new LiveGithubError("github", "Unexpected GitHub file encoding.");
    files.set(entry.path, Buffer.from(blob.body.content.replace(/\n/g, ""), "base64").toString("utf8"));
  }
  for (const filePath of extra) {
    assertLivePath(filePath);
    if (!files.has(filePath)) files.set(filePath, null);
  }
  return { baseSha, files };
};

/** One commit with the appended files on a new branch from `baseSha`, and a PR to main. */
export const openPublishPr = async (baseSha: string, changes: PublishChange[], summary: string): Promise<LivePullRequest> => {
  const cfg = config();
  for (const change of changes) {
    assertLivePath(change.path);
    if (change.created && !NEW_FILES.has(change.path.split("/").pop() ?? "")) {
      throw new LiveGithubError("path", "Publish may only create a new category's file.");
    }
  }
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const branch = `${PUBLISH_BRANCH_PREFIX}${stamp}-${Math.random().toString(36).slice(2, 8)}`;
  const baseCommit = await request<{ tree: { sha: string } }>(cfg, `${repoPath(cfg)}/git/commits/${baseSha}`);
  const tree = [];
  for (const change of changes) {
    const blob = await request<{ sha: string }>(cfg, `${repoPath(cfg)}/git/blobs`, {
      method: "POST", body: JSON.stringify({ content: change.content, encoding: "utf-8" }),
    });
    tree.push({ path: change.path, mode: "100644", type: "blob", sha: blob.body.sha });
  }
  const newTree = await request<{ sha: string }>(cfg, `${repoPath(cfg)}/git/trees`, {
    method: "POST", body: JSON.stringify({ base_tree: baseCommit.body.tree.sha, tree }),
  });
  const commit = await request<{ sha: string }>(cfg, `${repoPath(cfg)}/git/commits`, {
    method: "POST", body: JSON.stringify({ message: "content(live-trivia): publish reviewed writer questions", tree: newTree.body.sha, parents: [baseSha] }),
  });
  await request(cfg, `${repoPath(cfg)}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.body.sha }) });
  const pr = await request<{ html_url: string; number: number }>(cfg, `${repoPath(cfg)}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: "content(live-trivia): publish reviewed writer questions",
      head: branch,
      base: cfg.base,
      body: [
        summary,
        "",
        "Append-only (D10): existing entries are unchanged; new entries are added at the end of each file.",
        "Kept in Admin → Quick Review (Live). Merging runs Sync Live Trivia (check, then import).",
      ].join("\n"),
    }),
  });
  return { url: pr.body.html_url, number: pr.body.number, branch, commitSha: commit.body.sha };
};

/**
 * The open-PR guard (Phase 4c.2 step 5): an open Publish PR to main, if any. One call; independent of the database,
 * so it also catches a PR whose record was lost. Throws on a GitHub failure, so Publish fails closed.
 */
export const findOpenPublishPr = async (): Promise<{ url: string; number: number } | null> => {
  const cfg = config();
  const list = await request<{ html_url: string; number: number; head?: { ref?: string } }[]>(cfg,
    `${repoPath(cfg)}/pulls?state=open&base=${encodeURIComponent(cfg.base)}&per_page=100`);
  const open = (Array.isArray(list.body) ? list.body : []).find((pr) => pr.head?.ref?.startsWith(PUBLISH_BRANCH_PREFIX));
  return open ? { url: open.html_url, number: open.number } : null;
};

export type LivePrState = "merged" | "closed" | "open";

/** The PR check (Phase 4c.2 step 6): one GET for a Publish PR of this repo. Null = not this repo's PR link. */
export const readPrState = async (prUrl: string): Promise<LivePrState | null> => {
  const cfg = config();
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/.exec(prUrl);
  if (!match || match[1].toLowerCase() !== cfg.owner.toLowerCase() || match[2].toLowerCase() !== cfg.repo.toLowerCase()) return null;
  const pr = await request<{ state?: string; merged?: boolean; merged_at?: string | null }>(cfg, `${repoPath(cfg)}/pulls/${match[3]}`);
  if (pr.body?.merged || pr.body?.merged_at) return "merged";
  return pr.body?.state === "closed" ? "closed" : "open";
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Merge the PR at exactly `commitSha` (squash). main has no required checks, so GitHub's auto-merge can't be used;
 * this is the self-merge D10 describes. If GitHub won't merge yet (checks required later, or mergeability still
 * computing), auto-merge is requested instead; the PR then merges itself, or waits for Andrew on GitHub.
 */
export const mergePublishPr = async (pr: LivePullRequest): Promise<boolean> => {
  const cfg = config();
  for (const delay of [0, 1500, 3000]) {
    if (delay) await wait(delay);
    const result = await request<{ merged?: boolean }>(cfg, `${repoPath(cfg)}/pulls/${pr.number}/merge`, {
      method: "PUT", body: JSON.stringify({ merge_method: "squash", sha: pr.commitSha }),
    }, [405, 409, 422]);
    if (result.status === 200 && result.body?.merged) {
      await request(cfg, `${repoPath(cfg)}/git/refs/heads/${encodeURIComponent(pr.branch)}`, { method: "DELETE" }, [404, 422]).catch(() => null);
      return true;
    }
    if (result.status === 409) break; // head moved or conflict: leave it for Andrew
  }
  const node = await request<{ node_id: string }>(cfg, `${repoPath(cfg)}/pulls/${pr.number}`).catch(() => null);
  if (node?.body?.node_id) {
    await request(cfg, "/graphql", {
      method: "POST",
      body: JSON.stringify({ query: "mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){clientMutationId}}", variables: { id: node.body.node_id } }),
    }).catch(() => null);
  }
  return false;
};
