// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Native-app plan Phase 9f.2 (R4): on iPhone the Instagram Story shortcut put only the picture on the
// pasteboard, which wiped the caption + link the sheet had just copied. The plugin now carries the
// caption in the same pasteboard item.

const mocks = vi.hoisted(() => ({
  hasNativeCapability: vi.fn((_name?: string) => true),
  callNative: vi.fn(async (_plugin?: string, _method?: string, _options?: Record<string, unknown>): Promise<unknown> => undefined),
  nativePlatform: vi.fn((): string | null => "ios"),
}));
vi.mock("@/lib/nativeApp", () => ({ hasNativeCapability: mocks.hasNativeCapability, callNative: mocks.callNative, nativePlatform: mocks.nativePlatform }));

const { getInstagramStorySupport, instagramStoryVideoOff, shareToInstagramStory } = await import("@/lib/nativeInstagramStories");

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const picture = new Blob(["png"], { type: "image/png" });

afterEach(() => {
  mocks.hasNativeCapability.mockReturnValue(true);
  mocks.callNative.mockReset();
});

describe("Phase 9f.2 — the caption travels with the Story picture", () => {
  it("sends the caption to the plugin next to the picture", async () => {
    const caption = "I won Live Trivia at The High Top! hightopchallenge.com/app";
    await expect(shareToInstagramStory(picture, { caption })).resolves.toBe("opened");
    expect(mocks.callNative).toHaveBeenCalledWith("InstagramStories", "shareToStory", {
      data: btoa("png"),
      mediaType: "image",
      topColor: "#020617",
      bottomColor: "#020617",
      caption,
    });
  });

  it("sends an empty caption when there is none (the plugin then writes the picture only)", async () => {
    await shareToInstagramStory(picture);
    expect(mocks.callNative).toHaveBeenCalledWith("InstagramStories", "shareToStory", expect.objectContaining({ caption: "" }));
  });

  it("iOS writes ONE pasteboard item that holds the picture AND the caption as plain text", () => {
    const swift = read("native/ios/App/App/InstagramStoriesPlugin.swift");
    expect(swift).toContain('call.getString("caption")');
    expect(swift).toContain('item["public.utf8-plain-text"] = caption');
    // One item: a second item would not be what a Paste reads first.
    expect(swift).toContain("UIPasteboard.general.setItems([item],");
    expect(swift).toContain(".expirationDate: Date().addingTimeInterval(60 * 5)");
  });
});

