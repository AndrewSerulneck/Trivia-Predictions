import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
const require = createRequire(import.meta.url);
const core = require("../lib/speed-trivia-uniqueness/core.cjs") as { contentHash: (row: Record<string, unknown>) => string };
const cleanup = require("../scripts/manage-speed-trivia-retirement.cjs") as { run: (input: { client: { rpc: ReturnType<typeof vi.fn> }; source: Record<string, unknown> }) => Promise<{ proposed: number }> };

const fixture = () => {
  const rows = Array.from({ length: 1201 }, (_, n) => ({ id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`, slug: `fixture-${n}`, question: `Fixture association ${n}?`, options: ["A", "B", "C", "D"], correct_answer: 0, category: "Science", status: n === 1200 ? "active" : "pending_review", question_pool: "anytime_blitz", answer_format: "multiple_choice" }));
  const keeper = rows[1200];
  const retirements = rows.slice(0, 1200).map(row => ({ id: row.id, slug: row.slug, oldStatus: row.status, oldContentHash: core.contentHash(row), keeperId: keeper.id, keeperContentHash: core.contentHash(keeper) }));
  const rpc = vi.fn(async (name: string, args?: { p_offset?: number; p_limit?: number }) => {
    if (name === "speed_trivia_cleanup_state") return { data: { rows: [], revision: "7" }, error: null };
    if (name === "speed_trivia_inventory") return { data: { count: rows.length, revision: "7" }, error: null };
    if (name === "speed_trivia_corpus_page") return { data: { rows: rows.slice(args?.p_offset, (args?.p_offset ?? 0) + (args?.p_limit ?? 500)), revision: "7" }, error: null };
    throw new Error("Unexpected per-question read");
  });
  return { rows, client: { rpc }, source: { manifest: { retirements }, text: "synthetic-only", manifestHash: "synthetic-only" } };
};

describe("bounded cleanup inventory", () => {
  it("verifies 1,200 retirements using one complete paginated corpus", async () => {
    const input = fixture();
    expect((await cleanup.run(input)).proposed).toBe(1200);
    expect(input.client.rpc).toHaveBeenCalledTimes(6);
    expect(input.client.rpc.mock.calls.filter(([name]) => name === "speed_trivia_corpus_page")).toHaveLength(3);
  });
  it("stops when the bank changes during the shared load", async () => {
    const input = fixture(), original = input.client.rpc.getMockImplementation()!;
    let inventories = 0;
    input.client.rpc.mockImplementation(async (name, args) => {
      if (name === "speed_trivia_inventory" && ++inventories === 2) return { data: { count: input.rows.length, revision: "8" }, error: null };
      return original(name, args);
    });
    await expect(cleanup.run(input)).rejects.toThrow("stale-corpus-revision");
  });
  it("refuses a changed keeper even with a complete corpus", async () => {
    const input = fixture(); input.rows[1200].status = "pending_review";
    await expect(cleanup.run(input)).rejects.toThrow("retirement-state-or-keeper-drift");
  });
});
