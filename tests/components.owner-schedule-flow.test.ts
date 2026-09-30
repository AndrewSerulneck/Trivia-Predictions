// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, Fragment, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ScheduleGameFlow, type ScheduleChange } from "@/components/owner/schedule/ScheduleGameFlow";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";
import type { OwnerSchedule } from "@/types";

// The flag is read once at module load (like the old page), so set it before the
// component module is evaluated: Category Blitz hidden → Live Trivia is the only
// game → the Game step is skipped.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_CATEGORY_BLITZ_CONTINUOUS_DEFAULT = "true";
});

// docs/partner-dashboard-app-redesign-plan.md Phase 4: the Schedule Live Games
// sheet end to end against a fake history — create, edit, cancel, history.

const stubReducedMotion = () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
};

const makeSchedule = (overrides: Partial<OwnerSchedule> = {}): OwnerSchedule =>
  ({
    id: "sched-1",
    venueId: "venue-1",
    title: "Friday Trivia",
    startTime: "2099-10-03T00:00:00.000Z",
    endTime: "2099-10-03T00:40:00.000Z",
    timezone: "America/New_York",
    recurringType: "none",
    recurringDays: [],
    windowMinutes: 40,
    gameType: "live_trivia",
    ...overrides,
  }) as OwnerSchedule;

type HarnessProps = {
  initialStep?: string | null;
  initialSchedule?: OwnerSchedule | null;
  games?: OwnerSchedule[];
  onChanged?: (change: ScheduleChange) => void;
  onClosed?: () => void;
  log?: string[];
};

// A stand-in for useOwnerSheet: a step, an open flag and a history stack, so
// goBack pops the way the real driver does.
const Harness = ({
  initialStep = null,
  initialSchedule = null,
  games = [],
  onChanged = () => {},
  onClosed,
  log,
}: HarnessProps) => {
  const [step, setStep] = useState<string | null>(initialStep);
  const [open, setOpen] = useState(true);
  const [stack, setStack] = useState<(string | null)[]>([]);

  const nav: UseOwnerSheetResult = {
    sheet: open ? "schedule" : null,
    step,
    displayStepFor: (id) => (id === "schedule" ? step : null),
    openSheet: () => {},
    goToStep: (next) => {
      log?.push(`go:${next}`);
      setStack((prev) => [...prev, step]);
      setStep(next);
    },
    replaceCurrentStep: (next) => {
      log?.push(`replace:${next}`);
      setStep(next);
    },
    goBack: (previous) => {
      log?.push(`back:${previous}`);
      if (stack.length > 0) {
        setStep(stack[stack.length - 1] ?? null);
        setStack(stack.slice(0, -1));
      } else setStep(previous);
    },
    closeSheet: () => {
      log?.push("close");
      setOpen(false);
      onClosed?.();
    },
  };

  // Test-only: the phone's Back (pops without the flow's say-so) and a reopen (the browser's Forward).
  const phoneBack = () => {
    if (stack.length === 0) {
      setOpen(false); // Back from the sheet's first entry leaves it
      return;
    }
    setStep(stack[stack.length - 1] ?? null);
    setStack(stack.slice(0, -1));
  };

  return createElement(
    Fragment,
    null,
    createElement(ScheduleGameFlow, {
      venueId: "venue-1",
      nav,
      games: { status: "ready", items: games },
      nowMs: Date.parse("2099-09-01T00:00:00.000Z"),
      initialSchedule,
      onChanged,
    }),
    createElement("button", { type: "button", hidden: true, onClick: phoneBack }, "test:phone-back"),
    createElement("button", { type: "button", hidden: true, onClick: () => setOpen(true) }, "test:reopen"),
  );
};

const phoneBack = () => fireEvent.click(screen.getByText("test:phone-back"));
const reopen = () => fireEvent.click(screen.getByText("test:reopen"));

const heading = () => document.body.querySelector<HTMLElement>("[data-step-heading]")?.textContent ?? null;
const button = (name: string | RegExp) => screen.getByRole("button", { name });

const fetchMock = vi.fn();

