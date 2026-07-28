import { describe, it, expect } from "vitest";
import { formatCalendarDate } from "@/lib/formatCalendarDate";

// Regression: new Date("2026-09-10") parses as UTC midnight, which renders as
// Sept 9 for every viewer west of Greenwich — findings 4 and 5 in
// docs/nfl-pickem-code-review-fixes-plan.md. formatCalendarDate parses the
// components directly and constructs a LOCAL date instead.
describe("formatCalendarDate", () => {
  it("never renders a day earlier than the calendar date, regardless of the runner's local timezone", () => {
    expect(formatCalendarDate("2026-09-10")).toBe("Sep 10");
    expect(formatCalendarDate("2026-01-01")).toBe("Jan 1");
    expect(formatCalendarDate("2026-12-31")).toBe("Dec 31");
  });

  it("supports a custom Intl.DateTimeFormat options override", () => {
    expect(formatCalendarDate("2026-09-10", { month: "long", day: "numeric" })).toBe("September 10");
  });

  it("returns an empty string for an unparseable input rather than throwing", () => {
    expect(formatCalendarDate("")).toBe("");
    expect(formatCalendarDate("not-a-date")).toBe("");
  });
});
