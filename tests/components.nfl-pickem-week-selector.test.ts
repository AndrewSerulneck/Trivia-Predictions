// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { WeekSelector } from "@/components/nfl-pickem/WeekSelector";

afterEach(cleanup);

const weeks = [
  { id: "week-1", weekNumber: 1, label: "Week 1", weekStartDate: "2026-09-10", weekEndDate: "2026-09-14", status: "complete", isLocked: true, isCurrent: false, gamesCount: 16 },
  { id: "week-2", weekNumber: 2, label: "Week 2", weekStartDate: "2026-09-17", weekEndDate: "2026-09-21", status: "open", isLocked: false, isCurrent: true, gamesCount: 16 },
];

describe("NFL WeekSelector", () => {
  it("uses the shared listbox while preserving labels, current marker, and selection", () => {
    const onSelect = vi.fn();
    render(createElement(WeekSelector, { weeks, selectedWeekId: "week-2", onSelect }));

    const trigger = screen.getByRole("button", { name: "Select week" });
    expect(trigger.textContent).toContain("Week 2 · Sep 17 – Sep 21 (Now)");
    fireEvent.click(trigger);
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Week 1 · Sep 10 – Sep 14",
      "Week 2 · Sep 17 – Sep 21 (Now)",
    ]);
    expect(options[1].getAttribute("aria-selected")).toBe("true");

    fireEvent.click(options[0]);
    expect(onSelect).toHaveBeenCalledWith("week-1");
  });

  it("supports keyboard opening, navigation, Escape dismissal, and focus return", async () => {
    render(createElement(WeekSelector, { weeks, selectedWeekId: "week-2", onSelect: vi.fn() }));
    const trigger = screen.getByRole("button", { name: "Select week" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    await waitFor(() => expect(document.activeElement).toBe(options[1]));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
