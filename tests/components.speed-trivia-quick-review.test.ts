// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SpeedTriviaQuickReview } from "@/components/admin/sections/SpeedTriviaQuickReview";

// Quick Review keyboard flow against a fake in-memory server (no network, no database).
type Row = { id: string; question: string; options: string[]; correctAnswer: number; category: string; difficulty: string; createdAt: string; recent: boolean; contentHash: string; audience?: { score: number; familiar: number; fun: number; estCorrect: number; flags: string[] } | null };
const row = (n: number, recent = false): Row => ({ id: `id-${n}`, question: `Question ${n}?`, options: [`Right ${n}`, "B", "C", "D"], correctAnswer: 0, category: "Science", difficulty: "easy", createdAt: `2026-07-0${n}T00:00:00Z`, recent, contentHash: `hash-${n}` });

let waiting: Row[];
let looking: (Row & { note: string })[];
let decided: Map<string, { row: Row; from: "waiting" | "needs_look" }>;
// Where the fake server says an undone question went; null = back where it came from.
let undoView: "waiting" | "needs_look" | null;
let queuedCount = 0;
// Phase 4a.1: rows whose subject is at the star cap; Keep leaves them waiting.
let full: Set<string>;
// Post-4c.4 review #7: rows another writer keeps changing under a bulk Keep.
let changedIds: Set<string>;
let repeated: (Row & { note?: string; match?: { id: string; question: string; answer: string } })[];
// Phase 4b: "Writer stopped" after two Gemini fallback days in a row.
let writerStopped = false;
const posts: Record<string, unknown>[] = [];
// Phase 4e: Make Live requests ([method, questionId]); liveRefusal makes the queue call fail with that message.
const liveCalls: [string, unknown][] = [];
let liveRefusal: string | null = null;
let liveSent: Set<string>;
let liveQueued: Set<string>; // questions with an earlier, separate Make Live request (the POST answers already: true)
const gets: string[] = [];
const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const fakeFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!init?.method || init.method === "GET") {
    gets.push(url);
    const counts = { queued: queuedCount, needsLook: looking.length, repeats: repeated.length };
    if (url.includes("view=repeats")) return respond({ ok: true, total: repeated.length, items: repeated, counts });
    if (url.includes("view=needs_look")) return respond({ ok: true, total: looking.length, items: looking, counts });
    return respond({ ok: true, total: waiting.length, items: waiting.slice(0, 50), counts, writerStopped });
  }
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  if (url.endsWith("/live-conversions")) {
    liveCalls.push([init.method, body.questionId]);
    if (init.method === "DELETE") return respond({ ok: true, cancelled: !liveSent.has(body.questionId as string) });
    return liveRefusal ? respond({ ok: false, error: liveRefusal }, 409)
      : respond({ ok: true, state: "queued", already: liveQueued.has(body.questionId as string) });
  }
  posts.push(body);
  const take = (rowId: string) => {
    const from = looking.some((r) => r.id === rowId) ? "needs_look" : "waiting";
    const found = [...waiting, ...looking].find((r) => r.id === rowId)!;
    waiting = waiting.filter((r) => r.id !== rowId);
    looking = looking.filter((r) => r.id !== rowId);
    decided.set(rowId, { row: found, from });
    return found;
  };
  if (url.endsWith("/quick-review") && body.action === "keep") {
    const rows = body.rows as { id: string }[];
    return respond({ ok: true, rows: rows.map((r) => ({ id: r.id, outcome: full.has(r.id) ? "subject_full" : take(r.id).recent ? "approved" : "queued" })) });
  }
  if (body.action === "reject") {
    const ids = body.ids as string[];
    ids.forEach(take);
    return respond({ ok: true, rejected: ids });
  }
  if (body.action === "undo" && repeated.some((r) => r.id === body.id)) {
    repeated = repeated.filter((r) => r.id !== body.id);
    return respond({ ok: true, id: body.id, status: "pending_review", view: "waiting" });
  }
  if (body.action === "undo") {
    const { row: back, from } = decided.get(body.id as string)!;
    decided.delete(back.id);
    const view = undoView ?? from;
    if (view === "needs_look") looking = [{ ...back, note: (back as { note?: string }).note ?? "" }, ...looking];
    else waiting = [back, ...waiting].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return respond({ ok: true, id: back.id, status: "pending_review", view });
  }
  if (body.action === "bulk" && body.decision === "keep") {
    // Keyset paging by created date, like the server: kept rows leave, full ones stay.
    const after = (body.after as { createdAt?: string } | null)?.createdAt ?? "";
    const batch = waiting.filter((r) => r.createdAt > after).slice(0, Math.min(2, Number(body.max)));
    const fullHere = batch.filter((r) => full.has(r.id)).length;
    const changedHere = batch.filter((r) => changedIds.has(r.id));
    batch.filter((r) => !full.has(r.id) && !changedIds.has(r.id)).forEach((r) => take(r.id));
    // Like the server: the cursor sits just before the first changed row.
    const firstChanged = batch.findIndex((r) => changedIds.has(r.id));
    const last = firstChanged < 0 ? batch[batch.length - 1] : firstChanged > 0 ? batch[firstChanged - 1] : null;
    const next = last ? { createdAt: last.createdAt, id: last.id } : firstChanged === 0 ? body.after ?? null : null;
    return respond({ ok: true, processed: batch.length - changedHere.length, approved: batch.length - fullHere - changedHere.length, queued: 0,
      full: fullHere, rejected: 0, changed: changedHere.length, remaining: waiting.length - fullHere, next });
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
  looking = [{ ...row(7), note: "Accuracy unclear." }];
  undoView = null;
  queuedCount = 0;
  full = new Set();
  changedIds = new Set();
  repeated = [{ ...row(9), note: "Same fact.", match: { id: "id-50", question: "Approved question?", answer: "Right 9" } }];
  decided = new Map();
  writerStopped = false;
  posts.length = 0;
  gets.length = 0;
  liveCalls.length = 0;
  liveRefusal = null;
  liveSent = new Set();
  liveQueued = new Set();
  fakeFetch.mockClear();
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Speed Trivia Quick Review", () => {
  it("shows the overnight repeats with their match and restores one", async () => {
    queuedCount = 2;
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("4 left · 2 queued")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "repeats" } });
    expect(await screen.findByText("Question 9?")).toBeTruthy();
    expect(screen.getByTestId("quick-review-match").textContent).toBe("Repeats: Approved question? (Right 9)");
    expect(screen.queryByText(/Reject all shown/)).toBeNull();
    expect(screen.queryByText("Keep →")).toBeNull();
    // Arrow keys do nothing here; only Restore changes a repeat.
    press("ArrowLeft");
    expect(posts).toHaveLength(0);
    fireEvent.click(screen.getByText("Restore"));
    expect(await screen.findByText("Restored.")).toBeTruthy();
    expect(posts[0]).toEqual({ action: "undo", id: "id-9" });
    expect(screen.getByText("Nothing left.")).toBeTruthy();
  });

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

  it("3c: Undo in Needs a look puts the question back there with its note", async () => {
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "needs_look" } });
    expect(await screen.findByText("Question 7?")).toBeTruthy();
    expect(screen.getByTestId("quick-review-note").textContent).toBe("Accuracy unclear.");

    press("ArrowRight");
    expect(await screen.findByText("Nothing left.")).toBeTruthy();
    expect(screen.getByText("0 left · 1 queued")).toBeTruthy();
    expect(screen.getByText("Needs a look (0)")).toBeTruthy();

    press("z");
    expect(await screen.findByText("Question 7?")).toBeTruthy();
    expect(screen.getByTestId("quick-review-note").textContent).toBe("Accuracy unclear.");
    expect(screen.getByText("1 left")).toBeTruthy();
    expect(screen.getByText("Needs a look (1)")).toBeTruthy();

    press("ArrowLeft");
    expect(await screen.findByText("Nothing left.")).toBeTruthy();
    press("z");
    expect(await screen.findByText("Question 7?")).toBeTruthy();
    expect(screen.getByTestId("quick-review-note").textContent).toBe("Accuracy unclear.");
    expect(posts.map((p) => p.action)).toEqual(["keep", "undo", "reject", "undo"]);
  });

  it("3c: an undone question the server puts back in Waiting leaves Needs a look", async () => {
    undoView = "waiting";
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "needs_look" } });
    expect(await screen.findByText("Question 7?")).toBeTruthy();
    press("ArrowLeft");
    expect(await screen.findByText("Nothing left.")).toBeTruthy();
    press("z");
    expect(await screen.findByText("Undone.")).toBeTruthy();
    expect(screen.queryByText("Question 7?")).toBeNull();
    expect(screen.getByText("Nothing left.")).toBeTruthy();
    expect(screen.getByText("0 left")).toBeTruthy();
    expect(screen.getByText("Needs a look (0)")).toBeTruthy();
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

  it("4a.1: a Keep on a full subject saves nothing, says so and moves on; Keep all shown pages past them", async () => {
    full = new Set(["id-1", "id-3"]);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    press("ArrowRight");
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    expect(screen.getByText("Subject full.")).toBeTruthy();
    expect(screen.getByText("4 left")).toBeTruthy();
    fireEvent.click(screen.getByText("Keep all shown (4)"));
    expect(await screen.findByText("Kept 2. 2 subject full.")).toBeTruthy();
    const bulk = posts.filter((p) => p.action === "bulk");
    expect(bulk.map((p) => (p.after as { id: string } | null)?.id ?? null)).toEqual([null, "id-2"]);
  });

  it("4c.10: a bulk Keep that leaves changed rows says so", async () => {
    changedIds = new Set(["id-4"]);
    vi.stubGlobal("confirm", vi.fn(() => true));
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    fireEvent.click(screen.getByText("Keep all shown (4)"));
    expect(await screen.findByText("Kept 3. Some changed. Run again.")).toBeTruthy();
    const bulk = posts.filter((p) => p.action === "bulk");
    expect(bulk.map((p) => (p.after as { id: string } | null)?.id ?? null)).toEqual([null, "id-2", "id-3"]);
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

describe("Speed Trivia Quick Review: the daily writer (Phase 4b)", () => {
  it("shows ChatGPT, the map cell and the Current Events source; filters by writer", async () => {
    waiting = [{ ...row(1, true), category: "Current Events", source: "chatgpt", area: "Sports", era: "2026-03", sourceUrl: "https://example.com/a" } as Row];
    render(createElement(SpeedTriviaQuickReview));
    const card = await screen.findByTestId("quick-review-card");
    expect(card.textContent).toContain("ChatGPT · Sports · 2026-03");
    const link = screen.getByRole("link", { name: "Source" });
    expect(link.getAttribute("href")).toBe("https://example.com/a");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByText("Writer stopped")).toBeNull();
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "gemini" } });
    await waitFor(() => expect(gets.some((url) => url.includes("source=gemini"))).toBe(true));
    expect(screen.getByRole("option", { name: "ChatGPT" })).toBeTruthy();
  });

  it("shows the writer's note only after Why is pressed, and only when there is one (D30)", async () => {
    waiting = [{ ...row(1, true), source: "chatgpt", whyTrue: "Right 1 is the answer because of a fact." } as Row, row(2)];
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByTestId("quick-review-card");
    expect(screen.queryByTestId("quick-review-why")).toBeNull();
    const why = screen.getByRole("button", { name: "Why" });
    expect(why.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(why);
    expect(screen.getByTestId("quick-review-why").textContent).toBe("Right 1 is the answer because of a fact.");
    expect(why.className).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/);
    fireEvent.click(why);
    expect(screen.queryByTestId("quick-review-why")).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByTestId("quick-review-card").textContent).toContain("Question 2?"));
    expect(screen.queryByRole("button", { name: "Why" })).toBeNull();
  });

  it("says Writer stopped when the server does", async () => {
    writerStopped = true;
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Writer stopped")).toBeTruthy();
  });
});

