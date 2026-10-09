import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addNativeListener,
  callNative,
  compareAppVersions,
  hasNativeCapability,
  nativeAppVersion,
  nativePlatform,
  openInSystemBrowser,
  parseNativeUserAgent,
} from "@/lib/nativeApp";
import { readNativeAppConfig } from "@/lib/nativeAppConfig";
import { buildAppleAppSiteAssociation, buildAssetLinks, readAndroidCertFingerprints, readAppleTeamId } from "@/lib/nativeAppLinks";
import { nativeLocationErrorCode } from "@/lib/geolocation";
import { classifyPage, decideDomainSplit } from "@/lib/domainSplit";
import {
  handleNativeBackPress,
  registerNativeBackHandler,
  resetNativeBackHandlersForTest,
} from "@/components/navigation/nativeBackButton";
import { decideAppUpdate } from "@/components/native/NativeAppRuntimeImpl";

// docs/native-app-store-plan.md Phase 3 — the pure pieces of the production shell's
// web side. Static/contract checks live in tests/native-app-contract.test.ts.

const APP_UA_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 HightopChallengeApp/1.0.0 (ios)";
const APP_UA_ANDROID = "Mozilla/5.0 (Linux; Android 16) Chrome/133 Mobile HightopChallengeApp/1.2.3 (android)";

type FakeBridge = {
  isNativePlatform: () => boolean;
  isPluginAvailable: (name: string) => boolean;
  nativePromise: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
};

const stubApp = (userAgent: string, plugins: string[] = ["App", "Geolocation", "HightopShell"]): FakeBridge => {
  const bridge: FakeBridge = {
    isNativePlatform: () => true,
    isPluginAvailable: (name) => plugins.includes(name),
    nativePromise: vi.fn(async () => ({})),
    addListener: vi.fn(() => ({ remove: vi.fn() })),
  };
  vi.stubGlobal("window", { navigator: { userAgent }, Capacitor: bridge });
  return bridge;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native detection helpers", () => {
  it("parses the version and platform from the shell's token only", () => {
    expect(parseNativeUserAgent(APP_UA_IOS)).toEqual({ version: "1.0.0", platform: "ios" });
    expect(parseNativeUserAgent(APP_UA_ANDROID)).toEqual({ version: "1.2.3", platform: "android" });
    expect(parseNativeUserAgent("Mozilla/5.0 (iPhone) Safari/604.1")).toBeNull();
    expect(parseNativeUserAgent(undefined)).toBeNull();
  });

  it("compares versions numerically, never as strings", () => {
    expect(compareAppVersions("1.10.0", "1.9.2")).toBeGreaterThan(0);
    expect(compareAppVersions("1.0", "1.0.0")).toBe(0);
    expect(compareAppVersions("0.9.9", "1.0.0")).toBeLessThan(0);
    expect(compareAppVersions("junk", "0")).toBe(0);
  });

  it("is all-null / all-false on the website and on the server", async () => {
    expect(nativePlatform()).toBeNull();
    expect(nativeAppVersion()).toBeNull();
    expect(hasNativeCapability("App")).toBe(false);
    vi.stubGlobal("window", { navigator: { userAgent: "Mozilla/5.0 Safari/604.1" } });
    expect(nativePlatform()).toBeNull();
    expect(hasNativeCapability("HightopShell")).toBe(false);
    expect(addNativeListener("App", "backButton", () => undefined)).toBeNull();
    await expect(callNative("App", "minimizeApp")).rejects.toThrow();
    expect(await openInSystemBrowser("https://hightopchallenge.com/owner/billing")).toBe(false);
  });

  it("reads platform, version and plugins inside the app", () => {
    stubApp(APP_UA_ANDROID, ["App"]);
    expect(nativePlatform()).toBe("android");
    expect(nativeAppVersion()).toBe("1.2.3");
    expect(hasNativeCapability("App")).toBe(true);
    expect(hasNativeCapability("HightopShell")).toBe(false);
  });

  it("openInSystemBrowser: https only, through the HightopShell plugin, false on an older shell", async () => {
    const bridge = stubApp(APP_UA_IOS);
    expect(await openInSystemBrowser("https://hightopchallenge.com/owner/billing")).toBe(true);
    expect(bridge.nativePromise).toHaveBeenCalledWith("HightopShell", "openInBrowser", {
      url: "https://hightopchallenge.com/owner/billing",
    });
    expect(await openInSystemBrowser("javascript:alert(1)")).toBe(false);
    stubApp(APP_UA_IOS, ["App"]);
    expect(await openInSystemBrowser("https://hightopchallenge.com/owner/billing")).toBe(false);
  });
});

