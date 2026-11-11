// Phase 4a.1 (docs/native-app-store-plan.md): the story picture goes to the phone's share sheet in the app.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHARE_FILE_PIECE_BYTES, shareImageNatively, writeShareFileNatively } from "@/lib/nativeImageShare";
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

// The tests run in Node, which has no FileReader; this stands in for readAsDataURL.
class FakeFileReader {
  result: string | null = null;
  error: Error | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(file: Blob) {
    void file.arrayBuffer().then(
      (buffer) => {
        this.result = `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload?.();
      },
      (error: Error) => {
        this.error = error;
        this.onerror?.();
      },
    );
  }
}
vi.stubGlobal("FileReader", FakeFileReader);

const blob = () => new Blob(["png-bytes"], { type: "image/png" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal("FileReader", FakeFileReader);
});

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

describe("share-win plan Phase 3.2 — the file crosses the bridge in pieces; the cache keeps one video", () => {
  type Call = [string, string, Record<string, unknown>];
  const recorder = (listing: unknown = { files: [] }, fail: (plugin: string, method: string) => boolean = () => false) =>
    vi.fn(async (plugin: string, method: string, _options?: Record<string, unknown>): Promise<unknown> => {
      if (fail(plugin, method)) throw new Error(`${method} failed`);
      if (method === "readdir") return listing;
      if (method === "writeFile") return { uri: "file:///cache/hightop-share/win.mp4" };
      return {};
    });
  const calls = (fn: ReturnType<typeof recorder>): Call[] => fn.mock.calls as unknown as Call[];
  const bytes = (size: number): Uint8Array<ArrayBuffer> => {
    const out = new Uint8Array(new ArrayBuffer(size));
    for (let i = 0; i < size; i += 1) out[i] = (i * 7 + 3) % 256;
    return out;
  };

  it("the piece size is a multiple of 3, so no piece's base64 has padding mid-file", () => {
    expect(SHARE_FILE_PIECE_BYTES).toBe(786_432);
    expect(SHARE_FILE_PIECE_BYTES % 3).toBe(0);
  });

  it("a 2 MB video: one writeFile, then appendFile pieces that join back into the original bytes", async () => {
    const original = bytes(2 * 1024 * 1024);
    const nativePromise = recorder();
    stubApp(["Share", "Filesystem"], nativePromise);
    const uri = await writeShareFileNatively(new Blob([original], { type: "video/mp4" }), "win.mp4");
    expect(uri).toBe("file:///cache/hightop-share/win.mp4");
    const writes = calls(nativePromise).filter(([, method]) => method === "writeFile" || method === "appendFile");
    expect(writes.map(([, method]) => method)).toEqual(["writeFile", "appendFile", "appendFile"]);
    expect(writes[0][2]).toMatchObject({ path: "hightop-share/win.mp4", directory: "CACHE", recursive: true });
    for (const [, , options] of writes) {
      expect(options).toMatchObject({ path: "hightop-share/win.mp4", directory: "CACHE" });
      expect(options).not.toHaveProperty("encoding");
    }
    const pieces = writes.map(([, , options]) => Buffer.from(String(options.data), "base64"));
    for (const piece of pieces.slice(0, -1)) expect(piece.length).toBe(SHARE_FILE_PIECE_BYTES);
    expect(pieces.slice(0, -1).every((piece, i) => !String(writes[i][2].data).endsWith("="))).toBe(true);
    expect(Buffer.concat(pieces).equals(Buffer.from(original))).toBe(true);
  });

  it("a small picture is one writeFile and never touches the folder listing", async () => {
    const nativePromise = recorder();
    stubApp(["Share", "Filesystem"], nativePromise);
    await writeShareFileNatively(blob(), "win.png");
    expect(calls(nativePromise).map(([, method]) => method)).toEqual(["writeFile"]);
  });

  it("before a video is written, every OTHER .mp4 is deleted (not pictures, not its own name)", async () => {
    const nativePromise = recorder({
      files: [{ name: "old-trivia.mp4" }, { name: "instagram-story.mp4" }, { name: "win.mp4" }, { name: "win.png" }, { name: "instagram-story.png" }, "legacy.MP4"],
    });
    stubApp(["Share", "Filesystem"], nativePromise);
    await writeShareFileNatively(new Blob(["mp4"], { type: "video/mp4" }), "win.mp4");
    const methods = calls(nativePromise).map(([, method, options]) => `${method} ${String(options.path)}`);
    expect(methods).toEqual([
      "readdir hightop-share",
      "deleteFile hightop-share/old-trivia.mp4",
      "deleteFile hightop-share/instagram-story.mp4",
      "deleteFile hightop-share/legacy.MP4",
      "writeFile hightop-share/win.mp4",
    ]);
  });

  it("a failed cleanup (no folder yet, or a delete that fails) still writes the video", async () => {
    const noFolder = recorder(undefined, (_plugin, method) => method === "readdir");
    stubApp(["Share", "Filesystem"], noFolder);
    expect(await writeShareFileNatively(new Blob(["mp4"], { type: "video/mp4" }), "win.mp4")).toBe("file:///cache/hightop-share/win.mp4");
    const stuck = recorder({ files: [{ name: "a.mp4" }, { name: "b.mp4" }] }, (_plugin, method) => method === "deleteFile");
    stubApp(["Share", "Filesystem"], stuck);
    expect(await writeShareFileNatively(new Blob(["mp4"], { type: "video/mp4" }), "win.mp4")).toBe("file:///cache/hightop-share/win.mp4");
    expect(calls(stuck).filter(([, method]) => method === "deleteFile")).toHaveLength(2);
  });

  it("a failed write or append is null, and the share sheet reports `failed`", async () => {
    stubApp(["Share", "Filesystem"], recorder(undefined, (_plugin, method) => method === "appendFile"));
    expect(await writeShareFileNatively(new Blob([bytes(SHARE_FILE_PIECE_BYTES + 1)], { type: "video/mp4" }), "win.mp4")).toBeNull();
    const nativePromise = recorder(undefined, (_plugin, method) => method === "writeFile");
    stubApp(["Share", "Filesystem"], nativePromise);
    expect(await shareImageNatively({ blob: new Blob(["mp4"], { type: "video/mp4" }), fileName: "win.mp4" })).toBe("failed");
    expect(calls(nativePromise).some(([plugin]) => plugin === "Share")).toBe(false);
  });

  it("a long name is shortened without losing its extension", async () => {
    const nativePromise = recorder();
    stubApp(["Share", "Filesystem"], nativePromise);
    await writeShareFileNatively(new Blob(["mp4"], { type: "video/mp4" }), `hightop-live-trivia-${"x".repeat(120)}.mp4`);
    const path = String(calls(nativePromise).find(([, method]) => method === "writeFile")?.[2].path);
    expect(path.endsWith(".mp4")).toBe(true);
    expect(path.length).toBe("hightop-share/".length + 80);
  });

  it("without the Filesystem plugin nothing is written", async () => {
    const nativePromise = recorder();
    stubApp(["Share"], nativePromise);
    expect(await writeShareFileNatively(blob(), "win.png")).toBeNull();
    expect(nativePromise).not.toHaveBeenCalled();
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
    // The Instagram bridge writes its video with the same writer; it never calls Filesystem itself.
    expect(read("lib/nativeInstagramStories.ts")).not.toMatch(/callNative\("Filesystem"/);
  });
});