describe("ScheduleGameFlow", () => {
  beforeEach(() => {
    stubReducedMotion();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("opens on When (the Game step is skipped with one game) and blocks Next until a start is picked", () => {
    render(createElement(Harness));
    expect(heading()).toBe("When does it start?");
    expect(button(/^Next/)).toHaveProperty("disabled", true);
    expect(screen.getByText("Pick a date and time to continue.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
    expect(button(/^Next/)).toHaveProperty("disabled", false);
    expect(screen.getByText(/Ends around/)).toBeTruthy();
  });

  it("walks When → Repeat → Review and POSTs the same body the old form sent", async () => {
    const onChanged = vi.fn();
    const onClosed = vi.fn();
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, rewardNotice: null }) });
    render(createElement(Harness, { onChanged, onClosed }));

    fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Does it repeat?"));

    fireEvent.click(screen.getByRole("radio", { name: /Every week on/ }));
    // Weekly with no day is blocked, like the old form.
    expect(button(/^Next/)).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Fri" }));
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Review & name"));

    // The title is prefilled with the game's name, so it can't block saving.
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Live Trivia");
    fireEvent.click(button("Schedule game"));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/owner/schedule");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toMatchObject({
      venueId: "venue-1",
      title: "Live Trivia",
      startTime: "2099-10-09T20:00",
      gameType: "live_trivia",
      rounds: 3,
      recurringType: "weekly",
      recurringDays: ["fri"],
    });
    expect(onChanged.mock.calls[0][0]).toMatchObject({ rewardNotice: null });
    expect(onChanged.mock.calls[0][0].message).toMatch(/^Live Trivia scheduled: /);
    expect(onClosed).toHaveBeenCalled();
  });

  it("shows the server's error on Review and keeps the sheet open", async () => {
    const onClosed = vi.fn();
    fetchMock.mockResolvedValue({
      json: async () => ({ ok: false, error: "That time overlaps another game." }),
    });
    render(createElement(Harness, { onClosed }));
    fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Does it repeat?"));
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Review & name"));
    fireEvent.click(button("Schedule game"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("That time overlaps another game."));
    expect(onClosed).not.toHaveBeenCalled();
    expect(button("Schedule game")).toHaveProperty("disabled", false);
  });

  it("Change on Review jumps to a step, and Done returns to Review", async () => {
    render(createElement(Harness));
    fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Does it repeat?"));
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Review & name"));

    fireEvent.click(button("Change repeats"));
    await waitFor(() => expect(heading()).toBe("Does it repeat?"));
    fireEvent.click(screen.getByRole("radio", { name: /Every day/ }));
    fireEvent.click(button("Done"));
    await waitFor(() => expect(heading()).toBe("Review & name"));
    expect(screen.getByText("Every day")).toBeTruthy();
  });

  it("a deep link straight to Review with nothing filled in falls back to When", () => {
    const log: string[] = [];
    render(createElement(Harness, { initialStep: "review", log }));
    expect(heading()).toBe("When does it start?");
    expect(log).toContain("replace:when");
  });

  it("edits an existing game with a PATCH that has no venue or game type", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, rewardNotice: "1 reward was updated." }) });
    const onChanged = vi.fn();
    const game = makeSchedule({ recurringType: "weekly", recurringDays: ["fri"] });
    render(createElement(Harness, { initialStep: "detail", initialSchedule: game, games: [game], onChanged }));

    expect(heading()).toBe("Friday Trivia");
    fireEvent.click(button("Edit game"));
    await waitFor(() => expect(heading()).toBe("Review changes"));
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Friday Trivia");
    expect(screen.getByText("Game type can't be changed")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Friday Night Trivia" } });
    fireEvent.click(button("Save changes"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/owner/schedule/sched-1");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toMatchObject({ title: "Friday Night Trivia", recurringType: "weekly", recurringDays: ["fri"] });
    expect(body).not.toHaveProperty("venueId");
    expect(body).not.toHaveProperty("gameType");
    expect(onChanged.mock.calls[0][0]).toEqual({
      message: "Live Trivia updated",
      rewardNotice: "1 reward was updated.",
      scheduleId: "sched-1",
    });
  });

  it("cancels a game only after confirmation, and passes the reward notice up", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, rewardNotice: "2 rewards were retired." }) });
    const onChanged = vi.fn();
    const onClosed = vi.fn();
    const game = makeSchedule();
    render(createElement(Harness, { initialStep: "detail", initialSchedule: game, games: [game], onChanged, onClosed }));

    fireEvent.click(button("Cancel game"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Players will be returned to the lobby/)).toBeTruthy();

    fireEvent.click(button("Keep game"));
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(button("Cancel game"));
    fireEvent.click(button("Yes, cancel game"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/owner/schedule/sched-1", { method: "DELETE" });
    expect(onChanged.mock.calls[0][0]).toEqual({
      message: "Friday Trivia cancelled",
      rewardNotice: "2 rewards were retired.",
      removed: true,
    });
    expect(onClosed).toHaveBeenCalled();
  });

  it("a detail deep link with no game (after a reload) shows the upcoming list instead", () => {
    render(createElement(Harness, { initialStep: "detail", games: [makeSchedule()] }));
    expect(heading()).toBe("Upcoming games");
  });

  it("lists upcoming games, and Past games shows ended ones read-only", async () => {
    const upcoming = makeSchedule();
    const ended = makeSchedule({
      id: "sched-old",
      title: "Old Night",
      startTime: "2099-08-01T00:00:00.000Z",
      endTime: "2099-08-01T00:40:00.000Z",
    });
    render(createElement(Harness, { initialStep: "all", games: [upcoming, ended] }));
    expect(heading()).toBe("Upcoming games");
    expect(screen.getByText("Friday Trivia")).toBeTruthy();
    expect(screen.queryByText("Old Night")).toBeNull();

    fireEvent.click(button("Past games"));
    await waitFor(() => expect(heading()).toBe("Past games"));
    expect(screen.getByText("Old Night")).toBeTruthy();
    expect(screen.getByText("Ended")).toBeTruthy();
    // Read-only: no row buttons for an ended game.
    expect(screen.queryByRole("button", { name: /Old Night/ })).toBeNull();

    fireEvent.click(button("Back"));
    await waitFor(() => expect(heading()).toBe("Upcoming games"));
  });

  it("'+ Schedule another game' starts a blank flow", async () => {
    render(createElement(Harness, { initialStep: "all", games: [makeSchedule()] }));
    fireEvent.click(button("+ Schedule another game"));
    await waitFor(() => expect(heading()).toBe("When does it start?"));
    expect((screen.getByLabelText(/Date & time/) as HTMLInputElement).value).toBe("");
  });

  describe("Discard this game?", () => {
    it("closes at once while nothing has been entered", () => {
      const onClosed = vi.fn();
      render(createElement(Harness, { onClosed }));
      fireEvent.click(button("Close"));
      expect(onClosed).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("asks once something is entered; Keep editing leaves the sheet and the answers alone", async () => {
      const onClosed = vi.fn();
      render(createElement(Harness, { onClosed }));
      fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
      fireEvent.click(button("Close"));

      expect(screen.getByRole("alertdialog", { name: "Discard this game?" })).toBeTruthy();
      expect(onClosed).not.toHaveBeenCalled();

      fireEvent.click(button("Keep editing"));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect((screen.getByLabelText(/Date & time/) as HTMLInputElement).value).toBe("2099-10-09T20:00");
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("Discard closes the sheet; Escape asks instead of closing", async () => {
      const onClosed = vi.fn();
      render(createElement(Harness, { onClosed }));
      fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.getByRole("alertdialog")).toBeTruthy();
      expect(onClosed).not.toHaveBeenCalled();

      fireEvent.click(button("Discard"));
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it("an edit asks only after a change, with its own wording", async () => {
      const onClosed = vi.fn();
      const game = makeSchedule();
      render(createElement(Harness, { initialStep: "detail", initialSchedule: game, games: [game], onClosed }));
      fireEvent.click(button("Edit game"));
      await waitFor(() => expect(heading()).toBe("Review changes"));

      fireEvent.click(button("Close"));
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it("an edit with a change asks 'Discard your changes?'", async () => {
      const onClosed = vi.fn();
      const game = makeSchedule();
      render(createElement(Harness, { initialStep: "detail", initialSchedule: game, games: [game], onClosed }));
      fireEvent.click(button("Edit game"));
      await waitFor(() => expect(heading()).toBe("Review changes"));
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Renamed" } });
      fireEvent.click(button("Close"));
      expect(screen.getByRole("alertdialog", { name: "Discard your changes?" })).toBeTruthy();
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("the lists never ask (nothing to lose)", () => {
      const onClosed = vi.fn();
      render(createElement(Harness, { initialStep: "all", games: [makeSchedule()], onClosed }));
      fireEvent.click(button("Close"));
      expect(onClosed).toHaveBeenCalledTimes(1);
    });
  });

  it("a Change left with the phone's Back ends the Change: the step's button reads Next again", async () => {
    render(createElement(Harness));
    fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Does it repeat?"));
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Review & name"));

    fireEvent.click(button("Change repeats"));
    await waitFor(() => expect(heading()).toBe("Does it repeat?"));
    expect(button("Done")).toBeTruthy();
    phoneBack();
    await waitFor(() => expect(heading()).toBe("Review & name"));

    fireEvent.click(button("Back"));
    await waitFor(() => expect(heading()).toBe("Does it repeat?"));
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
    expect(button(/^Next/)).toBeTruthy();
  });

  it("after a save, the spent flow starts over once the sheet has gone (Forward can't reopen 'Scheduling…')", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ok: true, rewardNotice: null }) });
    const onClosed = vi.fn();
    render(createElement(Harness, { onClosed }));
    fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Does it repeat?"));
    fireEvent.click(button(/^Next/));
    await waitFor(() => expect(heading()).toBe("Review & name"));
    fireEvent.click(button("Schedule game"));
    await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    reopen();
    await waitFor(() => expect(heading()).toBe("When does it start?"));
    expect((screen.getByLabelText(/Date & time/) as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Scheduling…")).toBeNull();
  });

  describe("the phone's Back gesture (Andrew, 2026-09-30: it asks too)", () => {
    const SHEET_URL = "/owner/dashboard?sheet=schedule&step=when";

    beforeEach(() => {
      window.history.replaceState(null, "", SHEET_URL);
    });

    afterEach(() => {
      window.history.replaceState(null, "", "/");
      vi.restoreAllMocks();
    });

    it("Back that leaves the sheet with answers entered puts the sheet's entry back and asks", async () => {
      const pushState = vi.spyOn(window.history, "pushState");
      render(createElement(Harness));
      fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
      phoneBack();

      expect(screen.getByRole("alertdialog", { name: "Discard this game?" })).toBeTruthy();
      expect(pushState).toHaveBeenCalledWith({ ownerSheetDepth: 1 }, "", SHEET_URL);

      reopen(); // the router follows the restored URL
      fireEvent.click(button("Keep editing"));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect((screen.getByLabelText(/Date & time/) as HTMLInputElement).value).toBe("2099-10-09T20:00");
    });

    it("Discard after a Back finishes that Back (history.back), not a full close", () => {
      vi.spyOn(window.history, "pushState").mockImplementation(() => {});
      const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
      const onClosed = vi.fn();
      render(createElement(Harness, { onClosed }));
      fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
      phoneBack();
      reopen();
      fireEvent.click(button("Discard"));
      expect(back).toHaveBeenCalledTimes(1);
      expect(onClosed).not.toHaveBeenCalled();
    });

    it("never asks when nothing was entered", () => {
      const pushState = vi.spyOn(window.history, "pushState");
      render(createElement(Harness));
      phoneBack();
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(pushState).not.toHaveBeenCalled();
    });

    it("never asks when Back stays inside the sheet (the answers are still there)", async () => {
      render(createElement(Harness));
      fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
      fireEvent.click(button(/^Next/));
      await waitFor(() => expect(heading()).toBe("Does it repeat?"));
      phoneBack();
      await waitFor(() => expect(heading()).toBe("When does it start?"));
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("the flow's own close (Discard from Close) never asks a second time", async () => {
      const pushState = vi.spyOn(window.history, "pushState");
      const onClosed = vi.fn();
      render(createElement(Harness, { onClosed }));
      fireEvent.change(screen.getByLabelText(/Date & time/), { target: { value: "2099-10-09T20:00" } });
      fireEvent.click(button("Close"));
      fireEvent.click(button("Discard"));
      expect(onClosed).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(pushState).not.toHaveBeenCalled();
    });
  });
});
