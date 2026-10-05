// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// docs/reward-live-redemption-plan.md Phase 2: the coupon staff are shown must prove it is live.
// The clock runs on the SERVER's time (via an offset), a tap bursts, Reduce Motion keeps the
// clock + a border flash but drops the travelling motion, and the screen is kept awake.
// createElement, not JSX (the test glob is *.test.ts).

const { LiveCouponFrame } = await import("@/components/prizes/LiveCouponFrame");

// What the phone's own clock says in these tests: 10:00:00 AM on Mon Oct 5 2026 (local).
const PHONE_NOW = new Date(2026, 9, 5, 10, 0, 0, 0).getTime();
// What the server says: 3:04:09 PM on Sat Oct 3 2026 — deliberately NOT close to the phone.
const SERVER_NOW = new Date(2026, 9, 3, 15, 4, 9, 0).getTime();
const OFFSET = SERVER_NOW - PHONE_NOW;

// `children` is required, but lint wants it passed positionally (react/no-children-prop).
type FrameProps = ComponentProps<typeof LiveCouponFrame>;
const frame = (props: Partial<Omit<FrameProps, "children">> = {}) =>
  createElement(
    LiveCouponFrame,
    { clockOffsetMs: OFFSET, username: "Rick", venueName: "The Tap Room", ...props } as FrameProps,
    createElement("p", null, "COUPON"),
  );

const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

const clockText = (container: HTMLElement) => container.querySelector("[data-live-coupon-clock]")?.textContent;
const burst = (container: HTMLElement) => container.querySelector("[data-live-coupon-burst]");

