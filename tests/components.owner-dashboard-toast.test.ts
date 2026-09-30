// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DashboardToast, TOAST_MS, TOAST_WITH_ACTION_MS } from "@/components/owner/dashboard/DashboardToast";

type ToastProps = Omit<ComponentProps<typeof DashboardToast>, "children">;
const renderToast = (props: ToastProps, text: string) =>
  render(createElement(DashboardToast, props as ComponentProps<typeof DashboardToast>, text));

describe("DashboardToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("announces politely and clears itself", () => {
    const onDismiss = vi.fn();
    renderToast({ onDismiss }, "Live Trivia scheduled: Fri, Oct 3 at 8:00 PM");
    expect(screen.getByRole("status").textContent).toContain("Live Trivia scheduled");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");

    act(() => void vi.advanceTimersByTime(TOAST_MS - 1));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("stays longer when it carries an action, and the action survives", () => {
    const onDismiss = vi.fn();
    const onClick = vi.fn();
    renderToast({ onDismiss, action: { label: "Now offer a reward for it →", onClick } }, "Live Trivia scheduled");
    act(() => void vi.advanceTimersByTime(TOAST_MS));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Now offer a reward for it →" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(TOAST_WITH_ACTION_MS));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("can be dismissed by hand with a 44px target", () => {
    const onDismiss = vi.fn();
    renderToast({ onDismiss }, "Reward archived.");
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(dismiss.className).toContain("min-h-11");
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
