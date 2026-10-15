import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORY_BLITZ_SLEEP_GRACE_MS, isContinuousGameAwake } from "@/lib/categoryBlitzShared";

// Category Blitz "sleep when idle" (docs/category-blitz-how-to-play-plan.md
// Phase 5): a continuous round starts only while a player has the game open.
// The one thing that starts one is driveContinuousCategoryBlitz, reached only
// through GET /api/category-blitz/sessions WITHOUT `peek=1` — which only the
// game page (lib/categoryBlitzRealtime.ts, CategoryBlitzGame.tsx) calls.

const ROOT = process.cwd();
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

const sourceFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });

describe("isContinuousGameAwake", () => {
  const timing = { roundDurationSeconds: 180, intermissionSeconds: 180 };
  const scored = { startedAt: "2026-07-15T00:00:00.000Z", scoredAt: "2026-07-15T00:03:05.000Z" };
  const nextRoundMs = Date.parse("2026-07-15T00:06:05.000Z"); // scoredAt + intermission

  it("a session with no rounds is asleep", () => {
    expect(isContinuousGameAwake(null, false, timing, nextRoundMs)).toBe(false);
  });

  it("stays awake through the results/intermission and a short grace after the next round was due", () => {
    expect(isContinuousGameAwake(scored, false, timing, nextRoundMs - 60_000)).toBe(true);
    expect(isContinuousGameAwake(scored, false, timing, nextRoundMs + CATEGORY_BLITZ_SLEEP_GRACE_MS - 1)).toBe(true);
  });

  it("is asleep once the next round is overdue past the grace", () => {
    expect(isContinuousGameAwake(scored, false, timing, nextRoundMs + CATEGORY_BLITZ_SLEEP_GRACE_MS)).toBe(false);
  });

  it("an unscored round counts from its start (round + intermission)", () => {
    const unscored = { startedAt: "2026-07-15T00:00:00.000Z", scoredAt: null };
    const due = Date.parse("2026-07-15T00:06:00.000Z");
    expect(isContinuousGameAwake(unscored, false, timing, due - 1)).toBe(true);
    expect(isContinuousGameAwake(unscored, false, timing, due + CATEGORY_BLITZ_SLEEP_GRACE_MS)).toBe(false);
  });
});

describe("only the open game page wakes Category Blitz", () => {
  it("driveContinuousCategoryBlitz is called only from the engine and the sessions route", () => {
    const callers = ["app", "lib", "components"]
      .flatMap(sourceFiles)
      .filter((file) => read(file).includes("driveContinuousCategoryBlitz("))
      .sort();
    expect(callers).toEqual(["app/api/category-blitz/sessions/route.ts", "lib/categoryBlitz.ts"]);
  });

  it("the continuous cron only scores — it never drives or starts a round", () => {
    const source = read("lib/categoryBlitz.ts");
    const start = source.indexOf("export async function runContinuousCategoryBlitzEngine");
    expect(start).toBeGreaterThan(-1);
    const nextExport = source.indexOf("\nexport ", start + 1);
    const body = source.slice(start, nextExport === -1 ? undefined : nextExport);
    expect(body).not.toMatch(/driveContinuousCategoryBlitz|startContinuousRound|createContinuousSession/);
  });

  it("venue home and the admin panel only peek", () => {
    const hub = read("components/venue/VenueHubClient.tsx");
    const admin = read("components/admin/sections/CategoryBlitzSection.tsx");
    for (const source of [hub, admin]) {
      const calls = source.match(/\/api\/category-blitz\/sessions\?[^`"']*/g) ?? [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) expect(call).toContain("peek=1");
    }
  });

  it("the TV reads through peekCategoryBlitz and never drives continuous mode", () => {
    const tv = read("lib/venueScreen.ts");
    expect(tv).toContain("peekCategoryBlitz(");
    expect(tv).not.toContain("driveContinuousCategoryBlitz");
  });
});
