// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import {
  addDaysToDateKey,
  DateCalendarPopover,
  formatDateKey,
  toLocalDateKey,
  todayDateKey,
} from "@/components/ui/DateCalendarPopover";

/**
 * The date rail speaks one format — `YYYY-MM-DD`, always a LOCAL calendar day. Every bug this
 * file guards against is the same bug: a day key that silently becomes a different day because
 * something went through UTC. `Date.parse("2026-09-06")` is specified as UTC, so any arithmetic
 * that touches it lands on Sep 5 for every viewer west of Greenwich.
 */
describe("DateCalendarPopover date helpers", () => {
  it("formats a local Date without drifting through UTC", () => {
    // Local midnight — the exact instant a UTC-based formatter reports as the previous day for
    // anyone west of Greenwich.
    expect(formatDateKey(new Date(2026, 8, 6, 0, 0, 0))).toBe("2026-09-06");
    expect(formatDateKey(new Date(2026, 8, 6, 23, 59, 59))).toBe("2026-09-06");
  });

  it("zero-pads single-digit months and days", () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("maps an ISO instant onto the viewer's own calendar day", () => {
    const localNoon = new Date(2026, 8, 6, 12, 0, 0);
    expect(toLocalDateKey(localNoon.toISOString())).toBe("2026-09-06");
  });

  it("returns an empty key for an unparseable instant rather than throwing", () => {
    expect(toLocalDateKey("not-a-date")).toBe("");
    expect(toLocalDateKey("")).toBe("");
  });

  it("steps days across a month boundary", () => {
    expect(addDaysToDateKey("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysToDateKey("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("steps days across a year boundary", () => {
    expect(addDaysToDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDaysToDateKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToDateKey("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("leaves a malformed key untouched instead of inventing a date", () => {
    expect(addDaysToDateKey("09-06-2026", 1)).toBe("09-06-2026");
    expect(addDaysToDateKey("", 1)).toBe("");
  });

  it("string comparison on day keys orders chronologically", () => {
    // The popover's min/max bounds are plain `<` / `>` string compares — that is only correct
    // because the format is fixed-width and zero-padded.
    expect("2026-09-06" < "2026-09-07").toBe(true);
    expect("2026-09-30" < "2026-10-01").toBe(true);
    expect("2026-01-09" < "2026-01-10").toBe(true);
  });

  it("today's key round-trips through the local formatter", () => {
    expect(todayDateKey()).toBe(formatDateKey(new Date()));
    expect(todayDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * Phase 12 of docs/prop-bingo-code-review-fix-plan.md (finding 5): `closeSheet` schedules a
 * `setTimeout` into `closeTimerRef` that flips `isOpen`/`isClosing` off and refocuses the
 * trigger. The backdrop is `pointer-events-none` while closing, so the trigger stays tappable —
 * reopening inside the ~270 ms exit window used to let that stale timer fire against the
 * freshly-opened sheet and slam it shut. `openSheet` now cancels the pending timer.
 */
describe("DateCalendarPopover — pending close timer", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const renderPopover = () => {
    const view = render(
      createElement(DateCalendarPopover, {
        selectedDate: "2026-09-06",
        today: "2026-09-07",
        onSelect: () => {},
      })
    );
    const root = view.container as HTMLElement;
    return {
      trigger: () => root.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!,
      closeButton: () =>
        Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Close")!,
      dialog: () => root.querySelector('[role="dialog"]'),
    };
  };

  it("stays open when reopened inside the exit window", () => {
    vi.useFakeTimers();
    const ui = renderPopover();

    fireEvent.click(ui.trigger());
    expect(ui.dialog()).not.toBeNull();

    // Begin closing, then reopen well within the ~270 ms exit animation.
    fireEvent.click(ui.closeButton());
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(ui.trigger());
    expect(ui.dialog()).not.toBeNull();

    // Let the original close timer's delay elapse — it must not fire against the new sheet.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(ui.dialog()).not.toBeNull();
  });

  it("still closes normally when not interrupted", () => {
    vi.useFakeTimers();
    const ui = renderPopover();

    fireEvent.click(ui.trigger());
    fireEvent.click(ui.closeButton());
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(ui.dialog()).toBeNull();
  });
});
