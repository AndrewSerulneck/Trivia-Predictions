import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Phase 7c (docs/speed-trivia-backlog-and-quality-plan.md): Finder/iCloud makes "name 2.ext" copies, and `git add -A`
// used to commit them (32 were removed 2026-11-19). No tracked path may end in " <number>" before its extension.
// A copy deliberately kept for Andrew goes on this list, with a comment saying why.
const ALLOWED: string[] = [];

describe("no Finder duplicate files are committed", () => {
  it("git ls-files lists no 'name 2.ext' copies", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\0")
      .filter(Boolean);
    const copies = tracked.filter((file) => / \d+(\.[^/]+)?$/.test(file) && !ALLOWED.includes(file));
    expect(copies).toEqual([]);
  });
});
