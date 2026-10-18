// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CreateRewardWizard,
  type RewardCreationContextDTO,
} from "@/components/rewards/CreateRewardWizard";

// The wizard is shared: the admin Rewards section uses it as-is, the Partner
// Dashboard's Rewards sheet uses it with the opt-in props (docs/partner-dashboard-
// app-redesign-plan.md §4f). The snapshots below were recorded against the wizard
// BEFORE those props existed, so they pin "admin with no new props renders the
// same step markup as before — no transition wrapper".

const LIVE_CONTEXT: RewardCreationContextDTO = {
  scheduled: true,
  hasRecurringSchedule: true,
  scheduleDays: ["fri"],
  timezone: "America/New_York",
  allowedCadences: ["weekly"],
  scheduleShapes: [{ recurringType: "weekly", weekdayCount: 1 }],
  gameSlots: [],
};

const fetchContext = vi.fn(async (_venueId: string, definitionId: string): Promise<RewardCreationContextDTO> =>
  definitionId === "live_trivia_challenge"
    ? LIVE_CONTEXT
    : { ...LIVE_CONTEXT, scheduled: false },
);

const renderAdmin = () =>
  render(
    createElement(CreateRewardWizard, {
      variant: "admin",
      venues: [{ id: "venue-1", name: "The Pub" }],
      defaultVenueId: "venue-1",
      scheduleLinkHref: "/admin/schedule",
      fetchContext,
      onSubmit: async () => ({ ok: true as const }),
      onCreated: () => {},
      onCancel: () => {},
    }),
  );

afterEach(() => {
  cleanup();
  fetchContext.mockClear();
});

