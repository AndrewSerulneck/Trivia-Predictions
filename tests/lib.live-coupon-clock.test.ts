import { describe, expect, it } from "vitest";
import {
  clockOffsetFromServer,
  formatCouponClock,
  formatCouponDate,
  msUntilNextSecond,
} from "@/lib/liveCouponClock";

// docs/reward-live-redemption-plan.md Phase 2. Dates are built from LOCAL components so the
// expectations hold in any time zone (the coupon shows the phone's local time on purpose).

describe("clockOffsetFromServer", () => {
  it("is server time minus the phone's time", () => {
    expect(clockOffsetFromServer(1_000_000, 940_000)).toBe(60_000);
    expect(clockOffsetFromServer(1_000_000, 1_090_000)).toBe(-90_000);
  });

  it("is 0 when the server's time is missing or not a number (an old server, a failed read)", () => {
    expect(clockOffsetFromServer(undefined, 5)).toBe(0);
    expect(clockOffsetFromServer(null, 5)).toBe(0);
    expect(clockOffsetFromServer("1000", 5)).toBe(0);
    expect(clockOffsetFromServer(Number.NaN, 5)).toBe(0);
    expect(clockOffsetFromServer(Number.POSITIVE_INFINITY, 5)).toBe(0);
  });
});

describe("msUntilNextSecond", () => {
  it("counts to the next whole second, never 0", () => {
    expect(msUntilNextSecond(10_250)).toBe(750);
    expect(msUntilNextSecond(10_999)).toBe(1);
    expect(msUntilNextSecond(10_000)).toBe(1000);
  });

  it("handles a negative corrected time", () => {
    expect(msUntilNextSecond(-250)).toBe(250);
  });
});

describe("formatCouponClock", () => {
  it("shows a 12-hour clock with seconds", () => {
    expect(formatCouponClock(new Date(2026, 9, 3, 15, 4, 9).getTime())).toBe("3:04:09 PM");
    expect(formatCouponClock(new Date(2026, 9, 3, 9, 30, 0).getTime())).toBe("9:30:00 AM");
  });

  it("reads midnight and noon as 12", () => {
    expect(formatCouponClock(new Date(2026, 9, 3, 0, 5, 7).getTime())).toBe("12:05:07 AM");
    expect(formatCouponClock(new Date(2026, 9, 3, 12, 0, 0).getTime())).toBe("12:00:00 PM");
  });
});

describe("formatCouponDate", () => {
  it("shows weekday, month and day", () => {
    expect(formatCouponDate(new Date(2026, 9, 3, 15, 4, 9).getTime())).toBe("Sat, Oct 3");
    expect(formatCouponDate(new Date(2026, 11, 25, 1, 0, 0).getTime())).toBe("Fri, Dec 25");
  });
});
