import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Isolated PostgreSQL only (PGlite). Never contacts Supabase. Phase 4c.8 of docs/speed-trivia-backlog-and-quality-plan.md
// (post-4c.4 review #4, D15): the star cap also holds when an approved question's tag moves to another subject.
const require = createRequire(import.meta.url);
const harness = require("../scripts/test-speed-trivia-admission-sql.cjs") as { setup: (db: PGlite) => Promise<void> };
const MIGRATIONS = [
  "supabase/migrations/20261115151703_speed_trivia_quick_review.sql",
  "supabase/migrations/20261115153905_speed_trivia_bar_test_scores.sql",
  "supabase/migrations/20261115170333_speed_trivia_keep_queue.sql",
  "supabase/migrations/20261115212126_speed_trivia_queue_repairs.sql",
  "supabase/migrations/20261115213124_speed_trivia_released_rows_revision.sql",
  "supabase/migrations/20261115214254_speed_trivia_undo_needs_look.sql",
  "supabase/migrations/20261115220356_question_variety_map.sql",
  "supabase/migrations/20261116014954_speed_trivia_star_cap.sql",
  "supabase/migrations/20261117135338_speed_trivia_tag_cap.sql",
];
const id = (n: number) => `82000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: PGlite;
const scalar = async <T,>(sql: string, args: unknown[] = []): Promise<T> =>
  Object.values((await db.query<Record<string, T>>(sql, args)).rows[0])[0];

/** Rows and tags written straight in (all triggers off), so a fixture can even start over the cap. */
const seed = async (rows: { n: number; status: string; subject: string | null; pool?: string }[]) => {
  await db.exec("reset role; alter table trivia_questions disable trigger all; alter table question_tags disable trigger all;");
  for (const { n, status, subject, pool = "anytime_blitz" } of rows) {
    await db.query(
      "insert into trivia_questions(id,slug,question,options,correct_answer,category,status,question_pool,answer_format,normalized_question_key) values($1,$2,$3,'[\"A\",\"B\"]'::jsonb,0,'Animals',$4,$5,$6,$7)",
      [id(n), `tag-cap-${n}`, `Tag cap fixture ${n}?`, status, pool, pool === "anytime_blitz" ? "multiple_choice" : "write_in", `tag cap fixture ${n}`],
    );
    if (subject) {
      await db.query("insert into question_tags(game,question_ref,category,subject,subject_key) values('speed',$1,'Animals',$2,$2)", [id(n), subject]);
    }
  }
  await db.exec("alter table trivia_questions enable trigger all; alter table question_tags enable trigger all; set role service_role;");
};
const retag = (n: number, subject: string) =>
  db.query("update question_tags set subject=$2, subject_key=$2 where game='speed' and question_ref=$1", [id(n), subject]);
// What tagOne / tag-questions.cjs send: insert ... on conflict do update (fires the INSERT trigger first).
const upsertTag = (n: number, subject: string, extra = "") =>
  db.query(`insert into question_tags(game,question_ref,category,subject,subject_key${extra ? ",tagged_by" : ""}) values('speed',$1,'Animals',$2,$2${extra ? ",$3" : ""})
    on conflict (game,question_ref) do update set subject=excluded.subject, subject_key=excluded.subject_key, tagged_by=excluded.tagged_by`,
  extra ? [id(n), subject, extra] : [id(n), subject]);
const subjectOf = (n: number) => scalar<string | null>("select (select subject_key from question_tags where game='speed' and question_ref=$1) k", [id(n)]);
const hasRoom = (subject: string, n: number) => scalar<boolean>("select public.speed_trivia_subject_has_room($1,$2::uuid)", [subject, id(n)]);

beforeEach(async () => {
  db = new PGlite();
  await harness.setup(db);
  await db.exec("reset role;");
  for (const file of MIGRATIONS) await db.exec(readFileSync(file, "utf8"));
  await db.exec("set role service_role;");
});
afterEach(async () => { await db.close(); });

const fullChameleon = [1, 2, 3, 4, 5].map(n => ({ n, status: "active", subject: "chameleon" }));

describe("guard_speed_question_tag (Phase 4c.8)", () => {
  it("refuses moving an approved question's tag into a subject with 5 other approved questions (update and upsert)", async () => {
    await seed([...fullChameleon, { n: 6, status: "active", subject: "gecko" }]);
    await expect(retag(6, "chameleon")).rejects.toThrow(/star-cap/);
    await expect(upsertTag(6, "chameleon")).rejects.toThrow(/star-cap/);
    expect(await subjectOf(6)).toBe("gecko");
  });

  it("refuses a first tag (insert) on an untagged approved question into a full subject", async () => {
    await seed([...fullChameleon, { n: 6, status: "active", subject: null }]);
    await expect(upsertTag(6, "chameleon")).rejects.toThrow(/star-cap/);
    await expect(db.query("insert into question_tags(game,question_ref,category,subject,subject_key) values('speed',$1,'Animals','chameleon','chameleon')", [id(6)]))
      .rejects.toThrow(/star-cap/);
    expect(await subjectOf(6)).toBeNull();
  });

  it("allows the move while only 4 others are approved; retired, waiting and Live rows don't count", async () => {
    await seed([
      ...[1, 2, 3, 4].map(n => ({ n, status: "active", subject: "chameleon" })),
      { n: 5, status: "deleted", subject: "chameleon" },
      { n: 7, status: "pending_review", subject: "chameleon" },
      { n: 6, status: "active", subject: "gecko" },
    ]);
    await retag(6, "chameleon");
    expect(await subjectOf(6)).toBe("chameleon");
  });

  it("allows a waiting or retired question's tag into a full subject", async () => {
    await seed([...fullChameleon, { n: 6, status: "pending_review", subject: "gecko" }, { n: 7, status: "deleted", subject: null }]);
    await retag(6, "chameleon");
    await upsertTag(7, "chameleon");
    expect([await subjectOf(6), await subjectOf(7)]).toEqual(["chameleon", "chameleon"]);
  });

  it("never touches an unchanged subject, even one already over the cap", async () => {
    await seed([...fullChameleon, { n: 6, status: "active", subject: "chameleon" }]);
    await db.query("update question_tags set subject='Chameleon', tagged_by='edit' where question_ref=$1", [id(6)]);
    await upsertTag(6, "chameleon", "re-tag");
    await retag(6, "chameleon");
    expect(await scalar<string>("select tagged_by from question_tags where question_ref=$1", [id(6)])).toBe("re-tag");
  });

  it("ignores Live tags", async () => {
    await seed(fullChameleon);
    await db.query("insert into question_tags(game,question_ref,category,subject,subject_key) values('live','some-live-slug','Animals','chameleon','chameleon')");
    expect(await scalar<number>("select count(*)::int from question_tags where game='live'")).toBe(1);
  });

  it("leaves a malformed Speed ref to the existing check constraint", async () => {
    await expect(db.query("insert into question_tags(game,question_ref,category,subject,subject_key) values('speed','not-a-uuid','Animals','x','x')"))
      .rejects.toThrow(/question_tags_speed_ref/);
  });
});

describe("speed_trivia_subject_has_room (Phase 4c.8)", () => {
  it("counts other approved Speed rows only, excluding the row itself", async () => {
    await seed([...fullChameleon, { n: 6, status: "active", subject: "gecko" }, { n: 7, status: "pending_review", subject: "gecko" }]);
    expect(await hasRoom("chameleon", 6)).toBe(false);
    // One of the five moving within its own subject: 4 others.
    expect(await hasRoom("chameleon", 1)).toBe(true);
    expect(await hasRoom("gecko", 6)).toBe(true);
    expect(await hasRoom("brand new subject", 6)).toBe(true);
  });

  it("is executable by service_role only", async () => {
    await seed(fullChameleon);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role};`);
      await expect(db.query("select public.speed_trivia_subject_has_room('chameleon', $1::uuid)", [id(9)])).rejects.toThrow(/permission denied/);
    }
    await db.exec("reset role; set role service_role;");
    expect(await hasRoom("chameleon", 9)).toBe(false);
  });
});
