import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Frozen spread lines per bar (docs/cancelled-prizes-pick-windows-away-mode-plan.md B3). One home for
// the rules (lib/pickemFrozenLines.ts); every windowed spread pick records its bar's frozen line before
// it is saved; settlement grades a pending spread pick by its recorded line, else the kickoff lock.
// Behaviour: tests/lib.pickem-college-spreads.test.ts ("frozen lines"), tests/lib.nfl-pickem-game-fetch.test.ts,
// tests/lib.pickem-nfl-scoring-mode.test.ts; SQL: npm run test:pickem-frozen-lines-sql.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

import { lineShownForGame, linesToFreeze, recordedPickLine, type PickEmFrozenLine } from "@/lib/pickemFrozenLines";

const source = (path: string) => readFileSync(path, "utf8");
const between = (text: string, start: string, end: string) => {
  const from = text.indexOf(start);
  expect(from, start).toBeGreaterThan(-1);
  const to = text.indexOf(end, from + start.length);
  return text.slice(from, to === -1 ? undefined : to);
};
const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

describe("the freeze rule (pure)", () => {
  const window = { openDay: "thu", openTime: "00:00", closeDay: "sat", closeTime: "23:59" } as const;
  const THURSDAY_NOON = Date.parse("2026-10-29T16:00:00.000Z");
  const games = [
    { id: "sat", startsAt: "2026-10-31T19:00:00.000Z" },
    { id: "started", startsAt: "2026-10-29T15:00:00.000Z" },
    { id: "next-week", startsAt: "2026-11-07T19:00:00.000Z" },
    { id: "no-line", startsAt: "2026-10-31T20:00:00.000Z" },
    { id: "frozen", startsAt: "2026-10-31T21:00:00.000Z" },
  ];
  const line = { homeSpread: -3.5, awaySpread: 3.5, sourceVendor: "fanduel" };
  const globalLines = new Map(["sat", "started", "next-week", "frozen"].map((id) => [id, line]));
  const frozen = new Map<string, PickEmFrozenLine>([
    ["frozen", { venueId: "v", sportKey: "k", gameId: "frozen", startsAt: games[4].startsAt, homeSpread: -1, awaySpread: 1, sourceVendor: "x", frozenAt: "" }],
  ]);

  it("freezes only a game not started, inside its open window, with a line, not frozen yet", () => {
    const fresh = linesToFreeze({ window, games, globalLines, frozen, nowMs: THURSDAY_NOON, timeZone: "America/New_York" });
    expect(fresh).toEqual([{ gameId: "sat", startsAt: games[0].startsAt, ...line }]);
  });

  it("freezes nothing while the window is shut", () => {
    const friday = { openDay: "fri", openTime: "18:00", closeDay: "sat", closeTime: "23:59" } as const;
    expect(linesToFreeze({ window: friday, games, globalLines, frozen, nowMs: THURSDAY_NOON, timeZone: "America/New_York" })).toEqual([]);
  });

  it("a recorded line is read only from a pending pick with both spreads", () => {
    expect(recordedPickLine({ status: "pending", home_spread: "-3.5", away_spread: 3.5 })).toEqual({ homeSpread: -3.5, awaySpread: 3.5 });
    expect(recordedPickLine({ status: "pending", home_spread: null, away_spread: null })).toBeNull();
    expect(recordedPickLine({ status: "pending", home_spread: -3.5, away_spread: null })).toBeNull();
    expect(recordedPickLine({ status: "won", home_spread: -3.5, away_spread: 3.5 })).toBeNull();
  });
});

describe("the line a list shows (pure, away-mode plan R2)", () => {
  const frozen = { homeSpread: -3.5, awaySpread: 3.5 };
  const global = { homeSpread: -6.5, awaySpread: 6.5 };
  const pick = (status: string, home: number | string | null, away: number | string | null) => ({
    status,
    home_spread: home,
    away_spread: away,
  });

  it("a pending pick with no recorded line shows the global line (what settlement grades it by)", () => {
    expect(lineShownForGame({ pick: pick("pending", null, null), frozen, global })).toEqual(global);
    expect(lineShownForGame({ pick: pick("pending", null, null), frozen, global: null })).toBeNull();
  });

  it("a pick with a line on its row shows it, pending or graded", () => {
    expect(lineShownForGame({ pick: pick("pending", "-3.5", "3.5"), frozen: null, global })).toEqual(frozen);
    expect(lineShownForGame({ pick: pick("won", -10, 10), frozen, global })).toEqual({ homeSpread: -10, awaySpread: 10 });
  });

  it("no pick shows the frozen line, else the global line", () => {
    expect(lineShownForGame({ pick: null, frozen, global })).toEqual(frozen);
    expect(lineShownForGame({ pick: undefined, frozen: undefined, global })).toEqual(global);
    expect(lineShownForGame({ pick: null, frozen: null, global: null })).toBeNull();
  });
});

