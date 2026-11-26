import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Fewer builds without risk (Andrew, 2026-11-24): Vercel skips docs-only commits, CI skips docs-only
// changes and runs once per PR update, and Railway rebuilds the heartbeat worker only when its own files change.

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const require = createRequire(import.meta.url);
const { canSkipBuild, previewRequested } = require(join(ROOT, "scripts/vercel-ignore-build.cjs")) as {
  canSkipBuild: (files: string[]) => boolean;
  previewRequested: (input: { ref?: string; message?: string }) => boolean;
};

describe("Vercel Ignored Build Step", () => {
  it("is wired in vercel.json", () => {
    const config = JSON.parse(read("vercel.json")) as { ignoreCommand?: string };
    expect(config.ignoreCommand).toBe("node scripts/vercel-ignore-build.cjs");
  });

  it.each([
    [["docs/fire-tv-app-plan.md"]],
    [["docs/fire-tv-app-plan.md", "docs/fire-tv-app-plan_PHASE_CR1_HANDOFF.md", "CLAUDE.md"]],
    [["data/sports-bingo/nfl-star-index.json"]],
    [[".github/workflows/ci.yml"]],
  ])("skips %j", (files) => {
    expect(canSkipBuild(files)).toBe(true);
  });

  it.each([
    [[]],
    [["docs/fire-tv-app-plan.md", "lib/pickem.ts"]],
    [["vercel.json"]],
    [["package.json"]],
    [["data/category-blitz/CATEGORY_TEST.md"]],
    [["data/live-trivia/categories/history.json"]],
    [["data/sports-bingo/other.json"]],
    [["public/brand/web/logo.png"]],
  ])("builds for %j", (files) => {
    expect(canSkipBuild(files)).toBe(false);
  });
});

// Preview builds are opt-in (Andrew, 2026-11-25); production always goes through the path check.
describe("Vercel preview builds", () => {
  it.each([
    [{ ref: "preview/tv-check", message: "x" }],
    [{ ref: "fix/cr3", message: "CR3: device check [preview]" }],
    [{ ref: "fix/cr3", message: "[Preview] look" }],
  ])("build when requested: %j", (input) => {
    expect(previewRequested(input)).toBe(true);
  });

  it.each([[{ ref: "fix/cr3", message: "CR3: fixes" }], [{}], [{ ref: "main", message: "preview the page" }]])(
    "skip otherwise: %j",
    (input) => {
      expect(previewRequested(input)).toBe(false);
    },
  );

  it("the skip applies only when VERCEL_ENV is preview", () => {
    expect(read("scripts/vercel-ignore-build.cjs")).toMatch(/process\.env\.VERCEL_ENV === "preview" &&\s*!previewRequested/);
  });
});

const ciPathLists = (yml: string): string[][] =>
  [...yml.matchAll(/^ {4}paths:\n((?: {6}- .+\n)+)/gm)].map((m) =>
    m[1]
      .trim()
      .split("\n")
      .map((line) => line.replace(/^\s*-\s*"?|"?\s*$/g, "")),
  );

describe("CI workflow", () => {
  const yml = read(".github/workflows/ci.yml");
  const lists = ciPathLists(yml);

  it("pushes run only on main (pull_request covers branches), so a PR update runs once", () => {
    expect(yml).toMatch(/push:\n {4}branches:\n {6}- main\n/);
    expect(yml).toMatch(/\n {2}pull_request:\n/);
  });

  it("push and pull_request share one path list", () => {
    expect(lists).toHaveLength(2);
    expect(lists[0]).toEqual(lists[1]);
    expect(lists[0].slice(0, 3)).toEqual(["**", "!docs/**", "!*.md"]);
  });

  it("re-includes every doc or top-level Markdown file a test reads", () => {
    const testFiles = readdirSync(join(ROOT, "tests")).filter(
      (f) => /\.test\.tsx?$/.test(f) && f !== "build-skip-contract.test.ts",
    );
    const docsRead = new Set<string>();
    for (const file of testFiles) {
      // Code only: comment lines and trailing `// …` comments name docs without reading them.
      const source = read(`tests/${file}`)
        .split("\n")
        .filter((line) => !/^\s*(\*|\/\/|\/\*|\{\/\*)/.test(line))
        .map((line) => line.replace(/\s\/\/.*$/, ""))
        .join("\n");
      for (const m of source.matchAll(/["'`](docs\/[^"'`$]+)["'`]/g)) docsRead.add(m[1]);
      for (const m of source.matchAll(/["'`]([^"'`/$]+\.md)["'`]/g)) {
        if (existsSync(join(ROOT, m[1]))) docsRead.add(m[1]);
      }
    }
    expect(docsRead.size).toBeGreaterThan(0);
    for (const doc of docsRead) expect(lists[0]).toContain(doc);
  });
});

describe("Railway heartbeat worker", () => {
  const config = JSON.parse(read("railway.json")) as {
    build: { watchPatterns?: string[] };
    deploy: { startCommand: string };
  };
  const watched = config.build.watchPatterns ?? [];

  it("rebuilds when its script, dependencies or config change", () => {
    const script = config.deploy.startCommand.match(/scripts\/[\w.-]+\.ts/)?.[0];
    expect(script).toBe("scripts/heartbeat.ts");
    for (const path of [script, "package.json", "package-lock.json", "railway.json"]) {
      expect(watched).toContain(`/${path}`);
    }
  });

  it("imports no repo file (else add it to watchPatterns)", () => {
    const source = read("scripts/heartbeat.ts");
    const imports = [...source.matchAll(/(?:from\s+|import\(\s*|require\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports.filter((spec) => spec.startsWith(".") || spec.startsWith("@/"))).toEqual([]);
  });
});
