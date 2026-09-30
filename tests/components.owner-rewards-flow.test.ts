// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RewardsFlow, type RewardsChange } from "@/components/owner/rewards/RewardsFlow";
import type { OwnerCompetition } from "@/lib/ownerRewardDisplay";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// docs/partner-dashboard-app-redesign-plan.md Phase 5: the Offer Rewards sheet
// against a fake history — the list, one reward, End reward (archive / delete with
// prize counts), ended rewards, and the wizard hosted with its step in the URL.

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

const makeReward = (overrides: Partial<OwnerCompetition> = {}): OwnerCompetition =>
  ({
    id: "reward-1",
    name: "Trivia Night Appetizer",
    isActive: true,
    winnerUserId: null,
    winnerUsername: null,
    rewardDefinitionId: "live_trivia_challenge",
    winCondition: "points_threshold",
    winnerQuota: 2,
    recurringType: "weekly",
    gameTypes: ["live-trivia"],
    challengeMode: "progress",
    startDate: "2099-10-01",
    endDate: "2099-10-31",
    startTime: "00:00",
    endTime: "23:59",
    progressPoints: 0,
    leaderboard: { topEntries: [{ userId: "u1", rank: 1, username: "ace", points: 420 }] },
    ...overrides,
  }) as unknown as OwnerCompetition;

const ACTIVE = makeReward();
const ENDED = makeReward({ id: "reward-2", name: "Last Month", isActive: false, winnerUsername: "champ" });

type HarnessProps = {
  initialStep?: string | null;
  initialReward?: OwnerCompetition | null;
  rewards?: OwnerCompetition[];
  onChanged?: (change: RewardsChange) => void;
  onRequestSchedule?: () => void;
  onClosed?: () => void;
  log?: string[];
};

// A stand-in for useOwnerSheet: a step, an open flag and a history stack, so goBack pops as the real driver does.
const Harness = ({
  initialStep = null,
  initialReward = null,
  rewards = [ACTIVE, ENDED],
  onChanged = () => {},
  onRequestSchedule = () => {},
  onClosed,
  log,
}: HarnessProps) => {
  const [step, setStep] = useState<string | null>(initialStep);
  const [open, setOpen] = useState(true);
  const [stack, setStack] = useState<(string | null)[]>([]);

  const nav: UseOwnerSheetResult = {
    sheet: open ? "rewards" : null,
    step,
    displayStepFor: (id) => (id === "rewards" ? step : null),
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

  return createElement(RewardsFlow, {
    venueId: "venue-1",
    venueName: "The Pub",
    nav,
    rewards: { status: "ready", items: rewards },
    initialReward,
    onChanged,
    onRequestSchedule,
  });
};

const heading = () => document.body.querySelector<HTMLElement>("[data-step-heading]")?.textContent ?? null;
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const fetchMock = vi.fn();

const jsonReply = (body: unknown) => ({ json: async () => body });

// Route by URL so the wizard's prefetch and the sheet's own calls can coexist.
const routeFetch = (routes: Record<string, (init?: RequestInit) => unknown>) => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!key) throw new Error(`unmocked fetch ${url}`);
    return jsonReply(routes[key](init));
  });
};

const SCHEDULED_CONTEXT = {
  scheduled: true,
  hasRecurringSchedule: true,
  scheduleDays: ["fri"],
  timezone: "America/New_York",
  allowedCadences: ["weekly"],
  scheduleShapes: [{ recurringType: "weekly", weekdayCount: 1 }],
  gameSlots: [],
};