describe("Android Back button", () => {
  beforeEach(() => resetNativeBackHandlersForTest());

  const fallbacks = () => ({ goBack: vi.fn(), minimize: vi.fn() });

  it("runs the most specific control: overlay > step > exit", () => {
    const calls: string[] = [];
    registerNativeBackHandler("exit", () => calls.push("exit"));
    const removeStep = registerNativeBackHandler("step", () => calls.push("step"));
    const removeOverlay = registerNativeBackHandler("overlay", () => calls.push("overlay"));
    const f = fallbacks();
    handleNativeBackPress(true, f);
    removeOverlay();
    handleNativeBackPress(true, f);
    removeStep();
    handleNativeBackPress(true, f);
    expect(calls).toEqual(["overlay", "step", "exit"]);
    expect(f.goBack).not.toHaveBeenCalled();
  });

  it("same rank: the most recently opened wins (a sheet over a sheet)", () => {
    const calls: string[] = [];
    registerNativeBackHandler("overlay", () => calls.push("first"));
    registerNativeBackHandler("overlay", () => calls.push("second"));
    handleNativeBackPress(false, fallbacks());
    expect(calls).toEqual(["second"]);
  });

  it("nothing on screen: history, then the background at the first page — never quits", () => {
    const f = fallbacks();
    handleNativeBackPress(true, f);
    expect(f.goBack).toHaveBeenCalledTimes(1);
    handleNativeBackPress(false, f);
    expect(f.minimize).toHaveBeenCalledTimes(1);
  });
});

describe("minimum-version gate", () => {
  it("reads only well-formed server env values", () => {
    expect(
      readNativeAppConfig({
        NATIVE_APP_MIN_VERSION: " 1.2.0 ",
        NATIVE_APP_LATEST_VERSION: "1.3",
        NATIVE_APP_IOS_STORE_URL: "https://apps.apple.com/us/app/id123",
        NATIVE_APP_ANDROID_STORE_URL: "https://play.google.com/store/apps/details?id=com.hightopchallenge.app",
      }),
    ).toEqual({
      minSupportedVersion: "1.2.0",
      latestVersion: "1.3",
      storeUrls: {
        ios: "https://apps.apple.com/us/app/id123",
        android: "https://play.google.com/store/apps/details?id=com.hightopchallenge.app",
      },
    });
    // A typo must never lock players out, and a store link must be the real store.
    expect(
      readNativeAppConfig({
        NATIVE_APP_MIN_VERSION: "v1.2",
        NATIVE_APP_IOS_STORE_URL: "https://evil.example/app",
        NATIVE_APP_ANDROID_STORE_URL: "http://play.google.com/x",
      }),
    ).toEqual({ minSupportedVersion: null, latestVersion: null, storeUrls: { ios: null, android: null } });
  });

  it("gates only a known version below a known minimum (fails open)", () => {
    const config = { minSupportedVersion: "1.2.0", storeUrls: { ios: "https://apps.apple.com/x", android: null } };
    expect(decideAppUpdate("1.1.9", "ios", config)).toEqual({ required: true, storeUrl: "https://apps.apple.com/x" });
    expect(decideAppUpdate("1.1.9", "android", config)).toEqual({ required: true, storeUrl: null });
    expect(decideAppUpdate("1.2.0", "ios", config)).toEqual({ required: false });
    expect(decideAppUpdate(null, "ios", config)).toEqual({ required: false });
    expect(decideAppUpdate("0.1.0", "ios", null)).toEqual({ required: false });
    expect(decideAppUpdate("0.1.0", "ios", { minSupportedVersion: 5 })).toEqual({ required: false });
  });
});

