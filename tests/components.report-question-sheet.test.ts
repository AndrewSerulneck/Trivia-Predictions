// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Fragment, createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Phase 4c.7 (D32) of docs/speed-trivia-backlog-and-quality-plan.md: the Report button and its "What's wrong?" sheet.
// createElement, not JSX (the test glob is *.test.ts). The 12px floor is checked for every file by
// tests/text-size-floor-contract.test.ts; this file checks the sheet uses only the scale.

vi.mock("@/lib/storage", () => ({ getUserId: () => "user-1" }));

import { readFileSync } from "node:fs";
import { ReportButton, ReportQuestionSheet, ReportSheet } from "@/components/trivia/ReportQuestionSheet";

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

  // Andrew, 2026-11-17: on Live the sheet stays open over the next question until the player sends or closes it.
  // The harness mirrors app/trivia/live/page.tsx: the button sits in the question's panel, the sheet at page level.
  const LiveHarness = ({ questionKey, showPanel }: { questionKey: string; showPanel: boolean }) => {
    const [held, setHeld] = useState<{ key: string; slug: string } | null>(null);
    const [reported, setReported] = useState<Record<string, true>>({});
    return createElement(
      Fragment,
      null,
      showPanel
        ? createElement(ReportButton, {
            reported: Boolean(reported[questionKey]),
            onOpen: () => setHeld({ key: questionKey, slug: `slug-${questionKey}` }),
          })
        : null,
      held
        ? createElement(ReportSheet, {
            key: held.key,
            target: { game: "live", slug: held.slug },
            onSent: () => setReported((current) => ({ ...current, [held.key]: true })),
            onClose: () => setHeld(null),
          })
        : null,
    );
  };

  it("Live: the sheet stays open over the next question and reports the question it was opened on", async () => {
    const view = render(createElement(LiveHarness, { questionKey: "r1-q1", showPanel: true }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), { target: { value: "half typed" } });

    view.rerender(createElement(LiveHarness, { questionKey: "r1-q2", showPanel: false }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Other" }) as HTMLTextAreaElement).value).toBe("half typed");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Sent.");
    expect(posts).toEqual([{ userId: "user-1", game: "live", slug: "slug-r1-q1", reason: "other", note: "half typed" }]);
  });

  it("Live: Close ends it without sending", async () => {
    const view = render(createElement(LiveHarness, { questionKey: "r1-q1", showPanel: true }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    view.rerender(createElement(LiveHarness, { questionKey: "r1-q2", showPanel: true }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Report" })).toBeTruthy();
    await waitFor(() => expect(posts).toEqual([]));
  });

  it("Live page holds the sheet outside the question's panel", () => {
    const source = readFileSync("app/trivia/live/page.tsx", "utf8");
    expect(source).not.toMatch(/<ReportQuestionSheet\b/);
    expect(source).toMatch(/\{heldReport \? \(\s*<ReportSheet\s+key=\{heldReport\.key\}/);
  });

  it("uses only the text scale (no text-xs, no arbitrary sizes)", () => {
    const source = readFileSync("components/trivia/ReportQuestionSheet.tsx", "utf8");
    expect(source).not.toMatch(/\btext-(xs|\[)/);
    expect(source).not.toMatch(/\bReward/);
  });
});
