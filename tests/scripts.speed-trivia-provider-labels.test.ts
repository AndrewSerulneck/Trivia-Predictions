import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import * as runtime from "@/lib/speed-trivia-uniqueness/runtime.cjs";
import type { AdmissionClient } from "@/types/speedTriviaAdmission";
import type { SpeedQuestion } from "@/types/speedTriviaUniqueness";
type DB = { exec: (sql: string) => Promise<unknown>; query: (sql: string, args?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>; close: () => Promise<void> };
const { PGlite } = require("@electric-sql/pglite") as { PGlite: new () => DB };
const harness = require(path.resolve("scripts/test-speed-trivia-admission-sql.cjs")) as { setup: (db: DB, extraRows?: number, variety?: boolean) => Promise<void>; clientFor: (db: DB) => AdmissionClient; SECRET: string; row: (id: string, question: string, answer: string) => SpeedQuestion };
const response = (id: string) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify([{ id, decision: "unique", explanation: "Different synthetic facts", fact: "Synthetic comparison", qualityA: "sound", qualityB: "sound", confidence: "high" }]) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 80 } }));

describe("production provider task labels", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("keeps UUIDs local while returning evidence bound to the original row IDs", async () => {
    const db = new PGlite(); await harness.setup(db, 0, true);
    const prompts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { prompts.push(JSON.parse(String(init.body)).contents[0].parts[0].text); return response("comparison"); }));
    try {
      const session = await runtime.createSession({ client: harness.clientFor(db), secret: harness.SECRET, apiKey: "synthetic-only", budget: runtime.createBudget({ dollars: 1 }) });
      const row = harness.row("70000000-0000-4000-8000-000000000001", "Which flower structure stores pollen?", "Anther");
      const saved = await session.write(row);
      expect(saved.row.id).toBe(row.id);
      expect(prompts).toHaveLength(2);
      for (const prompt of prompts) expect(JSON.parse(prompt.split("\nPAIRS:\n")[1])[0].id).toBe("comparison");
      expect(saved.evidence?.comparisons).toHaveLength(2);
      expect(saved.evidence?.comparisons.every(result => session.corpus().rows.some(existing => existing.id === result.id))).toBe(true);
    } finally { await db.close(); }
  });
  it("still refuses a wrong provider label without admitting a question", async () => {
    const db = new PGlite(); await harness.setup(db, 0, true);
    vi.stubGlobal("fetch", vi.fn(async () => response("wrong-label")));
    try {
      const session = await runtime.createSession({ client: harness.clientFor(db), secret: harness.SECRET, apiKey: "synthetic-only", budget: runtime.createBudget({ dollars: 1 }) });
      const row = harness.row("70000000-0000-4000-8000-000000000002", "Which flower structure receives pollen?", "Stigma");
      await expect(session.write(row)).rejects.toMatchObject({ code: "verification_unavailable", evidence: { explanation: "Unverified comparison: semantic-result-incomplete-or-invalid" } });
      expect(session.corpus().rows.some(existing => existing.id === row.id)).toBe(false);
    } finally { await db.close(); }
  });
  it("classifies a provider abort at the global deadline as a cutoff and saves nothing", async () => {
    const db = new PGlite(); await harness.setup(db, 0, true);
    let elapsed = 0;
    const budget = runtime.createBudget({ dollars: 1, elapsedMs: 5000, now: () => elapsed });
    vi.stubGlobal("fetch", vi.fn(async () => { elapsed = 5000; throw new DOMException("Synthetic deadline abort", "TimeoutError"); }));
    try {
      const session = await runtime.createSession({ client: harness.clientFor(db), secret: harness.SECRET, apiKey: "synthetic-only", budget });
      const row = harness.row("70000000-0000-4000-8000-000000000003", "Which flower structure produces pollen?", "Anther");
      await expect(session.write(row)).rejects.toMatchObject({ code: "budget_exhausted" });
      expect(session.corpus().rows.some(existing => existing.id === row.id)).toBe(false);
      expect(budget.summary().dollars).toBeGreaterThan(0); // Lost attempt stays charged.
    } finally { await db.close(); }
  });
  it("continues to fail closed on a provider outage before the deadline", async () => {
    const db = new PGlite(); await harness.setup(db, 0, true);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Synthetic provider outage"); }));
    try {
      const session = await runtime.createSession({ client: harness.clientFor(db), secret: harness.SECRET, apiKey: "synthetic-only", budget: runtime.createBudget({ dollars: 1 }) });
      const row = harness.row("70000000-0000-4000-8000-000000000004", "Which flower structure receives pollen?", "Stigma");
      await expect(session.write(row)).rejects.toMatchObject({ code: "verification_unavailable", evidence: { explanation: "Unverified comparison: semantic-network-or-timeout" } });
      expect(session.corpus().rows.some(existing => existing.id === row.id)).toBe(false);
    } finally { await db.close(); }
  });
});
