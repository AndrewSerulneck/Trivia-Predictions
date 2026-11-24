#!/usr/bin/env node
// Vercel "Ignored Build Step" (vercel.json `ignoreCommand`). Exit 0 = skip this build; exit 1 = build.
//
// Skips a build only when every changed file is one the site never reads: plan/handoff docs, top-level
// Markdown, GitHub workflow files, and the weekly NFL star snapshot (F41 in docs/fire-tv-app-plan.md;
// lib/ never reads it at runtime). Tailwind only scans app/, components/ and lib/, so docs can't change CSS.
// Anything unexpected (no earlier deployment, shallow clone, git error, empty diff) builds.
// Andrew, 2026-11-24: fewer builds, with zero risk to Hightop Challenge.

const { execFileSync } = require("node:child_process");

const SKIPPABLE = [
  /^docs\//,
  /^[^/]+\.md$/,
  /^\.github\//,
  /^data\/sports-bingo\/nfl-star-index\.json$/,
];

const isSkippablePath = (file) => SKIPPABLE.some((re) => re.test(file));

/** True only for a non-empty list in which every path is skippable. */
const canSkipBuild = (files) => files.length > 0 && files.every(isSkippablePath);

const git = (args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

const hasCommit = (sha) => {
  try {
    git(["cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
};

/**
 * The commit to compare against: the branch's last deployed commit, else (a new preview branch) the tip of main.
 * Comparing with main's tip can only add files (main's own newer changes), so it builds more often, never skips wrongly.
 */
const baseCommit = () => {
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (previous) {
    if (!hasCommit(previous)) git(["fetch", "--quiet", "--depth=1", "origin", previous]);
    return previous;
  }
  if (process.env.VERCEL_ENV !== "preview") return null;
  git(["fetch", "--quiet", "--depth=1", "origin", "main"]);
  return git(["rev-parse", "FETCH_HEAD"]) || null;
};

const main = () => {
  try {
    const base = baseCommit();
    if (!base) {
      console.log("No earlier commit to compare with: building.");
      return 1;
    }
    const files = git(["diff", "--name-only", base, "HEAD"]).split("\n").filter(Boolean);
    if (canSkipBuild(files)) {
      console.log(`Only docs/snapshot files changed (${files.length}): skipping build.`);
      return 0;
    }
    console.log(files.length ? "Site files changed: building." : "No file changes: building.");
    return 1;
  } catch (error) {
    console.log(`Could not compare commits (${error instanceof Error ? error.message : "error"}): building.`);
    return 1;
  }
};

if (require.main === module) process.exit(main());

module.exports = { canSkipBuild, isSkippablePath };
