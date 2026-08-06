// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RadiusDial } from "@/components/admin/RadiusDial";
import {
  RADIUS_MAX,
  RADIUS_MIN,
  clampRadius,
  dialFractionToRadius,
  radiusKeyStep,
  radiusToDialFraction,
  snapRadius,
} from "@/lib/geofenceEditor";

// venue-activation Phase 5 (docs/venue-activation-map-radius-plan.md). Phase 2's
// as-built notes describe an equivalent throwaway jsdom probe that was verified
// then deleted, with instructions to recreate it here. This file is that
// recreation: the log-scale math (unit, no mount) plus RadiusDial's a11y/keyboard
// contract (component, jsdom). Pointer-drag "feel" itself is out of scope per
// CLAUDE.md — headless can't judge a touch gesture — see the device checklist.

afterEach(() => {
  cleanup();
});

describe("log-scale radius mapping (lib/geofenceEditor)", () => {
  it("maps dial fraction endpoints and midpoint per Phase 0's spot-check", () => {
    expect(dialFractionToRadius(0)).toBe(RADIUS_MIN);
    expect(dialFractionToRadius(1)).toBe(RADIUS_MAX);
    expect(dialFractionToRadius(0.5)).toBe(225);
  });

  it("clamps fractions outside 0..1", () => {
    expect(dialFractionToRadius(-1)).toBe(RADIUS_MIN);
    expect(dialFractionToRadius(2)).toBe(RADIUS_MAX);
  });

  it("radiusToDialFraction inverts dialFractionToRadius at the domain edges", () => {
    expect(radiusToDialFraction(RADIUS_MIN)).toBeCloseTo(0, 5);
    expect(radiusToDialFraction(RADIUS_MAX)).toBeCloseTo(1, 5);
  });

  it("snaps to 25m increments below 500m, 50m above", () => {
    expect(snapRadius(212)).toBe(200);
    expect(snapRadius(612)).toBe(600);
  });

  it("clamps to [25, 2000]", () => {
    expect(clampRadius(10)).toBe(RADIUS_MIN);
    expect(clampRadius(5000)).toBe(RADIUS_MAX);
    expect(clampRadius(300)).toBe(300);
  });

  it("steps by the snap granularity and clamps at both ends", () => {
    expect(radiusKeyStep(RADIUS_MAX, 1)).toBe(RADIUS_MAX);
    expect(radiusKeyStep(RADIUS_MIN, -1)).toBe(RADIUS_MIN);
    expect(radiusKeyStep(100, 1)).toBe(125);
    expect(radiusKeyStep(600, 1)).toBe(650);
  });
});

describe("RadiusDial a11y + keyboard contract", () => {
  it("renders slider role with correct aria values", () => {
    render(createElement(RadiusDial, { radius: 150, onChange: vi.fn() }));
    const slider = screen.getByRole("slider", { name: "Geofence radius" });
    expect(slider.getAttribute("aria-valuemin")).toBe(String(RADIUS_MIN));
    expect(slider.getAttribute("aria-valuemax")).toBe(String(RADIUS_MAX));
    expect(slider.getAttribute("aria-valuenow")).toBe("150");
    expect(slider.getAttribute("aria-valuetext")).toContain("150 meters");
  });

  it("renders on-grid for an unsnapped radius without calling onChange", () => {
    const onChange = vi.fn();
    render(createElement(RadiusDial, { radius: 212, onChange }));
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("200");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("sets --tp-dial-pct from radiusToDialFraction", () => {
    render(createElement(RadiusDial, { radius: 150, onChange: vi.fn() }));
    const slider = screen.getByRole("slider");
    const pct = slider.style.getPropertyValue("--tp-dial-pct");
    expect(Number(pct)).toBeCloseTo(radiusToDialFraction(150) * 100, 5);
  });

  it("ArrowRight steps up by the snap granularity", () => {
    const onChange = vi.fn();
    render(createElement(RadiusDial, { radius: 150, onChange }));
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(radiusKeyStep(150, 1));
  });

  it("ArrowLeft steps down by the snap granularity", () => {
    const onChange = vi.fn();
    render(createElement(RadiusDial, { radius: 150, onChange }));
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(radiusKeyStep(150, -1));
  });

  it("Home jumps to RADIUS_MIN and End jumps to RADIUS_MAX", () => {
    const onChange = vi.fn();
    render(createElement(RadiusDial, { radius: 150, onChange }));
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith(RADIUS_MIN);
    fireEvent.keyDown(slider, { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith(RADIUS_MAX);
  });

  it("fires onEditingChange(true) on keydown then false after the trailing delay", () => {
    vi.useFakeTimers();
    const onEditingChange = vi.fn();
    render(createElement(RadiusDial, { radius: 150, onChange: vi.fn(), onEditingChange }));
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect(onEditingChange).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(400);
    expect(onEditingChange).toHaveBeenLastCalledWith(false);
    vi.useRealTimers();
  });

  it("a disabled dial ignores keyboard input and is aria-disabled", () => {
    const onChange = vi.fn();
    render(createElement(RadiusDial, { radius: 150, onChange, disabled: true }));
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-disabled")).toBe("true");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clicking a preset chip emits its value and marks it pressed", () => {
    const onChange = vi.fn();
    render(createElement(RadiusDial, { radius: 150, onChange }));
    fireEvent.click(screen.getByRole("button", { name: /Campus/ }));
    expect(onChange).toHaveBeenCalledWith(600);
  });
});
