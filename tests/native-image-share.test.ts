// Phase 4a.1 (docs/native-app-store-plan.md): the story picture goes to the phone's share sheet in the app.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { shareImageNatively } from "@/lib/nativeImageShare";
import { shareStoryImage } from "@/lib/socialShare/sharePipeline";

type NativeCall = (plugin: string, method: string, options?: Record<string, unknown>) => Promise<unknown>;

const stubApp = (plugins: string[], nativePromise: NativeCall | ReturnType<typeof vi.fn>, webShare = false) => {
  const navigatorStub: Record<string, unknown> = { userAgent: "Mozilla HightopChallengeApp/1.0.0 (android)" };
  if (webShare) {
    navigatorStub.share = vi.fn().mockResolvedValue(undefined);
    navigatorStub.canShare = vi.fn().mockReturnValue(true);
  }
  vi.stubGlobal("window", {
    navigator: navigatorStub,
    Capacitor: { isNativePlatform: () => true, isPluginAvailable: (n: string) => plugins.includes(n), nativePromise },
  });
  vi.stubGlobal("navigator", navigatorStub);
  return navigatorStub;
};

const blob = () => new Blob(["png-bytes"], { type: "image/png" });

afterEach(() => vi.unstubAllGlobals());

describe("native image share", () => {
  it("writes the picture to the cache, then shares its file URI", async () => {
    const nativePromise = vi.fn(async (plugin: string, method: string) =>
      plugin === "Filesystem" && method === "writeFile" ? { uri: "file:///cache/hightop-share/win.png" } : {},
    );
    stubApp(["Share", "Filesystem"], nativePromise);
    expect(await shareImageNatively({ blob: blob(), fileName: "win.png", title: "Hightop" })).toBe("shared");
    expect(nativePromise).toHaveBeenNthCalledWith(
      1,
      "Filesystem",
      "writeFile",
      expect.objectContaining({ path: "hightop-share/win.png", directory: "CACHE", recursive: true, data: "cG5nLWJ5dGVz" }),
    );
    expect(nativePromise).toHaveBeenNthCalledWith(
      2,
      "Share",
      "share",
      expect.objectContaining({ files: ["file:///cache/hightop-share/win.png"] }),
    );
  });

  it("keeps the file name harmless", async () => {
    const nativePromise = vi.fn(async (_plugin: string, _method: string, _options?: Record<string, unknown>) => ({ uri: "file:///x.png" }));
    stubApp(["Share", "Filesystem"], nativePromise);
    await shareImageNatively({ blob: blob(), fileName: "../../etc/pass wd.png" });
    expect(nativePromise.mock.calls[0][2]).toMatchObject({ path: "hightop-share/-.-etc-pass-wd.png" });
  });

  it("is unavailable without both plugins (old app builds) and on the website", async () => {
    stubApp(["Share"], vi.fn());
    expect(await shareImageNatively({ blob: blob(), fileName: "a.png" })).toBe("unavailable");
    vi.stubGlobal("window", { navigator: { userAgent: "Safari" } });
    expect(await shareImageNatively({ blob: blob(), fileName: "a.png" })).toBe("unavailable");
  });

  it("reports a dismissed sheet as canceled and a write failure as failed", async () => {
    stubApp(["Share", "Filesystem"], vi.fn(async (plugin: string) => {
      if (plugin === "Filesystem") return { uri: "file:///x.png" };
      throw new Error("Share canceled");
    }));
    expect(await shareImageNatively({ blob: blob(), fileName: "a.png" })).toBe("canceled");
    stubApp(["Share", "Filesystem"], vi.fn().mockRejectedValue(new Error("disk full")));
    expect(await shareImageNatively({ blob: blob(), fileName: "a.png" })).toBe("failed");
  });
});

describe("shareStoryImage in the app", () => {
  it("uses the shell when the web view can't share files (Android)", async () => {
    const nativePromise = vi.fn(async (plugin: string) => (plugin === "Filesystem" ? { uri: "file:///x.png" } : {}));
    stubApp(["Share", "Filesystem"], nativePromise);
    await expect(shareStoryImage({ blob: blob() })).resolves.toMatchObject({ status: "shared", fallbackRecommended: false });
  });

  it("leaves the web view's own share alone when it works (iPhone)", async () => {
    const nativePromise = vi.fn();
    const nav = stubApp(["Share", "Filesystem"], nativePromise, true);
    await expect(shareStoryImage({ blob: blob() })).resolves.toMatchObject({ status: "shared" });
    expect(nav.share).toHaveBeenCalled();
    expect(nativePromise).not.toHaveBeenCalled();
  });

  it("falls back to the Save-image sheet when the app can't share the picture", async () => {
    stubApp([], vi.fn());
    await expect(shareStoryImage({ blob: blob() })).resolves.toMatchObject({ status: "unsupported", fallbackRecommended: true });
  });
});

describe("wiring", () => {
  it("the shell contains the filesystem plugin and only lib/nativeImageShare.ts calls it", () => {
    const read = (file: string): string => readFileSync(join(process.cwd(), file), "utf8");
    const pkg = JSON.parse(read("native/package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toHaveProperty("@capacitor/filesystem");
    expect(read("native/ios/App/CapApp-SPM/Package.swift")).toContain("CapacitorFilesystem");
    expect(read("native/android/capacitor.settings.gradle")).toContain("capacitor-filesystem");
    expect(read("lib/socialShare/sharePipeline.ts")).not.toMatch(/callNative\(/);
  });
});