const setVisibility = (state: "visible" | "hidden") =>
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(PHONE_NOW);
  setVisibility("visible");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "vibrate");
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("LiveCouponFrame — the clock", () => {
  it("shows the SERVER's time and date, not the phone's", () => {
    const { container } = render(frame());
    expect(clockText(container)).toBe("3:04:09 PM");
    expect(container.querySelector("[data-live-coupon-date]")?.textContent).toBe("Sat, Oct 3");
  });

  it("ticks once a second", async () => {
    const { container } = render(frame());
    expect(clockText(container)).toBe("3:04:09 PM");
    await advance(1000);
    expect(clockText(container)).toBe("3:04:10 PM");
    await advance(3000);
    expect(clockText(container)).toBe("3:04:13 PM");
  });

  it("keeps ticking in step when the phone's clock isn't on a whole second", async () => {
    vi.setSystemTime(PHONE_NOW + 400);
    const { container } = render(frame());
    expect(clockText(container)).toBe("3:04:09 PM");
    await advance(599);
    expect(clockText(container)).toBe("3:04:09 PM");
    await advance(1);
    expect(clockText(container)).toBe("3:04:10 PM");
  });

  it("falls back to the phone's own clock when the server's time is unknown", () => {
    const { container } = render(frame({ clockOffsetMs: 0 }));
    expect(clockText(container)).toBe("10:00:00 AM");
  });

  it("stops its timer when the coupon closes", async () => {
    const { unmount } = render(frame());
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("LiveCouponFrame — what the coupon says", () => {
  it("names the guest and the venue, and tells staff what to check", () => {
    const { container } = render(frame());
    expect(container.querySelector("[data-live-coupon-holder]")?.textContent).toBe("Rick · The Tap Room");
    expect(screen.getByText(/Staff: tap the coupon/).textContent).toBe(
      "Staff: tap the coupon — it should sparkle, and the clock should match the time now.",
    );
    expect(screen.getByText("COUPON")).not.toBeNull();
  });

  it("leaves out whatever it doesn't know instead of printing a blank", () => {
    const { container, rerender } = render(frame({ venueName: null }));
    expect(container.querySelector("[data-live-coupon-holder]")?.textContent).toBe("Rick");
    rerender(frame({ username: null }));
    expect(container.querySelector("[data-live-coupon-holder]")?.textContent).toBe("The Tap Room");
    rerender(frame({ username: null, venueName: null }));
    expect(container.querySelector("[data-live-coupon-holder]")).toBeNull();
  });

  it("announces the clock as a timer, not a live region that would chatter every second", () => {
    const { container } = render(frame());
    expect(container.querySelector("[data-live-coupon-clock]")?.getAttribute("role")).toBe("timer");
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});

describe("LiveCouponFrame — tap", () => {
  it("bursts on a tap, then clears", async () => {
    const { container } = render(frame());
    expect(burst(container)).toBeNull();

    fireEvent.pointerDown(screen.getByRole("group", { name: "Live coupon" }));
    expect(burst(container)).not.toBeNull();
    expect(container.querySelectorAll("[data-live-coupon-burst] span")).toHaveLength(10);

    await advance(699);
    expect(burst(container)).not.toBeNull();
    await advance(1);
    expect(burst(container)).toBeNull();
  });

  it("restarts the burst on a second tap instead of stacking two", async () => {
    const { container } = render(frame());
    const group = screen.getByRole("group", { name: "Live coupon" });
    fireEvent.pointerDown(group);
    await advance(400);
    fireEvent.pointerDown(group);
    expect(container.querySelectorAll("[data-live-coupon-burst]")).toHaveLength(1);
    // The first tap's 700 ms is gone, but the second tap's is not.
    await advance(400);
    expect(burst(container)).not.toBeNull();
    await advance(300);
    expect(burst(container)).toBeNull();
  });

  it("gives a haptic tick where the phone supports it", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    render(frame());
    fireEvent.pointerDown(screen.getByRole("group", { name: "Live coupon" }));
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("still works on a phone with no vibration", () => {
    const { container } = render(frame());
    fireEvent.pointerDown(screen.getByRole("group", { name: "Live coupon" }));
    expect(burst(container)).not.toBeNull();
  });
});

describe("LiveCouponFrame — Reduce Motion", () => {
  it("hides the shimmering bands", () => {
    const { container } = render(frame());
    const bands = Array.from(container.querySelectorAll("[data-live-coupon-band]"));
    expect(bands).toHaveLength(2);
    for (const band of bands) {
      expect(band.className).toContain("animate-coupon-shimmer");
      expect(band.className).toContain("motion-reduce:hidden");
    }
  });

  it("drops the sparkle travel but keeps the border flash, and never hides the clock", () => {
    const { container } = render(frame());
    fireEvent.pointerDown(screen.getByRole("group", { name: "Live coupon" }));
    const dots = container.querySelector("[data-live-coupon-burst] > .motion-reduce\\:hidden");
    expect(dots?.querySelectorAll("span")).toHaveLength(10);
    const flash = container.querySelector("[data-live-coupon-burst] > .animate-coupon-flash");
    expect(flash).not.toBeNull();
    expect(flash?.className).not.toContain("motion-reduce");
    expect(container.querySelector("[data-live-coupon-clock]")?.className).not.toContain("motion-reduce");
  });

  it("ignores touches on the decorative layers so staff always reach the coupon", () => {
    const { container } = render(frame());
    fireEvent.pointerDown(screen.getByRole("group", { name: "Live coupon" }));
    for (const layer of Array.from(container.querySelectorAll("[data-live-coupon-band], [data-live-coupon-burst]"))) {
      expect(layer.className).toContain("pointer-events-none");
    }
  });
});

describe("LiveCouponFrame — screen wake lock", () => {
  const installWakeLock = (request: () => Promise<{ release: () => Promise<void> }>) => {
    const wakeLock = { request: vi.fn(request) };
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: wakeLock });
    return wakeLock;
  };

  it("keeps the screen on while the coupon is open and lets go when it closes", async () => {
    const release = vi.fn(async () => undefined);
    const wakeLock = installWakeLock(async () => ({ release }));

    const { unmount } = render(frame());
    await act(async () => {});
    expect(wakeLock.request).toHaveBeenCalledWith("screen");
    expect(release).not.toHaveBeenCalled();

    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("takes the lock again when the guest comes back to the page", async () => {
    const release = vi.fn(async () => undefined);
    const wakeLock = installWakeLock(async () => ({ release }));

    render(frame());
    await act(async () => {});
    expect(wakeLock.request).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {});
    expect(wakeLock.request).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await act(async () => {});
    expect(wakeLock.request).toHaveBeenCalledTimes(2);
  });

  it("releases a lock that arrives after the coupon already closed", async () => {
    const release = vi.fn(async () => undefined);
    let grant: (value: { release: () => Promise<void> }) => void = () => {};
    installWakeLock(() => new Promise((resolve) => { grant = resolve; }));

    const { unmount } = render(frame());
    unmount();
    await act(async () => {
      grant({ release });
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("holds only one lock when a quick app switch overlaps the first request", async () => {
    const releases: Array<ReturnType<typeof vi.fn>> = [];
    const grants: Array<() => void> = [];
    installWakeLock(
      () =>
        new Promise((resolve) => {
          const release = vi.fn(async () => undefined);
          releases.push(release);
          grants.push(() => resolve({ release }));
        }),
    );

    const { unmount } = render(frame());
    // The first request is still pending when the guest switches away and back.
    setVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    setVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(grants).toHaveLength(2);

    await act(async () => {
      grants[0]();
      grants[1]();
    });
    // The second grant is surplus and handed straight back.
    expect(releases[0]).not.toHaveBeenCalled();
    expect(releases[1]).toHaveBeenCalledTimes(1);

    unmount();
    expect(releases[0]).toHaveBeenCalledTimes(1);
  });

  it("carries on when the browser refuses the lock", async () => {
    installWakeLock(async () => {
      throw new Error("NotAllowedError");
    });
    const { container } = render(frame());
    await act(async () => {});
    expect(clockText(container)).toBe("3:04:09 PM");
  });

  it("carries on when the browser has no wake lock at all", async () => {
    const { container } = render(frame());
    await act(async () => {});
    expect(clockText(container)).toBe("3:04:09 PM");
  });
});
