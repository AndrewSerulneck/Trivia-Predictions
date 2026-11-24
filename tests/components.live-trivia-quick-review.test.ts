// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LiveTriviaQuickReview } from "@/components/admin/sections/LiveTriviaQuickReview";

// Quick Review, Live mode (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c) against a fake in-memory server.
type Item = { id: string; question: string; answer: string; acceptableAnswers: string[]; category: string; difficulty: string; area: string | null;
  era: string | null; sourceUrl: string | null; whyTrue?: string | null; source: string; createdAt: string; audience: null; possibleRepeat: { slug: string; question: string; answer: string } | null; edited: boolean;
  fromSpeed?: { question: string; answer: string } | null; overStarCap?: boolean };
const item = (n: number, over: Partial<Item> = {}): Item => ({ id: `id-${n}`, question: `Live question ${n}?`, answer: `Answer ${n}`, acceptableAnswers: [],
  category: "Music", difficulty: "easy", area: "Classic rock", era: "1970s", sourceUrl: null, source: "chatgpt", createdAt: `2026-11-16T00:0${n}:00Z`,
  audience: null, possibleRepeat: null, edited: false, ...over });

let waiting: Item[];
/** The server's real waiting count; null = just the page (4c.9 #5). */
let total: number | null;
let kept: number;
/** When set, a GET for a category answers from here instead of `waiting`. */
let byCategory: Record<string, Item[]> | null;
let prWaiting: { waiting: number; prUrl: string };
let publishResult: Record<string, unknown>;
const posts: Record<string, unknown>[] = [];
const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

const fakeFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  if (!init?.method || init.method === "GET") {
    const category = new URL(String(input), "http://x").searchParams.get("category") ?? "";
    const list = byCategory ? byCategory[category] ?? [] : waiting;
    return respond({ ok: true, total: total ?? list.length, items: list, kept, categories: ["Music", "Movies", "Current Events"], waiting: prWaiting });
  }
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  posts.push(body);
  if (body.action === "keep" || body.action === "reject") return respond({ ok: true, decided: true });
  if (body.action === "undo") return respond({ ok: true, id: body.id, status: "pending_review" });
  if (body.action === "edit") return respond({ ok: true, answer: String(body.answer).trim(), acceptableAnswers: body.acceptableAnswers });
  if (body.action === "publish") { kept = 0; return respond({ ok: true, ...publishResult }); }
  return respond({ ok: false, error: "Unknown action." }, 400);
});

