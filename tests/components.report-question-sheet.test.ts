// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useEffect } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";

// Phase 4c.7 (D32) of docs/speed-trivia-backlog-and-quality-plan.md: the Report button and its "What's wrong?" sheet.
// createElement, not JSX (the test glob is *.test.ts). The 12px floor is checked for every file by
// tests/text-size-floor-contract.test.ts; this file checks the sheet uses only the scale.

vi.mock("@/lib/storage", () => ({ getUserId: () => "user-1" }));

import { readFileSync } from "node:fs";
import { ReportButton, ReportSheet, ReportQuestionSheet, useHeldReport } from "@/components/trivia/ReportQuestionSheet";

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
    render(createElement(ReportQuestionSheet, { questionId: "q-1" }));
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

  it("Other needs text before Send, and caps it at 200", async () => {
    render(createElement(ReportQuestionSheet, { questionId: "q-1" }));
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
    render(createElement(ReportQuestionSheet, { questionId: "q-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Typo" }));
    await screen.findByText("Try again later.");
    expect(screen.queryByText("Sent.")).toBeNull();
    expect((screen.getByRole("button", { name: "Typo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("closes itself after Sent.", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(createElement(ReportQuestionSheet, { questionId: "q-1" }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Confusing" }));
    await screen.findByText("Sent.");
    await act(async () => { vi.advanceTimersByTime(1300); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Reported" })).toBeTruthy();
  });

  // Andrew, 2026-11-17: on Live the sheet stays open over the next question. 7i (D46): it then shrinks to a bar, and
  // the page's state lives in useHeldReport. The harness mirrors app/trivia/live/page.tsx.
  const LiveHarness = ({ visible }: { visible: boolean }) => {
    const report = useHeldReport();
    useEffect(() => {
      harness = report;
    });
    return createElement(
      "div",
      null,
      createElement(ReportButton, {
        reported: Boolean(report.reportedKeys["q1"]),
        onOpen: () => report.open("q1", { game: "live", slug: "slug-q1" }),
      }),
      report.held && report.minimized ? createElement("button", { onClick: report.restore }, "Finish report") : null,
      visible && report.held && !report.minimized
        ? createElement(ReportSheet, {
            target: report.held.target,
            draft: report.draft,
            onDraftChange: report.setDraft,
            onSent: () => report.onSent(report.held?.key ?? ""),
            onClose: report.close,
            onDismiss: report.dismiss,
          })
        : null,
    );
  };
  let harness: ReturnType<typeof useHeldReport>;

  it("Live: a half-typed note survives the sheet shrinking, a hidden render, and reopening", async () => {
    const view = render(createElement(LiveHarness, { visible: true }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), { target: { value: "half typed" } });

    act(() => harness.minimize());
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finish report" }));
    expect((screen.getByRole("textbox", { name: "Other" }) as HTMLTextAreaElement).value).toBe("half typed");

    view.rerender(createElement(LiveHarness, { visible: false })); // a loading render unmounts the sheet
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(createElement(LiveHarness, { visible: true }));
    expect((screen.getByRole("textbox", { name: "Other" }) as HTMLTextAreaElement).value).toBe("half typed");

    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Sent.");
    expect(posts).toEqual([{ userId: "user-1", game: "live", slug: "slug-q1", reason: "other", note: "half typed" }]);
  });

  it("Live: tapping outside or Escape keeps typed text; an untouched sheet closes", () => {
    render(createElement(LiveHarness, { visible: true }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByTestId("report-question-backdrop"));
    expect(screen.queryByRole("dialog")).toBeNull(); // nothing typed: closes

    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Other" }), { target: { value: "keep me" } });
    fireEvent.click(screen.getByTestId("report-question-backdrop"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect((screen.getByRole("textbox", { name: "Other" }) as HTMLTextAreaElement).value).toBe("keep me");

    fireEvent.click(screen.getByRole("button", { name: "Close" })); // the X is an explicit discard
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Live: Close ends it without sending", async () => {
    render(createElement(LiveHarness, { visible: true }));
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(posts).toEqual([]));
  });

  it("a send that finishes after its sheet closed never closes a newer sheet (R2 #22.1)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useHeldReport());
    act(() => result.current.open("a", { game: "live", slug: "a" }));
    act(() => result.current.onSent("a")); // timer set for "a"
    act(() => result.current.open("b", { game: "live", slug: "b" }));
    await act(async () => { vi.advanceTimersByTime(1300); });
    expect(result.current.held?.key).toBe("b");
    // a late send for the closed report marks it reported but leaves "b" alone
    act(() => result.current.onSent("a"));
    await act(async () => { vi.advanceTimersByTime(1300); });
    expect(result.current.held?.key).toBe("b");
    expect(result.current.reportedKeys).toEqual({ a: true });
    // its own send closes it after the delay
    act(() => result.current.onSent("b"));
    expect(result.current.draft.sent).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1300); });
    expect(result.current.held).toBeNull();
  });

  it("clears the close timer on unmount", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useHeldReport());
    act(() => result.current.open("a", { game: "live", slug: "a" }));
    act(() => result.current.onSent("a"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("the game-end reset clears the held report, draft and reported keys (R2 #22.4)", () => {
    const { result } = renderHook(() => useHeldReport());
    act(() => result.current.open("a", { game: "live", slug: "a" }));
    act(() => result.current.setDraft({ writingOther: true, note: "x", sent: false }));
    act(() => result.current.onSent("a"));
    act(() => result.current.clearAll());
    expect(result.current.held).toBeNull();
    expect(result.current.draft).toEqual({ writingOther: false, note: "", sent: false });
    expect(result.current.reportedKeys).toEqual({});
  });

  it("keeps its callbacks stable across renders", () => {
    const { result, rerender } = renderHook(() => useHeldReport());
    const first = result.current;
    rerender();
    act(() => result.current.open("a", { game: "live", slug: "a" }));
    for (const name of ["open", "onSent", "close", "dismiss", "minimize", "restore", "clearAll"] as const) {
      expect(result.current[name]).toBe(first[name]);
    }
  });

  it("Live page uses the hook, with no hand-held copy", () => {
    const source = readFileSync("app/trivia/live/page.tsx", "utf8");
    expect(source).toMatch(/useHeldReport\(\)/);
    expect(source).not.toMatch(/<ReportQuestionSheet\b/);
    expect(source).not.toMatch(/setHeldReport/);
  });

  it("uses only the text scale (no text-xs, no arbitrary sizes)", () => {
    const source = readFileSync("components/trivia/ReportQuestionSheet.tsx", "utf8");
    expect(source).not.toMatch(/\btext-(xs|\[)/);
    expect(source).not.toMatch(/\bReward/);
  });
});
