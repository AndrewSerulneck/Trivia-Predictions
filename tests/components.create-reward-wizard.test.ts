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
    expect(container.querySelector("[data-step-heading]")?.textContent).toBe("Which reward?");
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

  it("corrects a step whose data a reload lost back to Definition", async () => {
    stubReducedMotion();
    const onStepChange = vi.fn();
    const { container } = renderOwner({ animateSteps: true, step: "prize", onStepChange });
    await waitFor(() => expect(onStepChange).toHaveBeenCalledWith("definition", "replace"));
    expect(container.querySelector("[data-step='definition']")).not.toBeNull();
  });
});
