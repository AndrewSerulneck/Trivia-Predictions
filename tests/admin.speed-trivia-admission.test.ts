import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), write: vi.fn(), leave: vi.fn(), find: vi.fn(), open: vi.fn(), fileWrite: vi.fn() }));
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("@/lib/speedTriviaAdmission", () => ({ writeSpeedTrivia: mocks.write, convertSpeedTriviaToLive: mocks.leave, findTriviaAdmissionRow: mocks.find, openSpeedTriviaAdmission: mocks.open }));
vi.mock("fs", () => ({ readFileSync: vi.fn(), readdirSync: vi.fn(), writeFileSync: mocks.fileWrite }));
vi.mock("@/lib/polymarket", () => ({ getPredictionMarketById: vi.fn(), listResolvedPredictionOutcomes: vi.fn() }));
import { createAdminTriviaQuestion, updateAdminTriviaQuestion, updateAdminSpeedTriviaQuestionInFile, bulkUpdateAdminTriviaQuestions, deleteAdminTriviaQuestion } from "@/lib/admin";
const stored = { id: "10000000-0000-4000-8000-000000000001", slug: "fixture", question: "Which author wrote the fixture?", options: ["Writer", "A", "B", "C"], correct_answer: 0, category: "Literature", difficulty: "medium", question_pool: "anytime_blitz", answer_format: "multiple_choice", status: "active", created_at: "2026-10-13" };
describe("canonical admin Speed writers", () => {
 beforeEach(() => { vi.clearAllMocks(); mocks.find.mockResolvedValue(stored); mocks.open.mockResolvedValue({}); mocks.write.mockResolvedValue(stored); });
 it("creates through admission as pending and performs no raw insert", async () => {
  await createAdminTriviaQuestion({ question: stored.question, options: stored.options, correctAnswer: 0, questionPool: "anytime_blitz", answerFormat: "multiple_choice" });
  expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ status: "pending_review", question_pool: "anytime_blitz" })); expect(mocks.from).not.toHaveBeenCalled();
 });
 it("passes current row into edit checks and does not save on rejection", async () => {
  mocks.write.mockRejectedValue(new Error("Repeated fact"));
  await expect(updateAdminTriviaQuestion({ id: stored.id, question: "Rephrased fact?", options: stored.options, correctAnswer: 0, questionPool: "anytime_blitz", answerFormat: "multiple_choice" })).rejects.toThrow("Repeated fact");
  expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ question: "Rephrased fact?" }), stored); expect(mocks.from).not.toHaveBeenCalled();
 });
 it("never falls back to export-file writes after a rejected Speed edit", async () => {
  mocks.write.mockRejectedValue(new Error("Repeated fact"));
  await expect(updateAdminSpeedTriviaQuestionInFile({ slug: stored.slug, question: stored.question, options: stored.options, correctAnswer: 0 })).rejects.toThrow("Repeated fact");
  expect(mocks.fileWrite).not.toHaveBeenCalled();
 });
 it("uses one session for a conversion batch and checks every row", async () => {
  const rows = [{ ...stored, question_pool: "live_showdown" }, { ...stored, id: "10000000-0000-4000-8000-000000000002", question_pool: "live_showdown" }];
  mocks.from.mockReturnValue({ select: () => ({ in: async () => ({ data: rows, error: null }) }) });
  const session = {}; mocks.open.mockResolvedValue(session);
  await bulkUpdateAdminTriviaQuestions({ ids: rows.map(r => r.id), questionPool: "anytime_blitz", answerFormat: "multiple_choice" });
  expect(mocks.open).toHaveBeenCalledTimes(1); expect(mocks.write).toHaveBeenCalledTimes(2);
  for (const row of rows) expect(mocks.write).toHaveBeenCalledWith({ question_pool: "anytime_blitz", answer_format: "multiple_choice" }, row, session);
 });
 it("soft-deletes Speed through generic deletion without removing references", async () => {
  const update = vi.fn(() => ({ eq: async () => ({ error: null }) })); mocks.from.mockReturnValue({ update });
  await deleteAdminTriviaQuestion(stored.id);
  expect(update).toHaveBeenCalledWith({ status: "deleted" }); expect(mocks.from).toHaveBeenCalledTimes(1); expect(mocks.from).toHaveBeenCalledWith("trivia_questions");
 });
 it("uses an explicit signed departure for Speed-to-Live conversions", async () => {
  mocks.leave.mockResolvedValue({ ...stored, question_pool: "live_showdown", answer_format: "write_in" });
  await updateAdminTriviaQuestion({ id: stored.id, question: stored.question, options: ["Writer"], correctAnswer: 0, questionPool: "live_showdown", answerFormat: "write_in" });
  expect(mocks.leave).toHaveBeenCalledWith(expect.objectContaining({ question_pool: "live_showdown", answer_format: "write_in" }), stored); expect(mocks.from).not.toHaveBeenCalled();
 });
});