// Phase 4e (D37): L = Keep, then queue for Live; Undo cancels a still-queued request.
describe("Speed Trivia Quick Review: Keep + Live (L)", () => {
  it("keeps, queues for Live, and Undo cancels the request", async () => {
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    press("l");
    expect(await screen.findByText("Kept. Queued for Live.")).toBeTruthy();
    expect(posts[0]).toMatchObject({ action: "keep", rows: [{ id: "id-1" }] });
    expect(liveCalls).toEqual([["POST", "id-1"]]);
    press("z");
    expect(await screen.findByText("Undone.")).toBeTruthy();
    expect(liveCalls).toEqual([["POST", "id-1"], ["DELETE", "id-1"]]);
    expect(await screen.findByText("Question 1?")).toBeTruthy();
  });

  it("says so when Undo can't cancel a request already sent to the writer", async () => {
    liveSent.add("id-1");
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    fireEvent.click(screen.getByText("Keep + Live (L)"));
    await screen.findByText("Kept. Queued for Live.");
    press("z");
    expect(await screen.findByText("Undone. Still queued for Live.")).toBeTruthy();
  });

  // Phase 7f (second review R2 #27.8): Undo cancels only a request this L created.
  it("leaves an earlier Make Live alone when Undo reverses an L that found it already queued", async () => {
    liveQueued.add("id-1");
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    press("l");
    await screen.findByText("Kept. Queued for Live.");
    press("z");
    expect(await screen.findByText("Undone.")).toBeTruthy();
    expect(liveCalls).toEqual([["POST", "id-1"]]);
  });

  it("still keeps when the Live queue refuses, and shows why", async () => {
    liveRefusal = "Already in Live.";
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    press("l");
    expect(await screen.findByText("Not queued for Live: Already in Live.")).toBeTruthy();
    expect(screen.getByText("Approved.")).toBeTruthy();
    press("z");
    await screen.findByText("Undone.");
    expect(liveCalls).toEqual([["POST", "id-1"]]);
  });

  it("never queues a question the Keep left waiting (star cap)", async () => {
    full = new Set(["id-1"]);
    render(createElement(SpeedTriviaQuickReview));
    await screen.findByText("Question 1?");
    press("l");
    expect(await screen.findByText("Subject full.")).toBeTruthy();
    expect(liveCalls).toEqual([]);
  });
});

