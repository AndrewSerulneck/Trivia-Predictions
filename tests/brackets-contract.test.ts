import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Squares + Brackets plan Phase 7: the bracket engine's standing rules — one writer per RPC, the
// SQL mirrors of the TypeScript numbers, the zero-I/O gate, flag-off 404s, admin input parsing, and
// no player id in a player response.

type Row = Record<string, unknown>;
const canned: Record<string, Row[]> = {};
class CannedQuery {
  private mode: "many" | "maybe" = "many";
  constructor(private table: string) {}
  select() { return this; }
  eq() { return this; }
  is() { return this; }
  in() { return this; }
  gt() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then<T>(resolve: (value: { data: unknown; error: null }) => T): Promise<T> {
    const rows = canned[this.table] ?? [];
    return Promise.resolve(resolve({ data: this.mode === "many" ? rows : (rows[0] ?? null), error: null }));
  }
}
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => new CannedQuery(t), rpc: vi.fn() } }));

import { BRACKET_TIEBREAKER_MAX } from "@/lib/brackets/picks";
import { bracketMaxScore } from "@/lib/brackets/scoring";
import { BRACKET_ROUND_POINTS } from "@/lib/seasonalPoints";
import { bracketsSyncMode } from "@/lib/bracketsSync";
import { kindHasStarted, parseBracketsAdminAction } from "@/lib/bracketsAdmin";
import { emptyBracketGame } from "@/lib/brackets/games";
import { getBracketStandings, getBracketsView, parseBracketPicks } from "@/lib/bracketsEntries";

const ROOT = path.join(__dirname, "..");
const MIGRATION = readFileSync(path.join(ROOT, "supabase/migrations/20261019203858_brackets_engine.sql"), "utf8");

const sourceFiles = (dir: string): string[] =>
  readdirSync(path.join(ROOT, dir)).flatMap((name) => {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(ts|tsx)$/.test(name) ? [rel] : [];
  });
const ALL = ["app", "components", "lib"].flatMap(sourceFiles);
const filesContaining = (needle: string | RegExp): string[] =>
  ALL.filter((file) => {
    const text = readFileSync(path.join(ROOT, file), "utf8");
    return typeof needle === "string" ? text.includes(needle) : needle.test(text);
  }).sort();

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of Object.keys(canned)) delete canned[key];
});

