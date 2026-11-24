import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const workflow = fs.readFileSync(
  path.join(process.cwd(), ".github/workflows/nfl-star-index-weekly.yml"),
  "utf8"
);

type Guard = (input: {
  failed: { current: boolean; prior: boolean };
  previous: unknown;
  snapshot: unknown;
  rows?: { current: { season?: number }[]; prior: { season?: number }[] };
}) => string | null;
const { guardFailure } = createRequire(import.meta.url)(
  path.join(process.cwd(), "scripts/refresh-nfl-star-index.cjs")
) as { guardFailure: Guard };

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ playerId: i }));
const slate = (season: number, current: number, prior: number) => ({
  season,
  priorSeason: season - 1,
  current: { players: players(current) },
  prior: { players: players(prior) },
});
const ok = { current: false, prior: false };

describe("NFL star workflow contract", () => {
  it("every piped run step fails on the first error", () => {
    const steps = workflow.split(/\n\s+- name:/).slice(1);
    for (const step of steps) {
      if (step.includes("| tee")) expect(step).toMatch(/shell: bash|pipefail/);
    }
  });

  it("fires on Sep 1 as well as Tuesdays", () => {
    expect(workflow).toMatch(/cron: "\d+ \d+ 1 9 \*"/);
  });

  it("checkout does not persist the token", () => {
    expect(workflow).toMatch(/persist-credentials: false/);
  });

  it("aborts a stopped rebase", () => {
    expect(workflow).toContain("git rebase --abort");
  });
});

describe("refresh-nfl-star-index guard", () => {
  it("refuses a shrunken prior slate (602 → 12)", () => {
    expect(guardFailure({ failed: ok, previous: slate(2026, 571, 602), snapshot: slate(2026, 571, 12) })).toMatch(
      /prior slate shrank/
    );
  });

  it("compares the prior slate with the old current slate at rollover", () => {
    expect(guardFailure({ failed: ok, previous: slate(2026, 571, 602), snapshot: slate(2027, 100, 12) })).toMatch(
      /prior slate shrank from 571/
    );
  });

  it("refuses wrong-season rows", () => {
    const rows = { current: [{ season: 2026 }, { season: 2025 }], prior: [{ season: 2025 }] };
    expect(guardFailure({ failed: ok, previous: null, snapshot: slate(2026, 2, 5), rows })).toMatch(/not season 2026/);
  });

  it("still allows 571 → 292 current", () => {
    expect(guardFailure({ failed: ok, previous: slate(2026, 571, 602), snapshot: slate(2026, 292, 602) })).toBeNull();
  });
});
