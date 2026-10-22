// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resetNativeStatusBarForTests, syncNativeStatusBar } from "@/lib/nativeStatusBar";
import { APPEARANCE_COPY, applyThemeForPath, THEME_ATTRIBUTE, THEME_COLOR, THEME_STORAGE_KEY } from "@/lib/theme";

// docs/light-theme-plan.md Phase 7: the Appearance row, <meta name="theme-color"> and the app's
// status bar. The rule that matters most: dark icons only on a strip we know turned white.

import { AppearancePicker } from "@/components/navigation/AppearancePicker";

type Call = [string, string, Record<string, unknown>];

const stubApp = (platform: "ios" | "android", plugins: string[], androidStripColor = "#FFFFFF") => {
  const calls: Call[] = [];
  const nativePromise = vi.fn(async (plugin: string, method: string, options: Record<string, unknown> = {}) => {
    calls.push([plugin, method, options]);
    if (plugin === "StatusBar" && method === "getInfo") return { color: androidStripColor };
    return {};
  });
  (window as unknown as Record<string, unknown>).Capacitor = {
    isNativePlatform: () => true,
    isPluginAvailable: (name: string) => plugins.includes(name),
    nativePromise,
  };
  Object.defineProperty(window.navigator, "userAgent", {
    value: `Mozilla HightopChallengeApp/1.0.0 (${platform})`,
    configurable: true,
  });
  return calls;
};

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const styles = (calls: Call[]) => calls.filter(([, method]) => method === "setStyle").map(([plugin, , o]) => `${plugin}:${o.style}`);
const colors = (calls: Call[]) => calls.filter(([, method]) => method === "setBackgroundColor").map(([, , o]) => o.color);

beforeEach(() => {
  resetNativeStatusBarForTests();
  vi.stubEnv("NEXT_PUBLIC_LIGHT_THEME_ENABLED", "true");
  window.localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.head.innerHTML = `<meta name="theme-color" content="${THEME_COLOR.dark}">`;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete (window as unknown as Record<string, unknown>).Capacitor;
  Object.defineProperty(window.navigator, "userAgent", { value: "Mozilla/5.0 Safari", configurable: true });
});

describe("app status bar", () => {
  it("does nothing on the website", async () => {
    const nativePromise = vi.fn();
    (window as unknown as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => false,
      isPluginAvailable: () => true,
      nativePromise,
    };
    syncNativeStatusBar("light");
    await settle();
    expect(nativePromise).not.toHaveBeenCalled();
  });

  it("iPhone: white strip + dark icons on a light screen, navy + white icons back on a dark one", async () => {
    const calls = stubApp("ios", ["StatusBar", "SystemBars"]);
    syncNativeStatusBar("light");
    await settle();
    expect(colors(calls)).toEqual([THEME_COLOR.light]);
    expect(styles(calls)).toEqual(["StatusBar:LIGHT", "SystemBars:LIGHT"]);
    expect(calls.find(([plugin]) => plugin === "SystemBars")?.[2].bar).toBe("StatusBar");

    calls.length = 0;
    syncNativeStatusBar("light");
    await settle();
    expect(calls).toEqual([]); // no bridge call when nothing changes

    syncNativeStatusBar("dark");
    await settle();
    expect(colors(calls)).toEqual([THEME_COLOR.dark]);
    expect(styles(calls)).toEqual(["StatusBar:DARK", "SystemBars:DARK"]);
  });

  it("Android: dark icons only when the strip really turned white (Android 15+ keeps it navy)", async () => {
    const older = stubApp("android", ["StatusBar", "SystemBars"], "#FFFFFF");
    syncNativeStatusBar("light");
    await settle();
    expect(styles(older)).toEqual(["StatusBar:LIGHT", "SystemBars:LIGHT"]);

    resetNativeStatusBarForTests();
    const newer = stubApp("android", ["StatusBar", "SystemBars"], "#000000");
    syncNativeStatusBar("light");
    await settle();
    expect(styles(newer)).toEqual(["StatusBar:DARK", "SystemBars:DARK"]);
    expect(colors(newer)).toEqual([THEME_COLOR.light, THEME_COLOR.dark]);
  });

  it("serialises quick changes and ends on the latest one", async () => {
    const calls = stubApp("ios", ["StatusBar"]);
    syncNativeStatusBar("light");
    syncNativeStatusBar("dark");
    syncNativeStatusBar("light");
    syncNativeStatusBar("dark");
    await settle();
    expect(styles(calls).at(-1)).toBe("StatusBar:DARK");
    expect(colors(calls).at(-1)).toBe(THEME_COLOR.dark);
    expect(styles(calls).some((s) => s.startsWith("SystemBars"))).toBe(false);
  });

  it("an app without the StatusBar plugin is left alone", async () => {
    const calls = stubApp("ios", ["Haptics"]);
    syncNativeStatusBar("light");
    await settle();
    expect(calls).toEqual([]);
  });
});

describe("theme-color", () => {
  it("is white on a light screen and the navy everywhere else", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const meta = () => document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content;
    expect(applyThemeForPath("/pickem")).toBe("light");
    expect(meta()).toBe(THEME_COLOR.light);
    expect(applyThemeForPath("/trivia")).toBe("dark");
    expect(meta()).toBe(THEME_COLOR.dark);
  });

  it("stays navy with the flag off, whatever is stored", () => {
    vi.stubEnv("NEXT_PUBLIC_LIGHT_THEME_ENABLED", "");
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    expect(applyThemeForPath("/pickem")).toBe("dark");
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe(THEME_COLOR.dark);
  });

  it("the root layout's dark colour is today's navy", () => {
    expect(THEME_COLOR.dark).toBe("#020617");
    expect(readFileSync(path.resolve(process.cwd(), "app/layout.tsx"), "utf8")).toContain("themeColor: THEME_COLOR.dark");
  });
});

describe("Appearance row", () => {
  it("offers Dark / Light / Match my phone and starts on the saved choice", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    render(createElement(AppearancePicker));
    const radios = await screen.findAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(APPEARANCE_COPY.options.map((o) => o.label));
    expect(APPEARANCE_COPY.options.map((o) => o.value)).toEqual(["dark", "light", "system"]);
    expect(screen.getByRole("radio", { name: "Match my phone" }).getAttribute("aria-checked")).toBe("true");
  });

  it("saves the choice and applies it at once", () => {
    window.history.replaceState(null, "", "/venue/v1");
    render(createElement(AppearancePicker));
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("light");
    expect(screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("is in the player menu only behind the flag", () => {
    const menu = readFileSync(path.resolve(process.cwd(), "components/navigation/AccountMenuList.tsx"), "utf8");
    expect(menu).toMatch(/isLightThemeEnabled\(\) \? \(\s*<li[^>]*>\s*<AppearancePicker \/>/);
  });
});