describe("CreateRewardWizard — admin variant, no new props", () => {
  it("renders the same markup at every step, with no transition wrapper", async () => {
    const { container } = renderAdmin();
    await waitFor(() => expect(fetchContext).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    expect(container.innerHTML).toMatchSnapshot("definition");

    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText("How many, how often?");
    expect(container.innerHTML).toMatchSnapshot("terms");

    fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
    await screen.findByText("Prize");
    expect(container.innerHTML).toMatchSnapshot("prize");

    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    expect(container.innerHTML).toMatchSnapshot("confirm");

    expect(container.querySelector("[data-step]")).toBeNull();
    expect(container.querySelector("[data-step-heading]")).toBeNull();
  });
});

describe("CreateRewardWizard — Confirm shows what guests will see", () => {
  it("composes the guest wording from the wizard's answers and the venue's schedule", async () => {
    const withGame: RewardCreationContextDTO = {
      ...LIVE_CONTEXT,
      gameSlots: [
        {
          scheduleId: "sched-1",
          weekday: "fri",
          recurring: true,
          title: "Trivia Night",
          timeLabel: "8:00 PM",
          dateLabel: null,
          label: "Friday 8:00 PM — Trivia Night",
        },
      ],
    };
    const { container } = render(
      createElement(CreateRewardWizard, {
        variant: "admin",
        venues: [{ id: "venue-1", name: "The Pub" }],
        defaultVenueId: "venue-1",
        scheduleLinkHref: "/admin/schedule",
        fetchContext: async () => withGame,
        onSubmit: async () => ({ ok: true as const }),
        onCreated: () => {},
        onCancel: () => {},
      }),
    );
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText("How many, how often?");
    fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
    await screen.findByText("Prize");
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");

    const text = container.textContent ?? "";
    expect(text).toContain("What guests will see");
    expect(text).toContain("Earn 500 points in Live Trivia this week and win 50% off an appetizer.");
    expect(text).toMatch(/8(:00)? ?PM/);
    expect(text).not.toContain("this venue");
    expect(text).not.toContain("Awarded to the winner");
  });
});

// ─── The opt-in props the Partner Dashboard's Rewards sheet uses ────────────

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

type OwnerProps = Partial<Parameters<typeof CreateRewardWizard>[0]>;

const renderOwner = (props: OwnerProps = {}, context: RewardCreationContextDTO | null = null) =>
  render(
    createElement(CreateRewardWizard, {
      variant: "owner",
      venues: [{ id: "venue-1", name: "The Pub" }],
      defaultVenueId: "venue-1",
      scheduleLinkHref: "/owner/dashboard?sheet=schedule",
      fetchContext: context ? async () => context : fetchContext,
      onSubmit: async () => ({ ok: true as const }),
      onCreated: () => {},
      onCancel: () => {},
      ...props,
    }),
  );

describe("CreateRewardWizard — sheet mode (animateSteps)", () => {
  it("wraps the step in the slide container, with a heading for focus and no card chrome", async () => {
    stubReducedMotion();
    const { container } = renderOwner({ animateSteps: true });
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    expect(container.querySelector("[data-step='definition']")).not.toBeNull();
    expect(container.querySelector("[data-step-heading]")?.textContent).toBe("Which game is this prize for?");
    expect(container.firstElementChild?.className).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await waitFor(() => expect(container.querySelector("[data-step='terms']")).not.toBeNull());
    await waitFor(() =>
      expect(container.querySelector("[data-step-heading]")?.textContent).toBe("Live Trivia Challenge"),
    );
  });

  it("shows the card and no wrapper when the prop is left out", async () => {
    const { container } = renderOwner();
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    expect(container.querySelector("[data-step]")).toBeNull();
    expect(container.querySelector("[data-step-heading]")).toBeNull();
    expect(container.firstElementChild?.className).toContain("rounded-2xl");
  });
});

describe("CreateRewardWizard — onRequestSchedule", () => {
  const unscheduled: RewardCreationContextDTO = { ...LIVE_CONTEXT, scheduled: false };

  it("calls the handler instead of following the link", async () => {
    const onRequestSchedule = vi.fn();
    const { container } = renderOwner({ onRequestSchedule }, unscheduled);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    const link = await screen.findByRole("button", { name: "Schedule Live Trivia" });
    expect(container.querySelector("a[href]")).toBeNull();
    fireEvent.click(link);
    expect(onRequestSchedule).toHaveBeenCalledTimes(1);
  });

  it("keeps the plain link when the handler is left out (admin)", async () => {
    const { container } = renderOwner({ variant: "admin", scheduleLinkHref: "/admin/x" }, unscheduled);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText(/Schedule Live Trivia/);
    expect(container.querySelector("a[href='/admin/x']")?.textContent).toBe("Schedule Live Trivia");
  });
});

describe("CreateRewardWizard — controlled step", () => {
  it("reports each move to the host and follows the step it is given", async () => {
    stubReducedMotion();
    const onStepChange = vi.fn();
    const view = renderOwner({ animateSteps: true, step: "definition", onStepChange });
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("terms", "forward"));
    // The host has not moved `step` yet, so the wizard is still on Definition.
    expect(view.container.querySelector("[data-step='definition']")).not.toBeNull();

    view.rerender(
      createElement(CreateRewardWizard, {
        variant: "owner",
        venues: [{ id: "venue-1", name: "The Pub" }],
        defaultVenueId: "venue-1",
        scheduleLinkHref: "/x",
        fetchContext,
        onSubmit: async () => ({ ok: true as const }),
        onCreated: () => {},
        onCancel: () => {},
        animateSteps: true,
        step: "terms",
        onStepChange,
      }),
    );
    await waitFor(() => expect(view.container.querySelector("[data-step='terms']")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia Challenge/ }));
    expect(onStepChange).toHaveBeenLastCalledWith("definition", "back");
  });

  it("asks the players question after the terms for a contest, and sends a points target past it", async () => {
    stubReducedMotion();
    const onStepChange = vi.fn();
    const ownerProps = (step: "definition" | "terms" | "players") =>
      createElement(CreateRewardWizard, {
        variant: "owner",
        venues: [{ id: "venue-1", name: "The Pub" }],
        defaultVenueId: "venue-1",
        scheduleLinkHref: "/x",
        fetchContext,
        onSubmit: async () => ({ ok: true as const }),
        onCreated: () => {},
        onCancel: () => {},
        animateSteps: true,
        step,
        onStepChange,
      });
    const view = render(ownerProps("definition"));
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("terms", "forward"));
    view.rerender(ownerProps("terms"));
    await waitFor(() => expect(view.container.querySelector("[data-step='terms'][data-step-phase='idle']")).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Winner of the game/ }));
    onStepChange.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Next: Minimum Players/ }));
    expect(onStepChange).toHaveBeenLastCalledWith("players", "forward");
    view.rerender(ownerProps("players"));
    await waitFor(() => expect(view.container.querySelector("[data-step='players']")).not.toBeNull());
    expect(view.container.querySelector("[data-step-heading]")?.textContent).toBe("How many players must play?");

    // A points target has no such question: a `?step=players` for it lands on Prize.
    view.rerender(ownerProps("terms"));
    await waitFor(() => expect(view.container.querySelector("[data-step='terms'][data-step-phase='idle']")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Points target/ }));
    onStepChange.mockClear();
    view.rerender(ownerProps("players"));
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("prize", "replace"));
  });

  it("an unscheduled pick drops the previous pick's context, so Forward to Terms can't mix them", async () => {
    stubReducedMotion();
    const onStepChange = vi.fn();
    const ownerProps = (step: "definition" | "terms") =>
      createElement(CreateRewardWizard, {
        variant: "owner",
        venues: [{ id: "venue-1", name: "The Pub" }],
        defaultVenueId: "venue-1",
        scheduleLinkHref: "/x",
        fetchContext,
        onSubmit: async () => ({ ok: true as const }),
        onCreated: () => {},
        onCancel: () => {},
        animateSteps: true,
        step,
        onStepChange,
      });
    const view = render(ownerProps("definition"));
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("terms", "forward"));
    view.rerender(ownerProps("terms"));
    await waitFor(() => expect(view.container.querySelector("[data-step='terms'][data-step-phase='idle']")).not.toBeNull());
    view.rerender(ownerProps("definition"));
    await waitFor(() => expect(view.container.querySelector("[data-step='definition'][data-step-phase='idle']")).not.toBeNull());

    // Returning to Definition refreshes the schedule prefetch. Wait for the tile
    // to accept clicks before exercising an unscheduled pick and browser Forward.
    await waitFor(() => expect((screen.getByRole("button", { name: /NFL Pick/ }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    onStepChange.mockClear();
    view.rerender(ownerProps("terms")); // the browser's Forward
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("definition", "replace"));
    expect(view.container.querySelector("[data-step='terms']")).toBeNull();
  });

  it("corrects a step whose data a reload lost back to Definition", async () => {
    stubReducedMotion();
    const onStepChange = vi.fn();
    const { container } = renderOwner({ animateSteps: true, step: "prize", onStepChange });
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("definition", "replace"));
    expect(container.querySelector("[data-step='definition']")).not.toBeNull();
  });
});

