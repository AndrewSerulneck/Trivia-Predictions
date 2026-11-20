import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKFLOWS_DIR = join(ROOT, ".github", "workflows");

const scripts = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
}).scripts;

const npmScriptsCalled = (yml: string): string[] =>
  [...yml.matchAll(/npm\s+run\s+(?:-s\s+)?([\w:.-]+)/g)].map((m) => m[1]);

describe("workflows never call an npm script that loads .env.local", () => {
  const files = readdirSync(WORKFLOWS_DIR).filter((f) => /\.ya?ml$/.test(f));

  it("finds workflows", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s", (file) => {
    const yml = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    const bad = npmScriptsCalled(yml).filter((name) => /--env-file=/.test(scripts[name] ?? ""));
    // CI has no .env.local: node exits "not found" (the Sync Live Trivia import failed this way for months).
    expect(bad).toEqual([]);
  });

  it("Sync Live Trivia has a concurrency group that never cancels", () => {
    const yml = readFileSync(join(WORKFLOWS_DIR, "sync-live-trivia.yml"), "utf8");
    expect(yml).toMatch(/concurrency:\s*\n\s+group: sync-live-trivia\s*\n\s+cancel-in-progress: false/);
  });
});
