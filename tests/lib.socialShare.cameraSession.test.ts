import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCameraSessionError,
  requestFrontCameraSession,
  stopCameraStream,
} from "@/lib/socialShare/cameraSession";

type NavigatorStub = Partial<Navigator>;

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

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function createStreamStub(trackCount = 2): MediaStream {
  return {
    getTracks: vi.fn(() =>
      Array.from({ length: trackCount }, () => ({
        stop: vi.fn(),
      }))
    ),
  } as unknown as MediaStream;
}

describe("social share camera session", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "navigator");
    Reflect.deleteProperty(globalThis, "window");
    vi.restoreAllMocks();
  });

  it("requests the front-facing camera with exact mobile constraints first", async () => {
    const stream = createStreamStub();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    installNavigator({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
    });
    installWindow({ isSecureContext: true } as Partial<Window>);

    const session = await requestFrontCameraSession();

    expect(session.stream).toBe(stream);
    expect(session.usedFallback).toBe(false);
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: expect.objectContaining({
        facingMode: { exact: "user" },
        width: { ideal: 1080 },
        height: { ideal: 1920 },
      }),
    });
  });

  it("falls back to soft front-camera constraints when exact constraints fail", async () => {
    const stream = createStreamStub();
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(namedError("OverconstrainedError"))
      .mockResolvedValueOnce(stream);
    installNavigator({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
    });
    installWindow({ isSecureContext: true } as Partial<Window>);

    const session = await requestFrontCameraSession();

    expect(session.stream).toBe(stream);
    expect(session.usedFallback).toBe(true);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: false,
      video: expect.objectContaining({
        facingMode: "user",
        width: { ideal: 1080 },
        height: { ideal: 1920 },
      }),
    });
  });

  it("does not retry when permission is denied", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(namedError("NotAllowedError"));
    installNavigator({
      mediaDevices: { getUserMedia } as unknown as MediaDevices,
    });
    installWindow({ isSecureContext: true } as Partial<Window>);

    await expect(requestFrontCameraSession()).rejects.toMatchObject({
      code: "permission-denied",
      name: "NotAllowedError",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it("returns unsupported when browser camera APIs are unavailable", async () => {
    installNavigator({});
    installWindow({ isSecureContext: true } as Partial<Window>);

    await expect(requestFrontCameraSession()).rejects.toMatchObject({
      code: "unsupported-browser",
    });
  });

  it("returns insecure-context before probing unsupported camera APIs", async () => {
    installNavigator({});
    installWindow({ isSecureContext: false } as Partial<Window>);

    await expect(requestFrontCameraSession()).rejects.toMatchObject({
      code: "insecure-context",
    });
  });

  it("normalizes common camera failures", () => {
    expect(normalizeCameraSessionError(namedError("NotFoundError"))).toMatchObject({
      code: "no-camera",
    });
    expect(normalizeCameraSessionError(namedError("NotSupportedError"))).toMatchObject({
      code: "unsupported-browser",
    });
    expect(normalizeCameraSessionError(namedError("NotReadableError"))).toMatchObject({
      code: "unknown",
    });
  });

  it("stops every stream track during cleanup", () => {
    const trackA = { stop: vi.fn() };
    const trackB = { stop: vi.fn() };
    const stream = {
      getTracks: vi.fn(() => [trackA, trackB]),
    } as unknown as MediaStream;

    stopCameraStream(stream);

    expect(trackA.stop).toHaveBeenCalledTimes(1);
    expect(trackB.stop).toHaveBeenCalledTimes(1);
  });

  it("exposes a session stop helper bound to the returned stream", async () => {
    const track = { stop: vi.fn() };
    const stream = {
      getTracks: vi.fn(() => [track]),
    } as unknown as MediaStream;
    installNavigator({
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) } as unknown as MediaDevices,
    });
    installWindow({ isSecureContext: true } as Partial<Window>);

    const session = await requestFrontCameraSession();
    session.stop();

    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