// ─── What the wizard SUBMITS (review-fixes plan Phase 1, F9) ────────────────
// Pinned before cadence/activeDays/quota derivation moved into the shared
// deriveRewardTerms (lib/rewardTerms.ts), so the refactor provably changes no
// payload. The server re-derives all of it; these pin the client's copy.

const NFL_CONTEXT: RewardCreationContextDTO = {
  scheduled: true,
  hasRecurringSchedule: true,
  scheduleDays: [],
  timezone: null,
  allowedCadences: ["none", "weekly"],
  scheduleShapes: [],
  gameSlots: [],
  nflSeason: {
    season: 2026,
    fromWeek: 5,
    fromWeekStartDate: "2026-10-08",
    seasonFirstWeekStartDate: "2026-09-10",
    seasonEndDate: "2027-01-11",
    weeksRemaining: 14,
  },
};

const PICKER_CONTEXT: RewardCreationContextDTO = {
  ...LIVE_CONTEXT,
  scheduleDays: ["tue", "fri"],
  scheduleShapes: [{ recurringType: "weekly", weekdayCount: 2 }],
  gameSlots: [
    {
      scheduleId: "sched-1",
      weekday: "tue",
      recurring: true,
      title: "Trivia Night",
      timeLabel: "8:00 PM",
      dateLabel: null,
      label: "Tuesday 8:00 PM — Trivia Night",
    },
    {
      scheduleId: "sched-1",
      weekday: "fri",
      recurring: true,
      title: "Trivia Night",
      timeLabel: "8:00 PM",
      dateLabel: null,
      label: "Friday 8:00 PM — Trivia Night",
    },
  ],
};

const renderForSubmit = (context: RewardCreationContextDTO) => {
  const onSubmit = vi.fn(async () => ({ ok: true as const }));
  const view = render(
    createElement(CreateRewardWizard, {
      variant: "admin",
      venues: [{ id: "venue-1", name: "The Pub" }],
      defaultVenueId: "venue-1",
      scheduleLinkHref: "/admin/schedule",
      fetchContext: async (_venueId: string, definitionId: string) =>
        definitionId === "nfl_pickem_challenge"
          ? context.nflSeason
            ? context
            : { ...context, scheduled: false }
          : context.nflSeason
            ? { ...context, scheduled: false }
            : context,
      onSubmit,
      onCreated: () => {},
      onCancel: () => {},
    }),
  );
  return { ...view, onSubmit };
};

/** Terms → (Players, when the reward offers a minimum) → Prize. `minimum` answers the Players step. */
const leaveTerms = async (minimum: "none" | number = "none") => {
  fireEvent.click(screen.getByRole("button", { name: /Next: (Offer a Prize|Minimum Players)/ }));
  const landed = await screen.findByText(/^(Prize|How many players must play\?)$/);
  if (landed.textContent === "Prize") return;
  if (minimum === "none") {
    fireEvent.click(screen.getByRole("button", { name: "No minimum" }));
  } else {
    fireEvent.click(screen.getByRole("button", { name: "Set a minimum" }));
    fireEvent.change(screen.getByLabelText("Minimum players"), { target: { value: String(minimum) } });
  }
  fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
  await screen.findByText("Prize");
};

const walkToConfirm = async (minimum: "none" | number = "none") => {
  await leaveTerms(minimum);
  fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
  await screen.findByText("Confirm");
};

const PRIZE = {
  prizeKind: "menu_item",
  menuItem: "appetizer",
  menuItemName: null,
  discountKind: "percent",
  discountValue: 50,
};

