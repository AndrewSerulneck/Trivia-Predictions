import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: null }));

import { SQUARES_PER_PLAYER_CAP, isSquaresServerLive } from "@/lib/seasonalGames";
import {
  SQUARES_CONFIRMATION_MS,
  SQUARES_MOMENTS,
  findSuperBowl,
  gradedMomentMismatches,
  isDigitPermutation,
  isSquaresReopenWatchOn,
  isStaleSquaresEvent,
  lockAtFor,
  planMomentStep,
  quartersFinishedFromStatus,
  squaresAxes,
  squaresCreditKey,
  squaresEventPurposeFor,
  squaresMomentEvidence,
  winningCell,
  type MomentObservation,
  type NflFeedGame,
  type SquaresMoment,
  type SquaresSide,
} from "@/lib/squares";
import { parseSquaresAdminAction, squaresArchiveRefusal, squaresSetGameRefusal } from "@/lib/squaresAdmin";
import {
  drawDigitPermutation,
  isSquaresSettlementActive,
  runSquaresTick,
  squaresSeason,
  squaresSettlementMode,
} from "@/lib/squaresSettlement";
import { squaresClaimMessage } from "@/lib/squaresView";

// Squares + Brackets plan (docs/squares-and-brackets-plan.md) Phase 2: the Super Bowl Squares engine.
// SQL behaviour is proven on PGlite by `npm run test:squares-sql`; this file pins the pure rules,
// the fixture replays, the SQL ↔ TypeScript mirrors and the "one writer" contracts.

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), "utf8");
const FIXTURES = path.join(ROOT, "tests/fixtures/squares");
const postseason = JSON.parse(readFileSync(path.join(FIXTURES, "nfl-postseason-2025.json"), "utf8")) as NflFeedGame[];
const superBowl = postseason.find((game) => game.id === 1341307) as NflFeedGame;
const migrationSql = (): string => {
  const name = readdirSync(path.join(ROOT, "supabase/migrations")).find((file) => file.endsWith("_squares_engine.sql"));
  expect(name).toBeDefined();
  return read(`supabase/migrations/${name}`);
};

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
};
const APP_SOURCES = ["app", "components", "lib"].flatMap(sourceFiles);
const filesContaining = (needle: string | RegExp): string[] =>
  APP_SOURCES.filter((rel) => (typeof needle === "string" ? read(rel).includes(needle) : needle.test(read(rel))));

const scoreOf = (game: NflFeedGame, colSide: SquaresSide, moment: SquaresMoment) => {
  const proof = squaresMomentEvidence(game, colSide).find((item) => item.moment === moment);
  return proof?.state === "over" ? proof.score : proof?.state;
};

