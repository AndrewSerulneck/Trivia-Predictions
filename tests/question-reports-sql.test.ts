import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 4c.7 of docs/speed-trivia-backlog-and-quality-plan.md
// (D32): the player report table is server-only, and its checks keep each reason to its game.
const require = createRequire(import.meta.url);
const harness = require("../scripts/test-speed-trivia-admission-sql.cjs") as { setup: (db: PGlite, extraRows?: number) => Promise<void> };
const MIGRATIONS = [
  "supabase/migrations/20261115220356_question_variety_map.sql",
  "supabase/migrations/20261117033637_speed_trivia_expire_undated_current_events.sql",
  "supabase/migrations/20261117040723_question_reports.sql",
  "supabase/migrations/20261117142126_question_reports_daily_limit.sql",
];
const USER_A = "85000000-0000-4000-8000-000000000001";
const USER_B = "85000000-0000-4000-8000-000000000002";

let db: PGlite;
let questionId = "";
let extraIds: string[] = [];
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];
const report = (values: { user?: string; game?: string; reason?: string; note?: string | null; answer?: string | null }) =>
  db.query(
    "insert into question_reports(question_id,game,user_id,reason,note,player_answer) values($1,$2,$3,$4,$5,$6)",
    [questionId, values.game ?? "speed", values.user ?? USER_A, values.reason ?? "typo", values.note ?? null, values.answer ?? null],
  );

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db, 25);
  await db.exec("reset role;");
  // The real users table has many more columns; the report table needs only its id.
  await db.exec(`create table public.users(id uuid primary key);
    insert into public.users(id) values ('${USER_A}'),('${USER_B}');`);
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  questionId = await scalar<string>("select id from trivia_questions where slug='gobi'");
  extraIds = (await db.query<{ id: string }>("select id from trivia_questions where slug like 'fixture-extra-%' order by slug")).rows.map((r) => r.id);
  await db.exec("set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("question_reports SQL", () => {
  it("keeps the browser roles out and lets the server insert, read and resolve", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role};`);
      await expect(db.query("select * from question_reports")).rejects.toThrow(/permission denied/);
      await expect(report({})).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role; set role service_role;");
    await report({ answer: "Asia" });
    expect(await scalar<number>("select count(*)::int from question_reports where resolved_at is null")).toBe(1);
    await db.query("update question_reports set resolved_at=now()");
    expect(await scalar<number>("select count(*)::int from question_reports where resolved_at is null")).toBe(0);
    await expect(db.query("delete from question_reports")).rejects.toThrow(/permission denied/);
    expect(await scalar<boolean>("select relforcerowsecurity from pg_class where relname='question_reports'")).toBe(true);
  });

  it("allows one report per player per question", async () => {
    await report({});
    // The limit trigger skips a duplicate quietly (post-4c.4 review #8); the unique constraint stays as the backstop.
    await report({ reason: "confusing" });
    expect(await scalar<string>("select reason from question_reports")).toBe("typo");
    await db.query(
      "insert into question_reports(question_id,game,user_id,reason) values($1,'speed',$2,'confusing') on conflict (user_id, question_id) do nothing",
      [questionId, USER_A],
    );
    await report({ user: USER_B });
    expect(await scalar<number>("select count(*)::int from question_reports")).toBe(2);
  });

  it("keeps each reason to its game", async () => {
    await expect(report({ game: "speed", reason: "my_answer_right" })).rejects.toThrow(/question_reports_reason/);
    await expect(report({ game: "live", reason: "two_right" })).rejects.toThrow(/question_reports_reason/);
    await expect(report({ reason: "spam" })).rejects.toThrow(/question_reports_reason/);
    await expect(report({ game: "tv" })).rejects.toThrow(/question_reports_game/);
    await report({ game: "live", reason: "my_answer_right", answer: "colloseum" });
    await report({ user: USER_B, game: "speed", reason: "two_right" });
  });

  it("needs a note of at most 200 characters with Other, and no note otherwise", async () => {
    await expect(report({ reason: "other" })).rejects.toThrow(/question_reports_note/);
    await expect(report({ reason: "other", note: "   " })).rejects.toThrow(/question_reports_note/);
    await expect(report({ reason: "other", note: "x".repeat(201) })).rejects.toThrow(/question_reports_note/);
    await expect(report({ reason: "typo", note: "extra" })).rejects.toThrow(/question_reports_note/);
    await expect(report({ answer: "y".repeat(201) })).rejects.toThrow(/question_reports_player_answer/);
    await report({ reason: "other", note: "x".repeat(200) });
  });

  it("counts plays per reported question, one grouped count per game, for the server only", async () => {
    await db.exec(`reset role;
      create table public.trivia_answers(id serial primary key, question_id uuid, user_id uuid);
      create table public.live_showdown_answers(id serial primary key, question_id text, user_id uuid);
      grant select on public.trivia_answers, public.live_showdown_answers to service_role;
      insert into trivia_answers(question_id,user_id) values ('${questionId}','${USER_A}'),('${questionId}','${USER_B}');
      insert into live_showdown_answers(question_id,user_id) values ('gobi','${USER_A}'),('other','${USER_A}');`);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role};`);
      await expect(db.query("select * from question_report_play_counts('{}'::uuid[], '{}'::text[])")).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role; set role service_role;");
    const rows = await db.query<{ game: string; question_ref: string; plays: number }>(
      "select game, question_ref, plays::int as plays from question_report_play_counts($1::uuid[], $2::text[]) order by game",
      [[questionId], ["gobi"]],
    );
    expect(rows.rows).toEqual([
      { game: "live", question_ref: "gobi", plays: 1 },
      { game: "speed", question_ref: questionId, plays: 2 },
    ]);
  });

  it("removes a player's reports with the player", async () => {
    await report({});
    await db.exec(`reset role; delete from users where id='${USER_A}'; set role service_role;`);
    expect(await scalar<number>("select count(*)::int from question_reports")).toBe(0);
  });
});

