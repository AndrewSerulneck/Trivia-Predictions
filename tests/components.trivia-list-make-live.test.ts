// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TriviaListSection } from "@/components/admin/sections/TriviaListSection";
import type { LiveConversionStatusMap } from "@/types/liveConversions";

// "Make Live" in the question list (docs/speed-trivia-backlog-and-quality-plan.md Phase 4e, D37), against a fake server.
const q = (n: number) => ({ id: `q-${n}`, question: `Speed question ${n}?`, options: ["A", "B", "C", "D"], correctAnswer: 0, category: "Science",
  difficulty: "easy", questionPool: "anytime_blitz", answerFormat: "multiple_choice", createdAt: "2026-11-01T00:00:00Z" });

let states: LiveConversionStatusMap;
const calls: [string, string][] = [];
const respond = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const fakeFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  calls.push([method, url]);
  if (url.startsWith("/api/admin/trivia/live-conversions")) {
    if (method === "GET") return respond({ ok: true, states });
    if (method === "DELETE") return respond({ ok: true, cancelled: true });
    return respond({ ok: true, state: "queued", already: false });
  }
  if (url.includes("resource=trivia-categories")) return respond({ ok: true, categories: ["Science"] });
  return respond({ ok: true, items: [1, 2, 3, 4, 5, 6].map(q), total: 6, totalPages: 1 });
});

beforeEach(() => {
  states = { "q-2": { state: "queued" }, "q-3": { state: "in_review" }, "q-4": { state: "in_live" }, "q-5": { state: "not_convertible", reason: "Too hard without choices." },
    "q-6": { state: "kept" } };
  calls.length = 0;
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Question list: Make Live", () => {
  it("reads every row's label in one request and shows each state", async () => {
    render(createElement(TriviaListSection));
    expect(await screen.findByText("In Live review")).toBeTruthy();
    const reads = calls.filter(([m, u]) => m === "GET" && u.startsWith("/api/admin/trivia/live-conversions"));
    expect(reads).toHaveLength(1);
    expect(reads[0][1]).toBe("/api/admin/trivia/live-conversions?ids=q-1,q-2,q-3,q-4,q-5,q-6");
    expect(screen.getByText("In Live")).toBeTruthy();
    expect(screen.getByText("Kept for Live")).toBeTruthy();
    expect(screen.getByText("Queued for Live")).toBeTruthy();
    expect(screen.getByText("Not convertible: Too hard without choices.")).toBeTruthy();
    expect(screen.getAllByText("Make Live")).toHaveLength(2);
  });

  it("queues with Make Live and cancels with a tap on Queued for Live", async () => {
    render(createElement(TriviaListSection));
    await screen.findByText("Queued for Live");
    fireEvent.click(screen.getAllByText("Make Live")[0]);
    await waitFor(() => expect(screen.getAllByText("Queued for Live")).toHaveLength(2));
    expect(calls.find(([m]) => m === "POST")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Queued for Live")[0]);
    await waitFor(() => expect(screen.getAllByText("Queued for Live")).toHaveLength(1));
    expect(calls.filter(([m]) => m === "DELETE")).toHaveLength(1);
  });
});
