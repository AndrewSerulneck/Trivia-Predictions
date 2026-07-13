import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openExternalStoryApp,
  saveStoryImageToDownloads,
  webStoryPlatform,
} from "@/lib/socialShare/platform/webStoryPlatform";

function installDocument(value: Partial<Document>): void {
  Object.defineProperty(globalThis, "document", {
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

describe("web story platform adapter", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("exposes the current web implementation behind one adapter", () => {
    expect(webStoryPlatform.id).toBe("web");
    expect(typeof webStoryPlatform.detectCapabilities).toBe("function");
    expect(typeof webStoryPlatform.requestFrontCameraSession).toBe("function");
    expect(typeof webStoryPlatform.captureFrame).toBe("function");
    expect(typeof webStoryPlatform.shareImage).toBe("function");
    expect(typeof webStoryPlatform.saveImage).toBe("function");
    expect(typeof webStoryPlatform.openExternalApp).toBe("function");
  });

  it("triggers a browser download with the provided object URL", () => {
    const anchor = {
      href: "",
      download: "",
      rel: "",
      click: vi.fn(),
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    const appendChild = vi.fn();
    installDocument({
      body: { appendChild } as unknown as HTMLElement,
      createElement: vi.fn(() => anchor),
    });

    const result = saveStoryImageToDownloads({
      blob: new Blob(["png"], { type: "image/png" }),
      fileName: "victory.png",
      objectUrl: "blob:hightop-story",
    });

    expect(result).toEqual({ status: "saved" });
    expect(anchor.href).toBe("blob:hightop-story");
    expect(anchor.download).toBe("victory.png");
    expect(anchor.rel).toBe("noopener");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
  });

  it("returns unsupported when download is requested outside the browser", () => {
    expect(saveStoryImageToDownloads({ blob: new Blob(["png"]) })).toMatchObject({
      status: "unsupported",
    });
  });

  it("opens a deep link and falls back to the web URL when the document remains visible", () => {
    vi.useFakeTimers();
    const location = { href: "" };
    installWindow({
      location: location as Location,
      setTimeout: globalThis.setTimeout as unknown as Window["setTimeout"],
    });
    installDocument({ visibilityState: "visible" });

    const result = openExternalStoryApp({
      target: "instagram",
      label: "Open Instagram",
      appName: "Instagram",
      deepLinkUrl: "instagram://camera",
      webFallbackUrl: "https://www.instagram.com/",
      likelyAvailable: true,
      canAttachImage: false,
      guidance: "Save first.",
    });

    expect(result).toEqual({ status: "opened" });
    expect(location.href).toBe("instagram://camera");

    vi.advanceTimersByTime(900);

    expect(location.href).toBe("https://www.instagram.com/");
  });
});