describe("CreateRewardWizard — submitted terms", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("points target: weekly sentence cadence, the chosen quantity, no slots or scope", async () => {
    const { onSubmit } = renderForSubmit(LIVE_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText("How many, how often?");
    await walkToConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      winCondition: "points_threshold",
      threshold: 500,
      winnerQuota: 1,
      prize: PRIZE,
      gameWinnerSlots: undefined,
      nflWeekScope: undefined,
    });
  });

  it("game picker: cadence and quota come from the picked games", async () => {
    vi.stubEnv("NEXT_PUBLIC_REWARD_GAME_PICKER_ENABLED", "true");
    const { onSubmit } = renderForSubmit(PICKER_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText("How many, how often?");
    fireEvent.click(screen.getByRole("button", { name: /Winner of the game/ }));
    // Recurring games render as one time chip per weekday column (Sun…Sat).
    const [tuesday, friday] = await screen.findAllByRole("button", { name: "8:00 PM" });
    fireEvent.click(tuesday);
    fireEvent.click(friday);
    await walkToConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cadence: "weekly",
        winCondition: "game_winner",
        winnerQuota: 2,
        gameWinnerSlots: [
          { scheduleId: "sched-1", weekday: "tue" },
          { scheduleId: "sched-1", weekday: "fri" },
        ],
        nflWeekScope: undefined,
      }),
    );
  });

  it("NFL every week, most picks right: weekly cadence, exactly 1 winner, the server's season", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T16:00:00.000Z"));
    const { onSubmit } = renderForSubmit(NFL_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Most picks right/ }));
    await walkToConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        definitionId: "nfl_pickem_challenge",
        cadence: "weekly",
        winCondition: "game_winner",
        winnerQuota: 1,
        gameWinnerSlots: undefined,
        nflWeekScope: { kind: "weekly", season: 2026 },
      }),
    );
    // "No minimum" on the Players step: even one player can win (plan A2), so nothing is sent.
    expect((onSubmit.mock.calls[0] as unknown[])[0]).not.toHaveProperty("minPlayers");
  });

  it("NFL most picks: the Players step sends the partner's number, worded for the week", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T16:00:00.000Z"));
    const { onSubmit } = renderForSubmit(NFL_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Most picks right/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next: Minimum Players/ }));
    await screen.findByText("How many players must play?");
    expect(document.body.textContent).toContain("make picks that week");
    expect(screen.getByRole("button", { name: /Next: Offer a Prize/ })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Set a minimum" }));
    expect(screen.getByLabelText("Minimum players")).toHaveProperty("value", "3");
    fireEvent.change(screen.getByLabelText("Minimum players"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
    await screen.findByText("Prize");
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    expect(screen.getByText("Minimum players").nextSibling?.textContent).toBe("At least 6");
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ winCondition: "game_winner", nflWeekScope: { kind: "weekly", season: 2026 }, minPlayers: 6 }),
    );
  });

  it("NFL most picks for the whole season words the Players step for the season", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T16:00:00.000Z"));
    renderForSubmit(NFL_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Most picks right/ }));
    fireEvent.click(screen.getByRole("button", { name: /Whole season/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next: Minimum Players/ }));
    await screen.findByText("How many players must play?");
    expect(document.body.textContent).toContain("make picks that season");
  });

  it("NFL whole season: a one-off cadence from the server's fromWeek", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T16:00:00.000Z"));
    const { onSubmit } = renderForSubmit(NFL_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Whole season/ }));
    await walkToConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cadence: "none",
        winCondition: "points_threshold",
        threshold: 10,
        winnerQuota: 1,
        nflWeekScope: { kind: "season", season: 2026, fromWeek: 5 },
      }),
    );
    // Never a minimum on a picks target (plan A1).
    expect((onSubmit.mock.calls[0] as unknown[])[0]).not.toHaveProperty("minPlayers");
  });
});

const SINGLE_WEEK_CONTEXT: RewardCreationContextDTO = {
  ...NFL_CONTEXT,
  nflSeason: {
    ...NFL_CONTEXT.nflSeason!,
    selectableWeeks: [
      { weekNumber: 9, weekStartDate: "2026-11-05", weekEndDate: "2026-11-09", label: "Week 9 · Nov 5 – Nov 9", gamesCount: 6 },
      { weekNumber: 10, weekStartDate: "2026-11-12", weekEndDate: "2026-11-16", label: "Week 10 · Nov 12 – Nov 16", gamesCount: 14 },
    ],
  },
};

describe("CreateRewardWizard — NFL single week", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the Single week card when the server offers no weeks", async () => {
    renderForSubmit(NFL_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    await screen.findByRole("button", { name: /Whole season/ });
    expect(screen.queryByRole("button", { name: /Single week/ })).toBeNull();
  });

  it("submits only the chosen week number, defaulting to the first offered week", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T16:00:00.000Z"));
    const { onSubmit } = renderForSubmit(SINGLE_WEEK_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Single week/ }));
    const select = screen.getByLabelText("Which week?") as HTMLSelectElement;
    expect(select.value).toBe("9");
    fireEvent.change(select, { target: { value: "10" } });
    await walkToConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        cadence: "none",
        winnerQuota: 1,
        nflWeekScope: { kind: "single_week", season: 2026, week: 10 },
      }),
    );
  });

  it("disables picks targets above the week's game count and explains why", async () => {
    renderForSubmit(SINGLE_WEEK_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Single week/ }));
    expect(screen.getByText(/Week 9 has 6 games, so targets above 6/)).toBeTruthy();
  });
});

// ─── F1: the NFL preview's "Starts …" follows the server's rule ─────────────
// A weekly reward's first covered week is the SEASON's first week
// (resolveNFLRewardStartDate), so mid-season it is already running — even on a
// Tuesday between NFL weeks, when the next week (fromWeek) hasn't begun.

