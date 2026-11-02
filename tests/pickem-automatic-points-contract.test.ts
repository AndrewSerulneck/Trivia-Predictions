import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { VENUE_GAME_CARD_BY_KEY } from "@/lib/venueGameCards";

/**
 * Pick 'Em Phase 1 tripwires (docs/pickem-college-football-and-prize-plan.md, D1 + D2 + D10):
 * no daily pick cap, no 2x/3x bonus, no Collect button; every correct pick (NFL included) is
 * paid a flat 10 points once, only by the pay_pickem_points RPC via lib/pickemPoints.ts.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const sourceFiles = (dir: string): string[] =>
  readdirSync(resolve(process.cwd(), dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(resolve(process.cwd(), path)).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

const appSources = () => ["app", "components", "lib"].flatMap(sourceFiles);

describe("Pick 'Em automatic points contract", () => {
  const pickem = read("lib/pickem.ts");

  it("has no daily pick cap and no bonus multiplier", () => {
    expect(pickem).not.toContain("PICKEM_DAILY_PICK_LIMIT");
    expect(pickem).not.toMatch(/multiplier/i);
    expect(pickem).not.toContain("pickem_daily_snapshots");
    const start = pickem.indexOf("export async function submitPickEmPick");
    const body = pickem.slice(start, pickem.indexOf("\nexport async function", start + 1));
    expect(body).not.toContain('count: "exact"');
    expect(body).not.toMatch(/limit reached/i);
  });

  it("never credits users.points or stamps a pick paid outside the RPC", () => {
    expect(pickem).not.toContain('.from("users")');
    // Type fields (`reward_claimed_at: string | null`) are fine; a written value is not.
    expect(pickem).not.toMatch(/reward_claimed_at:\s*(?!string)[^\s|]/);
    const points = read("lib/pickemPoints.ts");
    expect(points).not.toContain('.from("users")');
    expect(points).not.toContain('.from("pickem_picks")');
  });

  it("the admin settle-game action only grades and pays through the RPC (Phase 7.5.1, F12)", () => {
    const admin = read("lib/admin.ts");
    const start = admin.indexOf("export async function settleAdminPickEmGame");
    expect(start).toBeGreaterThan(-1);
    const body = admin.slice(start, admin.indexOf("\nexport async function", start + 1));
    expect(body).not.toContain('.from("users")');
    expect(body).not.toMatch(/reward_claimed_at:\s*(?!string)[^\s|]/);
    expect(body.match(/payPickEmPoints\(/g)?.length).toBe(1);
  });

  it("only lib/pickemPoints.ts calls pay_pickem_points, and nothing calls the retired Collect RPC", () => {
    const callers = appSources().filter((path) => read(path).includes('"pay_pickem_points"'));
    expect(callers).toEqual(["lib/pickemPoints.ts"]);
    const collectCallers = appSources().filter((path) => read(path).includes("claim_pickem_points"));
    expect(collectCallers).toEqual([]);
  });

  it("settlement pays after grading: a global call always, a player's own call only when it graded a win (7.5.2, F15)", () => {
    const start = pickem.indexOf("export async function settlePendingPickEmPicks");
    const body = pickem.slice(start, pickem.indexOf("\nexport async function", start + 1));
    expect(body.match(/payPickEmPoints\(\{ userId \}\)/g)?.length).toBe(2);
    expect(body).toContain("payout: userId ? null : await payPickEmPoints({ userId })");
    expect(body).toContain("const payout = userId && won === 0 ? null : await payPickEmPoints({ userId });");
  });

  it("the TypeScript point value matches the SQL literal", () => {
    const migration = read("supabase/migrations/20261031182914_pickem_automatic_points.sql");
    expect(migration).toContain("reward_points = 10");
    expect(migration).toContain("(count(*) * 10)::integer");
    expect(read("lib/pickemPoints.ts")).toContain("export const PICKEM_POINTS_PER_CORRECT_PICK = 10;");
  });

  it("the screen has no Collect, cap or bonus left", () => {
    const screen = read("components/pickem/PickEmGameList.tsx");
    expect(screen).not.toContain("claim_points");
    expect(screen).not.toContain("PICKEM_PICK_LIMIT");
    expect(screen).not.toMatch(/Limit Reached|Double Points|Triple Points|multiplier/i);
    expect(screen).not.toContain("PickEmCollectAnimation");
  });

  it("the card rules and tutorial promise no cap, bonus or Collect", () => {
    const card = VENUE_GAME_CARD_BY_KEY.pickem;
    const copy = JSON.stringify({ rules: card.rules, steps: card.steps });
    expect(copy).not.toMatch(/10 picks|double|triple|bonus|2×|3×|300|collect points/i);
    expect(copy).toContain("10 points per correct pick");
  });

  it("NFL Pick 'Em stays a flat 10 per correct pick", () => {
    expect(read("lib/nflPickEm.ts")).toContain("export const PICKEM_REWARD_POINTS = 10;");
  });

  it("nothing in the app offers a Collect / claim call to the picks route", () => {
    for (const path of appSources()) {
      const text = read(path);
      if (!text.includes("/api/pickem/picks")) continue;
      expect(text, path).not.toMatch(/action:\s*["'](claim|claim_points)["']/);
    }
  });
});
