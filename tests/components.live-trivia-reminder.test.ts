// @vitest-environment jsdom
// "Remind me" + "Add to calendar" on Venue Home (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C3).
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isApp: true,
  pushAvailable: true,
  optedIn: true,
  enablePush: vi.fn(),
  openInSystemBrowser: vi.fn(async () => true),
}));

vi.mock("@/lib/useIsNativeApp", () => ({ useIsNativeApp: () => state.isApp }));
vi.mock("@/lib/nativeApp", () => ({ openInSystemBrowser: state.openInSystemBrowser }));
vi.mock("@/lib/nativePush", () => ({
  enablePush: state.enablePush,
  isPushAvailable: () => state.pushAvailable,
  isPushOptedIn: () => state.optedIn,
  PUSH_ASK_INLINE_EVENT: "htc:push-ask-inline",
}));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/storage", () => ({ getUserId: () => "user-1" }));

import { LiveTriviaReminderRow } from "@/components/venue/LiveTriviaReminderRow";
import { PUSH_COPY } from "@/lib/pushCategories";

const SCHEDULE = "8b1f6a52-1c1e-4d4e-9a63-0d3f7c2b1a90";
const START = Date.now() + 3 * 24 * 60 * 60_000;

let replies: Array<{ status: number; body: Record<string, unknown> }> = [];
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
  const reply = replies.shift() ?? { status: 200, body: { ok: true } };
  return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "Content-Type": "application/json" } });
});

const row = () => render(createElement(LiveTriviaReminderRow, { venueId: "bar-1", scheduleId: SCHEDULE, startMs: START }));

beforeEach(() => {
  localStorage.clear();
  state.isApp = true;
  state.pushAvailable = true;
  state.optedIn = true;
  state.enablePush.mockReset();
  state.openInSystemBrowser.mockClear();
  replies = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LiveTriviaReminderRow", () => {
  it("website: Add to calendar only (a push needs the app), as a plain link to the .ics", async () => {
    state.isApp = false;
    row();
    const link = await screen.findByText("Add to calendar");
    expect(link.getAttribute("href")).toContain(`/api/trivia/live/calendar?venueId=bar-1&scheduleId=${SCHEDULE}`);
    expect(screen.queryByText("Remind me")).toBeNull();
  });

  it("app: the calendar opens in the phone's browser", async () => {
    row();
    fireEvent.click(await screen.findByText("Add to calendar"));
    await waitFor(() => expect(state.openInSystemBrowser).toHaveBeenCalledTimes(1));
    expect(String((state.openInSystemBrowser.mock.calls as unknown as string[][])[0]?.[0])).toMatch(/^http.*\/api\/trivia\/live\/calendar\?/);
  });

  it("push on: Remind me saves, then a second tap turns it off; the phone remembers it", async () => {
    replies = [{ status: 200, body: { ok: true, occurrenceDate: "2026-11-12", startsAt: new Date(START).toISOString() } }];
    row();
    fireEvent.click(await screen.findByText("Remind me"));
    await screen.findByText("Reminder set");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/push/game-reminders");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ venueId: "bar-1", scheduleId: SCHEDULE, userId: "user-1" });

    cleanup();
    row();
    await screen.findByText("Reminder set");

    fireEvent.click(screen.getByText("Reminder set"));
    await screen.findByText("Remind me");
    const [, off] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(off.method).toBe("DELETE");
    expect(JSON.parse(String(off.body))).toMatchObject({ scheduleId: SCHEDULE, occurrenceDate: "2026-11-12" });
  });

  it("push off: the consent words come first; nothing is saved until Turn on", async () => {
    state.optedIn = false;
    state.enablePush.mockResolvedValue({ ok: true, preferences: {} });
    replies = [{ status: 200, body: { ok: true, occurrenceDate: "2026-11-12", startsAt: new Date(START).toISOString() } }];
    const inlineAsk = vi.fn();
    window.addEventListener("htc:push-ask-inline", inlineAsk);
    row();
    fireEvent.click(await screen.findByText("Remind me"));
    expect(screen.getByText(PUSH_COPY.askBody)).toBeTruthy();
    expect(inlineAsk).toHaveBeenCalledTimes(1); // the push card steps aside: never the same ask twice
    window.removeEventListener("htc:push-ask-inline", inlineAsk);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.enablePush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(PUSH_COPY.askAccept));
    await screen.findByText("Reminder set");
    expect(state.enablePush).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(PUSH_COPY.askBody)).toBeNull();
  });

  it("push blocked in Settings: says so and saves nothing", async () => {
    state.optedIn = false;
    state.enablePush.mockResolvedValue({ ok: false, reason: "denied" });
    row();
    fireEvent.click(await screen.findByText("Remind me"));
    fireEvent.click(screen.getByText(PUSH_COPY.askAccept));
    await screen.findByText(PUSH_COPY.settingsBlocked);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a game that changed says so", async () => {
    replies = [{ status: 409, body: { ok: false } }];
    row();
    fireEvent.click(await screen.findByText("Remind me"));
    await screen.findByText("This game has changed.");
    expect(screen.queryByText("Reminder set")).toBeNull();
  });

  it("an old app without the push plugin: no Remind me", async () => {
    state.pushAvailable = false;
    row();
    await screen.findByText("Add to calendar");
    expect(screen.queryByText("Remind me")).toBeNull();
  });
});
