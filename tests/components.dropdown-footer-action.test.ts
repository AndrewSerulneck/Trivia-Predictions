// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dropdown } from "@/components/ui/Dropdown";

// Multi-venue billing Phase 4: Dropdown gets ONE optional footer action ("+ Add a venue"). Without it the
// popup must be exactly what the other call sites have always rendered.

const options = [
  { value: "a", label: "Pacific Street" },
  { value: "b", label: "Garden State" },
];

const renderDropdown = (footerAction?: { label: string; onSelect: () => void }, onChange = vi.fn()) =>
  render(
    createElement(Dropdown<string>, {
      value: "a",
      options,
      onChange,
      ariaLabel: "Select venue",
      ...(footerAction ? { footerAction } : {}),
    }),
  );

afterEach(() => cleanup());

describe("Dropdown footerAction", () => {
  it("renders no footer and the original popup when omitted", () => {
    renderDropdown();
    fireEvent.click(screen.getByRole("button", { name: "Select venue" }));
    const list = screen.getByRole("listbox");
    expect(list.className).toContain("absolute");
    expect(list.className).toContain("max-h-64");
    expect(screen.queryByText("+ Add a venue")).toBeNull();
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("shows the action under the options, outside the listbox, and runs it once", () => {
    const onSelect = vi.fn();
    const onChange = vi.fn();
    renderDropdown({ label: "+ Add a venue", onSelect }, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Select venue" }));

    const action = screen.getByRole("button", { name: "+ Add a venue" });
    expect(screen.getByRole("listbox").contains(action)).toBe(false);
    expect(screen.getAllByRole("option")).toHaveLength(2);

    fireEvent.click(action);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("still selects an option and closes", () => {
    const onChange = vi.fn();
    renderDropdown({ label: "+ Add a venue", onSelect: vi.fn() }, onChange);
    fireEvent.click(screen.getByRole("button", { name: "Select venue" }));
    fireEvent.click(screen.getByRole("option", { name: "Garden State" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