describe("share-win plan Phase 3 — the app's Instagram Story button sends the animated Story", () => {
  const video = new Blob(["mp4"], { type: "video/mp4" });

  const fileUri = "file:///cache/hightop-share/hightop-live-trivia-sam.mp4";
  const fakeFilesystem = async (plugin?: string, method?: string): Promise<unknown> =>
    plugin === "Filesystem" && method === "writeFile" ? { uri: fileUri } : plugin === "Filesystem" && method === "readdir" ? { files: [] } : undefined;

  it("a video is written to the cache and the plugin gets only its path, never base64 (Phase 3.2)", async () => {
    mocks.callNative.mockImplementation(fakeFilesystem);
    await expect(shareToInstagramStory(video, { caption: "c", fileName: "hightop-live-trivia-sam.mp4" })).resolves.toBe("opened");
    expect(mocks.callNative).toHaveBeenCalledWith("Filesystem", "writeFile", expect.objectContaining({ path: "hightop-share/hightop-live-trivia-sam.mp4", data: btoa("mp4") }));
    const share = mocks.callNative.mock.calls.find((call) => (call as unknown[])[1] === "shareToStory") as unknown[] | undefined;
    expect(share?.[2]).toEqual({ path: fileUri, mediaType: "video", topColor: "#020617", bottomColor: "#020617", caption: "c" });
  });

  it("a video always gets a .mp4 name (the one-video cleanup goes by it)", async () => {
    mocks.callNative.mockImplementation(fakeFilesystem);
    await shareToInstagramStory(video, { fileName: "story.png" });
    expect(mocks.callNative).toHaveBeenCalledWith("Filesystem", "writeFile", expect.objectContaining({ path: "hightop-share/hightop-story.mp4" }));
  });

  it("a video that can't be written is `failed`, and the plugin is never called", async () => {
    mocks.callNative.mockImplementation(async (plugin?: string, method?: string) => {
      if (plugin === "Filesystem" && method === "writeFile") throw new Error("disk full");
      return undefined;
    });
    await expect(shareToInstagramStory(video)).resolves.toBe("failed");
    expect(mocks.callNative.mock.calls.some((call) => (call as unknown[])[1] === "shareToStory")).toBe(false);
  });

  it("a picture still crosses as base64 data (every build since 9d reads it)", async () => {
    await shareToInstagramStory(picture);
    expect(mocks.callNative).toHaveBeenCalledTimes(1);
    expect(mocks.callNative).toHaveBeenCalledWith("InstagramStories", "shareToStory", expect.objectContaining({ data: btoa("png"), mediaType: "image" }));
    expect(mocks.callNative.mock.calls[0][2]).not.toHaveProperty("path");
  });

  it("video support comes only from a build that reads a file path (`videoFile`)", async () => {
    // A build from before Phase 3.
    mocks.callNative.mockResolvedValueOnce({ available: true });
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: true, video: false });
    // A Phase 3 test build answers `video` and expects base64: it must never get a path.
    mocks.callNative.mockResolvedValueOnce({ available: true, video: true });
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: true, video: false });
    mocks.callNative.mockResolvedValueOnce({ available: true, videoFile: true });
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: true, video: true });
    // No Instagram means no video either, whatever the plugin says.
    mocks.callNative.mockResolvedValueOnce({ available: false, videoFile: true });
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: false, video: false });
    // No Filesystem plugin: the video can't be written, so no one-tap video; the picture stays.
    mocks.hasNativeCapability.mockImplementation((name?: string) => name !== "Filesystem");
    mocks.callNative.mockResolvedValueOnce({ available: true, videoFile: true });
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: true, video: false });
    mocks.hasNativeCapability.mockImplementation(() => true);
    mocks.callNative.mockRejectedValueOnce(new Error("bridge"));
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: false, video: false });
    mocks.hasNativeCapability.mockReturnValue(false);
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: false, video: false });
  });

  it("the website switch: unset, empty and none are on; a named platform is off", () => {
    for (const raw of [undefined, "", "none", "  "]) expect(instagramStoryVideoOff("ios", raw)).toBe(false);
    expect(instagramStoryVideoOff("ios", "ios")).toBe(true);
    expect(instagramStoryVideoOff("android", "ios")).toBe(false);
    expect(instagramStoryVideoOff("android", "android")).toBe(true);
    expect(instagramStoryVideoOff("android", " iOS , Android ")).toBe(true);
    expect(instagramStoryVideoOff(null, "ios,android")).toBe(false);
  });

  it("the switch turns off video on the named platform only; the picture stays", async () => {
    vi.stubEnv("NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF", "ios");
    mocks.hasNativeCapability.mockReturnValue(true);
    mocks.callNative.mockResolvedValue({ available: true, videoFile: true });
    mocks.nativePlatform.mockReturnValue("ios");
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: true, video: false });
    mocks.nativePlatform.mockReturnValue("android");
    await expect(getInstagramStorySupport()).resolves.toEqual({ picture: true, video: true });
    vi.unstubAllEnvs();
    mocks.nativePlatform.mockReturnValue("ios");
  });

  it("iOS reads the video from the share folder only, puts it under backgroundVideo, and says it can", () => {
    const swift = read("native/ios/App/App/InstagramStoriesPlugin.swift");
    expect(swift).toContain('call.getString("mediaType") == "video"');
    expect(swift).toContain('call.getString("path")');
    expect(swift).toContain('appendingPathComponent("hightop-share", isDirectory: true)');
    expect(swift).toContain(".resolvingSymlinksInPath().standardizedFileURL");
    expect(swift).toContain("file.path.hasPrefix(folder)");
    expect(swift).toContain("com.instagram.sharedSticker.backgroundVideo");
    expect(swift).toContain('"videoFile": available');
    expect(swift).not.toContain('"video": available');
    // Still ONE pasteboard item, so the caption rides along with the video too (9f.2).
    expect(swift.match(/UIPasteboard\.general\.setItems\(/g)).toHaveLength(1);
  });

  it("Android shares the web's video file from the share folder only, as video/mp4, and writes none itself", () => {
    const java = read("native/android/app/src/main/java/com/hightopchallenge/app/InstagramStoriesPlugin.java");
    expect(java).toContain('"video".equals(call.getString("mediaType", "image"))');
    expect(java).toContain('call.getString("path", "")');
    expect(java).toContain('VIDEO_TYPE = "video/mp4"');
    expect(java).toContain('SHARE_FOLDER = "hightop-share"');
    expect(java).toContain("new File(activity.getCacheDir(), SHARE_FOLDER).getCanonicalPath() + File.separator");
    expect(java).toContain("file.getCanonicalPath().startsWith(folder) && file.isFile()");
    expect(java).not.toContain("instagram-story.mp4");
    expect(java).toContain('result.put("videoFile", available && instagramCanTakeStory(VIDEO_TYPE));');
    // A low-memory phone gets "Could not prepare the picture.", not a crash.
    expect(java).toContain("catch (OutOfMemoryError ex)");
  });
});
