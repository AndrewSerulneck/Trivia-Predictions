import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

type Row = { id: string; question_pool: string; answer_format: string };
type Packet = { page: number; total_count: number; id_digest: string; corpus_revision: string; rows: Row[] };
const { validatePages, referenceSQL } = require(path.resolve("scripts/audit-speed-trivia-inventory.cjs")) as {
  validatePages: (packets: Packet[]) => Row[];
  referenceSQL: (references: { name: string; table_schema: string; table: string; column: string; target_column: string }[]) => string;
};
const fixture = (count = 1251): Packet[] => {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: String(index).padStart(8, "0"), question_pool: "anytime_blitz", answer_format: "multiple_choice",
  }));
  const digest = createHash("md5").update(rows.map(row => row.id).join(",")).digest("hex");
  return Array.from({ length: Math.ceil(count / 250) }, (_, page) => ({
    page, total_count: count, id_digest: digest, corpus_revision: "fixed-mvcc-revision", rows: rows.slice(page * 250, (page + 1) * 250),
  }));
};
describe("read-only Speed snapshot integrity", () => {
  it("fails without injected credentials instead of verifying an empty corpus", () => {
    const result = spawnSync(process.execPath, [path.resolve("scripts/audit-speed-trivia-inventory.cjs")], {
      encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" }, timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Inventory incomplete");
    expect(result.stdout).not.toContain('"completed":true');
  });
  it("preserves every ordered row beyond the usual 1,000-row API cap", () => {
    expect(validatePages(fixture())).toHaveLength(1251);
  });
  it("refuses a missing final page or a silently truncated page", () => {
    expect(() => validatePages(fixture().slice(0, -1))).toThrow("truncated-pages");
    const pages = fixture(); pages[2].rows.pop();
    expect(() => validatePages(pages)).toThrow("truncated-page");
  });
  it("refuses repeated IDs, out-of-order pages and mixed pools", () => {
    const repeated = fixture(); repeated[1].rows[0] = repeated[0].rows[0];
    expect(() => validatePages(repeated)).toThrow("unordered-or-duplicate-id");
    expect(() => validatePages(fixture().reverse())).toThrow("invalid-page-schema");
    const mixed = fixture(); mixed[0].rows[0].question_pool = "live_showdown";
    expect(() => validatePages(mixed)).toThrow("mixed-pool");
  });
  it("refuses inconsistent count, ID digest, revision and an empty corpus", () => {
    const count = fixture(); count[1].total_count++;
    expect(() => validatePages(count)).toThrow("invalid-page-schema");
    const digest = fixture(); digest[1].id_digest = "wrong";
    expect(() => validatePages(digest)).toThrow("revision-mismatch");
    const revision = fixture(); revision[1].corpus_revision = "newer";
    expect(() => validatePages(revision)).toThrow("revision-mismatch");
    expect(() => validatePages([])).toThrow("missing-pages");
  });
  it("escapes catalog identifiers and exports aggregate counts only", () => {
    const query = referenceSQL([{ name: "test'fk", table_schema: "public", table: 'table"name', column: "question_id", target_column: "slug" }]);
    expect(query).toContain("'test''fk'");
    expect(query).toContain('"table""name"');
    expect(query).toContain("count(*)");
    expect(query).not.toContain("user_id");
  });
});
