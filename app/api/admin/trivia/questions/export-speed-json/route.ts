import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type SpeedQuestionRow = {
  slug: string | null;
  question: string;
  options: unknown;
  correct_answer: number;
  category: string | null;
  difficulty: string | null;
  question_pool: string;
  answer_format: string;
  status: string;
};

type JsonQuestion = {
  slug: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category: string;
  difficulty: string | null;
};

type GithubConfig = {
  token: string;
  owner: string;
  repo: string;
  baseBranch: string;
  draftPr: boolean;
};

type GithubRefResponse = {
  object: {
    sha: string;
  };
};

type GithubCommitResponse = {
  sha: string;
  tree: {
    sha: string;
  };
};

type GithubContentResponse = {
  content?: string;
  encoding?: string;
};

type GithubBlobResponse = {
  sha: string;
};

type GithubTreeResponse = {
  sha: string;
};

type GithubPullResponse = {
  html_url: string;
  number: number;
};

type ExportFile = {
  path: string;
  content: string;
};

const SPEED_TRIVIA_REPO_DIR = "data/trivia/categories";
const PAGE_SIZE = 1000;

function slugify(value: string): string {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function assertSpeedRepoPath(filePath: string): void {
  if (!filePath.startsWith(`${SPEED_TRIVIA_REPO_DIR}/`) || filePath.includes("..")) {
    throw new Error("Refusing to write outside the Speed Trivia JSON directory.");
  }
}

function normalizeEnvValue(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getGithubConfig(): GithubConfig {
  const token = normalizeEnvValue(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const repoFullName = normalizeEnvValue(process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPO);
  const owner = normalizeEnvValue(process.env.GITHUB_REPO_OWNER || repoFullName.split("/")[0]);
  const repo = normalizeEnvValue(process.env.GITHUB_REPO_NAME || repoFullName.split("/")[1]);
  const baseBranch = normalizeEnvValue(process.env.GITHUB_BASE_BRANCH || process.env.GITHUB_EXPORT_BASE_BRANCH) || "main";
  const draftPr = normalizeEnvValue(process.env.GITHUB_EXPORT_DRAFT_PR).toLowerCase() === "true";

  if (!token) {
    throw new Error("Missing GITHUB_TOKEN or GH_TOKEN for Speed Trivia JSON export PR creation.");
  }
  if (!owner || !repo) {
    throw new Error("Missing GitHub repository config. Set GITHUB_REPOSITORY or GITHUB_REPO_OWNER/GITHUB_REPO_NAME.");
  }

  return { token, owner, repo, baseBranch, draftPr };
}

function mapSpeedQuestion(row: SpeedQuestionRow): JsonQuestion {
  if (
    row.question_pool !== "anytime_blitz" ||
    row.answer_format !== "multiple_choice" ||
    row.status !== "active"
  ) {
    throw new Error("Export received a non-Speed-Trivia row.");
  }

  const options = Array.isArray(row.options)
    ? row.options.map((option) => String(option ?? "").trim()).filter(Boolean)
    : [];
  if (options.length !== 4) {
    throw new Error(`Question "${row.question}" must have exactly 4 options.`);
  }

  const correctAnswer = Number(row.correct_answer);
  if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
    throw new Error(`Question "${row.question}" has an invalid correct answer index.`);
  }

  const category = String(row.category ?? "General Knowledge").trim() || "General Knowledge";
  const slug = slugify(String(row.slug ?? row.question));
  if (!slug) {
    throw new Error(`Question "${row.question}" produced an empty slug.`);
  }

  return {
    slug,
    question: row.question.trim(),
    options,
    correctAnswer,
    category,
    difficulty: row.difficulty,
  };
}

async function fetchAllActiveSpeedQuestions(): Promise<SpeedQuestionRow[]> {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const rows: SpeedQuestionRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from("trivia_questions")
      .select("slug, question, options, correct_answer, category, difficulty, question_pool, answer_format, status")
      .eq("status", "active")
      .eq("question_pool", "anytime_blitz")
      .eq("answer_format", "multiple_choice")
      .order("category", { ascending: true, nullsFirst: false })
      .order("question", { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) {
      throw new Error(error.message || "Failed to load approved Speed Trivia questions.");
    }

    const batch = (data ?? []) as SpeedQuestionRow[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

function buildExportFiles(rows: SpeedQuestionRow[]): ExportFile[] {
  const grouped = new Map<string, JsonQuestion[]>();

  for (const row of rows) {
    const question = mapSpeedQuestion(row);
    const categorySlug = slugify(question.category) || "general-knowledge";
    const group = grouped.get(categorySlug) ?? [];
    group.push(question);
    grouped.set(categorySlug, group);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([categorySlug, questions]) => {
      const filePath = `${SPEED_TRIVIA_REPO_DIR}/${categorySlug}.v1.json`;
      assertSpeedRepoPath(filePath);
      const sorted = [...questions].sort((a, b) => a.question.localeCompare(b.question));
      return {
        path: filePath,
        content: `${JSON.stringify(sorted, null, 2)}\n`,
      };
    });
}

async function githubRequest<T>(
  config: GithubConfig,
  endpoint: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GitHub API request failed (${response.status}) for ${endpoint}: ${text || response.statusText}`);
  }

  return (await response.json()) as T;
}

async function getExistingGithubFileContent(
  config: GithubConfig,
  filePath: string,
  ref: string
): Promise<string | null> {
  assertSpeedRepoPath(filePath);
  const endpoint = `/repos/${config.owner}/${config.repo}/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GitHub API request failed (${response.status}) for ${filePath}: ${text || response.statusText}`);
  }

  const data = (await response.json()) as GithubContentResponse;
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new Error(`Unexpected GitHub content response for ${filePath}.`);
  }

  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
}

function encodeURIComponentPath(filePath: string): string {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function buildBranchName(): string {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `speed-trivia-export-${stamp}-${suffix}`;
}

function buildRequestId(): string {
  return `speed-export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createSpeedTriviaExportPr(config: GithubConfig, files: ExportFile[], totalQuestions: number) {
  const baseRef = await githubRequest<GithubRefResponse>(
    config,
    `/repos/${config.owner}/${config.repo}/git/ref/heads/${encodeURIComponent(config.baseBranch)}`
  );
  const baseSha = baseRef.object.sha;

  const changedFiles: ExportFile[] = [];
  for (const file of files) {
    const existing = await getExistingGithubFileContent(config, file.path, config.baseBranch);
    if (existing !== file.content) {
      changedFiles.push(file);
    }
  }

  if (changedFiles.length === 0) {
    return {
      prUrl: "",
      prNumber: 0,
      branchName: "",
      changedFiles: [] as string[],
    };
  }

  const baseCommit = await githubRequest<GithubCommitResponse>(
    config,
    `/repos/${config.owner}/${config.repo}/git/commits/${baseSha}`
  );
  const branchName = buildBranchName();

  await githubRequest(config, `/repos/${config.owner}/${config.repo}/git/refs`, {
    method: "POST",
    body: JSON.stringify({
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    }),
  });

  const treeEntries = [];
  for (const file of changedFiles) {
    const blob = await githubRequest<GithubBlobResponse>(config, `/repos/${config.owner}/${config.repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({
        content: file.content,
        encoding: "utf-8",
      }),
    });
    treeEntries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  const tree = await githubRequest<GithubTreeResponse>(config, `/repos/${config.owner}/${config.repo}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: treeEntries,
    }),
  });

  const commit = await githubRequest<GithubCommitResponse>(config, `/repos/${config.owner}/${config.repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: "chore(trivia): export approved speed trivia questions",
      tree: tree.sha,
      parents: [baseSha],
    }),
  });

  await githubRequest(config, `/repos/${config.owner}/${config.repo}/git/refs/heads/${encodeURIComponent(branchName)}`, {
    method: "PATCH",
    body: JSON.stringify({
      sha: commit.sha,
      force: false,
    }),
  });

  const prBody = [
    "Exports approved Speed Trivia questions from the Admin review database into JSON files.",
    "",
    `Questions exported: ${totalQuestions}`,
    `Category files changed: ${changedFiles.length}`,
    "",
    "Safety checks:",
    "- Only `status=active` rows were exported.",
    "- Only `question_pool=anytime_blitz` rows were exported.",
    "- Only `answer_format=multiple_choice` rows were exported.",
    "- Only `data/trivia/categories/` files were written.",
    "- Live Trivia JSON was not touched.",
  ].join("\n");

  const pr = await githubRequest<GithubPullResponse>(config, `/repos/${config.owner}/${config.repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: "chore(trivia): export approved Speed Trivia questions",
      head: branchName,
      base: config.baseBranch,
      body: prBody,
      draft: config.draftPr,
      maintainer_can_modify: true,
    }),
  });

  return {
    prUrl: pr.html_url,
    prNumber: pr.number,
    branchName,
    changedFiles: changedFiles.map((file) => file.path),
  };
}

export async function POST(request: Request) {
  const requestId = buildRequestId();
  try {
    const auth = await requireAdminAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    console.info(`[${requestId}] Creating Speed Trivia JSON export PR.`);
    const config = getGithubConfig();
    const rows = await fetchAllActiveSpeedQuestions();
    const files = buildExportFiles(rows);
    const result = await createSpeedTriviaExportPr(config, files, rows.length);
    console.info(`[${requestId}] Speed Trivia JSON export PR result`, {
      totalQuestions: rows.length,
      categories: files.length,
      changedFiles: result.changedFiles.length,
      prUrl: result.prUrl || null,
      alreadyUpToDate: result.changedFiles.length === 0,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      totalQuestions: rows.length,
      categories: files.length,
      changedFiles: result.changedFiles,
      branchName: result.branchName,
      prNumber: result.prNumber,
      prUrl: result.prUrl,
      alreadyUpToDate: result.changedFiles.length === 0,
    });
  } catch (error) {
    console.error(`[${requestId}] Failed to create Speed Trivia export PR`, error);
    return NextResponse.json(
      {
        ok: false,
        requestId,
        error: error instanceof Error ? error.message : "Failed to create Speed Trivia export PR.",
      },
      { status: 500 }
    );
  }
}