describe("one writer each", () => {
  it("bracket_save_entry is called only by lib/bracketsEntries.ts", () => {
    expect(filesContaining('"bracket_save_entry"')).toEqual(["lib/bracketsEntries.ts"]);
  });

  it("bracket_record_results is called only by lib/bracketsStore.ts, from the sync and the admin", () => {
    expect(filesContaining('"bracket_record_results"')).toEqual(["lib/bracketsStore.ts"]);
    expect(filesContaining(/recordBracketResults\(/)).toEqual(["lib/bracketsAdmin.ts", "lib/bracketsStore.ts", "lib/bracketsSync.ts"]);
  });

  it("bracket venue points are paid only by the sync, through creditSeasonalPoints", () => {
    expect(filesContaining('creditSeasonalPoints("bracket"')).toEqual(["lib/bracketsSync.ts"]);
  });

  it("entries are never written with a plain insert/update from the app", () => {
    expect(filesContaining(/from\("bracket_entries"\)\s*\.(insert|update|upsert|delete)/)).toEqual([]);
  });

  it("the cron checks the pure gate before running the tick", () => {
    const cron = readFileSync(path.join(ROOT, "app/api/cron/pickem-settle/route.ts"), "utf8");
    expect(cron).toMatch(/isBracketsSyncActive\(new Date\(\)\) \? await runBracketsTick\(\) : null/);
  });

  it("the rehearsal switch has one reader", () => {
    expect(filesContaining("process.env.BRACKETS_REHEARSAL_ENABLED")).toEqual(["lib/seasonalGames.ts"]);
  });
});

describe("SQL mirrors", () => {
  it("scores 10 · 2^(round − 1) per correct pick, like BRACKET_ROUND_POINTS", () => {
    expect(BRACKET_ROUND_POINTS).toEqual([1, 2, 3, 4, 5, 6].map((r) => 10 * 2 ** (r - 1)));
    expect(MIGRATION).toContain("p_round_correct[r] * 10 * (1 << (r - 1))");
    expect(MIGRATION).toContain(`score between 0 and ${bracketMaxScore("main")}`);
  });

  it("caps the tiebreaker the same way", () => {
    expect(MIGRATION).toContain(`tiebreaker between 0 and ${BRACKET_TIEBREAKER_MAX}`);
    expect(MIGRATION).toContain(`p_tiebreaker > ${BRACKET_TIEBREAKER_MAX}`);
  });

  it("builds credit keys like bracketCreditKey (entry:r<round>:<grade>) and venue points as bracket points ÷ 10", () => {
    expect(MIGRATION).toContain(`v_rec.id::text || ':r' || v_round || ':' || v_grade`);
    expect(MIGRATION).toContain("coalesce(v_rec.correct, 0) * (1 << (v_round - 1))");
  });

  it("cascades entries with the player (no delete_player_account change needed)", () => {
    expect(MIGRATION).toContain("user_id uuid not null references public.users(id) on delete cascade");
  });
});

describe("gate (zero I/O unless on)", () => {
  it("is off with the flag off and no rehearsal switch, even mid-tournament", () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    vi.stubEnv("BRACKETS_REHEARSAL_ENABLED", "");
    expect(bracketsSyncMode(new Date("2027-03-20T18:00:00Z"))).toBeNull();
  });

  it("runs live only inside Mar 14 – Apr 6 (Eastern) with the flag on", () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "true");
    vi.stubEnv("BRACKETS_REHEARSAL_ENABLED", "");
    expect(bracketsSyncMode(new Date("2027-03-14T05:00:00Z"))).toEqual({ live: true, rehearsal: false }); // 1 AM Mar 14 ET
    expect(bracketsSyncMode(new Date("2027-03-14T03:59:00Z"))).toBeNull(); // still Mar 13 ET
    expect(bracketsSyncMode(new Date("2027-04-07T04:00:00Z"))).toBeNull(); // Apr 7 ET
  });

  it("runs rehearsals on the switch alone", () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    vi.stubEnv("BRACKETS_REHEARSAL_ENABLED", "true");
    expect(bracketsSyncMode(new Date("2026-12-01T12:00:00Z"))).toEqual({ live: false, rehearsal: true });
  });
});

describe("player routes", () => {
  it("404 while NEXT_PUBLIC_BRACKETS_ENABLED is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRACKETS_ENABLED", "");
    const state = await import("@/app/api/bracket/state/route");
    const entry = await import("@/app/api/bracket/entry/route");
    const copy = await import("@/app/api/bracket/copy/route");
    const standings = await import("@/app/api/bracket/standings/route");
    const get = (url: string) => new Request(`http://x${url}`);
    const post = (url: string) => new Request(`http://x${url}`, { method: "POST", body: "{}" });
    expect((await state.GET(get("/api/bracket/state?venueId=v1"))).status).toBe(404);
    expect((await entry.POST(post("/api/bracket/entry"))).status).toBe(404);
    expect((await copy.POST(post("/api/bracket/copy"))).status).toBe(404);
    expect((await standings.GET(get("/api/bracket/standings?venueId=v1"))).status).toBe(404);
  });

  it("parses picks strictly: 63 seats or nulls", () => {
    expect(parseBracketPicks(Array.from({ length: 63 }, () => null))).toHaveLength(63);
    expect(parseBracketPicks(Array.from({ length: 62 }, () => null))).toBeNull();
    expect(parseBracketPicks([...Array.from({ length: 62 }, () => null), 64])).toBeNull();
    expect(parseBracketPicks([...Array.from({ length: 62 }, () => null), "1"])).toBeNull();
  });

  it("never sends a player id: standings and the bracket view carry usernames and 'mine' only", async () => {
    const PLAYER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const T = "cccccccc-cccc-cccc-cccc-cccccccccccc";
    const seats = Array.from({ length: 63 }, () => null);
    canned.bracket_tournaments = [{
      id: T, gender: "men", season: 2026, purpose: "live", clock_offset_seconds: 0, region_names: null, winner_seats: seats,
      championship_total: null, main_lock_at: "2027-03-18T16:00:00Z", main_lock_set_by: "auto", second_lock_at: null,
      second_lock_set_by: "auto", feed_checked_at: null, next_sync_at: null, completed_at: null, archived_at: null,
      created_by: "auto", created_at: "2027-03-14T22:00:00Z",
    }];
    canned.bracket_games = [];
    canned.users = [{ id: PLAYER, account_id: "acct-1", venue_id: "v1" }];
    canned.bracket_entries = [
      { id: "e1", tournament_id: T, kind: "main", venue_id: "v1", user_id: PLAYER, picks: seats, tiebreaker: 140, pick_count: 0, score: 0, submitted_at: "2027-03-15T00:00:00Z", users: { username: "ann" }, venues: { name: "One" } },
      { id: "e2", tournament_id: T, kind: "main", venue_id: "v1", user_id: OTHER, picks: seats, tiebreaker: 150, pick_count: 3, score: 0, submitted_at: "2027-03-15T01:00:00Z", users: { username: "bob" }, venues: { name: "One" } },
    ];
    const standings = await getBracketStandings({ tournamentId: T, kind: "main", venueId: "v1", userId: PLAYER });
    const view = await getBracketsView({ venueId: "v1", userId: PLAYER, nowMs: Date.parse("2027-03-15T12:00:00Z") });
    const text = JSON.stringify([standings, view]);
    expect(text).not.toContain(PLAYER);
    expect(text).not.toContain(OTHER);
    expect(text).not.toMatch(/user_?id/i);
    expect(standings.ok && standings.standings.map((s) => [s.username, s.mine])).toEqual([["ann", true], ["bob", false]]);
  });
});

