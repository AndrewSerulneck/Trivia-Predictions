import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canShareStoryFile,
  createStoryShareFile,
  shareStoryImage,
} from "@/lib/socialShare/sharePipeline";

type NavigatorStub = Partial<Navigator>;

function installNavigator(value: NavigatorStub): void {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
  });
}

function installFileStub(): void {
  class TestFile extends Blob {
    readonly name: string;
    readonly lastModified: number;

    constructor(parts: BlobPart[], name: string, options?: FilePropertyBag) {
      super(parts, options);
      this.name = name;
      this.lastModified = options?.lastModified ?? Date.now();
    }
  }

  Object.defineProperty(globalThis, "File", {
    value: TestFile,
    configurable: true,
  });
}

function namedError(name: string, message = name): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe("social share pipeline", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "navigator");
    Reflect.deleteProperty(globalThis, "File");
    vi.restoreAllMocks();
  });

  it("converts captured blobs into image files", async () => {
    installFileStub();
    const blob = new Blob(["png"], { type: "image/png" });

    const file = createStoryShareFile({ blob, fileName: "victory.png" });

    expect(file.name).toBe("victory.png");
    expect(file.type).toBe("image/png");
    expect(await file.text()).toBe("png");
  });

  it("checks whether the current browser can share a story file", () => {
    installFileStub();
    const file = createStoryShareFile({ blob: new Blob(["png"], { type: "image/png" }) });
    const canShare = vi.fn().mockReturnValue(true);
    installNavigator({
      share: vi.fn(),
      canShare,
    });

    expect(canShareStoryFile(file)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
  });

  it("returns unsupported when the browser lacks file sharing APIs", async () => {
    installFileStub();
    installNavigator({});

    await expect(shareStoryImage({ blob: new Blob(["png"], { type: "image/png" }) })).resolves.toMatchObject({
      status: "unsupported",
      fallbackRecommended: true,
      reason: "Web Share API is unavailable.",
    });
  });

  it("returns unsupported when canShare rejects the file payload", async () => {
    installFileStub();
    installNavigator({
      share: vi.fn(),
      canShare: vi.fn().mockReturnValue(false),
    });

    await expect(shareStoryImage({ blob: new Blob(["png"], { type: "image/png" }) })).resolves.toMatchObject({
      status: "unsupported",
      fallbackRecommended: true,
      reason: "This browser cannot share the captured image file.",
    });
  });

  it("returns shared after navigator.share resolves", async () => {
    installFileStub();
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    installNavigator({ share, canShare });
    const blob = new Blob(["png"], { type: "image/png" });

    const result = await shareStoryImage({
      blob,
      fileName: "hightop-win.png",
      title: "Hightop Challenge",
      text: "I won at trivia.",
    });

    expect(result).toMatchObject({
      status: "shared",
      fallbackRecommended: false,
    });
    expect(result.file?.name).toBe("hightop-win.png");
    expect(canShare).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "hightop-win.png", type: "image/png" })],
      title: "Hightop Challenge",
      text: "I won at trivia.",
    });
    expect(share).toHaveBeenCalledWith({
      files: [expect.objectContaining({ name: "hightop-win.png", type: "image/png" })],
      title: "Hightop Challenge",
      text: "I won at trivia.",
    });
  });

  it("returns canceled when the native sheet is dismissed", async () => {
    installFileStub();
    installNavigator({
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn().mockRejectedValue(namedError("AbortError", "Share canceled")),
    });

    await expect(shareStoryImage({ blob: new Blob(["png"], { type: "image/png" }) })).resolves.toMatchObject({
      status: "canceled",
      fallbackRecommended: true,
      reason: "Share was canceled.",
    });
  });

  it("returns failed when native sharing throws an unexpected error", async () => {
    installFileStub();
    installNavigator({
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn().mockRejectedValue(namedError("DataError", "Could not share")),
    });

    await expect(shareStoryImage({ blob: new Blob(["png"], { type: "image/png" }) })).resolves.toMatchObject({
      status: "failed",
      fallbackRecommended: true,
      reason: "Native share failed.",
    });
  });

  it("handles canShare throwing without surfacing an exception", async () => {
    installFileStub();
    installNavigator({
      share: vi.fn(),
      canShare: vi.fn(() => {
        throw namedError("TypeError", "bad payload");
      }),
    });

    await expect(shareStoryImage({ blob: new Blob(["png"], { type: "image/png" }) })).resolves.toMatchObject({
      status: "unsupported",
      fallbackRecommended: true,
      reason: "File sharing support check failed.",
    });
  });
});
