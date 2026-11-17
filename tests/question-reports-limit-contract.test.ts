import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Post-4c.4 review #8 (docs/speed-trivia-backlog-and-quality-plan.md, Phase 4c.10): the report limit is enforced by
// the insert trigger, which hard-codes the number. QUESTION_REPORT_DAILY_LIMIT is the one number the code names;
// the two must match.
const lib = readFileSync("lib/questionReports.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261117142126_question_reports_daily_limit.sql", "utf8");

describe("question report limit contract", () => {
  it("the trigger's number matches QUESTION_REPORT_DAILY_LIMIT", () => {
    const code = lib.match(/export const QUESTION_REPORT_DAILY_LIMIT = (\d+);/);
    const sql = migration.match(/interval '24 hours'\s*\)\s*>=\s*(\d+)/);
    expect(code?.[1]).toBeDefined();
    expect(sql?.[1]).toBe(code?.[1]);
  });

  it("the route maps the trigger's error and no longer counts reports itself", () => {
    expect(migration).toContain("raise exception 'question-report-limit'");
    expect(lib).toContain('"question-report-limit"');
    expect(lib).not.toMatch(/count:\s*"exact"/);
  });
});