beforeEach(() => {
  waiting = [item(1), item(2, { possibleRepeat: { slug: "old", question: "Who sang Thriller?", answer: "Michael Jackson" }, acceptableAnswers: ["Two"] })];
  kept = 2;
  byCategory = null;
  total = null;
  prWaiting = { waiting: 0, prUrl: "" };
  publishResult = { prUrl: "https://github.com/o/r/pull/3", merged: true, waiting: false, published: 2, already: 0, refused: 0, files: [] };
  posts.length = 0;
  vi.stubGlobal("fetch", fakeFetch);
  vi.stubGlobal("confirm", () => true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const card = () => screen.getByTestId("live-review-card");

describe("Live Quick Review", () => {
  it("shows the question, the answer, and keeps with →", async () => {
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    expect(card().textContent).toContain("✓ Answer 1");
    expect(card().textContent).toContain("Classic rock · 1970s");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    expect(posts[0]).toEqual({ action: "keep", id: "id-1" });
    expect(screen.getByRole("button", { name: "Publish (3)" })).toBeTruthy();
  });

  it("counts every waiting question in N left, not just the loaded page (4c.9 #5)", async () => {
    total = 250;
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(screen.getByText("250 left")).toBeTruthy());
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(screen.getByText("249 left")).toBeTruthy());
    fireEvent.keyDown(window, { key: "z" });
    await waitFor(() => expect(screen.getByText("250 left")).toBeTruthy());
  });

  it("shows the writer's note only after Why is pressed, and only when there is one (D30)", async () => {
    waiting = [item(1, { whyTrue: "Answer 1 is right because of a fact." }), item(2)];
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    expect(screen.queryByTestId("live-review-why")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Why" }));
    expect(screen.getByTestId("live-review-why").textContent).toBe("Answer 1 is right because of a fact.");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    expect(screen.queryByRole("button", { name: "Why" })).toBeNull();
    expect(screen.queryByTestId("live-review-why")).toBeNull();
  });

  it("shows a possible repeat and the accepted answers, rejects with ← and undoes with Z", async () => {
    waiting = [waiting[1]];
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(screen.getByTestId("live-review-repeat").textContent).toBe("Possible repeat of: Who sang Thriller? (Michael Jackson)"));
    expect(screen.getByTestId("live-review-accepted").textContent).toBe("Also accept: Two");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByText("Nothing left.")).toBeTruthy());
    fireEvent.keyDown(window, { key: "z" });
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    expect(posts.map((p) => p.action)).toEqual(["reject", "undo"]);
  });

  it("undoes with Z pressed between the commit that shows a reject and the effects after it (no stale key handler)", async () => {
    waiting = [waiting[1]];
    const { container } = render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card()).toBeTruthy());
    // A MutationObserver callback runs as a microtask right after React's commit, before the task that flushes
    // passive effects: the window where a useEffect-swapped listener is still the old one. A plain dispatch
    // (not fireEvent, which wraps act and flushes effects first) presses Z inside it.
    let pressed = false;
    const observer = new MutationObserver(() => {
      if (pressed || !container.textContent?.includes("Nothing left.")) return;
      pressed = true;
      observer.disconnect();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z" }));
    });
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(pressed).toBe(true));
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    expect(posts.map((p) => p.action)).toEqual(["reject", "undo"]);
  });

  it("binds the key listener once, however many decisions are made", async () => {
    const add = vi.spyOn(window, "addEventListener");
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    await waitFor(() => expect(screen.getByText("Nothing left.")).toBeTruthy());
    fireEvent.keyDown(window, { key: "z" });
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    expect(add.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    add.mockRestore();
  });

  it("edits the answer and acceptable answers with E", async () => {
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card()).toBeTruthy());
    fireEvent.keyDown(window, { key: "e" });
    fireEvent.change(screen.getByLabelText("Answer"), { target: { value: "Led Zeppelin" } });
    fireEvent.change(screen.getByLabelText("Also accept (one per line)"), { target: { value: "Zeppelin\n\nLed Zep" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(card().textContent).toContain("✓ Led Zeppelin"));
    expect(posts[0]).toEqual({ action: "edit", id: "id-1", answer: "Led Zeppelin", acceptableAnswers: ["Zeppelin", "Led Zep"] });
    expect(screen.getByText("Saved.")).toBeTruthy();
  });

  it("publishes the kept questions and links the PR", async () => {
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card()).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Publish (2)" }));
    await waitFor(() => expect(screen.getByText("Published 2.")).toBeTruthy());
    expect(screen.getByRole("link", { name: "PR" }).getAttribute("href")).toBe("https://github.com/o/r/pull/3");
  });

  it("says a PR that isn't merged is waiting on GitHub, with its link (Phase 4c.2)", async () => {
    publishResult = { ...publishResult, merged: false, waiting: true };
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card()).toBeTruthy());
    prWaiting = { waiting: 2, prUrl: "https://github.com/o/r/pull/3" };
    fireEvent.click(screen.getByRole("button", { name: "Publish (2)" }));
    await waitFor(() => expect(screen.getByText("Waiting on GitHub.")).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId("live-review-waiting").textContent).toBe("2 waiting on GitHubPR"));
    for (const link of screen.getAllByRole("link", { name: "PR" })) expect(link.getAttribute("href")).toBe("https://github.com/o/r/pull/3");
  });

  it("says when an open Publish PR blocked this one", async () => {
    publishResult = { prUrl: "https://github.com/o/r/pull/4", merged: false, waiting: true, published: 0, already: 0, refused: 0, files: [] };
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card()).toBeTruthy());
    expect(screen.queryByTestId("live-review-waiting")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publish (2)" }));
    await waitFor(() => expect(screen.getByText("A Publish PR is waiting on GitHub.")).toBeTruthy());
    expect(screen.getByRole("link", { name: "PR" }).getAttribute("href")).toBe("https://github.com/o/r/pull/4");
  });

  it("keeps copy minimal: no Reward wording and no text under 12px", () => {
    const source = readFileSync("components/admin/sections/LiveTriviaQuickReview.tsx", "utf8");
    expect(source).not.toMatch(/Reward/);
    expect(source).not.toMatch(/text-\[(?:[0-9]|1[01])px\]/);
  });
});

// Phase 4e (D37): a Speed -> Live rewrite shows where it came from.
describe("Live Quick Review: conversions", () => {
  it("shows the original Speed question and answer, and a star-cap note, only on a conversion", async () => {
    waiting = [item(1, { fromSpeed: { question: "Which planet is called the Red Planet?", answer: "Mars" }, overStarCap: true }), item(2)];
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    expect(screen.getByTestId("live-review-from-speed").textContent).toBe("From Speed: Which planet is called the Red Planet? (Mars)");
    expect(screen.getByTestId("live-review-star-cap").textContent).toBe("Over star cap");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    expect(screen.queryByTestId("live-review-from-speed")).toBeNull();
    expect(screen.queryByTestId("live-review-star-cap")).toBeNull();
  });
});