describe("app-link trust files", () => {
  const env = {
    APPLE_TEAM_ID: "abcde12345",
    ANDROID_APP_CERT_SHA256: ` ${"AB:".repeat(31)}CD , not-a-fingerprint`,
  };

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads only well-formed ids", () => {
    expect(readAppleTeamId(env)).toBe("ABCDE12345");
    expect(readAppleTeamId({ APPLE_TEAM_ID: "short" })).toBeNull();
    expect(readAndroidCertFingerprints(env)).toEqual([`${"AB:".repeat(31)}CD`]);
  });

  it("is a 404 (null) until the accounts exist", () => {
    expect(buildAppleAppSiteAssociation("play.hightopchallenge.com", {})).toBeNull();
    expect(buildAssetLinks("play.hightopchallenge.com", {})).toBeNull();
  });

  it("play. claims every game page except /api; the apex claims none (passkeys only)", () => {
    const play = buildAppleAppSiteAssociation("play.hightopchallenge.com", env);
    expect(play?.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.hightopchallenge.app"]);
    expect(play?.applinks.details[0].components).toEqual([
      expect.objectContaining({ "/": "/api/*", exclude: true }),
      // Phase 3B.1: the app is for players — partner pages, /tv and /admin never open it.
      expect.objectContaining({ "/": "/owner", exclude: true }),
      expect.objectContaining({ "/": "/owner/*", exclude: true }),
      expect.objectContaining({ "/": "/tv", exclude: true }),
      expect.objectContaining({ "/": "/tv/*", exclude: true }),
      expect.objectContaining({ "/": "/admin", exclude: true }),
      expect.objectContaining({ "/": "/admin/*", exclude: true }),
      expect.objectContaining({ "/": "/*" }),
    ]);
    expect(play?.webcredentials.apps).toEqual(["ABCDE12345.com.hightopchallenge.app"]);
    const apex = buildAppleAppSiteAssociation("hightopchallenge.com", env);
    expect(apex?.applinks.details).toEqual([]);
    expect(apex?.webcredentials.apps).toEqual(["ABCDE12345.com.hightopchallenge.app"]);

    expect(buildAssetLinks("play.hightopchallenge.com", env)?.[0].relation).toEqual([
      "delegate_permission/common.handle_all_urls",
      "delegate_permission/common.get_login_creds",
    ]);
    expect(buildAssetLinks("hightopchallenge.com", env)?.[0].relation).toEqual(["delegate_permission/common.get_login_creds"]);
    expect(buildAssetLinks("hightopchallenge.com", env)?.[0].target.package_name).toBe("com.hightopchallenge.app");
  });

  it("/.well-known is served on whichever host is asked — never bounced across hosts", () => {
    expect(classifyPage("/.well-known/apple-app-site-association")).toBe("neutral");
    expect(decideDomainSplit("hightopchallenge.com", "/.well-known/apple-app-site-association")).toEqual({ action: "none" });
    expect(decideDomainSplit("play.hightopchallenge.com", "/.well-known/assetlinks.json")).toEqual({ action: "none" });
  });
});

describe("native geolocation errors map to the browser's codes", () => {
  it("denied → 1, timeout → 3, everything else → 2", () => {
    expect(nativeLocationErrorCode({ code: "OS-PLUG-GLOC-0003" })).toBe(1);
    expect(nativeLocationErrorCode({ code: "OS-PLUG-GLOC-0008" })).toBe(1);
    expect(nativeLocationErrorCode({ code: "OS-PLUG-GLOC-0009" })).toBe(1);
    expect(nativeLocationErrorCode({ code: "OS-PLUG-GLOC-0010" })).toBe(3);
    expect(nativeLocationErrorCode({ code: "OS-PLUG-GLOC-0007" })).toBe(2);
    expect(nativeLocationErrorCode(new Error("boom"))).toBe(2);
    expect(nativeLocationErrorCode(null)).toBe(2);
  });
});
