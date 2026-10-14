import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createSession: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { rpc: vi.fn() } }));
vi.mock("@/lib/speed-trivia-uniqueness/runtime.cjs", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/speed-trivia-uniqueness/runtime.cjs")>(),
  createSession: mocks.createSession,
}));
describe("hosted admission deadline", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.stubEnv("SPEED_TRIVIA_MAX_DOLLARS", "0.50"); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("returns a deadline failure even when initial corpus loading has not finished", async () => {
    let finish!: () => void;
    const refresh = new Promise<void>(resolve => { finish = resolve; });
    mocks.createSession.mockImplementation(async ({ budget }) => ({ budget, refresh: () => refresh, index: () => null }));
    const { openSpeedTriviaAdmission } = await import("@/lib/speedTriviaAdmission");
    const opening = openSpeedTriviaAdmission({ elapsedMs: 100 });
    const rejected = expect(opening).rejects.toMatchObject({ code: "budget_exhausted" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(mocks.createSession.mock.calls[0][0].budget.summary().ceiling).toMatchObject({ dollars: 0.50, elapsedMs: 100 });
    finish();
    await vi.advanceTimersByTimeAsync(0);
  });
  it("counts time spent waiting behind another request and never starts expired queued work", async () => {
    let finish!: () => void;
    const refresh = new Promise<void>(resolve => { finish = resolve; });
    mocks.createSession.mockResolvedValue({ refresh: () => refresh, index: () => null });
    const { openSpeedTriviaAdmission } = await import("@/lib/speedTriviaAdmission");
    const first = openSpeedTriviaAdmission();
    await vi.advanceTimersByTimeAsync(0);
    const second = openSpeedTriviaAdmission({ elapsedMs: 100 });
    const rejected = expect(second).rejects.toMatchObject({ code: "budget_exhausted" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    finish();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });
  it("returns on time when an individual write is still waiting", async () => {
    let finish!: () => void;
    const writing = new Promise<void>(resolve => { finish = resolve; });
    mocks.createSession.mockImplementation(async ({ budget }) => ({ budget, refresh: async () => {}, index: () => null, write: () => writing }));
    const { openSpeedTriviaAdmission } = await import("@/lib/speedTriviaAdmission");
    const gate = await openSpeedTriviaAdmission({ elapsedMs: 100 });
    const result = gate.write({ status: "active" });
    const rejected = expect(result).rejects.toMatchObject({ code: "budget_exhausted" });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.createSession).toHaveBeenCalledTimes(2);
  });
  it("exposes the latest write index for exact approved-match details without loading the bank again", async () => {
    const initial = { byId: new Map() }, latest = { byId: new Map([["keeper", { row: { id: "keeper", status: "active" } }]]) };
    const opening = { refresh: async () => {}, index: () => initial, corpus: () => ({ revision: "1" }) };
    const fresh = { write: async () => { throw Object.assign(new Error("Repeat"), { code: "duplicate" }); }, index: () => latest, corpus: () => ({ revision: "2" }) };
    mocks.createSession.mockImplementationOnce(async ({ budget }) => ({ ...opening, budget })).mockResolvedValueOnce(fresh);
    const { openSpeedTriviaAdmission } = await import("@/lib/speedTriviaAdmission");
    const gate = await openSpeedTriviaAdmission({ elapsedMs: 100 });
    await expect(gate.write({ status: "active" })).rejects.toMatchObject({ code: "duplicate" });
    expect(gate.index()).toBe(latest); expect(gate.corpus()).toEqual({ revision: "2" }); expect(mocks.createSession.mock.calls[1][0].budget).toBe(gate.budget);
  });
  it("never starts cancelled work waiting behind another request", async () => {
    let finish!: () => void;
    const refresh = new Promise<void>(resolve => { finish = resolve; });
    mocks.createSession.mockResolvedValue({ refresh: () => refresh, index: () => null });
    const { openSpeedTriviaAdmission } = await import("@/lib/speedTriviaAdmission");
    const first = openSpeedTriviaAdmission(); await vi.advanceTimersByTimeAsync(0);
    const controller = new AbortController();
    const second = openSpeedTriviaAdmission({ elapsedMs: 100, signal: controller.signal });
    const rejected = expect(second).rejects.toMatchObject({ code: "cancelled" }); controller.abort(); await rejected;
    finish(); await first; await vi.advanceTimersByTimeAsync(0); expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });

});