// Post-4c.4 review #8: the 20-a-day limit is one atomic rule in the insert trigger. PGlite has one connection, so the
// advisory lock's concurrency guarantee is reasoned, not tested here.
describe("question_reports daily limit trigger", () => {
  const fill = async (user: string, n: number, ago = "1 minute") => {
    await db.exec("reset role;");
    for (const id of extraIds.slice(0, n)) {
      await db.query(
        `insert into question_reports(question_id,game,user_id,reason,created_at) values($1,'speed',$2,'typo',now() - $3::interval)`,
        [id, user, ago],
      );
    }
    await db.exec("set role service_role;");
  };
  const insert = (id: string, user = USER_A) =>
    db.query("insert into question_reports(question_id,game,user_id,reason) values($1,'speed',$2,'confusing')", [id, user]);
  const upsert = (id: string, user = USER_A) =>
    db.query(
      "insert into question_reports(question_id,game,user_id,reason) values($1,'speed',$2,'confusing') on conflict (user_id, question_id) do nothing",
      [id, user],
    );

  it("refuses the 21st report in 24 hours, per player", async () => {
    await fill(USER_A, 20);
    await expect(insert(extraIds[20])).rejects.toThrow(/question-report-limit/);
    await expect(upsert(extraIds[20])).rejects.toThrow(/question-report-limit/);
    await insert(extraIds[20], USER_B);
    expect(await scalar<number>("select count(*)::int from question_reports where user_id=$1", [USER_A])).toBe(20);
  });

  it("allows the 20th", async () => {
    await fill(USER_A, 19);
    await insert(extraIds[19]);
    expect(await scalar<number>("select count(*)::int from question_reports")).toBe(20);
  });

  it("skips a duplicate at the limit without an error", async () => {
    await fill(USER_A, 20);
    await upsert(extraIds[0]);
    await insert(extraIds[0]);
    expect(await scalar<number>("select count(*)::int from question_reports")).toBe(20);
  });

  it("doesn't count reports older than 24 hours", async () => {
    await fill(USER_A, 20, "25 hours");
    await insert(extraIds[20]);
    expect(await scalar<number>("select count(*)::int from question_reports")).toBe(21);
  });

  it("is invoker rights with search_path pinned, and no browser role can run it", async () => {
    await db.exec("reset role;");
    const fn = await db.query<{ prosecdef: boolean; proconfig: string[] }>(
      "select prosecdef, proconfig from pg_proc where proname='guard_question_report_limit'",
    );
    expect(fn.rows[0].prosecdef).toBe(false);
    expect(fn.rows[0].proconfig).toEqual(["search_path=pg_catalog, public"]);
    for (const role of ["anon", "authenticated"]) {
      expect(await scalar<boolean>(`select has_function_privilege('${role}', 'public.guard_question_report_limit()', 'execute')`)).toBe(false);
    }
  });
});