/** A live record: quarters given are filled, the rest null. */
const live = (overrides: Partial<NflFeedGame>): NflFeedGame => ({
  ...superBowl,
  status: "1st Quarter",
  status_state: "in",
  home_team_q1: null,
  home_team_q2: null,
  home_team_q3: null,
  home_team_q4: null,
  home_team_ot: null,
  visitor_team_q1: null,
  visitor_team_q2: null,
  visitor_team_q3: null,
  visitor_team_q4: null,
  visitor_team_ot: null,
  home_team_score: 0,
  visitor_team_score: 0,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("grid math", () => {
  it("finds the winning cell from the last digits (row * 10 + col)", () => {
    const col = [3, 1, 4, 0, 5, 9, 2, 6, 8, 7];
    const row = [2, 7, 1, 8, 0, 9, 5, 3, 6, 4];
    expect(winningCell(col, row, 0, 0)).toBe(43);
    expect(winningCell(col, row, 17, 23)).toBe(79);
    expect(winningCell(col, row, 10, 10)).toBe(43);
  });

  it("checks digit permutations and draws real ones", () => {
    expect(isDigitPermutation([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(true);
    expect(isDigitPermutation([0, 1, 2, 3, 4, 5, 6, 7, 8, 8])).toBe(false);
    expect(isDigitPermutation([0, 1, 2])).toBe(false);
    for (let i = 0; i < 50; i += 1) expect(isDigitPermutation(drawDigitPermutation())).toBe(true);
  });

  it("locks 30 minutes before kickoff, or at an admin's earlier time, never after kickoff", () => {
    const kickoff = Date.parse("2027-02-14T23:30:00Z");
    expect(new Date(lockAtFor(kickoff)).toISOString()).toBe("2027-02-14T23:00:00.000Z");
    expect(lockAtFor(kickoff, kickoff - 3_600_000)).toBe(kickoff - 3_600_000);
    expect(lockAtFor(kickoff, kickoff + 60_000)).toBe(kickoff);
  });
});

describe("the Super Bowl in the feed", () => {
  it("is the one inter-conference postseason game", () => {
    expect(findSuperBowl(postseason)?.id).toBe(1341307);
    expect(findSuperBowl(postseason.filter((game) => game.id !== 1341307))).toBeNull();
  });

  it("puts the AFC team on the columns whichever side is home", () => {
    const axes = squaresAxes(superBowl);
    expect(axes?.colSide).toBe("home"); // Feb 2026: NE (AFC) was home
    expect(axes?.colTeam.abbreviation).toBe("NE");
    expect(axes?.rowTeam.abbreviation).toBe("SEA");
    const swapped = { ...superBowl, home_team: superBowl.visitor_team, visitor_team: superBowl.home_team };
    expect(squaresAxes(swapped)?.colSide).toBe("visitor");
    expect(squaresAxes(swapped)?.colTeam.abbreviation).toBe("NE");
  });

  it("uses the visitor as columns for a same-conference rehearsal game", () => {
    const sameConference = postseason.find(
      (game) => game.home_team?.conference === game.visitor_team?.conference,
    ) as NflFeedGame;
    expect(squaresAxes(sameConference)?.colSide).toBe("visitor");
  });

  it("derives the season the card window covers", () => {
    expect(squaresSeason()).toBe(2026);
  });
});

describe("moment evidence on finished records (Phase 0 fixture)", () => {
  it("scores Super Bowl LX: null quarters are 0 once the game is final", () => {
    // NE (columns) q1–q3 null, q4 13; SEA (rows) 3/6/3/17.
    expect(scoreOf(superBowl, "home", "q1")).toEqual({ col: 0, row: 3 });
    expect(scoreOf(superBowl, "home", "half")).toEqual({ col: 0, row: 9 });
    expect(scoreOf(superBowl, "home", "q3")).toEqual({ col: 0, row: 12 });
    expect(scoreOf(superBowl, "home", "final")).toEqual({ col: 13, row: 29 });
  });

  it("proves every moment of every finished postseason game, overtime counting toward the final", () => {
    for (const game of postseason) {
      const evidence = squaresMomentEvidence(game, "home");
      expect(evidence.every((item) => item.state === "over"), `game ${game.id}`).toBe(true);
      const final = evidence.find((item) => item.moment === "final");
      expect(final?.state === "over" && final.score).toEqual({ col: game.home_team_score, row: game.visitor_team_score });
    }
    const overtime = postseason.filter((game) => (game.home_team_ot ?? 0) + (game.visitor_team_ot ?? 0) > 0);
    expect(overtime.length).toBeGreaterThan(0);
    for (const game of overtime) {
      const q4 = (side: "home" | "visitor") =>
        [1, 2, 3, 4].reduce((sum, q) => sum + (Number(game[`${side}_team_q${q}` as keyof NflFeedGame]) || 0), 0);
      // Regulation ends level; the final moment is the OT-inclusive total.
      expect(q4("home")).toBe(q4("visitor"));
      expect(scoreOf(game, "home", "final")).toEqual({ col: game.home_team_score, row: game.visitor_team_score });
      expect(game.home_team_score).not.toBe(game.visitor_team_score);
    }
  });
});

describe("moment evidence while live: positive evidence only", () => {
  it("proves nothing from pre-filled zeros or a down-and-distance status", () => {
    const zeros = live({
      status: "1st Quarter",
      home_team_q1: 0, home_team_q2: 0, home_team_q3: 0, home_team_q4: 0,
      visitor_team_q1: 0, visitor_team_q2: 0, visitor_team_q3: 0, visitor_team_q4: 0,
    });
    expect(squaresMomentEvidence(zeros, "home").map((item) => item.state)).toEqual(["not_over", "not_over", "not_over", "not_over"]);
    expect(quartersFinishedFromStatus("3rd & 5 at SF 25")).toBe(0);
    expect(quartersFinishedFromStatus("1st & 10")).toBe(0);
    expect(quartersFinishedFromStatus("10/19 - 8:15 PM EDT")).toBe(0);
  });

  it("reads quarter breaks from the status text", () => {
    expect(quartersFinishedFromStatus("End of 1st Quarter")).toBe(1);
    expect(quartersFinishedFromStatus("2nd Quarter")).toBe(1);
    expect(quartersFinishedFromStatus("Q2 10:31")).toBe(1);
    expect(quartersFinishedFromStatus("Halftime")).toBe(2);
    expect(quartersFinishedFromStatus("3rd Qtr")).toBe(2);
    expect(quartersFinishedFromStatus("End of 3rd")).toBe(3);
    expect(quartersFinishedFromStatus("4th Quarter")).toBe(3);
    expect(quartersFinishedFromStatus("OT 10:00")).toBe(4);
    expect(quartersFinishedFromStatus("Final/OT")).toBe(4);
  });

  it("reads the live feed's '<clock> - <quarter>' status (WSH @ SF capture, 2026-10-19)", () => {
    expect(quartersFinishedFromStatus("15:00 - 1st")).toBe(0);
    expect(quartersFinishedFromStatus("0:13 - 1st")).toBe(0);
    expect(quartersFinishedFromStatus("14:25 - 2nd")).toBe(1);
    expect(quartersFinishedFromStatus("5:56 - 3rd")).toBe(2);
    expect(quartersFinishedFromStatus("14:05 - 4th")).toBe(3);
    expect(quartersFinishedFromStatus("0:06 - 4th")).toBe(3);
    expect(quartersFinishedFromStatus("3rd & 5 - 2nd")).toBe(0);
  });

  it("treats points in a later quarter as proof the earlier one is over", () => {
    const game = live({ status: "In Progress", home_team_q1: 7, home_team_q2: 3, home_team_score: 10, visitor_team_q1: 0, visitor_team_score: 0 });
    expect(scoreOf(game, "home", "q1")).toEqual({ col: 7, row: 0 });
    expect(scoreOf(game, "home", "half")).toBe("not_over");
  });

  it("waits while the quarter breakdown doesn't add up to the score", () => {
    const lagging = live({ status: "Halftime", home_team_q1: 7, home_team_score: 14, visitor_team_score: 3, visitor_team_q1: 3 });
    expect(scoreOf(lagging, "home", "q1")).toBe("unproven");
    expect(scoreOf(lagging, "home", "half")).toBe("unproven");
    const caughtUp = { ...lagging, home_team_q2: 7 };
    expect(scoreOf(caughtUp, "home", "half")).toEqual({ col: 14, row: 3 });
  });

  it("never grades the final before the game is final", () => {
    expect(scoreOf(live({ status: "4th Quarter", home_team_score: 0, visitor_team_score: 0 }), "home", "final")).toBe("not_over");
  });
});

describe("the 60-second hold", () => {
  const over = { moment: "q1" as const, state: "over" as const, score: { col: 7, row: 3 } };

  it("observes, holds, then grades the same score", () => {
    const t0 = 1_000_000;
    const first = planMomentStep(over, null, t0);
    expect(first).toEqual({ action: "observe", observation: { col: 7, row: 3, atMs: t0 } });
    const seen: MomentObservation = { col: 7, row: 3, atMs: t0 };
    expect(planMomentStep(over, seen, t0 + SQUARES_CONFIRMATION_MS - 1)).toEqual({ action: "none" });
    expect(planMomentStep(over, seen, t0 + SQUARES_CONFIRMATION_MS)).toEqual({ action: "grade", score: { col: 7, row: 3 } });
  });

  it("restarts on a changed score and clears when the evidence disappears", () => {
    const seen: MomentObservation = { col: 7, row: 0, atMs: 0 };
    expect(planMomentStep(over, seen, 999_999)).toMatchObject({ action: "observe" });
    expect(planMomentStep({ moment: "q1", state: "not_over" }, seen, 999_999)).toEqual({ action: "clear" });
    expect(planMomentStep({ moment: "q1", state: "not_over" }, null, 999_999)).toEqual({ action: "none" });
  });
});

describe("post-final cross-check", () => {
  it("reports a graded quarter the final record disagrees with", () => {
    const graded = [
      { moment: "q1" as const, col: 0, row: 3 },
      { moment: "half" as const, col: 7, row: 9 },
    ];
    const mismatches = gradedMomentMismatches(superBowl, "home", graded);
    expect(mismatches).toEqual([{ moment: "half", graded: { col: 7, row: 9 }, final: { col: 0, row: 9 } }]);
  });
});

// Phase 0's live capture (scripts/capture-nfl-live-game.cjs) — present once a game has been
// watched. Replays it a minute at a time through the real rule: every moment it would have graded
// must match what the finished record says. Nothing to check until a capture exists.
type CaptureSnapshot = { firstSeen: string; lastSeen: string; game: NflFeedGame };

/** Replays a capture minute by minute through the live rule; returns each graded score + the status it was graded on. */
const replayCapture = (snapshots: CaptureSnapshot[], colSide: SquaresSide) => {
  const observed = new Map<SquaresMoment, MomentObservation>();
  const graded = new Map<SquaresMoment, { score: { col: number; row: number }; status: string }>();
  for (const snap of snapshots) {
    for (let t = Date.parse(snap.firstSeen); t <= Date.parse(snap.lastSeen); t += 60_000) {
      for (const proof of squaresMomentEvidence(snap.game, colSide)) {
        if (graded.has(proof.moment)) continue;
        const step = planMomentStep(proof, observed.get(proof.moment) ?? null, t);
        if (step.action === "observe") observed.set(proof.moment, step.observation);
        if (step.action === "clear") observed.delete(proof.moment);
        if (step.action === "grade") graded.set(proof.moment, { score: step.score, status: String(snap.game.status) });
      }
    }
  }
  return graded;
};

describe("live capture replay", () => {
  const captures = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((name) => /^nfl-live-capture-\d+\.json$/.test(name)) : [];
  it.each(captures.length ? captures : ["(none yet)"])("never grades a wrong score: %s", (name) => {
    if (name === "(none yet)") return;
    const capture = JSON.parse(readFileSync(path.join(FIXTURES, name), "utf8")) as { snapshots: CaptureSnapshot[] };
    const finalSnapshot = [...capture.snapshots].reverse().find((snap) => snap.game.status_state === "final");
    if (!finalSnapshot) return; // still in progress
    const axes = squaresAxes(finalSnapshot.game);
    expect(axes).not.toBeNull();
    const colSide = axes!.colSide;
    const truth = new Map(squaresMomentEvidence(finalSnapshot.game, colSide).map((item) => [item.moment, item]));
    const graded = replayCapture(capture.snapshots, colSide);
    for (const moment of SQUARES_MOMENTS) {
      const proof = truth.get(moment);
      expect(proof?.state, `${name} ${moment} provable from the final`).toBe("over");
      expect(graded.get(moment)?.score, `${name} ${moment}`).toEqual(proof?.state === "over" ? proof.score : undefined);
    }
  });

  // Plan 6.5: before the "<clock> - <quarter>" status was read, Q1 waited for points in the 2nd and Q3
  // for points in the 4th (up to an hour late). Each quarter is now graded during the next one.
  it("grades each quarter during the next one (WSH @ SF, 1392308)", () => {
    const capture = JSON.parse(readFileSync(path.join(FIXTURES, "nfl-live-capture-1392308.json"), "utf8")) as {
      snapshots: CaptureSnapshot[];
    };
    const final = [...capture.snapshots].reverse().find((snap) => snap.game.status_state === "final")!;
    const graded = replayCapture(capture.snapshots, squaresAxes(final.game)!.colSide);
    expect(graded.get("q1")?.status).toMatch(/ - 2nd$/);
    expect(graded.get("half")?.status).toMatch(/ - 3rd$/);
    expect(graded.get("q3")?.status).toMatch(/ - 4th$/);
    expect(graded.get("final")?.status).toBe("Final");
  });
});

describe("SQL mirrors", () => {
  it("pins the claim cap to SQUARES_PER_PLAYER_CAP", () => {
    expect(migrationSql()).toContain(`v_cap constant integer := ${SQUARES_PER_PLAYER_CAP};`);
  });

  it("builds credit keys the same way in SQL and TypeScript", () => {
    expect(migrationSql()).toContain(`b.id::text || ':' || p_moment || ':' || v_moment.grade_no`);
    expect(squaresCreditKey("board", "half", 2)).toBe("board:half:2");
  });

  it("lists the same moments", () => {
    const sql = migrationSql();
    const list = SQUARES_MOMENTS.map((moment) => `'${moment}'`).join(", ");
    expect(sql).toContain(`moment in (${list})`);
  });

  it("grants service_role on every new table and keeps the RPCs server-only", () => {
    const sql = migrationSql();
    for (const table of ["squares_events", "squares_event_moments", "squares_boards", "squares_claims", "squares_results", "squares_admin_log"]) {
      expect(sql).toContain(`grant select, insert, update, delete on table public.${table} to service_role;`);
      expect(sql).toContain(`alter table public.${table} force row level security;`);
    }
    for (const fn of ["squares_claim", "squares_draw", "squares_grade_moment", "squares_void_moment", "reverse_seasonal_points"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`));
    }
  });

  it("references users only with ON DELETE CASCADE (no delete_player_account change needed)", () => {
    const refs = migrationSql().match(/references public\.users\(id\)[^,\n]*/g) ?? [];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ref).toContain("on delete cascade");
  });
});

describe("one writer each", () => {
  it("claims go only through squares_claim, from lib/squaresBoard.ts", () => {
    expect(filesContaining('"squares_claim"')).toEqual(["lib/squaresBoard.ts"]);
    expect(filesContaining(/from\("squares_claims"\)\s*\.(insert|update|upsert|delete)/)).toEqual([]);
  });

  it("grading and the draw are only in the settlement; voids only in the admin module", () => {
    expect(filesContaining('"squares_grade_moment"')).toEqual(["lib/squaresSettlement.ts"]);
    expect(filesContaining('"squares_draw"')).toEqual(["lib/squaresSettlement.ts"]);
    expect(filesContaining('"squares_void_moment"')).toEqual(["lib/squaresAdmin.ts"]);
    expect(filesContaining(/from\("squares_results"\)\s*\.insert/)).toEqual([]);
  });

  it("never touches users.points directly", () => {
    for (const rel of APP_SOURCES.filter((file) => /lib\/squares\w*\.ts$/.test(file))) {
      expect(read(rel), rel).not.toMatch(/from\("users"\)\s*\.update/);
    }
  });

  it("the leaderboard ignores reversed credits", () => {
    expect(read("lib/leaderboard.ts")).toMatch(/from\("seasonal_points_credits"\)[\s\S]{0,300}\.is\("reversed_at", null\)/);
  });
});

describe("cost gate", () => {
  it("does nothing while the flag is off, inside the window or not", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    expect(isSquaresSettlementActive(new Date("2027-02-14T23:30:00Z"))).toBe(false);
    const report = await runSquaresTick({ now: new Date("2027-02-14T23:30:00Z") });
    expect(report).toMatchObject({ ran: false, skipped: "inactive", feedRequests: 0 });
  });

  it("runs only inside the card window (or with the rehearsal switch)", () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    vi.stubEnv("SQUARES_REHEARSAL_ENABLED", "");
    expect(isSquaresSettlementActive(new Date("2027-01-31T12:00:00Z"))).toBe(false);
    expect(isSquaresSettlementActive(new Date("2027-02-14T23:30:00Z"))).toBe(true);
    expect(isSquaresSettlementActive(new Date("2027-02-16T12:00:00Z"))).toBe(false);
    vi.stubEnv("SQUARES_REHEARSAL_ENABLED", "1");
    expect(isSquaresSettlementActive(new Date("2027-01-03T12:00:00Z"))).toBe(true);
  });

  it("runs on the rehearsal switch alone (Production's cron, public flag off) but discovers only in season (plan 6.2)", () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    vi.stubEnv("SQUARES_REHEARSAL_ENABLED", "true");
    expect(squaresSettlementMode(new Date("2026-12-06T18:00:00Z"))).toBe("rehearsal");
    expect(squaresSettlementMode(new Date("2027-02-14T23:30:00Z"))).toBe("rehearsal");
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    expect(squaresSettlementMode(new Date("2027-02-14T23:30:00Z"))).toBe("season");
    vi.stubEnv("SQUARES_REHEARSAL_ENABLED", "");
    expect(squaresSettlementMode(new Date("2026-12-06T18:00:00Z"))).toBeNull();
  });

  it("the TV read needs the public flag, and the window or the rehearsal switch", () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    vi.stubEnv("SQUARES_REHEARSAL_ENABLED", "true");
    expect(isSquaresServerLive(new Date("2026-12-06T18:00:00Z"))).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    expect(isSquaresServerLive(new Date("2026-12-06T18:00:00Z"))).toBe(true);
    vi.stubEnv("SQUARES_REHEARSAL_ENABLED", "");
    expect(isSquaresServerLive(new Date("2026-12-06T18:00:00Z"))).toBe(false);
    expect(isSquaresServerLive(new Date("2027-02-14T23:30:00Z"))).toBe(true);
    expect(read("lib/squaresTvRead.ts")).toContain("if (!isSquaresServerLive(new Date(nowMs))) return null;");
  });

  it("is checked before anything else in the cron", () => {
    const cron = read("app/api/cron/pickem-settle/route.ts");
    expect(cron).toContain("isSquaresSettlementActive(new Date()) ? await runSquaresTick() : null");
  });
});

describe("admin actions", () => {
  it("validates input", () => {
    expect(parseSquaresAdminAction({ action: "run_now" })).toEqual({ action: "run_now" });
    expect(parseSquaresAdminAction({ action: "set_game", gameId: 12 })).toEqual({ action: "set_game", gameId: 12 });
    expect(parseSquaresAdminAction({ action: "set_game", gameId: "12" })).toHaveProperty("error");
    expect(parseSquaresAdminAction({ action: "void_moment", moment: "q1", reason: "feed fixed" })).toEqual({
      action: "void_moment", moment: "q1", reason: "feed fixed", colScore: null, rowScore: null,
    });
    expect(parseSquaresAdminAction({ action: "void_moment", moment: "q1", reason: "feed fixed", colScore: 3 })).toHaveProperty("error");
    expect(parseSquaresAdminAction({ action: "void_moment", moment: "q1", reason: "x" })).toHaveProperty("error");
    expect(parseSquaresAdminAction({ action: "grade_moment", moment: "q5", colScore: 1, rowScore: 2, reason: "ok ok" })).toHaveProperty("error");
    expect(parseSquaresAdminAction({ action: "move_lock", lockAt: "2027-02-14T23:00:00Z" })).toEqual({
      action: "move_lock", lockAt: "2027-02-14T23:00:00.000Z",
    });
    expect(parseSquaresAdminAction({ action: "drop_table" })).toHaveProperty("error");
  });
});

describe("event lifecycle (plan 6.2)", () => {
  it("only this season's Super Bowl is a super_bowl event; anything else is a rehearsal", () => {
    expect(squaresEventPurposeFor({ ...superBowl, season: 2025 }, 2025)).toBe("super_bowl");
    expect(squaresEventPurposeFor({ ...superBowl, season: 2025 }, 2026)).toBe("rehearsal");
    expect(squaresEventPurposeFor({ ...superBowl, season: null }, 2025)).toBe("rehearsal");
    expect(squaresEventPurposeFor({ ...superBowl, postseason: false }, Number(superBowl.season))).toBe("rehearsal");
    const sameConference = { ...superBowl, visitor_team: { ...superBowl.visitor_team!, conference: superBowl.home_team?.conference } };
    expect(squaresEventPurposeFor(sameConference as NflFeedGame, Number(superBowl.season))).toBe("rehearsal");
  });

  it("refuses archiving a drawn Super Bowl until the card window closes (Eastern); rehearsals and undrawn events any time", () => {
    const drawn = { purpose: "super_bowl" as const, drawnAt: "2027-02-14T23:00:00Z", season: squaresSeason() };
    expect(squaresArchiveRefusal(drawn, new Date("2027-02-15T12:00:00Z"))).toMatch(/can't be archived until/);
    // Feb 16 00:30 UTC is still Feb 15 in New York.
    expect(squaresArchiveRefusal(drawn, new Date("2027-02-16T00:30:00Z"))).not.toBeNull();
    expect(squaresArchiveRefusal(drawn, new Date("2027-02-16T05:30:00Z"))).toBeNull();
    expect(squaresArchiveRefusal({ purpose: "super_bowl", drawnAt: null, season: squaresSeason() }, new Date("2027-02-10T12:00:00Z"))).toBeNull();
    expect(squaresArchiveRefusal({ purpose: "rehearsal", drawnAt: "2026-12-06T17:30:00Z", season: squaresSeason() }, new Date("2026-12-06T20:00:00Z"))).toBeNull();
  });

  it("allows archiving an earlier season's drawn Super Bowl inside this window (6.6.1, §29 S1)", () => {
    const old = { purpose: "super_bowl" as const, drawnAt: "2026-02-08T23:00:00Z", season: squaresSeason() - 1 };
    expect(squaresArchiveRefusal(old, new Date("2027-02-05T12:00:00Z"))).toBeNull();
  });

  it("isStaleSquaresEvent: a rehearsal, or another season's event", () => {
    expect(isStaleSquaresEvent({ purpose: "rehearsal", season: 2026 }, 2026)).toBe(true);
    expect(isStaleSquaresEvent({ purpose: "super_bowl", season: 2025 }, 2026)).toBe(true);
    expect(isStaleSquaresEvent({ purpose: "super_bowl", season: 2026 }, 2026)).toBe(false);
  });

  it("set_game never changes an event's purpose", () => {
    expect(squaresSetGameRefusal("super_bowl", "super_bowl")).toBeNull();
    expect(squaresSetGameRefusal("rehearsal", "rehearsal")).toBeNull();
    expect(squaresSetGameRefusal("super_bowl", "rehearsal")).toMatch(/isn't this season's Super Bowl/);
    expect(squaresSetGameRefusal("rehearsal", "super_bowl")).toMatch(/Archive this rehearsal/);
  });

  it("watches the feed for 3 hours after a void, and only after one", () => {
    const at = Date.parse("2027-02-15T12:30:00Z");
    expect(isSquaresReopenWatchOn(null, at)).toBe(false);
    expect(isSquaresReopenWatchOn("not a date", at)).toBe(false);
    expect(isSquaresReopenWatchOn("2027-02-15T12:30:00+00:00", at + 60_000)).toBe(true);
    expect(isSquaresReopenWatchOn("2027-02-15T12:30:00+00:00", at - 500)).toBe(true); // clocks a moment apart
    expect(isSquaresReopenWatchOn("2027-02-15T12:30:00+00:00", at + 3 * 60 * 60_000)).toBe(false);
  });

  it("the claim route answers rehearsal_only with 403 and plain copy", () => {
    expect(read("app/api/squares/claim/route.ts")).toContain("rehearsal_only: 403");
    expect(squaresClaimMessage("rehearsal_only")).toBe("This board is a test game and isn't open at this venue.");
  });

  it("the lifecycle migration replaces squares_claim and squares_void_moment and keeps them service-role only", () => {
    const name = readdirSync(path.join(ROOT, "supabase/migrations")).find((file) => file.endsWith("_squares_event_lifecycle.sql"));
    expect(name).toBeDefined();
    const sql = read(`supabase/migrations/${name}`);
    for (const signature of [
      "squares_claim(uuid, uuid, text, integer, text)",
      "squares_void_moment(uuid, text, text, text, integer, integer, integer)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).toContain("claim_outcome := 'rehearsal_only'");
    expect(sql).toMatch(/set completed_at = null, reopened_at = now\(\)/);
  });

  it("every event insert names its purpose", () => {
    expect(read("lib/squaresStore.ts")).toContain("purpose: options.purpose");
    expect(read("lib/squaresSettlement.ts")).toContain('purpose: "super_bowl"');
  });
});

describe("player routes", () => {
  it("404 while the flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "");
    const board = await import("@/app/api/squares/board/route");
    const claim = await import("@/app/api/squares/claim/route");
    expect((await board.GET(new Request("http://x/api/squares/board?venueId=v1"))).status).toBe(404);
    expect((await claim.POST(new Request("http://x/api/squares/claim", { method: "POST", body: "{}" }))).status).toBe(404);
  });

  it("reject a malformed claim before any database work", async () => {
    vi.stubEnv("NEXT_PUBLIC_SQUARES_ENABLED", "true");
    const claim = await import("@/app/api/squares/claim/route");
    const post = (body: unknown) =>
      claim.POST(new Request("http://x/api/squares/claim", { method: "POST", body: JSON.stringify(body) }));
    expect((await post({ venueId: "v1", userId: "u", cell: 100, action: "claim" })).status).toBe(400);
    expect((await post({ venueId: "v1", userId: "u", cell: 5, action: "steal" })).status).toBe(400);
    expect((await post({ venueId: "", userId: "u", cell: 5, action: "claim" })).status).toBe(400);
  });
});
