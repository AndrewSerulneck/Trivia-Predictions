// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Phase 4c.7 (D32) of docs/speed-trivia-backlog-and-quality-plan.md: the Report button and its "What's wrong?" sheet.
// createElement, not JSX (the test glob is *.test.ts). The 12px floor is checked for every file by
// tests/text-size-floor-contract.test.ts; this file checks the sheet uses only the scale.

vi.mock("@/lib/storage", () => ({ getUserId: () => "user-1" }));

import { readFileSync } from "node:fs";
import { ReportQuestionSheet } from "@/components/trivia/ReportQuestionSheet";

type Posted = { game: string; questionId?: string; slug?: string; reason: string; note?: string };
let posts: Posted[] = [];
let reply: { status: number; body: Record<string, unknown> } = { status: 200, body: { ok: true, message: "Sent." } };

beforeEach(() => {
  posts = [];
  reply = { status: 200, body: { ok: true, message: "Sent." } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url !== "/api/trivia/report") throw new Error(`unexpected fetch ${url}`);
      posts.push(JSON.parse(String(init?.body)) as Posted);
      return { ok: reply.status < 400, status: reply.status, json: async () => reply.body } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const reasonLabels = () =>
  screen.getAllByRole("listitem").map((item) => item.textContent);

describe("ReportQuestionSheet", () => {
  it("lists the Speed reasons and sends the question id on one tap", async () => {
    render(createElement(ReportQuestionSheet, { game: "speed", questionId: "q-1" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByRole("dialog").textContent).toContain("What's wrong?");
    expect(reasonLabels()).toEqual(["Wrong answer", "Two right answers", "Confusing", "Typo", "Other"]);

    fireEvent.click(screen.getByRole("button", { name: "Two right answers" }));
    await screen.findByText("Sent.");
    expect(posts).toEqual([{ userId: "user-1", game: "speed", questionId: "q-1", reason: "two_right" }]);
    const button = screen.getByRole("button", { name: "Reported" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("lists the Live reasons and sends the slug", async () => {
    render(createElement(ReportQuestionSheet, { game: "live", slug: "sports-q" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(reasonLabels()).toEqual(["My answer was right", "Wrong answer", "Confusing", "Typo", "Other"]);
    fireEvent.click(screen.getByRole("button", { name: "My answer was right" }));
    await screen.findByText("Sent.");
    expect(posts).toEqual([{ userId: "user-1", game: "live", slug: "sports-q", reason: "my_answer_right" }]);
  });

  it("Other needs text before Send, and caps it at 200", async () => {
    render(createElement(ReportQuestionSheet, { game: "speed", questionId: "q-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    expect(posts).toEqual([]);
    const send = screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    const box = screen.getByRole("textbox", { name: "Other" }) as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: "   " } });
    expect(send.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "x".repeat(250) } });
    expect(box.value).toHaveLength(200);
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await screen.findByText("Sent.");
    expect(posts[0]).toMatchObject({ reason: "other", note: "x".repeat(200) });
  });

  it("shows the server's error and lets the player try again", async () => {
    reply = { status: 429, body: { ok: false, error: "Try again later." } };
    render(createElement(ReportQuestionSheet, { game: "speed", questionId: "q-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Typo" }));
    await screen.findByText("Try again later.");
    expect(screen.queryByText("Sent.")).toBeNull();
    expect((screen.getByRole("button", { name: "Typo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("closes itself after Sent.", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(createElement(ReportQuestionSheet, { game: "speed", questionId: "q-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Confusing" }));
    await screen.findByText("Sent.");
    await act(async () => { vi.advanceTimersByTime(1300); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Reported" })).toBeTruthy();
  });

  it("Live: the next question (a new key) closes the sheet without sending", async () => {
    const view = render(createElement(ReportQuestionSheet, { key: "r1-q1", game: "live", slug: "sports-q1" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), { target: { value: "half typed" } });
    view.rerender(createElement(ReportQuestionSheet, { key: "r1-q2", game: "live", slug: "sports-q2" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
    await waitFor(() => expect(posts).toEqual([]));
  });

  it("uses only the text scale (no text-xs, no arbitrary sizes)", () => {
    const source = readFileSync("components/trivia/ReportQuestionSheet.tsx", "utf8");
    expect(source).not.toMatch(/\btext-(xs|\[)/);
    expect(source).not.toMatch(/\bReward/);
  });
});
