// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SpeedTriviaQuickReview } from "@/components/admin/sections/SpeedTriviaQuickReview";

// Quick Review keyboard flow against a fake in-memory server (no network, no database).
type Row = { id: string; question: string; options: string[]; correctAnswer: number; category: string; difficulty: string; createdAt: string; recent: boolean; contentHash: string; audience?: { score: number; familiar: number; fun: number; estCorrect: number; flags: string[] } | null };
const row = (n: number, recent = false): Row => ({ id: `id-${n}`, question: `Question ${n}?`, options: [`Right ${n}`, "B", "C", "D"], correctAnswer: 0, category: "Science", difficulty: "easy", createdAt: `2026-07-0${n}T00:00:00Z`, recent, contentHash: `hash-${n}` });

let waiting: Row[];
let decided: Map<string, Row>;
const posts: Record<string, unknown>[] = [];
const gets: string[] = [];
const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const fakeFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!init?.method || init.method === "GET") {
    gets.push(url);
    return respond({ ok: true, total: waiting.length, items: waiting.slice(0, 50) });
  }
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  posts.push(body);
  const take = (rowId: string) => {
    const found = waiting.find((r) => r.id === rowId)!;
    waiting = waiting.filter((r) => r.id !== rowId);
    decided.set(rowId, found);
    return found;
  };
  if (url.endsWith("/quick-review") && body.action === "keep") {
    const rows = body.rows as { id: string }[];
    return respond({ ok: true, rows: rows.map((r) => ({ id: r.id, outcome: take(r.id).recent ? "approved" : "queued" })) });
  }
  if (body.action === "reject") {
    const ids = body.ids as string[];
    ids.forEach(take);
    return respond({ ok: true, rejected: ids });
  }
  if (body.action === "undo") {
    const back = decided.get(body.id as string)!;
    decided.delete(back.id);
    waiting = [back, ...waiting].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return respond({ ok: true, id: back.id, status: "pending_review" });
  }
  if (body.action === "bulk") {
    const batch = waiting.slice(0, Math.min(2, Number(body.max)));
    batch.forEach((r) => take(r.id));
    return respond({ ok: true, processed: batch.length, approved: 0, queued: 0, rejected: batch.length, remaining: waiting.length });
  }
  return respond({ ok: false, error: "unexpected" }, 400);
});

const press = (key: string) => fireEvent.keyDown(window, { key });

beforeEach(() => {
  waiting = [row(1, true), row(2), row(3), row(4)];
  decided = new Map();
  posts.length = 0;
  gets.length = 0;
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Speed Trivia Quick Review", () => {
  it("keeps, rejects, skips and undoes from the keyboard", async () => {
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    expect(screen.getByText("4 left")).toBeTruthy();
    expect(screen.getByText("✓ Right 1")).toBeTruthy();

    press("ArrowRight");
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    expect(screen.getByText("Approved.")).toBeTruthy();
    expect(posts[0]).toEqual({ action: "keep", rows: [{ id: "id-1", contentHash: "hash-1" }] });

    press("ArrowLeft");
    expect(await screen.findByText("Question 3?")).toBeTruthy();
    expect(posts[1]).toEqual({ action: "reject", ids: ["id-2"], reason: "quality" });
    expect(screen.getByText("2 left")).toBeTruthy();

    press("s");
    expect(await screen.findByText("Question 4?")).toBeTruthy();
    expect(posts).toHaveLength(2);
    expect(screen.getByText("2 left")).toBeTruthy();

    press("w");
    expect(await screen.findByText("Nothing left.")).toBeTruthy();
    expect(posts[2]).toEqual({ action: "reject", ids: ["id-4"], reason: "wrong" });

    press("z");
    expect(await screen.findByText("Question 4?")).toBeTruthy();
    expect(posts[3]).toEqual({ action: "undo", id: "id-4" });
    // Undoing a skip makes no request.
    press("z");
    expect(await screen.findByText("Question 3?")).toBeTruthy();
    expect(posts).toHaveLength(4);
  });

  it("ignores shortcuts while editing and while typing in a field", async () => {
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    fireEvent.keyDown(screen.getByLabelText("Category"), { key: "ArrowRight" });
    press("e");
    expect(await screen.findByLabelText("Question")).toBeTruthy();
    press("ArrowLeft");
    press("ArrowRight");
    expect(posts).toHaveLength(0);
  });

  it("bulk-rejects the whole filter after confirming the count", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    fireEvent.click(screen.getByText("Reject all shown (4)"));
    expect(await screen.findByText("Rejected 4.")).toBeTruthy();
    expect(confirm).toHaveBeenCalledWith("Reject 4 questions?");
    expect(posts.map((p) => p.max)).toEqual([4, 2]);
    expect(posts.every((p) => p.action === "bulk" && p.decision === "reject" && p.source === "all")).toBe(true);
    expect(await screen.findByText("Nothing left.")).toBeTruthy();
  });

  it("does nothing when the bulk confirm is cancelled", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    fireEvent.click(screen.getByText("Keep all shown (4)"));
    await waitFor(() => expect(posts).toHaveLength(0));
    expect(screen.getByText("Question 1?")).toBeTruthy();
  });

  it("shows the bar-test score and flags, and sends the score filter to reads and bulk", async () => {
    waiting[0] = { ...waiting[0], audience: { score: 2, familiar: 2, fun: 3, estCorrect: 30, flags: ["niche-subject", "too-long"] } };
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText(/Score 2/)).toBeTruthy();
    expect(screen.getByTestId("quick-review-flags").textContent).toBe("Niche · Long");
    // Best score first is the default sort.
    expect(new URL(gets[0], "https://x.invalid").searchParams.get("sort")).toBe("best");

    fireEvent.change(screen.getByLabelText("Score"), { target: { value: "1" } });
    await waitFor(() => expect(new URL(gets[gets.length - 1], "https://x.invalid").searchParams.get("score")).toBe("1"));
    await screen.findByText("Question 1?");
    fireEvent.click(screen.getByText("Reject all shown (4)"));
    expect(await screen.findByText("Rejected 4.")).toBeTruthy();
    expect(posts.every((p) => p.score === "1")).toBe(true);
  });
});
