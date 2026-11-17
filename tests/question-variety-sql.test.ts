import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 4a of docs/speed-trivia-backlog-and-quality-plan.md.
const require = createRequire(import.meta.url);
const harness = require("../scripts/test-speed-trivia-admission-sql.cjs") as {
  setup: (db: PGlite) => Promise<void>;
  call: (db: PGlite, name: string, args?: Record<string, unknown>) => Promise<unknown>;
};
const MIGRATION = "supabase/migrations/20261115220356_question_variety_map.sql";
// Phase 4c.3 (review #5, D28): replaces speed_trivia_expire_dated so undated Current Events rows expire 12 months after creation.
const EXPIRE_UNDATED = "supabase/migrations/20261117033637_speed_trivia_expire_undated_current_events.sql";
const id = (n: number) => `72000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: PGlite;
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];
const call = <T,>(name: string, args: Record<string, unknown> = {}) => harness.call(db, name, args) as Promise<T>;

const insertQuestion = async (n: number, category: string, status: string, metadata: unknown = null, createdAt = "2026-07-01T00:00:00Z") => {
  await db.query(
    "insert into trivia_questions(id,slug,question,options,correct_answer,category,status,speed_generation_metadata,created_at,normalized_question_key) values($1,$2,$3,'[\"A\",\"B\",\"C\",\"D\"]'::jsonb,0,$4,$5,$6::jsonb,$7::timestamptz,$8)",
    [id(n), `q-${n}`, `Question number ${n}?`, category, status, metadata === null ? null : JSON.stringify(metadata), createdAt, `questionnumber${n}`],
  );
};

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  await db.exec(readFileSync(MIGRATION, "utf8"));
  await db.exec(readFileSync(EXPIRE_UNDATED, "utf8"));
  await db.exec("alter table trivia_questions disable trigger all;");
  await insertQuestion(1, "Music", "active");
  await insertQuestion(2, "Music", "pending_review", null, "2026-11-10T00:00:00Z");
  await insertQuestion(3, "Music", "deleted");
  await insertQuestion(4, "Music", "active");
  await insertQuestion(5, "Science", "active");
  await db.exec(`insert into question_coverage_areas(id,game,category,name,eras,position) values
    ('${id(101)}','speed','Music','Pop','{1980s,1990s}',0),
    ('${id(102)}','speed','Music','Country','{1990s}',1),
    ('${id(103)}','live','Music','Band lineups','{1970s}',0);`);
  await db.exec(`insert into question_tags(game,question_ref,category,area_id,era,subject,subject_key,written_at) values
    ('speed','${id(1)}','Music','${id(101)}','1980s','Madonna','madonna','2026-07-01T00:00:00Z'),
    ('speed','${id(2)}','Music','${id(101)}','1980s','Madonna','madonna','2026-11-10T00:00:00Z'),
    ('speed','${id(3)}','Music','${id(101)}','1990s','Madonna','madonna','2026-07-01T00:00:00Z'),
    ('speed','${id(4)}','Music',null,null,'Sheet music','sheet music','2026-07-01T00:00:00Z'),
    ('live','band-1','Music','${id(103)}','1970s','The Eagles','eagles',null);`);
  await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
});
afterEach(async () => { await db.close(); });

describe("variety map SQL", () => {
  it("keeps browser roles out and lets the server read and write the map and tags", async () => {
    await db.exec("reset role; set role anon;");
    await expect(db.query("select * from question_coverage_areas")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from question_tags")).rejects.toThrow(/permission denied/);
    await expect(db.query("select * from speed_trivia_category_flags")).rejects.toThrow(/permission denied/);
    await expect(db.query("select public.question_variety_stats('speed')")).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role;");
    expect(await scalar<number>("select count(*)::int from question_coverage_areas")).toBe(3);
    await expect(db.query("delete from question_coverage_areas")).rejects.toThrow(/permission denied/);
    // Flags and expiry logs are written only by their RPCs.
    await expect(db.query("update speed_trivia_category_flags set visible=true")).rejects.toThrow(/permission denied/);
    await expect(db.query("insert into speed_trivia_expiry_runs(cutoff,rows) values (now(),'[]')")).rejects.toThrow(/permission denied/);
  });

  it("keeps a tag's area in the same game and category, and Speed refs as ids", async () => {
    await expect(db.query(`insert into question_tags(game,question_ref,category,area_id,era,subject,subject_key) values ('speed','${id(5)}','Science','${id(101)}','1980s','X','x')`)).rejects.toThrow(/question_tags_area/);
    await expect(db.query(`insert into question_tags(game,question_ref,category,area_id,era,subject,subject_key) values ('speed','${id(5)}','Music','${id(103)}','1970s','X','x')`)).rejects.toThrow(/question_tags_area/);
    await expect(db.query("insert into question_tags(game,question_ref,category,subject,subject_key) values ('speed','not-a-uuid','Music','X','x')")).rejects.toThrow(/question_tags_speed_ref/);
    await expect(db.query("insert into question_tags(game,question_ref,category,era,subject,subject_key) values ('live','slug','Music','1970s','X','x')")).rejects.toThrow(/question_tags_era_needs_area/);
    await expect(db.query(`insert into question_coverage_areas(game,category,name,eras) values ('speed','Music','POP','{1980s}')`)).rejects.toThrow(/question_coverage_areas_name/);
  });

  it("counts only active and waiting Speed questions, and returns capped or recent subjects", async () => {
    type Stats = { areas: { id: string }[]; cells: { areaId: string; era: string; count: number; lastWritten: string }[]; subjects: { subjectKey: string; count: number; categories: string[] }[] };
    const stats = await call<Stats>("question_variety_stats", { p_game: "speed", p_cap: 2, p_gap_days: 30 });
    expect(stats.areas.map((a) => a.id)).toEqual([id(101), id(102)]);
    expect(stats.cells).toEqual([{ areaId: id(101), era: "1980s", count: 2, lastWritten: expect.any(String) }]);
    expect(Date.parse(stats.cells[0].lastWritten)).toBe(Date.parse("2026-11-10T00:00:00Z"));
    // Madonna: 2 in the bank (the deleted one doesn't count) = at the cap of 2.
    expect(stats.subjects).toEqual([expect.objectContaining({ subjectKey: "madonna", count: 2, categories: ["Music"] })]);
    const live = await call<Stats>("question_variety_stats", { p_game: "live" });
    expect(live.cells).toEqual([expect.objectContaining({ areaId: id(103), era: "1970s", count: 1 })]);
    await expect(call("question_variety_stats", { p_game: "trivia" })).rejects.toThrow(/invalid-variety-request/);
  });

  it("re-checks specific subjects for the star cap", async () => {
    const result = await db.query<{ result: { subjectKey: string; count: number; lastWritten: string }[] }>("select public.question_subject_stats('speed', array['madonna','nobody']) result");
    expect(result.rows[0].result).toEqual([{ subjectKey: "madonna", count: 2, lastWritten: expect.any(String) }]);
    expect(Date.parse(result.rows[0].result[0].lastWritten)).toBe(Date.parse("2026-11-10T00:00:00Z"));
  });

  it("reports a category for the Variety page", async () => {
    type Report = { areas: { name: string; counts: Record<string, number> }[]; tagged: number; unmapped: number; untagged: number | null; topSubjects: { subject: string; count: number }[]; top5Share: number };
    const report = await call<Report>("question_variety_report", { p_game: "speed", p_category: "Music" });
    expect(report.areas).toEqual([
      expect.objectContaining({ name: "Pop", counts: { "1980s": 2 } }),
      expect.objectContaining({ name: "Country", counts: {} }),
    ]);
    expect(report).toMatchObject({ tagged: 3, unmapped: 1, untagged: 0, top5Share: 1 });
    expect(report.topSubjects).toEqual([{ subject: "Madonna", count: 2 }, { subject: "Sheet music", count: 1 }]);
    const science = await call<Report>("question_variety_report", { p_game: "speed", p_category: "Science" });
    expect(science).toMatchObject({ tagged: 0, untagged: 1, top5Share: null, areas: [] });
    expect((await call<Report>("question_variety_report", { p_game: "live", p_category: "Music" })).untagged).toBeNull();
  });
});

describe("Current Events visibility and expiry SQL", () => {
  it("starts hidden and shows the category at 60 active questions (D11)", async () => {
    expect(await scalar<boolean>("select visible from speed_trivia_category_flags where category='Current Events'")).toBe(false);
    await db.exec("reset role; alter table trivia_questions disable trigger all;");
    for (let n = 200; n < 259; n++) await insertQuestion(n, "Current Events", "active");
    await insertQuestion(259, "Current Events", "pending_review");
    await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
    expect(await call("speed_trivia_refresh_category_visibility", { p_category: "Current Events", p_threshold: 60 }))
      .toEqual({ category: "Current Events", activeCount: 59, threshold: 60, visible: false });
    await db.exec("reset role; alter table trivia_questions disable trigger all;");
    await insertQuestion(260, "Current Events", "active");
    await db.exec("alter table trivia_questions enable trigger all; set role service_role;");
    expect(await call("speed_trivia_refresh_category_visibility", { p_category: "Current Events", p_threshold: 60 }))
      .toMatchObject({ activeCount: 60, visible: true });
    expect(await scalar<boolean>("select visible from speed_trivia_category_flags where category='Current Events'")).toBe(true);
    await expect(call("speed_trivia_refresh_category_visibility", { p_category: "Current Events", p_threshold: 0 })).rejects.toThrow(/invalid-visibility-request/);
  });

  it("retires only expired active and waiting rows, logging them first (D16)", async () => {
    await db.exec("reset role; alter table trivia_questions disable trigger all;");
    await insertQuestion(301, "Current Events", "active", { expiresOn: "2026-11-01" });
    await insertQuestion(302, "Current Events", "pending_review", { expiresOn: "2026-10-01" });
    await insertQuestion(303, "Current Events", "active", { expiresOn: "2026-12-01" });
    await insertQuestion(304, "Current Events", "deleted", { expiresOn: "2026-01-01" });
    await insertQuestion(305, "Current Events", "active", { expiresOn: "soon" });
    await db.exec("alter table trivia_questions enable trigger all; set role service_role;");

    const dry = await call<{ mode: string; matched: number; retired: number; ids: string[] }>("speed_trivia_expire_dated", { p_today: "2026-11-01", p_apply: false });
    expect(dry).toMatchObject({ mode: "dry-run", matched: 2, retired: 0, ids: [id(301), id(302)] });
    // Dry run changes nothing: the harness's retired row, id(3) and id(304) are the only deleted rows.
    expect(await scalar<number>("select count(*)::int from trivia_questions where status='deleted'")).toBe(3);

    // The guard trigger is on: this is the status-only retirement that needs no permit.
    const applied = await call<{ mode: string; matched: number; retired: number; runId: string }>("speed_trivia_expire_dated", { p_today: "2026-11-01", p_apply: true });
    expect(applied).toMatchObject({ mode: "apply", matched: 2, retired: 2 });
    const statuses = await db.query<{ id: string; status: string }>("select id::text, status from trivia_questions where id = any($1::uuid[]) order by id", [`{${[301, 302, 303, 305].map(id).join(",")}}`]);
    expect(statuses.rows.map((r) => r.status)).toEqual(["deleted", "deleted", "active", "active"]);
    const log = await db.query<{ rows: { id: string; status: string }[] }>("select rows from speed_trivia_expiry_runs where id=$1", [applied.runId]);
    expect(log.rows[0].rows.map((r) => [r.id, r.status])).toEqual([[id(301), "active"], [id(302), "pending_review"]]);
    expect(await call("speed_trivia_expire_dated", { p_today: "2026-11-01", p_apply: true })).toMatchObject({ matched: 0, retired: 0, runId: null });
    await expect(call("speed_trivia_expire_dated", { p_today: "2026-11-01", p_apply: true, p_limit: 5000 })).rejects.toThrow(/invalid-expiry-request/);
  });

  it("retires an undated Current Events row 12 months after it was created, and not before (D28)", async () => {
    await db.exec("reset role; alter table trivia_questions disable trigger all;");
    await insertQuestion(401, "Current Events", "active", null, "2025-11-01T23:30:00Z"); // 12 months on 2026-11-01
    await insertQuestion(402, "Current Events", "pending_review", { sourceUrl: "x" }, "2025-10-15T00:00:00Z"); // older, edited (no expiresOn)
    await insertQuestion(403, "Current Events", "active", null, "2025-11-02T00:00:00Z"); // one day short
    await insertQuestion(404, "Current Events", "active", { expiresOn: "soon" }, "2025-06-01T00:00:00Z"); // malformed date = undated
    await insertQuestion(405, "Current Events", "active", { expiresOn: "2027-01-01" }, "2025-01-01T00:00:00Z"); // dated: its date wins
    await insertQuestion(406, "Music", "active", null, "2020-01-01T00:00:00Z"); // not Current Events: never touched
    await insertQuestion(407, "Current Events", "deleted", null, "2020-01-01T00:00:00Z");
    await db.exec("alter table trivia_questions enable trigger all; set role service_role;");

    const before = await call<{ matched: number; ids: string[] }>("speed_trivia_expire_dated", { p_today: "2026-10-31", p_apply: false });
    expect(before.ids).toEqual([id(402), id(404)]);
    const applied = await call<{ matched: number; retired: number; runId: string; ids: string[] }>("speed_trivia_expire_dated", { p_today: "2026-11-01", p_apply: true });
    expect(applied).toMatchObject({ matched: 3, retired: 3, ids: [id(401), id(402), id(404)] });
    const statuses = await db.query<{ status: string }>("select status from trivia_questions where id = any($1::uuid[]) order by id", [`{${[401, 402, 403, 404, 405, 406].map(id).join(",")}}`]);
    expect(statuses.rows.map((r) => r.status)).toEqual(["deleted", "deleted", "active", "deleted", "active", "active"]);
    const log = await db.query<{ rows: { id: string; status: string }[] }>("select rows from speed_trivia_expiry_runs where id=$1", [applied.runId]);
    expect(log.rows[0].rows.map((r) => [r.id, r.status])).toEqual([[id(401), "active"], [id(402), "pending_review"], [id(404), "active"]]);
    // The dated row still goes by its own date.
    expect((await call<{ ids: string[] }>("speed_trivia_expire_dated", { p_today: "2027-01-01", p_apply: false })).ids).toEqual([id(403), id(405)]);
  });

  it("keeps the new expiry function out of browser roles", async () => {
    await db.exec("reset role; set role anon;");
    await expect(call("speed_trivia_expire_dated", { p_today: "2026-11-01", p_apply: false })).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role authenticated;");
    await expect(call("speed_trivia_expire_dated", { p_today: "2026-11-01", p_apply: false })).rejects.toThrow(/permission denied/);
  });
});