describe("where frozen lines may be written and used", () => {
  it("both games lists choose the line shown only through lineShownForGame (R2)", () => {
    const college = between(source("lib/pickem.ts"), "async function applyCollegeFootballLines", "\nexport ");
    expect(college).toContain("lineShownForGame({ pick, frozen: frozen.get(game.id), global: lines.get(game.id) })");
    expect(college).not.toContain("recordedPickLine(");
    expect(college).not.toMatch(/frozen\.get\([^)]*\)\s*\?\?/);
    const nfl = between(source("lib/nflPickEm.ts"), "export async function listNFLPickEmGames", "// USER SUMMARIES");
    expect(nfl.match(/lineShownForGame\(/g)).toHaveLength(2);
    expect(nfl).not.toContain("recordedPickLine(");
    expect(nfl).not.toMatch(/frozenLines\.get\([^)]*\)\s*\?\?/);
  });

  it("only lib/pickemFrozenLines.ts calls the freeze RPC or names the table", () => {
    const offenders = [...filesUnder("lib"), ...filesUnder("app"), ...filesUnder("components")].filter((path) => {
      if (path === join("lib", "pickemFrozenLines.ts")) return false;
      const text = source(path);
      return text.includes("freeze_pickem_venue_lines") || text.includes("pickem_venue_frozen_lines");
    });
    expect(offenders).toEqual([]);
  });

  it("a NEW college spread pick at a windowed bar freezes before it saves, and only the insert saves the line (R8)", () => {
    const pickem = source("lib/pickem.ts");
    const resolve = between(pickem, "async function resolvePickScoringMode", "export async function clearPickEmPick");
    expect(resolve).toContain("if (params.existing || !params.settings?.pickWindows?.[params.game.sportSlug])");
    expect(resolve).toContain("frozenLineForPick(");
    expect(resolve).toContain("throw new Error(PICKEM_FROZEN_LINE_FAILED_MESSAGE)");
    const submit = between(pickem, "export async function submitPickEmPick", "async function resolvePickScoringMode");
    expect(submit.indexOf("resolvePickScoringMode(")).toBeLessThan(submit.indexOf(".insert("));
    expect(submit.match(/\.\.\.lineColumns,/g)).toHaveLength(1);
    expect(submit.indexOf("...lineColumns,")).toBeGreaterThan(submit.indexOf(".insert("));
  });

  it("a NEW NFL pick at a windowed spread venue freezes before it saves, and only the insert saves the line (R8)", () => {
    const nfl = source("lib/nflPickEm.ts");
    const submit = between(nfl, "export async function submitNFLPickEmPick", "const nflFrozenLineColumnsForPick");
    expect(submit.indexOf("nflFrozenLineColumnsForPick(")).toBeGreaterThan(submit.indexOf("assertPickEmPickWindowOpen("));
    // After the existing-pick read and its side-switch update: one RPC per new pick, none per switch.
    expect(submit.indexOf("nflFrozenLineColumnsForPick(")).toBeGreaterThan(submit.indexOf(".update("));
    expect(submit.indexOf("nflFrozenLineColumnsForPick(")).toBeLessThan(submit.indexOf(".insert("));
    expect(submit.match(/\.\.\.lineColumns,/g)).toHaveLength(1);
    const helper = between(nfl, "const nflFrozenLineColumnsForPick", "\n};\n");
    expect(helper).toContain('params.settings && (params.settings.nflPickEmScoringMode !== "spread" || !params.settings.pickWindows?.nfl)');
    // A failed settings read only looks the stored frozen line up (globalLine null = read-only).
    expect(helper).toContain("params.settings ? await getNFLPickEmGameLine(params.game.id) : null");
    expect(helper).toContain("throw new Error(PICKEM_FROZEN_LINE_FAILED_MESSAGE)");
    // The week list shows a pick's line through lineShownForGame (R2, asserted above).
  });

  it("no pick update writes line columns: a pick's line is set when it is made (R8)", () => {
    for (const [path, start, end] of [
      ["lib/pickem.ts", "export async function submitPickEmPick", "async function resolvePickScoringMode"],
      ["lib/nflPickEm.ts", "export async function submitNFLPickEmPick", "const nflFrozenLineColumnsForPick"],
    ] as const) {
      const submit = between(source(path), start, end);
      const update = submit.slice(submit.indexOf(".update("), submit.indexOf(".eq(\"id\", existing.id)"));
      expect(update.length).toBeGreaterThan(0);
      expect(update).not.toContain("lineColumns");
      expect(update).not.toMatch(/home_spread|away_spread|frozenLinePickColumns/);
    }
  });

  it("settlement grades a spread pick by its recorded line first (college and NFL), else the kickoff lock", () => {
    const settle = between(source("lib/pickem.ts"), "export async function settlePendingPickEmPicks", "\nexport ");
    expect(settle).toContain("const recordedLine = recordedPickLine(row);");
    expect(settle).toMatch(/collegeScoringMode === "spread" && homeScore !== null && awayScore !== null && recordedLine\)/);
    expect(settle).toContain("recordedLine ?? (await getLockedNFLLine(row.game_id))");
    // Picks with a recorded line never ask the global lock.
    expect(settle).toContain('row.scoring_mode === "spread" && !recordedPickLine(row)');
  });
});
