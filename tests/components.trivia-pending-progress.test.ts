// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TriviaPendingReviewSection } from "@/components/admin/sections/TriviaPendingReviewSection";
import { REVIEW_STREAM_TYPE } from "@/lib/triviaReviewTransport";
import type { TriviaReviewRecord } from "@/types/triviaReview";
vi.mock("@/components/admin/AdminShell", () => ({ PaginationBar: ({ onPageChange }: { onPageChange: (page: number) => void }) => createElement("button", { onClick: () => onPageChange(2) }, "Next page") }));
const items = ["a", "b", "c", "d", "e"].map(id => ({ id, question: `Pending ${id}?`, options: ["A", "B", "C", "D"], correctAnswer: 0, answer: "A", category: "Science", pool: "anytime_blitz", status: "pending_review", createdAt: "2026-10-14" }));
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
let streamController: ReadableStreamDefaultController<Uint8Array>;
let request: ReturnType<typeof vi.fn<typeof fetch>>;
const send = (record: TriviaReviewRecord) => streamController.enqueue(new TextEncoder().encode(JSON.stringify(record) + "\n"));
const ready = async () => {
  render(createElement(TriviaPendingReviewSection));
  await waitFor(() => expect(screen.getByRole("button", { name: /Speed Trivia Pending/ }).closest("fieldset")?.disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: /Speed Trivia Pending/ }));
  await screen.findByText("Pending a?"); await waitFor(() => expect(screen.getByRole("button", { name: /Approve Selected/ }).closest("fieldset")?.disabled).toBe(false));
  fireEvent.click(screen.getByLabelText("Select all")); fireEvent.click(screen.getByRole("button", { name: /Approve Selected/ }));
  await waitFor(() => expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
  await act(async () => send({ type: "start", version: 1, mode: "review", total: 5 }));
};
const outcomes = async () => {
  await act(async () => {
    send({ type: "row", result: { id: "a", outcome: "approved" }, counts: { checked: 1, approved: 1, repeats: 0, unresolved: 0, remaining: 4 } });
    send({ type: "row", result: { id: "b", outcome: "repeat", reason: "Same orbit fact", matches: [{ id: "keeper", question: "Approved orbit question?", answer: "Gravity" }] }, counts: { checked: 2, approved: 1, repeats: 1, unresolved: 0, remaining: 3 } });
    send({ type: "row", result: { id: "c", outcome: "unresolved", reason: "Premise uncertain" }, counts: { checked: 3, approved: 1, repeats: 1, unresolved: 1, remaining: 2 } });
  });
};
describe("manual review progress and selection", () => {
  beforeEach(() => {
    request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (body.action === "status") return json({ ok: true, items: items.map(item => ({ id: item.id, status: item.id === "a" ? "active" : "pending_review" })) });
        if (body.action === "delete") return json({ ok: true, savedIds: body.ids });
        return new Response(new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } }), { headers: { "Content-Type": REVIEW_STREAM_TYPE } });
      }
      return json({ ok: true, items, total: 500, limit: 200 });
    }); vi.stubGlobal("fetch", request);
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("shows the current question and exact row results before completion, locking all changing controls", async () => {
    await ready();
    await act(async () => send({ type: "checking", id: "a", question: "Pending a?" }));
    expect(screen.getByRole("status").textContent).toContain("Checking: Pending a?");
    const fieldset = screen.getByRole("button", { name: /Working/ }).closest("fieldset"); expect(fieldset?.disabled).toBe(true);
    for (const element of [screen.getByLabelText("Select all"), ...screen.getAllByRole("combobox"), screen.getByRole("button", { name: "Next page" }), screen.getByRole("button", { name: /Add To Live/ }), ...screen.getAllByRole("button", { name: "Edit question" })]) expect(element.closest("fieldset")).toBe(fieldset);
    const before = request.mock.calls.length; fireEvent.click(screen.getByRole("button", { name: "Next page" })); expect(request).toHaveBeenCalledTimes(before);
    await outcomes(); expect(screen.queryByText("Pending a?")).toBeNull();
    expect(within(screen.getByTestId("review-result-b")).getByText("Confirmed repeat")).toBeTruthy();
    expect(screen.getByTestId("review-result-b").textContent).toContain("Approved orbit question? · Answer: Gravity");
    expect(screen.getByTestId("review-result-c").textContent).toContain("Unresolved");
    expect(screen.getByRole("status").textContent).toContain("Checked: 3 · Approved: 1 · Repeats: 1 · Unresolved: 1 · Remaining: 2");
    await act(async () => { send({ type: "complete", result: { ok: true, savedIds: ["a"] } }); streamController.close(); });
  });
  it("selects only unchecked rows after a pause, allows explicit Continue and selects only repeats for deletion", async () => {
    await ready(); await outcomes();
    await act(async () => { send({ type: "complete", result: { ok: true, paused: true, code: "budget_exhausted", needsRecovery: true, savedIds: ["a"] } }); streamController.close(); });
    await screen.findByRole("button", { name: "Continue (2)" });
    expect((screen.getByLabelText("Select question b") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Select question c") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Select question d") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Select question e") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/Each Continue click has its own \$0.50 cap/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue (2)" }));
    await waitFor(() => expect(request.mock.calls.filter(([, init]) => init?.method === "POST" && JSON.parse(String(init.body)).action === "approve")).toHaveLength(2));
    const approvals = request.mock.calls.filter(([, init]) => init?.method === "POST" && JSON.parse(String(init.body)).action === "approve");
    expect(JSON.parse(String(approvals[1][1]?.body)).ids).toEqual(["d", "e"]);
    await act(async () => { send({ type: "start", version: 1, mode: "review", total: 2 }); send({ type: "complete", result: { ok: true, savedIds: [] } }); streamController.close(); });
    await waitFor(() => expect(screen.getByRole("button", { name: /Approve Selected/ }).closest("fieldset")?.disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Select Confirmed Repeats" }));
    expect((screen.getByLabelText("Select question b") as HTMLInputElement).checked).toBe(true);
    for (const id of ["c", "d", "e"]) expect((screen.getByLabelText(`Select question ${id}`) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete Selected (1)" }));
    await waitFor(() => expect(screen.queryByText("Pending b?")).toBeNull());
  });
  it("retains received repeat labels on a lost acknowledgement and requires refresh before more approval", async () => {
    await ready(); await outcomes(); await act(async () => streamController.close());
    await screen.findByText(/connection stopped/); expect(screen.getByTestId("review-result-b").textContent).toContain("Confirmed repeat");
    expect((screen.getByRole("button", { name: /Approve Selected/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Refresh Review" }));
    await waitFor(() => expect(screen.queryByTestId("review-result-b")).toBeNull());
  });
  it("clears obsolete labels when editing or reloading rows", async () => {
    await ready(); await outcomes(); await act(async () => { send({ type: "complete", result: { ok: true, savedIds: ["a"] } }); streamController.close(); });
    await waitFor(() => expect(screen.getByRole("button", { name: /Approve Selected/ }).closest("fieldset")?.disabled).toBe(false));
    const repeatRow = screen.getByTestId("review-result-b").closest("tr")!; fireEvent.click(within(repeatRow).getByRole("button", { name: "Edit question" }));
    expect(screen.queryByTestId("review-result-b")).toBeNull(); expect(screen.getByTestId("review-result-c")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.queryByTestId("review-result-c")).toBeNull());
  });
});
