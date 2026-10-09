// Phase 4a (docs/native-app-store-plan.md): native share + haptics.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hapticForAnimation, playHaptic } from "@/lib/nativeHaptics";
import { INVITE_FRIEND_PAYLOAD, sharePayload } from "@/lib/nativeShare";

const read = (file: string): string => readFileSync(join(process.cwd(), file), "utf8");

type FakeWindow = { Capacitor?: unknown; navigator: Record<string, unknown>; matchMedia?: (q: string) => { matches: boolean } };

const stubApp = (plugins: string[], nativePromise: ReturnType<typeof vi.fn>, reduceMotion = false) => {
  const win: FakeWindow = {
    navigator: { userAgent: "Mozilla HightopChallengeApp/1.0.0 (ios)" },
    Capacitor: { isNativePlatform: () => true, isPluginAvailable: (n: string) => plugins.includes(n), nativePromise },
    matchMedia: () => ({ matches: reduceMotion }),
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", win.navigator);
};

afterEach(() => vi.unstubAllGlobals());

describe("native share", () => {
  it("uses the phone's share sheet in the app", async () => {
    const nativePromise = vi.fn().mockResolvedValue({});
    stubApp(["Share"], nativePromise);
    expect(await sharePayload(INVITE_FRIEND_PAYLOAD)).toBe("shared");
    expect(nativePromise).toHaveBeenCalledWith("Share", "share", expect.objectContaining({ url: INVITE_FRIEND_PAYLOAD.url }));
  });

  it("reports a dismissed sheet as canceled, not an error", async () => {
    stubApp(["Share"], vi.fn().mockRejectedValue(new Error("Share canceled")));
    expect(await sharePayload(INVITE_FRIEND_PAYLOAD)).toBe("canceled");
  });

  it("an old shell without the plugin falls back to the website share, then to copying", async () => {
    stubApp([], vi.fn());
    const share = vi.fn().mockResolvedValue(undefined);
    (window.navigator as Record<string, unknown>).share = share;
    expect(await sharePayload(INVITE_FRIEND_PAYLOAD)).toBe("shared");
    expect(share).toHaveBeenCalled();

    delete (window.navigator as Record<string, unknown>).share;
    const writeText = vi.fn().mockResolvedValue(undefined);
    (window.navigator as Record<string, unknown>).clipboard = { writeText };
    expect(await sharePayload(INVITE_FRIEND_PAYLOAD)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining(INVITE_FRIEND_PAYLOAD.url));
  });

  it("invites with the permanent join URL", () => {
    expect(INVITE_FRIEND_PAYLOAD.url).toBe("https://play.hightopchallenge.com");
  });
});

describe("native haptics", () => {
  it("maps wins and correct answers to haptics and leaves other animations silent", () => {
    expect(hapticForAnimation("SPEED_TRIVIA_CORRECT")).toBe("success");
    expect(hapticForAnimation("BINGO_WIN")).toBe("celebrate");
    expect(hapticForAnimation("LIVE_TRIVIA_NEXT_CATEGORY")).toBeNull();
  });

  it("fires through the plugin in the app", async () => {
    const nativePromise = vi.fn().mockResolvedValue({});
    stubApp(["Haptics"], nativePromise);
    playHaptic("success");
    await Promise.resolve();
    expect(nativePromise).toHaveBeenCalledWith("Haptics", "notification", { type: "SUCCESS" });
  });

  it("does nothing with Reduce Motion on, without the plugin, or on the website", async () => {
    const reduced = vi.fn();
    stubApp(["Haptics"], reduced, true);
    playHaptic("celebrate");
    const missing = vi.fn();
    stubApp([], missing);
    playHaptic("celebrate");
    vi.stubGlobal("window", { navigator: { userAgent: "Safari" }, matchMedia: () => ({ matches: false }) });
    expect(() => playHaptic("celebrate")).not.toThrow();
    await Promise.resolve();
    expect(reduced).not.toHaveBeenCalled();
    expect(missing).not.toHaveBeenCalled();
  });
});

describe("wiring", () => {
  it("every gameplay animation goes through the one haptic map", () => {
    expect(read("components/animations/AnimationTriggerProvider.tsx")).toContain("hapticForAnimation(type)");
  });
  it("the shell contains both plugins", () => {
    const pkg = JSON.parse(read("native/package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toHaveProperty("@capacitor/share");
    expect(pkg.dependencies).toHaveProperty("@capacitor/haptics");
    expect(read("native/ios/App/CapApp-SPM/Package.swift")).toContain("CapacitorShare");
    expect(read("native/android/capacitor.settings.gradle")).toContain("capacitor-haptics");
  });
  it("only lib/nativeShare.ts and lib/nativeHaptics.ts talk to these plugins", () => {
    for (const file of ["components/social-share/ShareLinkButton.tsx", "components/venue/VenueChallengesPanel.tsx"]) {
      expect(read(file)).not.toMatch(/callNative\(/);
    }
  });
});
