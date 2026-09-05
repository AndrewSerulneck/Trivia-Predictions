import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic } from "@/lib/haptics";
import { readPlayerPanel, savePlayerPanel } from "@/lib/playerViewState";

afterEach(() => vi.unstubAllGlobals());

describe("player haptics", () => {
  it("silently tolerates unsupported and throwing devices", () => {
    vi.stubGlobal("navigator", undefined);
    expect(() => haptic("selection")).not.toThrow();
    vi.stubGlobal("navigator", { vibrate: () => { throw new Error("denied"); } });
    expect(() => haptic("success")).not.toThrow();
  });
  it.each([
    ["selection", 14], ["commit", 22], ["success", [14, 35, 14]], ["warning", [22, 40, 22]],
  ] as const)("makes exactly one vibration call for %s", (pattern, expected) => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    haptic(pattern);
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(expected);
  });
});

describe("venue panel memory", () => {
  it("scopes panels to the venue and falls back to Games for malformed values", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) } });
    savePlayerPanel("venue-a", 2);
    savePlayerPanel("venue-b", 1);
    expect(readPlayerPanel("venue-a")).toBe(2);
    expect(readPlayerPanel("venue-b")).toBe(1);
    expect(readPlayerPanel("venue-c")).toBe(0);
    for (const bad of ["null", "-1", "3", "1.0", " 2", "{}", "undefined"]) {
      values.set("tp:player-view:v1:venue-a", bad);
      expect(readPlayerPanel("venue-a")).toBe(0);
    }
    values.clear(); // Same sessionStorage clear used by normal auth teardown.
    expect(readPlayerPanel("venue-b")).toBe(0);
  });
  it("works without a browser or with denied storage", () => {
    vi.stubGlobal("window", undefined);
    expect(readPlayerPanel("venue")).toBe(0);
    expect(() => savePlayerPanel("venue", 2)).not.toThrow();
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("denied"); } });
    expect(readPlayerPanel("venue")).toBe(0);
    expect(() => savePlayerPanel("venue", 1)).not.toThrow();
  });
});