describe("CreateRewardWizard — NFL guest preview start date", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const previewFor = async (now: string, scope: RegExp, context: RewardCreationContextDTO = NFL_CONTEXT) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const { container } = renderForSubmit(context);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Most picks right/ }));
    fireEvent.click(screen.getByRole("button", { name: scope }));
    await walkToConfirm();
    return container.textContent ?? "";
  };

  it("weekly, Tuesday mid-season: no 'Starts', the every-Thursday line the server shows", async () => {
    // Tue Oct 6 2026, noon ET — Week 5 starts Thu Oct 8; the season opened Sep 10.
    const text = await previewFor("2026-10-06T16:00:00.000Z", /Every week/);
    expect(text).not.toContain("Starts ");
    expect(text).toContain("A new contest starts every Thursday of the NFL season.");
  });

  it("weekly, before the season: 'Starts' the season's first week", async () => {
    // Preseason the server's "current, else next" week IS Week 1.
    const preseason: RewardCreationContextDTO = {
      ...NFL_CONTEXT,
      nflSeason: { ...NFL_CONTEXT.nflSeason!, fromWeek: 1, fromWeekStartDate: "2026-09-10", weeksRemaining: 18 },
    };
    const text = await previewFor("2026-08-20T16:00:00.000Z", /Every week/, preseason);
    expect(text).toContain("Starts Thu, Sep 10.");
  });

  it("whole season, Tuesday between weeks: 'Starts' the reward's own first week", async () => {
    const text = await previewFor("2026-10-06T16:00:00.000Z", /Whole season/);
    expect(text).toContain("Starts Thu, Oct 8.");
  });
});

// F11: a venue whose only Live Trivia game is a one-off has no period to pick,
// but the reward still submits (cadence "none") — so the preview must show too.

describe("CreateRewardWizard — guest preview at a one-off-only venue", () => {
  const ONE_OFF_SLOT = {
    scheduleId: "sched-once",
    weekday: "tue" as const,
    recurring: false,
    title: "Halloween Special",
    timeLabel: "8:00 PM",
    dateLabel: "Tue, Oct 13",
    label: "Tue, Oct 13 8:00 PM — Halloween Special",
  };
  const ONE_OFF_CONTEXT: RewardCreationContextDTO = {
    ...LIVE_CONTEXT,
    hasRecurringSchedule: false,
    scheduleDays: ["tue"],
    allowedCadences: [],
    scheduleShapes: [{ recurringType: "none", weekdayCount: 1 }],
    gameSlots: [ONE_OFF_SLOT],
  };

  it("points target: shows the one-off wording and still submits as a one-off", async () => {
    const { container, onSubmit } = renderForSubmit(ONE_OFF_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText("How many, how often?");
    await walkToConfirm();
    expect(container.textContent).toContain("What guests will see");
    expect(container.textContent).toContain("Earn 500 points at Live Trivia on Tue, Oct 13");
    expect(container.textContent).toContain("It starts at 8:00 PM.");
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cadence: "none", winnerQuota: 1 }));
  });
});

