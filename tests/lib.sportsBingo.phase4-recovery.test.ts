import { describe, expect, it } from "vitest";
import { planBingoSettlement, previewBingoCorrection, BINGO_FINAL_DATA_GRACE_MS, BINGO_NO_FINAL_DEADLINE_MS, type BingoGradingState } from "@/lib/sportsBingoSettlement";
const now = Date.parse("2026-09-10T03:40:00Z");
const startsAt = "2026-09-10T00:20:00Z";
describe("bounded final-data recovery", () => {
  it("requires a second final observation at least one minute later", () => {
    const input = { now, startsAt, completed: true, state: {}, evaluations: [{ index: 0, status: "hit" as const, resolved: true }] };
    const first = planBingoSettlement(input); expect(first.maySettle).toBe(false);
    expect(planBingoSettlement({ ...input, state: first.state, now: now + 59_999 }).maySettle).toBe(false);
    expect(planBingoSettlement({ ...input, state: first.state, now: now + 60_000 }).maySettle).toBe(true);
  });
  it("partial final remains pending then converges on complete evidence", () => {
    const first = planBingoSettlement({ now, startsAt, completed: true, state: {}, evaluations: [{ index: 17, status: "void", resolved: true, reason: "participation_or_player_row_missing" }] });
    expect(first.statuses[0].status).toBe("pending"); expect(first.maySettle).toBe(false);
    const recovered = planBingoSettlement({ now: now + 61_000, startsAt, completed: true, state: first.state, evaluations: [{ index: 17, status: "hit", resolved: true }] });
    expect(recovered.statuses[0].status).toBe("hit"); expect(recovered.maySettle).toBe(true); expect(recovered.state.reasons).toEqual({});
  });
  it("expires missing final evidence exactly at two hours with a persisted reason", () => {
    const state: BingoGradingState = { firstFinalAt: new Date(now).toISOString() };
    const input = { startsAt, completed: true, state, evaluations: [{ index: 17, status: "void" as const, resolved: true, reason: "player_stats_incomplete" }] };
    const pending = planBingoSettlement({ ...input, now: now + BINGO_FINAL_DATA_GRACE_MS - 1 });
    expect(pending.maySettle).toBe(false); expect(pending.statuses[0].status).toBe("pending");
    const expired = planBingoSettlement({ ...input, now: now + BINGO_FINAL_DATA_GRACE_MS });
    expect(expired.maySettle).toBe(true); expect(expired.statuses[0].status).toBe("void"); expect(expired.state.reasons?.["17"]).toBe("grace_expired:player_stats_incomplete");
  });
  it("a feed outage cannot lose a card at six or twelve hours; no-final deadline is 48 hours", () => {
    const input = { startsAt, completed: false, state: {}, evaluations: [{ index: 0, status: "pending" as const, resolved: false, reason: "game_feed_missing" }] };
    for (const hours of [6, 12, 47]) expect(planBingoSettlement({ ...input, now: Date.parse(startsAt) + hours * 3_600_000 }).maySettle).toBe(false);
    const expired = planBingoSettlement({ ...input, now: Date.parse(startsAt) + BINGO_NO_FINAL_DEADLINE_MS }); expect(expired.statuses[0].status).toBe("void"); expect(expired.maySettle).toBe(true);
  });
  it("a provisional hit can become a final miss, and terminal repair previews do not mutate rows", () => {
    const before = [{ index: 1, status: "hit" }, { index: 2, status: "miss" }];
    const after = [{ index: 1, status: "miss" }, { index: 2, status: "hit" }];
    const copy = structuredClone(before);
    expect(previewBingoCorrection(before, after)).toEqual([{ index: 1, before: "hit", after: "miss" }, { index: 2, before: "miss", after: "hit" }]);
    expect(before).toEqual(copy); expect(previewBingoCorrection(after, after)).toEqual([]);
  });
  it("restarts confirmation after the provider retracts its final signal", () => {
    const input = { startsAt, evaluations: [{ index: 0, status: "hit" as const, resolved: true }] };
    const first = planBingoSettlement({ ...input, now, completed: true, state: {} });
    const retracted = planBingoSettlement({ ...input, now: now + 61_000, completed: false, state: first.state });
    expect(retracted.state.firstFinalAt).toBeUndefined(); expect(retracted.maySettle).toBe(false);
    expect(planBingoSettlement({ ...input, now: now + 120_000, completed: true, state: retracted.state }).maySettle).toBe(false);
  });
});
