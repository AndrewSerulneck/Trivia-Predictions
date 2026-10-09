// Phase 4b (docs/native-app-store-plan.md): the in-app QR scanner only ever accepts our own join links.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JOIN_QR_URL } from "@/lib/joinQr";
import { joinPathForScan, parseHightopQr, scanQr } from "@/lib/nativeQrScan";

const read = (file: string): string => readFileSync(join(process.cwd(), file), "utf8");

const stubApp = (plugins: string[], nativePromise: ReturnType<typeof vi.fn>) => {
  const navigatorStub = { userAgent: "Mozilla HightopChallengeApp/1.0.0 (ios)" };
  vi.stubGlobal("window", {
    navigator: navigatorStub,
    Capacitor: { isNativePlatform: () => true, isPluginAvailable: (n: string) => plugins.includes(n), nativePromise },
  });
  vi.stubGlobal("navigator", navigatorStub);
};

afterEach(() => vi.unstubAllGlobals());

describe("parseHightopQr", () => {
  it("accepts the permanent printed join QR", () => {
    expect(parseHightopQr(JOIN_QR_URL)).toEqual({ venueId: null });
    expect(parseHightopQr("https://play.hightopchallenge.com/")).toEqual({ venueId: null });
  });

  it("accepts the apex host and the join page, with a venue id when there is one", () => {
    expect(parseHightopQr("https://hightopchallenge.com")).toEqual({ venueId: null });
    expect(parseHightopQr("https://HIGHTOPCHALLENGE.com/join/")).toEqual({ venueId: null });
    expect(parseHightopQr("https://play.hightopchallenge.com/?v=venue-pacific-street")).toEqual({ venueId: "venue-pacific-street" });
    expect(parseHightopQr("  https://play.hightopchallenge.com/join?utm_source=coaster&v=abc_123#top ")).toEqual({ venueId: "abc_123" });
  });

  it("says 'not a Hightop code' to anything else", () => {
    for (const text of [
      "",
      "hello",
      "http://play.hightopchallenge.com", // not https
      "https://evil.example.com/?v=abc",
      "https://hightopchallenge.com.evil.example.com",
      "https://evilhightopchallenge.com",
      "https://play.hightopchallenge.com@evil.example.com",
      "https://user:pw@play.hightopchallenge.com",
      "https://play.hightopchallenge.com:8443",
      "https://sub.play.hightopchallenge.com",
      "javascript:alert(1)",
      "https://play.hightopchallenge.com/owner/dashboard",
      "https://hightopchallenge.com/admin",
      "https://hightopchallenge.com/info",
      "https://play.hightopchallenge.com/?v=../../etc",
      "https://play.hightopchallenge.com/?v=" + "a".repeat(65),
      "https://play.hightopchallenge.com/?v=",
      "https://play.hightopchallenge.com/" + "a".repeat(3000),
    ]) {
      expect(parseHightopQr(text), text).toBeNull();
    }
  });

  it("builds the in-app path from the validated id only", () => {
    expect(joinPathForScan({ venueId: null })).toBe("/");
    expect(joinPathForScan({ venueId: "venue-1" })).toBe("/?v=venue-1");
  });
});

describe("scanQr", () => {
  it("opens the scanner for QR codes only and returns a valid target", async () => {
    const nativePromise = vi.fn().mockResolvedValue({ ScanResult: "https://play.hightopchallenge.com/?v=venue-1", format: 0 });
    stubApp(["CapacitorBarcodeScanner"], nativePromise);
    await expect(scanQr()).resolves.toEqual({ status: "scanned", target: { venueId: "venue-1" } });
    expect(nativePromise).toHaveBeenCalledWith("CapacitorBarcodeScanner", "scanBarcode", expect.objectContaining({ hint: 0, scanButton: false }));
  });

  it("rejects a scanned code that isn't ours", async () => {
    stubApp(["CapacitorBarcodeScanner"], vi.fn().mockResolvedValue({ ScanResult: "https://evil.example.com", format: 0 }));
    await expect(scanQr()).resolves.toEqual({ status: "invalid" });
  });

  it("tells a closed scanner, a refused camera and a crash apart", async () => {
    stubApp(["CapacitorBarcodeScanner"], vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: "OS-PLUG-BARC-0006" })));
    await expect(scanQr()).resolves.toEqual({ status: "canceled" });
    stubApp(["CapacitorBarcodeScanner"], vi.fn().mockRejectedValue(Object.assign(new Error("x"), { code: "OS-PLUG-BARC-0007" })));
    await expect(scanQr()).resolves.toEqual({ status: "denied" });
    stubApp(["CapacitorBarcodeScanner"], vi.fn().mockRejectedValue(new Error("boom")));
    await expect(scanQr()).resolves.toEqual({ status: "failed" });
  });

  it("does nothing on the website or in an app build without the scanner", async () => {
    const nativePromise = vi.fn();
    stubApp([], nativePromise);
    await expect(scanQr()).resolves.toEqual({ status: "unavailable" });
    vi.stubGlobal("window", { navigator: { userAgent: "Safari" } });
    await expect(scanQr()).resolves.toEqual({ status: "unavailable" });
    expect(nativePromise).not.toHaveBeenCalled();
  });
});

describe("wiring", () => {
  it("the shell contains the scanner, with the camera permission text and manifest entries", () => {
    const pkg = JSON.parse(read("native/package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toHaveProperty("@capacitor/barcode-scanner");
    expect(read("native/ios/App/CapApp-SPM/Package.swift")).toContain("CapacitorBarcodeScanner");
    expect(read("native/android/capacitor.settings.gradle")).toContain("capacitor-barcode-scanner");
    expect(read("native/ios/App/App/Info.plist")).toContain("NSCameraUsageDescription");
    const manifest = read("native/android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain("android.permission.CAMERA");
    expect(manifest).toMatch(/android\.hardware\.camera"\s+android:required="false"/);
  });

  it("the button shows only where the scanner exists and sits on the sign-in and venue-list panels", () => {
    expect(read("components/join/ScanQrButton.tsx")).toContain('useHasNativeCapability("CapacitorBarcodeScanner")');
    const join = read("components/join/JoinFlow.tsx");
    expect(join.match(/<ScanQrButton/g)?.length).toBe(2);
  });

  it("nothing but lib/nativeQrScan.ts calls the scanner, and nothing navigates to scanned text", () => {
    expect(read("components/join/ScanQrButton.tsx")).not.toMatch(/callNative\(|window\.location|ScanResult/);
    expect(read("components/join/JoinFlow.tsx")).not.toMatch(/ScanResult/);
  });

  it("the camera is never requested at launch", () => {
    expect(read("lib/nativeQrScan.ts")).not.toMatch(/requestPermissions|checkPermissions/);
    expect(read("components/join/ScanQrButton.tsx")).not.toMatch(/useEffect/);
  });
});
