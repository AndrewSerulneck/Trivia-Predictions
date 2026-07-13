import { afterEach, describe, expect, it, vi } from "vitest";
import {
  detectStoryShareCapabilities,
  getCameraPermissionState,
  isAndroidBrowser,
  isIOSBrowser,
  isStandaloneDisplayMode,
} from "@/lib/socialShare/deviceCapabilities";

type NavigatorStub = Partial<Navigator> & {
  standalone?: boolean;
};

function installNavigator(value: NavigatorStub): void {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
  });
}

function installWindow(value: Partial<Window>): void {
  Object.defineProperty(globalThis, "window", {
    value,
    configurable: true,
  });
}

describe("social share device capabilities", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "navigator");
    Reflect.deleteProperty(globalThis, "window");
    vi.restoreAllMocks();
  });

  it("returns a safe unsupported snapshot outside the browser", () => {
    expect(detectStoryShareCapabilities()).toEqual({
      hasMediaDevices: false,
      hasFrontCamera: false,
      canWebShare: false,
      canShareFiles: false,
      isIOS: false,
      isAndroid: false,
      isStandalone: false,
      instagramDeepLinkLikely: false,
      facebookDeepLinkLikely: false,
    });
  });

  it("detects iOS, including iPadOS desktop-style Safari", () => {
    expect(isIOSBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).toBe(true);
    expect(isIOSBrowser({ platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIOSBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" })).toBe(false);
  });

  it("detects Android browsers from the user agent", () => {
    expect(isAndroidBrowser({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" })).toBe(true);
    expect(isAndroidBrowser({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })).toBe(false);
  });

  it("detects installed standalone display mode", () => {
    installNavigator({ standalone: false });
    installWindow({
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as Partial<Window>);

    expect(isStandaloneDisplayMode()).toBe(true);
  });

  it("builds a mobile share snapshot without prompting for camera access", () => {
    const getUserMedia = vi.fn();
    const canShare = vi.fn().mockReturnValue(true);
    installNavigator({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
      share: vi.fn(),
      canShare,
    });
    installWindow({
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    } as Partial<Window>);

    expect(detectStoryShareCapabilities()).toMatchObject({
      hasMediaDevices: true,
      hasFrontCamera: true,
      canWebShare: true,
      canShareFiles: true,
      isIOS: true,
      isAndroid: false,
      instagramDeepLinkLikely: true,
      facebookDeepLinkLikely: true,
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(canShare).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "hightop-story.png", type: "image/png" })],
    });
  });

  it("returns unsupported permission state when media devices are unavailable", async () => {
    installNavigator({});

    await expect(getCameraPermissionState()).resolves.toBe("unsupported");
  });

  it("queries camera permission when the browser supports the Permissions API", async () => {
    const query = vi.fn().mockResolvedValue({ state: "prompt" });
    installNavigator({
      mediaDevices: { getUserMedia: vi.fn() } as unknown as MediaDevices,
      permissions: { query } as unknown as Permissions,
    });

    await expect(getCameraPermissionState()).resolves.toBe("prompt");
    expect(query).toHaveBeenCalledWith({ name: "camera" });
  });

  it("falls back to unknown when camera permission querying is blocked", async () => {
    installNavigator({
      mediaDevices: { getUserMedia: vi.fn() } as unknown as MediaDevices,
      permissions: { query: vi.fn().mockRejectedValue(new Error("blocked")) } as unknown as Permissions,
    });

    await expect(getCameraPermissionState()).resolves.toBe("unknown");
  });
});
