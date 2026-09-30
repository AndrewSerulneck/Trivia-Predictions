import { describe, expect, it } from "vitest";
import { knownItemIds, resolvePendingHighlight, type HighlightLoad } from "@/lib/ownerDashboardHighlight";

const ready = (...ids: string[]): HighlightLoad => ({ status: "ready", items: ids.map((id) => ({ id })) });

describe("resolvePendingHighlight", () => {
  it("waits while the list is still the one from before the change", () => {
    const before = ready("a", "b");
    const pending = { baseline: before, knownIds: knownItemIds(before), id: null };
    expect(resolvePendingHighlight(pending, before)).toEqual({ resolved: false });
  });

  it("waits through a loading or failed refetch", () => {
    const before = ready("a");
    const pending = { baseline: before, knownIds: knownItemIds(before), id: null };
    expect(resolvePendingHighlight(pending, { status: "loading" })).toEqual({ resolved: false });
    expect(resolvePendingHighlight(pending, { status: "error" })).toEqual({ resolved: false });
  });

  it("rings the row that was not there before", () => {
    const before = ready("a", "b");
    const pending = { baseline: before, knownIds: knownItemIds(before), id: null };
    expect(resolvePendingHighlight(pending, ready("a", "new", "b"))).toEqual({ resolved: true, id: "new" });
  });

  it("an edit rings its own row, even though no id is new", () => {
    const before = ready("a", "b");
    const pending = { baseline: before, knownIds: knownItemIds(before), id: "b" };
    expect(resolvePendingHighlight(pending, ready("a", "b"))).toEqual({ resolved: true, id: "b" });
  });

  it("resolves to nothing when no row is new (e.g. the list was empty and stays so)", () => {
    const before = ready("a");
    const pending = { baseline: before, knownIds: knownItemIds(before), id: null };
    expect(resolvePendingHighlight(pending, ready("a"))).toEqual({ resolved: true, id: null });
  });

  it("the first game on an empty dashboard is rung (no baseline ids)", () => {
    const before: HighlightLoad = { status: "loading" };
    const pending = { baseline: before, knownIds: knownItemIds(before), id: null };
    expect(resolvePendingHighlight(pending, ready("first"))).toEqual({ resolved: true, id: "first" });
  });
});