// D36 (phase T4.2): keys while a save runs or a list loads. A held request is a promise the test settles by hand.
type Held = { release: (status?: number, payload?: unknown) => Promise<void> };
/** Hold every request `match` picks; the rest go to the fake server. `sent` lists each quick-review POST when it is sent. */
const hold = (match: (url: string, init?: RequestInit) => boolean) => {
  const held: Held[] = [];
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    if (init?.method === "POST" && body && String(input).endsWith("/quick-review")) sent.push(String(body.action));
    if (!match(String(input), init)) return fakeFetch(input, init);
    return new Promise<Response>((resolve) => {
      held.push({
        release: async (status, payload) => {
          await act(async () => {
            resolve(payload ? await respond(payload) : status ? await respond({ ok: false, error: "Server error." }, status) : await fakeFetch(input, init));
          });
        },
      });
    });
  }));
  return { held, sent };
};
const isPost = (action: string) => (_url: string, init?: RequestInit) => init?.method === "POST" && JSON.parse(String(init.body)).action === action;
const isList = (_url: string, init?: RequestInit) => !init?.method || init.method === "GET";
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const page = (rows: Row[]) => ({ ok: true, total: rows.length, items: rows, counts: { queued: 0, needsLook: 0, repeats: 0 } });

describe("Speed Trivia Quick Review: keys while a save runs or a list loads (D36)", () => {
  it("runs a Z pressed during a Reject save once the save finishes", async () => {
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    const { held, sent } = hold(isPost("reject"));
    press("ArrowLeft");
    press("z");
    expect(sent).toEqual(["reject"]);
    await held[0].release();
    expect(await screen.findByText("Undone.")).toBeTruthy();
    expect(screen.getByText("Question 1?")).toBeTruthy();
    expect(sent).toEqual(["reject", "undo"]);
  });

  it("drops a Z queued during a failed Keep; the earlier decision stays", async () => {
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    press("ArrowLeft");
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    const { held, sent } = hold(isPost("keep"));
    press("ArrowRight");
    press("z");
    await held[0].release(500);
    expect(await screen.findByText("Server error.")).toBeTruthy();
    await settle();
    expect(sent).toEqual(["keep"]);
    expect(screen.getByText("Question 2?")).toBeTruthy();
  });

  it("ignores → pressed during a save: the next question was never seen", async () => {
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    const { held, sent } = hold(isPost("reject"));
    press("ArrowLeft");
    press("ArrowRight");
    await held[0].release();
    expect(await screen.findByText("Question 2?")).toBeTruthy();
    await settle();
    expect(sent).toEqual(["reject"]);
  });

  it("decides nothing while a new list loads, then shows it", async () => {
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    const { held, sent } = hold(isList);
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "science" } });
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByTestId("quick-review-card")).toBeNull();
    expect(screen.queryByText(/ left/)).toBeNull();
    for (const key of ["ArrowRight", "l", "ArrowLeft", "w", "s", "e", "z"]) press(key);
    expect(screen.getByRole("button", { name: "Keep →" }).hasAttribute("disabled")).toBe(true);
    expect(sent).toEqual([]);
    await held[0].release(undefined, page([row(8)]));
    expect(await screen.findByText("Question 8?")).toBeTruthy();
    expect(sent).toEqual([]);
  });

  it("shows the last list asked for when the first answer arrives last", async () => {
    render(createElement(SpeedTriviaQuickReview));
    expect(await screen.findByText("Question 1?")).toBeTruthy();
    const { held } = hold(isList);
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "older" } });
    fireEvent.change(screen.getByLabelText("Source"), { target: { value: "recent" } });
    expect(held).toHaveLength(2);
    await held[1].release(undefined, page([row(6)]));
    expect(await screen.findByText("Question 6?")).toBeTruthy();
    await held[0].release(undefined, page([row(5)]));
    await settle();
    expect(screen.getByText("Question 6?")).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("paints Loading…, not Nothing left., on the very first render", () => {
    // Server-side render = the first paint; a client effect that sets loading comes too late to count.
    const html = renderToString(createElement(SpeedTriviaQuickReview));
    expect(html).toContain("Loading…");
    expect(html).not.toContain("Nothing left.");
  });

  it("shows Loading…, not Nothing left., before the first list arrives", async () => {
    const { held } = hold(isList);
    render(createElement(SpeedTriviaQuickReview));
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("Nothing left.")).toBeNull();
    await held[0].release();
    expect(await screen.findByText("Question 1?")).toBeTruthy();
  });
});
