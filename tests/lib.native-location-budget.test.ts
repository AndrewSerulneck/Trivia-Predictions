import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// R4 (docs/native-app-review-fixes-plan.md): inside the iPhone app,
// getBestCurrentLocation gives the high-accuracy fix sampleDurationMs and the
// low-accuracy fallback what is left of timeoutMs (at least 3 s).

const callNative = vi.fn();

vi.mock("@/lib/nativeApp", () => ({
  callNative: (...args: unknown[]) => callNative(...args),
  hasNativeCapability: () => true,
  nativePlatform: () => "ios",
}));

vi.mock("@/lib/googleMapsKeys", () => ({ serverGoogleMapsKey: () => "" }));

const { getBestCurrentLocation } = await import("@/lib/geolocation");

type NativeCallOptions = { enableHighAccuracy: boolean; timeout: number; maximumAge: number };

const fix = (latitude: number) => ({ timestamp: 1, coords: { latitude, longitude: -74, accuracy: 30 } });

// A native call that answers like the plugin: resolves after `afterMs`, or
// rejects with the plugin's timeout code once its own `timeout` passes.
const pluginAnswering = (afterMs: number | null, latitude: number) =>
  (_plugin: string, _method: string, options: NativeCallOptions) =>
    new Promise((resolve, reject) => {
      if (afterMs !== null && afterMs <= options.timeout) {
        setTimeout(() => resolve(fix(latitude)), afterMs);
        return;
      }
      setTimeout(() => reject({ code: "OS-PLUG-GLOC-0010" }), options.timeout);
    });

const optionsOfCall = (index: number): NativeCallOptions => callNative.mock.calls[index][2] as NativeCallOptions;

beforeEach(() => {
  vi.useFakeTimers();
  callNative.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getBestCurrentLocation in the iPhone app", () => {
  it("returns the high-accuracy fix, asked for with sampleDurationMs", async () => {
    callNative.mockImplementationOnce(pluginAnswering(1200, 40.1));
    const result = getBestCurrentLocation({ sampleDurationMs: 2800, timeoutMs: 5500 });
    await vi.advanceTimersByTimeAsync(1200);
    await expect(result).resolves.toMatchObject({ latitude: 40.1, accuracy: 30 });
    expect(callNative).toHaveBeenCalledTimes(1);
    expect(optionsOfCall(0)).toEqual({ enableHighAccuracy: true, timeout: 2800, maximumAge: 0 });
  });

  it("times out the high-accuracy fix at sampleDurationMs, then the fallback gets the rest of timeoutMs", async () => {
    callNative.mockImplementationOnce(pluginAnswering(null, 0)).mockImplementationOnce(pluginAnswering(500, 40.2));
    const result = getBestCurrentLocation();
    await vi.advanceTimersByTimeAsync(9000);
    expect(callNative).toHaveBeenCalledTimes(2);
    expect(optionsOfCall(0)).toEqual({ enableHighAccuracy: true, timeout: 9000, maximumAge: 0 });
    expect(optionsOfCall(1)).toEqual({ enableHighAccuracy: false, timeout: 9000, maximumAge: 120000 });
    await vi.advanceTimersByTimeAsync(500);
    await expect(result).resolves.toMatchObject({ latitude: 40.2 });
  });

  it("fails with the browser's timeout code within timeoutMs when both fixes fail", async () => {
    callNative.mockImplementation(pluginAnswering(null, 0));
    const result = getBestCurrentLocation();
    const settled = result.then(
      () => "resolved",
      (error: { code?: number; message?: string }) => error
    );
    await vi.advanceTimersByTimeAsync(18000);
    const error = await settled;
    expect(error).toMatchObject({ code: 3, message: "Unable to determine location." });
    expect(callNative).toHaveBeenCalledTimes(2);
  });

  it("keeps a usable fallback when the budget is short (JoinFlow's 2800/4000)", async () => {
    callNative.mockImplementation(pluginAnswering(null, 0));
    const result = getBestCurrentLocation({ sampleDurationMs: 2800, timeoutMs: 4000 });
    const settled = result.catch(() => "failed");
    await vi.advanceTimersByTimeAsync(2800);
    expect(optionsOfCall(1).timeout).toBe(3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(settled).resolves.toBe("failed");
  });

  it("does not wait forever when the bridge never answers", async () => {
    callNative.mockImplementation(() => new Promise(() => undefined));
    const settled = getBestCurrentLocation({ sampleDurationMs: 2800, timeoutMs: 5500 }).catch(
      (error: { code?: number }) => error.code
    );
    // 2800 + 1000 grace, then max(3000, 5500 - 3800) + 1000 grace.
    await vi.advanceTimersByTimeAsync(3800 + 4000);
    await expect(settled).resolves.toBe(3);
  });
});
