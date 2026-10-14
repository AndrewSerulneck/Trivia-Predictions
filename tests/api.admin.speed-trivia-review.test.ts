import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), find: vi.fn(), write: vi.fn(), approve: vi.fn(), open: vi.fn(), replace: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: async () => ({ ok: true }) }));
vi.mock("@/lib/liveShowdownAdmin", () => ({ replaceSessionQuestion: mocks.replace }));
vi.mock("@/lib/speedTriviaAdmission", () => ({ findTriviaAdmissionRow: mocks.find, writeSpeedTrivia: mocks.write, approveSpeedTrivia: mocks.approve, openSpeedTriviaAdmission: mocks.open, speedTriviaError: (e: { code?: string }) => ({ status: e.code === "duplicate" || e.code === "retired" ? 409 : 503, code: e.code, conflicts: [] }) }));
import { POST } from "@/app/api/admin/trivia/questions/route";
import { PATCH, DELETE } from "@/app/api/admin/trivia/questions/[id]/route";
const row = { id: "10000000-0000-4000-8000-000000000001", slug: "fixture", status: "pending_review", question_pool: "anytime_blitz", answer_format: "multiple_choice", question: "Fixture question?", options: ["A", "B", "C", "D"], correct_answer: 0, category: "Science" };
const request = (method: string, body: unknown) => new Request("https://example.invalid/api/admin/trivia/questions", { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const params = { params: Promise.resolve({ id: row.id }) };
describe("admin review admission behavior", () => {
 beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue(row); mocks.open.mockResolvedValue({ budget: { assertTime: vi.fn() } }); mocks.write.mockResolvedValue(row); mocks.approve.mockResolvedValue(row); });
 it("approves every Speed item through one session and returns precise repeat rejection", async () => {
  const rows = [row, { ...row, id: "10000000-0000-4000-8000-000000000002" }];
  mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: rows, error: null }) }) });
  mocks.approve.mockResolvedValueOnce({ ...row, status: "active" }).mockRejectedValueOnce(Object.assign(new Error("This tests a fact already used. Existing question: Fixture question?"), { code: "duplicate" }));
  const response = await POST(request("POST", { action: "approve", ids: rows.map(r => r.id) }));
  expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ code: "duplicate", updated: 1, savedIds: [row.id], error: "This tests a fact already used. Existing question: Fixture question?" });
  expect(mocks.open).toHaveBeenCalledTimes(1); expect(mocks.approve).toHaveBeenCalledTimes(2); expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.from).toHaveBeenCalledTimes(1);
  expect(mocks.approve).toHaveBeenCalledWith(row, expect.objectContaining({ budget: expect.any(Object) }));
  expect(mocks.open.mock.calls[0][0].elapsedMs).toBeLessThanOrEqual(240_000);
 });
 it("rejects retired Speed approvals and never runs raw activation", async () => {
  mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: [{ ...row, status: "deleted" }], error: null }) }) });
  mocks.approve.mockRejectedValue(Object.assign(new Error("Retired question"), { code: "retired" }));
  expect((await POST(request("POST", { action: "approve", ids: [row.id] }))).status).toBe(409);
  expect(mocks.from).toHaveBeenCalledTimes(1);
 });
 it("partial-bulk preserves three committed IDs when the fourth checker fails", async () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({ ...row, id: `fixture-${index}` }));
  mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: rows, error: null }) }) });
  for (const saved of rows.slice(0, 3)) mocks.approve.mockResolvedValueOnce({ ...saved, status: "active" });
  mocks.approve.mockRejectedValueOnce(Object.assign(new Error("Question checks are unavailable for this item."), { code: "verification_unavailable" }));
  const response = await POST(request("POST", { action: "approve", ids: rows.map(item => item.id) }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ updated: 3, savedIds: rows.slice(0, 3).map(item => item.id), notProcessed: rows.slice(3).map(item => item.id), repeats: [], holds: [] });
  expect(mocks.approve).toHaveBeenCalledTimes(4);
 });
 it("stops a 200-item batch at the application deadline and returns saved IDs as JSON", async () => {
  const rows = Array.from({ length: 200 }, (_, index) => ({ ...row, id: `fixture-${index}` }));
  let checked = 0;
  const assertTime = () => { if (checked >= 3) throw Object.assign(new Error("Run time budget exhausted."), { code: "budget_exhausted" }); };
  mocks.open.mockResolvedValue({ budget: { assertTime } });
  mocks.approve.mockImplementation(async () => { checked++; return row; });
  mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: rows, error: null }) }) });
  const response = await POST(request("POST", { action: "approve", ids: rows.map(item => item.id) }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ code: "budget_exhausted", savedIds: rows.slice(0, 3).map(item => item.id), notProcessed: rows.slice(3).map(item => item.id), error: expect.stringContaining("Saved approvals are kept") });
  expect(mocks.approve).toHaveBeenCalledTimes(3);
  expect(mocks.open).toHaveBeenCalledTimes(1);
 });
 it("does not rerun paid checking for already-approved selections", async () => {
  mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: [{ ...row, status: "active" }], error: null }) }) });
  const response = await POST(request("POST", { action: "approve", ids: [row.id] }));
  expect(await response.json()).toMatchObject({ ok: true, savedIds: [row.id] });
  expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.approve).not.toHaveBeenCalled();
 });
 it("recovery reads only selected statuses and cannot approve, delete or spend", async () => {
  const statusRead = { abortSignal: vi.fn().mockResolvedValue({ data: [{ id: row.id, status: "active" }], error: null }) };
  const select = vi.fn(() => ({ in: vi.fn(() => statusRead) }));
  mocks.from.mockReturnValue({ select });
  const response = await POST(request("POST", { action: "status", ids: [row.id] }));
  expect(await response.json()).toEqual({ ok: true, items: [{ id: row.id, status: "active" }] });
  expect(select).toHaveBeenCalledWith("id,status"); expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.approve).not.toHaveBeenCalled();
  expect((await POST(request("POST", { action: "status", ids: Array.from({ length: 201 }, (_, i) => String(i)) }))).status).toBe(400);
 });
 it("checks final edited Speed content and refuses write-in answer conversion", async () => {
  const edited = await PATCH(request("PATCH", { question: "Edited question?", options: row.options, correctAnswer: 2 }), params);
  expect(edited.status).toBe(200); expect(mocks.write).toHaveBeenCalledWith({ question: "Edited question?", options: row.options, correct_answer: 2 }, row);
  expect(mocks.from).not.toHaveBeenCalled();
  const refused = await PATCH(request("PATCH", { answer: "Single write-in answer" }), params);
  expect(refused.status).toBe(400); expect(mocks.write).toHaveBeenCalledTimes(1);
 });
 it("keeps Speed deletion out of Live replacement helpers", async () => {
  const query = { eq: vi.fn(), select: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() };
  query.eq.mockReturnValue(query); query.select.mockReturnValue(query); query.limit.mockReturnValue(query); query.maybeSingle.mockResolvedValue({ data: row, error: null });
  mocks.from.mockReturnValue({ update: () => query });
  expect((await DELETE(request("DELETE", {}), params)).status).toBe(200);
  expect(mocks.replace).not.toHaveBeenCalled(); expect(mocks.from).toHaveBeenCalledTimes(1);
 });
 it("preserves Live PATCH behavior without requiring Speed verification", async () => {
  mocks.find.mockResolvedValue({ ...row, question_pool: "live_showdown", answer_format: "write_in" });
  const query = { eq: vi.fn(), select: vi.fn(), limit: vi.fn(), maybeSingle: vi.fn() };
  query.eq.mockReturnValue(query); query.select.mockReturnValue(query); query.limit.mockReturnValue(query); query.maybeSingle.mockResolvedValue({ data: { ...row, question_pool: "live_showdown" }, error: null });
  const update = vi.fn(() => query); mocks.from.mockReturnValue({ update });
  expect((await PATCH(request("PATCH", { answer: "Canonical answer", acceptableAnswers: ["Alias"] }), params)).status).toBe(200);
  expect(update).toHaveBeenCalledWith({ options: ["Canonical answer", "Alias"], correct_answer: 0 }); expect(mocks.write).not.toHaveBeenCalled(); expect(mocks.open).not.toHaveBeenCalled();
 });
});