describe("RewardsFlow", () => {
  beforeEach(() => {
    stubReducedMotion();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.body.removeAttribute("style");
    document.body.className = "";
  });

  it("opens on the list of active rewards, with 'offer another' and 'Ended rewards'", () => {
    render(createElement(Harness));
    expect(heading()).toBe("Your rewards");
    expect(screen.getByText("Trivia Night Appetizer")).toBeTruthy();
    expect(screen.queryByText("Last Month")).toBeNull();
    expect(button("+ Offer another reward")).toBeTruthy();
    expect(button("Ended rewards")).toBeTruthy();
  });

  it("shows ended rewards read-only, with the winner, and Back returns to the list", async () => {
    render(createElement(Harness));
    fireEvent.click(button("Ended rewards"));
    await waitFor(() => expect(heading()).toBe("Ended rewards"));
    expect(screen.getByText("Last Month")).toBeTruthy();
    expect(screen.getByText(/Winner: champ/)).toBeTruthy();
    // Not a button: an ended reward can't be opened or ended again.
    expect(screen.queryByRole("button", { name: /Last Month/ })).toBeNull();
    fireEvent.click(button(/Back/));
    await waitFor(() => expect(heading()).toBe("Your rewards"));
  });

  it("opens a reward's detail with its terms, top players and End reward", async () => {
    render(createElement(Harness, { initialStep: "detail", initialReward: ACTIVE }));
    expect(heading()).toBe("Trivia Night Appetizer");
    expect(screen.getByText("Top players")).toBeTruthy();
    expect(screen.getByText(/ace/)).toBeTruthy();
    expect(button("End reward")).toBeTruthy();
  });

  it("a detail screen with no reward (a reload lost it) is corrected to the list", async () => {
    const log: string[] = [];
    render(createElement(Harness, { initialStep: "detail", initialReward: null, log }));
    expect(heading()).toBe("Your rewards");
    await waitFor(() => expect(log).toContain("replace:all"));
  });

  it("End reward → counts → Archive sends DELETE mode=archive, tells the partner, and closes", async () => {
    const onChanged = vi.fn();
    const onClosed = vi.fn();
    routeFetch({
      "/api/owner/competitions/reward-1?mode=": () => ({ ok: true, outcome: "archived" }),
      "/api/owner/competitions/reward-1": () => ({ ok: true, counts: { awarded: 3, unredeemed: 2, redeemed: 1 } }),
    });
    render(createElement(Harness, { initialStep: "detail", initialReward: ACTIVE, onChanged, onClosed }));

    fireEvent.click(button("End reward"));
    await waitFor(() => expect(heading()).toBe("Remove “Trivia Night Appetizer”?"));
    // Buttons stay disabled until the prize counts arrive, then the cost is spelled out.
    await screen.findByText(/still unredeemed/);
    expect(screen.getByText(/voids 2 unredeemed prizes/)).toBeTruthy();

    fireEvent.click(button(/Archive/));
    await waitFor(() => expect(onClosed).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalledWith({
      message: "Reward archived. Prizes already awarded still work.",
      removed: true,
    });
    const deleteCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "DELETE");
    expect(deleteCall?.[0]).toBe("/api/owner/competitions/reward-1?mode=archive");
  });

  it("Delete anyway sends mode=delete and reports what the server did", async () => {
    const onChanged = vi.fn();
    routeFetch({
      "/api/owner/competitions/reward-1?mode=": () => ({ ok: true, outcome: "deleted", redeemedKept: 1 }),
      "/api/owner/competitions/reward-1": () => ({ ok: true, counts: { awarded: 1, unredeemed: 0, redeemed: 1 } }),
    });
    render(createElement(Harness, { initialStep: "detail", initialReward: ACTIVE, onChanged }));
    fireEvent.click(button("End reward"));
    await screen.findByText(/all of which have already been redeemed/);
    fireEvent.click(button("Delete anyway"));
    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith({
        message: "Reward deleted. 1 already-redeemed prize kept for your records.",
        removed: true,
      }),
    );
  });

  it("shows a failed remove in the sheet and leaves it open", async () => {
    const onClosed = vi.fn();
    routeFetch({
      "/api/owner/competitions/reward-1?mode=": () => ({ ok: false, error: "Nope." }),
      "/api/owner/competitions/reward-1": () => ({ ok: true, counts: { awarded: 0, unredeemed: 0, redeemed: 0 } }),
    });
    render(createElement(Harness, { initialStep: "detail", initialReward: ACTIVE, onClosed }));
    fireEvent.click(button("End reward"));
    await screen.findByText(/nothing players hold is affected/);
    fireEvent.click(button(/Archive/));
    await screen.findByText("Nope.");
    expect(onClosed).not.toHaveBeenCalled();
    expect(button(/Archive/)).toHaveProperty("disabled", false);
  });

  it("shows why it can't end when the prize counts fail to load", async () => {
    routeFetch({ "/api/owner/competitions/reward-1": () => ({ ok: false, error: "Counts unavailable." }) });
    render(createElement(Harness, { initialStep: "detail", initialReward: ACTIVE }));
    fireEvent.click(button("End reward"));
    await screen.findByText("Counts unavailable.");
    expect(button(/Archive/)).toHaveProperty("disabled", true);
    expect(button("Delete anyway")).toHaveProperty("disabled", true);
  });

  it("a late prize-count reply for one reward never lands on another reward's End screen", async () => {
    const OTHER = makeReward({ id: "reward-3", name: "Second Reward" });
    let resolveFirst: (value: unknown) => void = () => {};
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/owner/competitions/reward-1") {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      if (url === "/api/owner/competitions/reward-3") {
        return Promise.resolve(jsonReply({ ok: true, counts: { awarded: 0, unredeemed: 0, redeemed: 0 } }));
      }
      return Promise.reject(new Error(`unmocked fetch ${url}`));
    });
    render(createElement(Harness, { rewards: [ACTIVE, OTHER] }));

    fireEvent.click(screen.getByText("Trivia Night Appetizer"));
    await waitFor(() => expect(button("End reward")).toBeTruthy());
    fireEvent.click(button("End reward"));
    await waitFor(() => expect(heading()).toBe("Remove “Trivia Night Appetizer”?"));
    fireEvent.click(button("Back"));
    await waitFor(() => expect(button("End reward")).toBeTruthy());
    fireEvent.click(button("Back"));
    await waitFor(() => expect(screen.getByText("Second Reward")).toBeTruthy());

    fireEvent.click(screen.getByText("Second Reward"));
    await waitFor(() => expect(button("End reward")).toBeTruthy());
    fireEvent.click(button("End reward"));
    await screen.findByText(/nothing players hold is affected/);

    await act(async () => {
      resolveFirst(jsonReply({ ok: true, counts: { awarded: 3, unredeemed: 2, redeemed: 1 } }));
    });
    expect(heading()).toBe("Remove “Second Reward”?");
    expect(screen.queryByText(/voids 2 unredeemed prizes/)).toBeNull();
    expect(screen.getByText(/nothing players hold is affected/)).toBeTruthy();
  });

  it("hosts the wizard: each move is a history step, Cancel from the list returns to it", async () => {
    const log: string[] = [];
    routeFetch({ "/api/owner/rewards/context": () => ({ ok: true, context: SCHEDULED_CONTEXT }) });
    render(createElement(Harness, { log }));

    fireEvent.click(button("+ Offer another reward"));
    await waitFor(() => expect(heading()).toBe("Which reward?"));
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());

    fireEvent.click(button(/Live Trivia Challenge/));
    await waitFor(() => expect(heading()).toBe("Live Trivia Challenge"));
    expect(log).toEqual(["go:definition", "go:terms"]);

    // The wizard's Back (labelled with the reward) is the phone's Back.
    fireEvent.click(button(/Live Trivia Challenge/));
    await waitFor(() => expect(heading()).toBe("Which reward?"));
    expect(log.at(-1)).toBe("back:definition");

    fireEvent.click(button("Cancel"));
    await waitFor(() => expect(heading()).toBe("Your rewards"));
    expect(log.at(-1)).toBe("back:all");
  });

  it("opened straight on the wizard, Cancel closes the sheet", async () => {
    const onClosed = vi.fn();
    routeFetch({ "/api/owner/rewards/context": () => ({ ok: true, context: SCHEDULED_CONTEXT }) });
    render(createElement(Harness, { initialStep: "definition", onClosed }));
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(button("Cancel"));
    expect(onClosed).toHaveBeenCalled();
  });

  it("creates a reward: POSTs the submission, names the reward in the confirmation, closes", async () => {
    const onChanged = vi.fn();
    const onClosed = vi.fn();
    routeFetch({
      "/api/owner/rewards/context": () => ({ ok: true, context: SCHEDULED_CONTEXT }),
      "/api/owner/rewards": () => ({ ok: true }),
    });
    render(createElement(Harness, { initialStep: "definition", onChanged, onClosed }));
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());

    fireEvent.click(button(/Live Trivia Challenge/));
    await waitFor(() => expect(heading()).toBe("Live Trivia Challenge"));
    fireEvent.click(button(/Next: Offer a Prize/));
    await waitFor(() => expect(heading()).toBe("Prize"));
    fireEvent.click(button(/Next: Confirm/));
    await waitFor(() => expect(heading()).toBe("Confirm"));
    fireEvent.click(button("Create Reward"));

    await waitFor(() => expect(onClosed).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalledWith({ message: "Live Trivia Challenge reward created" });
    const post = fetchMock.mock.calls.find(([url, init]) => url === "/api/owner/rewards" && (init as RequestInit)?.method === "POST");
    const body = JSON.parse((post?.[1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ venueId: "venue-1", definitionId: "live_trivia_challenge", winCondition: "points_threshold" });
  });

  it("hands off to Schedule when the reward's game isn't scheduled", async () => {
    const onRequestSchedule = vi.fn();
    routeFetch({
      "/api/owner/rewards/context": () => ({ ok: true, context: { ...SCHEDULED_CONTEXT, scheduled: false } }),
    });
    render(createElement(Harness, { initialStep: "definition", onRequestSchedule }));
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(button(/Live Trivia Challenge/));
    fireEvent.click(await screen.findByRole("button", { name: "Schedule Live Trivia" }));
    expect(onRequestSchedule).toHaveBeenCalledTimes(1);
  });

  it("a wizard step whose data a reload lost is corrected in place", async () => {
    const log: string[] = [];
    routeFetch({ "/api/owner/rewards/context": () => ({ ok: true, context: SCHEDULED_CONTEXT }) });
    render(createElement(Harness, { initialStep: "confirm", log }));
    await waitFor(() => expect(log).toContain("replace:definition"));
    await waitFor(() => expect(heading()).toBe("Which reward?"));
  });

  describe("Discard this reward?", () => {
    it("closes at once on the Definition step and on the lists", async () => {
      const onClosed = vi.fn();
      routeFetch({ "/api/owner/rewards/context": () => ({ ok: true, context: SCHEDULED_CONTEXT }) });
      render(createElement(Harness, { initialStep: "definition", onClosed }));
      await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
      fireEvent.click(button("Close"));
      expect(onClosed).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("asks once the partner is past Definition; Keep editing stays, Discard closes", async () => {
      const onClosed = vi.fn();
      routeFetch({ "/api/owner/rewards/context": () => ({ ok: true, context: SCHEDULED_CONTEXT }) });
      render(createElement(Harness, { initialStep: "definition", onClosed }));
      await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
      fireEvent.click(button(/Live Trivia Challenge/));
      await waitFor(() => expect(heading()).toBe("Live Trivia Challenge"));

      fireEvent.click(button("Close"));
      expect(screen.getByRole("alertdialog", { name: "Discard this reward?" })).toBeTruthy();
      expect(onClosed).not.toHaveBeenCalled();

      fireEvent.click(button("Keep editing"));
      await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
      expect(heading()).toBe("Live Trivia Challenge");

      fireEvent.click(button("Close"));
      fireEvent.click(button("Discard"));
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it("never asks on a reward's detail screen", () => {
      const onClosed = vi.fn();
      render(createElement(Harness, { initialStep: "detail", initialReward: ACTIVE, onClosed }));
      fireEvent.click(button("Close"));
      expect(onClosed).toHaveBeenCalledTimes(1);
    });
  });
});
