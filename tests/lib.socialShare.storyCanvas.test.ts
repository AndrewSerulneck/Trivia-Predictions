import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoryRenderSpec } from "@/lib/socialShare/contracts";
import {
  StoryCanvasRenderError,
  calculateCoverCrop,
  renderStoryImage,
} from "@/lib/socialShare/storyCanvas";

type MockCanvasContext = CanvasRenderingContext2D & {
  clearRect: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  strokeText: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
};

const renderSpec: StoryRenderSpec = {
  width: 1080,
  height: 1920,
  mirrorPreview: true,
  frameAssetUrl: "/story-frames/live-trivia/default.png",
  textBlocks: [
    {
      text: "TRIVIA CHAMPION",
      x: 96,
      y: 240,
      maxWidth: 888,
      font: "900 84px Nunito, Arial, sans-serif",
      color: "#ffffff",
      strokeColor: "rgba(2, 6, 23, 0.70)",
      strokeWidth: 8,
    },
  ],
};

function createContextStub(): MockCanvasContext {
  return {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    strokeText: vi.fn(),
    translate: vi.fn(),
  } as unknown as MockCanvasContext;
}

function installCanvasStub(context: CanvasRenderingContext2D | null = createContextStub()) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback, outputType?: string) => {
      callback(new Blob(["story"], { type: outputType ?? "image/png" }));
    }),
  };
  const documentStub = {
    createElement: vi.fn(() => canvas),
  };

  Object.defineProperty(globalThis, "document", {
    value: documentStub,
    configurable: true,
  });

  return { canvas, context: context as MockCanvasContext, documentStub };
}

function installImageStub({ fail = false }: { fail?: boolean } = {}) {
  class FakeImage {
    crossOrigin = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    srcValue = "";

    set src(value: string) {
      this.srcValue = value;
      queueMicrotask(() => {
        if (fail) {
          this.onerror?.();
        } else {
          this.onload?.();
        }
      });
    }

    get src(): string {
      return this.srcValue;
    }
  }

  Object.defineProperty(globalThis, "Image", {
    value: FakeImage,
    configurable: true,
  });
}

function videoSource(width: number, height: number): CanvasImageSource {
  return { videoWidth: width, videoHeight: height } as unknown as CanvasImageSource;
}

describe("story canvas crop math", () => {
  it("cover-crops landscape video into portrait output", () => {
    const crop = calculateCoverCrop(1280, 720, 1080, 1920);

    expect(crop.sx).toBeCloseTo(437.5);
    expect(crop.sy).toBe(0);
    expect(crop.sWidth).toBeCloseTo(405);
    expect(crop.sHeight).toBe(720);
    expect(crop.dWidth).toBe(1080);
    expect(crop.dHeight).toBe(1920);
  });

  it("cover-crops portrait video by trimming top and bottom when needed", () => {
    const crop = calculateCoverCrop(1080, 2400, 1080, 1920);

    expect(crop.sx).toBe(0);
    expect(crop.sy).toBe(240);
    expect(crop.sWidth).toBe(1080);
    expect(crop.sHeight).toBe(1920);
  });

  it("rejects invalid crop dimensions", () => {
    expect(() => calculateCoverCrop(0, 720, 1080, 1920)).toThrow(StoryCanvasRenderError);
  });
});

describe("story canvas renderer", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "Image");
    vi.restoreAllMocks();
  });

  it("renders video, frame, and text to a PNG blob at export dimensions", async () => {
    installImageStub();
    const { canvas, context } = installCanvasStub();
    const blob = await renderStoryImage({
      source: videoSource(1280, 720),
      spec: renderSpec,
    });

    expect(blob.type).toBe("image/png");
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1080, 1920);
    expect(context.drawImage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.closeTo(437.5),
      0,
      expect.closeTo(405),
      720,
      0,
      0,
      1080,
      1920
    );
    expect(context.drawImage).toHaveBeenNthCalledWith(2, expect.anything(), 0, 0, 1080, 1920);
    expect(context.strokeText).toHaveBeenCalledWith("TRIVIA CHAMPION", 96, 240, 888);
    expect(context.fillText).toHaveBeenCalledWith("TRIVIA CHAMPION", 96, 240, 888);
  });

  it("does not mirror export just because preview is mirrored", async () => {
    installImageStub();
    const { context } = installCanvasStub();
    await renderStoryImage({
      source: videoSource(1080, 1920),
      spec: { ...renderSpec, mirrorPreview: true },
    });

    expect(context.scale).not.toHaveBeenCalledWith(-1, 1);
  });

  it("mirrors the exported source only when explicitly requested", async () => {
    installImageStub();
    const { context } = installCanvasStub();
    await renderStoryImage({
      source: videoSource(1080, 1920),
      spec: renderSpec,
      exportMirrored: true,
    });

    expect(context.translate).toHaveBeenCalledWith(1080, 0);
    expect(context.scale).toHaveBeenCalledWith(-1, 1);
  });

  it("reports missing video dimensions clearly", async () => {
    installImageStub();
    installCanvasStub();

    await expect(renderStoryImage({ source: videoSource(0, 0), spec: renderSpec })).rejects.toMatchObject({
      code: "missing-video-dimensions",
    });
  });

  it("reports a missing 2D context clearly", async () => {
    installImageStub();
    installCanvasStub(null);

    await expect(renderStoryImage({ source: videoSource(1080, 1920), spec: renderSpec })).rejects.toMatchObject({
      code: "missing-2d-context",
    });
  });

  it("reports frame asset load failures clearly", async () => {
    installImageStub({ fail: true });
    installCanvasStub();

    await expect(renderStoryImage({ source: videoSource(1080, 1920), spec: renderSpec })).rejects.toMatchObject({
      code: "asset-load-failed",
    });
  });
});