// docs/pos-rewards-integration-plan.md Phase 1: a percent-off prize at a venue with a POS
// connected is also asked the most it takes off at the register. OPTIONAL since Phase 2d
// (Andrew, §6 item 3): blank = no limit. Without a POS the step is unchanged (the snapshots
// above pin that), and dollar-off / gift-card prizes never ask.
describe("CreateRewardWizard — register limit (POS)", () => {
  const POS_CONTEXT: RewardCreationContextDTO = { ...LIVE_CONTEXT, posConnected: true };

  const toPrize = async () => {
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText("How many, how often?");
    fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
    await screen.findByText("Prize");
  };

  it("is not asked when the venue has no POS", async () => {
    renderForSubmit(LIVE_CONTEXT);
    await toPrize();
    expect(screen.queryByLabelText(/Most it takes off at the register/)).toBeNull();
  });

  it("is optional for a percent-off prize: blank submits no limit", async () => {
    const { onSubmit } = renderForSubmit(POS_CONTEXT);
    await toPrize();
    expect(screen.getByLabelText(/Most it takes off at the register/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    expect(screen.queryByText(/Most off at the register/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(((onSubmit.mock.calls[0] as unknown[])[0] as { prize: unknown }).prize).toEqual(PRIZE);
  });

  it("refuses a typed value that isn't a dollar amount, and submits a valid one in cents", async () => {
    const { onSubmit } = renderForSubmit(POS_CONTEXT);
    await toPrize();
    const input = screen.getByLabelText(/Most it takes off at the register/);

    fireEvent.change(input, { target: { value: "twelve" } });
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    expect(await screen.findByText(/leave it blank for no limit/)).toBeTruthy();
    expect(screen.queryByText("Confirm")).toBeNull();

    fireEvent.change(input, { target: { value: "12.50" } });
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    expect(screen.getByText("$12.50")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(((onSubmit.mock.calls[0] as unknown[])[0] as { prize: unknown }).prize).toEqual({ ...PRIZE, posValueCents: 1250 });
  });

  it("is not asked for a dollar-off prize (the discount is the value)", async () => {
    renderForSubmit(POS_CONTEXT);
    await toPrize();
    fireEvent.click(screen.getByRole("button", { name: "Dollar amount off" }));
    expect(screen.queryByLabelText(/Most it takes off at the register/)).toBeNull();
  });
});

// docs/square-scannable-prizes-plan.md S3: a dollar-off prize gets a per-prize choice of how
// staff take it at a Square register, for everyone while the POS switch is on. Default = discount.
describe("CreateRewardWizard — scannable gift card choice (POS)", () => {
  const toPrize = async () => {
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText("How many, how often?");
    fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
    await screen.findByText("Prize");
  };

  afterEach(() => vi.unstubAllEnvs());

  it("is hidden when the POS switch is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "");
    renderForSubmit(LIVE_CONTEXT);
    await toPrize();
    fireEvent.click(screen.getByRole("button", { name: "Dollar amount off" }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("is hidden for percent-off, shown for dollar-off, even with no Square connected", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
    renderForSubmit(LIVE_CONTEXT);
    await toPrize();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dollar amount off" }));
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Apply a discount/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Percentage off" }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("sends posDelivery only when the gift card is chosen; the default submits no field", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
    const first = renderForSubmit(LIVE_CONTEXT);
    await toPrize();
    fireEvent.click(screen.getByRole("button", { name: "Dollar amount off" }));
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(first.onSubmit).toHaveBeenCalledTimes(1));
    const defaultPrize = (first.onSubmit.mock.calls[0] as unknown[])[0] as { prize: Record<string, unknown> };
    expect("posDelivery" in defaultPrize.prize).toBe(false);
    cleanup();

    const second = renderForSubmit(LIVE_CONTEXT);
    await toPrize();
    fireEvent.click(screen.getByRole("button", { name: "Dollar amount off" }));
    fireEvent.click(screen.getByRole("radio", { name: /Scannable gift card/ }));
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(second.onSubmit).toHaveBeenCalledTimes(1));
    const chosen = (second.onSubmit.mock.calls[0] as unknown[])[0] as { prize: Record<string, unknown> };
    expect(chosen.prize.posDelivery).toBe("gift_card");
    expect(chosen.prize.discountKind).toBe("dollar");
  });

  it("switching back to percent-off drops a chosen gift card", async () => {
    vi.stubEnv("NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED", "true");
    const { onSubmit } = renderForSubmit(LIVE_CONTEXT);
    await toPrize();
    fireEvent.click(screen.getByRole("button", { name: "Dollar amount off" }));
    fireEvent.click(screen.getByRole("radio", { name: /Scannable gift card/ }));
    fireEvent.click(screen.getByRole("button", { name: "Percentage off" }));
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect("posDelivery" in ((onSubmit.mock.calls[0] as unknown[])[0] as { prize: object }).prize).toBe(false);
  });
});

// ─── Weekly places (docs/live-trivia-weekly-places-reward-plan.md Phase 6) ──────────────
// A third way to win a Live Trivia reward: top 1-3 players over the week, a prize per place, and
// an optional "at least N players took part" minimum (also offered for "Winner of the game").
// It is offered wherever the venue has a Live Trivia game, even a single one-off (Andrew,
// 2026-10-14), so the admin "terms" snapshot above shows its chip; the other steps are unchanged.
describe("CreateRewardWizard — weekly places", () => {
  const pickLiveTrivia = async (context: RewardCreationContextDTO = PICKER_CONTEXT) => {
    const view = renderForSubmit(context);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Live Trivia/ }));
    await screen.findByText("How many, how often?");
    return view;
  };

  const chooseWeeklyPlaces = async () => {
    fireEvent.click(screen.getByRole("button", { name: /Top players this week/ }));
    await screen.findByText("How many places?");
  };

  /** On the prize step, make this place's prize a gift card of this many dollars. */
  const setGiftCard = (place: string, dollars: string) => {
    fireEvent.click(screen.getByRole("tab", { name: place }));
    fireEvent.click(screen.getByRole("button", { name: "Gift Card" }));
    fireEvent.change(screen.getByLabelText("Gift card amount ($)"), { target: { value: dollars } });
  };

  const toPrizeStep = (minimum: "none" | number = "none") => leaveTerms(minimum);

  const submitted = (onSubmit: ReturnType<typeof vi.fn>) => (onSubmit.mock.calls[0] as unknown[])[0] as Record<string, unknown>;

  // Andrew, 2026-10-14: always an option once the venue has a Live Trivia game, even a single one-off.
  it("is offered at a venue whose only game is a one-off, and submits weekly", async () => {
    const ONE_OFF_ONLY: RewardCreationContextDTO = {
      ...LIVE_CONTEXT,
      hasRecurringSchedule: false,
      scheduleDays: ["tue"],
      allowedCadences: [],
      scheduleShapes: [{ recurringType: "none", weekdayCount: 1 }],
      gameSlots: [
        {
          scheduleId: "sched-once",
          weekday: "tue",
          recurring: false,
          title: "Halloween Special",
          timeLabel: "8:00 PM",
          dateLabel: "Tue, Oct 13",
          label: "Tue, Oct 13 8:00 PM — Halloween Special",
        },
      ],
    };
    const { onSubmit } = await pickLiveTrivia(ONE_OFF_ONLY);
    await chooseWeeklyPlaces();
    expect(screen.getByText(/a single game decides its week/)).toBeTruthy();
    await toPrizeStep();
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(submitted(onSubmit)).toEqual(
      expect.objectContaining({ winCondition: "ranked_places", cadence: "weekly", winnerQuota: 3 }),
    );
  });

  it("is not offered when no game night can be resolved at all", async () => {
    await pickLiveTrivia({ ...LIVE_CONTEXT, scheduleDays: [], gameSlots: [] });
    expect(screen.queryByRole("button", { name: /Top players this week/ })).toBeNull();
  });

  it("is offered with the venue's real nights, and replaces the points target and the sentence", async () => {
    await pickLiveTrivia();
    expect(screen.getByRole("button", { name: /Top players this week/ })).toBeTruthy();
    await chooseWeeklyPlaces();
    expect(screen.getByText(/points from all Tuesday and Friday games add up/)).toBeTruthy();
    // The "Points target" chip stays (it is a way to win); its target picker does not.
    expect(screen.getAllByText("Points target")).toHaveLength(1);
    expect(screen.queryByPlaceholderText("Custom target")).toBeNull();
    expect(screen.queryByText("How many, how often?")).toBeNull();
    expect(screen.getByText(/Starts right away/)).toBeTruthy();
  });

  it("submits a prize per place, weekly, with the place count as the quota and no minimum", async () => {
    const { onSubmit } = await pickLiveTrivia();
    await chooseWeeklyPlaces();
    await toPrizeStep();
    setGiftCard("1st place", "30");
    setGiftCard("2nd place", "20");
    setGiftCard("3rd place", "10");
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");

    const text = document.body.textContent ?? "";
    expect(text).toContain("What guests will see");
    expect(text).toContain("1st place wins a $30 gift card, 2nd place wins a $20 gift card and 3rd place wins a $10 gift card.");
    expect(text).toContain("Top 3 each week");
    expect(text).toContain("$30.00 gift card");

    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const body = submitted(onSubmit);
    expect(body).toMatchObject({
      venueId: "venue-1",
      definitionId: "live_trivia_challenge",
      cadence: "weekly",
      winCondition: "ranked_places",
      winnerQuota: 3,
      prize: { prizeKind: "gift_card", amount: 30 },
      placePrizes: [
        { prizeKind: "gift_card", amount: 30 },
        { prizeKind: "gift_card", amount: 20 },
        { prizeKind: "gift_card", amount: 10 },
      ],
    });
    expect(body).not.toHaveProperty("minPlayers");
    expect(body.gameWinnerSlots).toBeUndefined();
  });

  it("lets a place have its own kind of prize (a free appetizer for 2nd)", async () => {
    const { onSubmit } = await pickLiveTrivia();
    await chooseWeeklyPlaces();
    fireEvent.click(screen.getByRole("button", { name: "Top 2" }));
    await toPrizeStep();
    setGiftCard("1st place", "30");
    fireEvent.click(screen.getByRole("tab", { name: "2nd place" }));
    fireEvent.click(screen.getByRole("button", { name: "Percentage off" }));
    fireEvent.change(screen.getByDisplayValue("50"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const body = submitted(onSubmit);
    expect(body).toMatchObject({ winnerQuota: 2 });
    expect((body.placePrizes as unknown[]).length).toBe(2);
    expect((body.placePrizes as unknown[])[1]).toMatchObject({
      prizeKind: "menu_item",
      menuItem: "appetizer",
      discountKind: "percent",
      discountValue: 100,
    });
  });

  it("offers one tab per place and 'Same prize as 1st place' on the others", async () => {
    await pickLiveTrivia();
    await chooseWeeklyPlaces();
    fireEvent.click(screen.getByRole("button", { name: "1st only" }));
    await toPrizeStep();
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Same prize as 1st place/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("How many players must play?");
    fireEvent.click(screen.getByRole("button", { name: /^Live Trivia Challenge$/ }));
    await screen.findByText("How many places?");
    fireEvent.click(screen.getByRole("button", { name: "Top 3" }));
    await toPrizeStep();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    setGiftCard("1st place", "30");
    fireEvent.click(screen.getByRole("tab", { name: "3rd place" }));
    fireEvent.click(screen.getByRole("button", { name: /Same prize as 1st place/ }));
    expect(screen.getByLabelText("Gift card amount ($)")).toHaveProperty("value", "30");
  });

  it("names the place when a menu item is missing its name", async () => {
    const { onSubmit } = await pickLiveTrivia();
    await chooseWeeklyPlaces();
    await toPrizeStep();
    fireEvent.click(screen.getByRole("tab", { name: "2nd place" }));
    fireEvent.click(screen.getByRole("button", { name: "Other" }));
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
    expect(await screen.findByText("2nd place: enter a name for the menu item.")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  describe("minimum players — its own step (plan Phase 2)", () => {
    const toPlayersStep = () => {
      fireEvent.click(screen.getByRole("button", { name: /Next: Minimum Players/ }));
      return screen.findByText("How many players must play?");
    };

    it("comes after the terms and before the prize, with nothing pre-selected and Next held", async () => {
      await pickLiveTrivia();
      await chooseWeeklyPlaces();
      expect(screen.queryByText("Minimum players?")).toBeNull();
      expect(screen.queryByText("Prize")).toBeNull();
      await toPlayersStep();
      expect(screen.queryByText("Prize")).toBeNull();
      expect(screen.getByRole("button", { name: "No minimum" }).getAttribute("aria-pressed")).toBe("false");
      expect(screen.getByRole("button", { name: "Set a minimum" }).getAttribute("aria-pressed")).toBe("false");
      expect(screen.queryByLabelText("Minimum players")).toBeNull();
      expect(screen.getByRole("button", { name: /Next: Offer a Prize/ })).toHaveProperty("disabled", true);
      fireEvent.click(screen.getByRole("button", { name: "No minimum" }));
      expect(screen.getByRole("button", { name: /Next: Offer a Prize/ })).toHaveProperty("disabled", false);
    });

    it("pre-fills the number with 3 and sends a set minimum, shown on Confirm", async () => {
      const { onSubmit } = await pickLiveTrivia();
      await chooseWeeklyPlaces();
      await toPlayersStep();
      fireEvent.click(screen.getByRole("button", { name: "Set a minimum" }));
      expect(screen.getByLabelText("Minimum players")).toHaveProperty("value", "3");
      fireEvent.change(screen.getByLabelText("Minimum players"), { target: { value: "5" } });
      fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
      await screen.findByText("Prize");
      fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
      await screen.findByText("Confirm");
      expect(document.body.textContent).toContain("At least 5");
      expect(document.body.textContent).toContain("At least 5 players need to play that week for prizes to be awarded.");
      fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(submitted(onSubmit)).toMatchObject({ winCondition: "ranked_places", minPlayers: 5 });
    });

    it("holds Next while the number is out of range, and says why", async () => {
      await pickLiveTrivia();
      await chooseWeeklyPlaces();
      await toPlayersStep();
      fireEvent.click(screen.getByRole("button", { name: "Set a minimum" }));
      for (const bad of ["1", "101", "", "2.5"]) {
        fireEvent.change(screen.getByLabelText("Minimum players"), { target: { value: bad } });
        expect(screen.getByText("Minimum players must be a whole number from 2 to 100.")).toBeTruthy();
        expect(screen.getByRole("button", { name: /Next: Offer a Prize/ })).toHaveProperty("disabled", true);
      }
      fireEvent.change(screen.getByLabelText("Minimum players"), { target: { value: "2" } });
      expect(screen.getByRole("button", { name: /Next: Offer a Prize/ })).toHaveProperty("disabled", false);
    });

    it("turning it back off sends no minimum, and Confirm says None", async () => {
      const { onSubmit } = await pickLiveTrivia();
      await chooseWeeklyPlaces();
      await toPlayersStep();
      fireEvent.click(screen.getByRole("button", { name: "Set a minimum" }));
      fireEvent.change(screen.getByLabelText("Minimum players"), { target: { value: "9" } });
      fireEvent.click(screen.getByRole("button", { name: "No minimum" }));
      fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
      await screen.findByText("Prize");
      fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
      await screen.findByText("Confirm");
      expect(screen.getByText("Minimum players").nextSibling?.textContent).toBe("None");
      fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(submitted(onSubmit)).not.toHaveProperty("minPlayers");
    });

    it("going Back from Prize returns to the answered question, and the answer is kept", async () => {
      await pickLiveTrivia();
      await chooseWeeklyPlaces();
      await toPlayersStep();
      fireEvent.click(screen.getByRole("button", { name: "Set a minimum" }));
      fireEvent.change(screen.getByLabelText("Minimum players"), { target: { value: "7" } });
      fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
      await screen.findByText("Prize");
      fireEvent.click(screen.getByRole("button", { name: "Back" }));
      await screen.findByText("How many players must play?");
      expect(screen.getByLabelText("Minimum players")).toHaveProperty("value", "7");
      fireEvent.click(screen.getByRole("button", { name: /^Live Trivia Challenge$/ }));
      await screen.findByText("How many places?");
      expect(screen.queryByText("How many players must play?")).toBeNull();
    });

    it("is also asked for 'Winner of the game', never for a points target", async () => {
      const { onSubmit } = await pickLiveTrivia();
      expect(screen.getByRole("button", { name: /Next: Offer a Prize/ })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Winner of the game/ }));
      await walkToConfirm(3);
      fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(submitted(onSubmit)).toMatchObject({ winCondition: "game_winner", minPlayers: 3 });
      expect(submitted(onSubmit)).not.toHaveProperty("placePrizes");
    });

    it("a points target skips the step and never sends one, even after a minimum was typed for another way to win", async () => {
      const { onSubmit } = await pickLiveTrivia();
      fireEvent.click(screen.getByRole("button", { name: /Winner of the game/ }));
      await toPlayersStep();
      fireEvent.click(screen.getByRole("button", { name: "Set a minimum" }));
      fireEvent.click(screen.getByRole("button", { name: /^Live Trivia Challenge$/ }));
      await screen.findByText("How many, how often?");
      fireEvent.click(screen.getByRole("button", { name: /Points target/ }));
      expect(screen.getByRole("button", { name: /Next: Offer a Prize/ })).toBeTruthy();
      await walkToConfirm();
      expect(screen.queryByText("Minimum players")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Create Prize/ }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(submitted(onSubmit)).toMatchObject({ winCondition: "points_threshold" });
      expect(submitted(onSubmit)).not.toHaveProperty("minPlayers");
    });
  });
});