// D36 (phase T4.2): keys while a save runs or a list loads. A held request is a promise the test settles by hand.
type Held = { url: string; body: Record<string, unknown> | null; release: (status?: number) => Promise<void> };
/** Hold every request `match` picks; the rest go to the fake server. `sent` lists every POST at the moment it is sent. */
const hold = (match: (url: string, init?: RequestInit) => boolean) => {
  const held: Held[] = [];
  const sent: string[] = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    if (init?.method === "POST" && body) sent.push(`${body.action}:${body.id ?? ""}`);
    if (!match(String(input), init)) return fakeFetch(input, init);
    return new Promise<Response>((resolve) => {
      held.push({
        url: String(input), body,
        release: async (status) => { await act(async () => { resolve(status ? await respond({ ok: false, error: "Server error." }, status) : await fakeFetch(input, init)); }); },
      });
    });
  }));
  return { held, sent };
};
const isPost = (action: string) => (_url: string, init?: RequestInit) => init?.method === "POST" && JSON.parse(String(init.body)).action === action;
const isList = (_url: string, init?: RequestInit) => !init?.method || init.method === "GET";
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

describe("Live Quick Review: keys while a save runs or a list loads (D36)", () => {
  it("runs a Z pressed during a Reject save once the save finishes", async () => {
    waiting = [item(1)];
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card()).toBeTruthy());
    const { held, sent } = hold(isPost("reject"));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "z" });
    expect(sent).toEqual(["reject:id-1"]);
    await held[0].release();
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    expect(sent).toEqual(["reject:id-1", "undo:id-1"]);
    expect(screen.getByText("Undone.")).toBeTruthy();
  });

  it("drops a Z queued during a failed save; the earlier decision stays", async () => {
    waiting = [item(1), item(2)];
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    const { held, sent } = hold(isPost("reject"));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "z" });
    await held[0].release(500);
    await waitFor(() => expect(screen.getByText("Server error.")).toBeTruthy());
    await settle();
    expect(sent).toEqual(["reject:id-2"]);
    expect(card().textContent).toContain("Live question 2?");
    expect(screen.getByRole("button", { name: "Undo (Z)" }).hasAttribute("disabled")).toBe(false);
  });

  it("ignores → pressed during a save: the next question was never seen", async () => {
    waiting = [item(1), item(2)];
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    const { held, sent } = hold(isPost("reject"));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await held[0].release();
    await waitFor(() => expect(card().textContent).toContain("Live question 2?"));
    await settle();
    expect(sent).toEqual(["reject:id-1"]);
  });

  it("decides nothing while a new category loads, then shows that category's question", async () => {
    byCategory = { "": [item(1)], Movies: [item(5, { category: "Movies" })] };
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    const { held, sent } = hold(isList);
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Movies" } });
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByTestId("live-review-card")).toBeNull();
    expect(screen.queryByText(/ left$/)).toBeNull();
    for (const key of ["ArrowRight", "ArrowLeft", "s", "e", "z"]) fireEvent.keyDown(window, { key });
    for (const name of ["← Reject", "Keep →", "Skip (S)", "Edit (E)"]) expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    expect(sent).toEqual([]);
    await held[0].release();
    await waitFor(() => expect(card().textContent).toContain("Live question 5?"));
    expect(sent).toEqual([]);
  });

  it("shows the last category picked when the first answer arrives last", async () => {
    byCategory = { "": [item(1)], Movies: [item(5, { category: "Movies" })], "Current Events": [item(6, { category: "Current Events" })] };
    render(createElement(LiveTriviaQuickReview));
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
    const { held } = hold(isList);
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Movies" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Current Events" } });
    expect(held).toHaveLength(2);
    await held[1].release();
    await waitFor(() => expect(card().textContent).toContain("Live question 6?"));
    await held[0].release();
    await settle();
    expect(card().textContent).toContain("Live question 6?");
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("paints Loading…, not Nothing left., on the very first render", () => {
    // Server-side render = the first paint; a client effect that sets loading comes too late to count.
    const html = renderToString(createElement(LiveTriviaQuickReview));
    expect(html).toContain("Loading…");
    expect(html).not.toContain("Nothing left.");
  });

  it("shows Loading…, not Nothing left., before the first list arrives", async () => {
    const { held } = hold(isList);
    render(createElement(LiveTriviaQuickReview));
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("Nothing left.")).toBeNull();
    await held[0].release();
    await waitFor(() => expect(card().textContent).toContain("Live question 1?"));
  });
});
