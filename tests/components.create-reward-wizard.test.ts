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
    expect(container.querySelector("[data-step-heading]")?.textContent).toBe("Which game should the reward be tied to?");
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
    await waitFor(() => expect(view.container.querySelector("[data-step='terms']")).not.toBeNull());
    view.rerender(ownerProps("definition"));
    await waitFor(() => expect(view.container.querySelector("[data-step='definition']")).not.toBeNull());

    // NFL Pick 'Em is unscheduled (and already cached from the prefetch).
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

const walkToConfirm = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Next: Offer a Prize/ }));
  await screen.findByText("Prize");
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
    fireEvent.click(screen.getByRole("button", { name: /Create Reward/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /Create Reward/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /Create Reward/ }));
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
  });

  it("NFL whole season: a one-off cadence from the server's fromWeek", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T16:00:00.000Z"));
    const { onSubmit } = renderForSubmit(NFL_CONTEXT);
    await waitFor(() => expect(screen.queryByText(/Checking the venue/)).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /NFL Pick/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Whole season/ }));
    await walkToConfirm();
    fireEvent.click(screen.getByRole("button", { name: /Create Reward/ }));
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
    fireEvent.click(screen.getByRole("button", { name: /Create Reward/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ cadence: "none", winnerQuota: 1 }));
  });
});

// docs/pos-rewards-integration-plan.md Phase 1: a percent-off prize at a venue with a POS
// connected also needs its value at the register. Without a POS the step is unchanged
// (the snapshots above pin that), and dollar-off / gift-card prizes never ask.
describe("CreateRewardWizard — value at the register (POS)", () => {
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
    expect(screen.queryByLabelText(/Value at the register/)).toBeNull();
  });

  it("is required for a percent-off prize, and submitted in cents", async () => {
    const { onSubmit } = renderForSubmit(POS_CONTEXT);
    await toPrize();
    const input = screen.getByLabelText(/Value at the register/);

    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    expect(await screen.findByText(/Enter what this prize is worth at the register/)).toBeTruthy();
    expect(screen.queryByText("Confirm")).toBeNull();

    fireEvent.change(input, { target: { value: "12.50" } });
    fireEvent.click(screen.getByRole("button", { name: /Next: Confirm/ }));
    await screen.findByText("Confirm");
    expect(screen.getByText("$12.50")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Create Reward/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(((onSubmit.mock.calls[0] as unknown[])[0] as { prize: unknown }).prize).toEqual({ ...PRIZE, posValueCents: 1250 });
  });

  it("is not asked for a dollar-off prize (the discount is the value)", async () => {
    renderForSubmit(POS_CONTEXT);
    await toPrize();
    fireEvent.click(screen.getByRole("button", { name: "Dollar amount off" }));
    expect(screen.queryByLabelText(/Value at the register/)).toBeNull();
  });
});
