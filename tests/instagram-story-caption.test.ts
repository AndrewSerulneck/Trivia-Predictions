// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Native-app plan Phase 9f.2 (R4): on iPhone the Instagram Story shortcut put only the picture on the
// pasteboard, which wiped the caption + link the sheet had just copied. The plugin now carries the
// caption in the same pasteboard item.

const mocks = vi.hoisted(() => ({
  hasNativeCapability: vi.fn(() => true),
  callNative: vi.fn(async (): Promise<unknown> => undefined),
}));
vi.mock("@/lib/nativeApp", () => ({ hasNativeCapability: mocks.hasNativeCapability, callNative: mocks.callNative }));

const { shareToInstagramStory } = await import("@/lib/nativeInstagramStories");

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