describe("admin actions", () => {
  const T = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  it("accepts the fix-ups with what they need", () => {
    expect(parseBracketsAdminAction({ action: "create", gender: "men", season: 2025, purpose: "rehearsal", asOf: "2026-03-15T12:00:00Z" })).toMatchObject({ purpose: "rehearsal" });
    expect(parseBracketsAdminAction({ action: "override_result", tournamentId: T, round: 2, location: 3, winner: "away", reason: "feed wrong" })).toMatchObject({ winner: "away" });
    expect(parseBracketsAdminAction({ action: "link_opener", tournamentId: T, location: 2, seat: 41 })).toMatchObject({ seat: 41 });
    expect(parseBracketsAdminAction({ action: "set_region_names", tournamentId: T, names: ["East", "", "South", "West"] })).toMatchObject({ names: ["East", null, "South", "West"] });
    expect(parseBracketsAdminAction({ action: "move_lock", tournamentId: T, kind: "second", lockAt: null })).toMatchObject({ lockAt: null });
  });

  it("freezes a lock once its first games tip, not only once they are decided", () => {
    const tip = "2027-03-18T16:15:00Z";
    const games = [{ ...emptyBracketGame(1, 1), tipAt: tip }, { ...emptyBracketGame(3, 1), tipAt: "2027-03-25T23:00:00Z" }];
    const none = Array.from({ length: 63 }, () => null);
    expect(kindHasStarted("main", games, none, Date.parse(tip) - 60_000)).toBe(false);
    expect(kindHasStarted("main", games, none, Date.parse(tip))).toBe(true);
    expect(kindHasStarted("second", games, none, Date.parse(tip))).toBe(false);
  });

  it("refuses what is missing or wrong", () => {
    expect(parseBracketsAdminAction({ action: "create", gender: "men", season: 2025, purpose: "rehearsal" })).toHaveProperty("error");
    expect(parseBracketsAdminAction({ action: "create", gender: "men", season: 2026, purpose: "live", asOf: "2026-03-15T12:00:00Z" })).toHaveProperty("error");
    expect(parseBracketsAdminAction({ action: "override_result", tournamentId: T, round: 2, location: 3, winner: "away", reason: "" })).toHaveProperty("error");
    expect(parseBracketsAdminAction({ action: "override_result", tournamentId: T, round: 6, location: 2, winner: "home", reason: "feed wrong" })).toHaveProperty("error");
    expect(parseBracketsAdminAction({ action: "set_seat_team", tournamentId: T, slot: 40, side: "home", teamId: 1 })).toHaveProperty("error");
    expect(parseBracketsAdminAction({ action: "sync" })).toHaveProperty("error");
  });
});
