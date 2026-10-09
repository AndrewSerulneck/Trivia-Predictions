import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyPage, gameHref, homeHref, marketingHref } from "@/lib/domainSplit";
import { isNativeApp, isNativeUserAgent } from "@/lib/nativeApp";
import {
  APP_LINK_OUT_PATHS,
  APP_MARKETING_LINK_OUT_PATHS,
  APP_WEB_ONLY_PATHS,
  isAppLinkOutPath,
  webOnlyNoticePath,
  webOnlyPageFor,
} from "@/lib/nativeLinkOut";
import { NATIVE_APP_ID } from "@/lib/nativeAppLinks";

// Tripwire for docs/native-app-store-plan.md Phase 2E (the app's front door).
//
//  1. lib/nativeApp.ts is the ONLY reader of the app's user-agent token and of
//     `window.Capacitor` (Phase 3 adds its helpers to that file, not a second one).
//  2. Every "go home" control uses homeHref() / the ExitBackButton `home` option,
//     never a bare marketingHref("/info"): on the website that is still /info, but
//     inside the app it is the front door (the app has no marketing page).
//  3. The shell's link-out list (marketing pages → system browser) and offline-page
//     settings live once in native/capacitor.config.json, and the native code reads
//     them from there. Legal pages stay IN the app (Apple wants them reachable).
//  4. Phase 3B.1: the app is for PLAYERS ONLY — no partner link on its sign-in,
//     every `/owner/*` page (and `/tv`, `/admin`) leaves the app, no remembered
//     partner launch.

const repoRoot = process.cwd();
const read = (relativePath: string): string => readFileSync(path.resolve(repoRoot, relativePath), "utf8");

const listSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(path.resolve(repoRoot, dir))) {
    const rel = path.join(dir, entry);
    const stat = statSync(path.resolve(repoRoot, rel));
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      out.push(...listSourceFiles(rel));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(rel);
    }
  }
  return out;
};

const webSources = (): string[] => ["app", "components", "lib"].flatMap(listSourceFiles);

type ShellConfig = {
  server?: { url?: string; errorPath?: string; allowNavigation?: string[] };
  plugins?: { HightopShell?: { offlinePage?: string; openInBrowser?: { host?: string; paths?: string[] } } };
};
const shellConfig = (): ShellConfig => JSON.parse(read("native/capacitor.config.json")) as ShellConfig;

describe("native app detection has one reader", () => {
  it("only lib/nativeApp.ts reads the UA token or window.Capacitor", () => {
    const offenders = webSources().filter((file) => {
      if (file === path.join("lib", "nativeApp.ts")) return false;
      const source = read(file);
      return source.includes("HightopChallengeApp") || /\bCapacitor\b/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("the token matches what the shell appends on both platforms", () => {
    const config = JSON.parse(read("native/capacitor.config.json")) as {
      ios?: { appendUserAgent?: string };
      android?: { appendUserAgent?: string };
    };
    expect(isNativeUserAgent(`Mozilla/5.0 ${config.ios?.appendUserAgent}`)).toBe(true);
    expect(isNativeUserAgent(`Mozilla/5.0 ${config.android?.appendUserAgent}`)).toBe(true);
    expect(isNativeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Safari/604.1")).toBe(false);
    expect(isNativeUserAgent(null)).toBe(false);
  });

  describe("isNativeApp", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("is false on the server", () => {
      expect(isNativeApp()).toBe(false);
    });

    it("reads the UA token, or the bridge when the token is missing", () => {
      vi.stubGlobal("window", { navigator: { userAgent: "x HightopChallengeApp/0.1.0 (ios)" } });
      expect(isNativeApp()).toBe(true);
      vi.stubGlobal("window", { navigator: { userAgent: "Safari" }, Capacitor: { isNativePlatform: () => true } });
      expect(isNativeApp()).toBe(true);
      vi.stubGlobal("window", { navigator: { userAgent: "Safari" }, Capacitor: { isNativePlatform: () => false } });
      expect(isNativeApp()).toBe(false);
      vi.stubGlobal("window", { navigator: { userAgent: "Safari" } });
      expect(isNativeApp()).toBe(false);
    });
  });
});

describe("homeHref", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is /info on the website and the front door in the app, split on or off", () => {
    for (const split of ["false", "true"]) {
      vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", split);
      expect(homeHref(false)).toBe(marketingHref("/info"));
      expect(homeHref(true)).toBe(gameHref("/"));
    }
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "true");
    expect(homeHref(false)).toBe("https://hightopchallenge.com/info");
    expect(homeHref(true)).toBe("https://play.hightopchallenge.com/");
  });

  it('no file outside lib/domainSplit.ts passes marketingHref("/info") as a home link', () => {
    const offenders = webSources().filter((file) => {
      if (file === path.join("lib", "domainSplit.ts")) return false;
      // Code only — a comment may name the old call.
      const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      return /marketingHref\(\s*["']\/info["']\s*\)/.test(code);
    });
    expect(offenders).toEqual([]);
  });

  it("the R5 home controls go through homeHref or the Back button's home option", () => {
    expect(read("components/legal/LegalPage.tsx")).toMatch(/backTo=\{\{[^}]*home: true/);
    expect(read("app/owner/login/page.tsx")).toMatch(/backTo=\{\{[^}]*home: true/);
    expect(read("components/signup/SignupShell.tsx")).toContain("{ home: true }");
    expect(read("components/signup/SignupWizard.tsx")).toContain("homeHref(isNativeApp())");
    expect(read("app/owner/billing/setup/page.tsx")).toContain("homeHref(isNativeApp())");
    expect(read("components/account/DeleteAccountPanel.tsx")).toContain("homeHref(inNativeApp)");
    const joinFlow = read("components/join/JoinFlow.tsx");
    expect(joinFlow).toContain("homeHref(false)");
    // The app's sign-in shows neither Home nor a partner link (Phase 3B.1).
    expect(joinFlow).toContain("{inNativeApp ? null : (");
    expect(joinFlow).not.toContain("/owner/login");
    expect(joinFlow).not.toContain("Venue partner");
  });

  it("Back's home option resolves through homeHref, and in the app Back is one navigation", () => {
    const exitNavigation = read("components/navigation/exitNavigation.ts");
    expect(exitNavigation).toContain("home ? homeHref(isNativeApp()) : href");
    expect(exitNavigation).toContain('window.addEventListener("pagehide", markLeaving');
    expect(exitNavigation).toContain("IN_APP_BACK_FALLBACK_MS");
    expect(read("components/navigation/ExitBackButton.tsx")).toMatch(/useExitNavigation\(\{\s*href,\s*home,/);
  });
});

describe("the app's front door is the player sign-in, and nothing else (Phase 3B.1)", () => {
  it("app/page.tsx renders JoinFlow for everyone; the UA only hides the website's Home link", () => {
    for (const file of ["app/page.tsx", "app/join/page.tsx"]) {
      const page = read(file);
      expect(page, file).toContain('isNativeUserAgent((await headers()).get("user-agent"))');
      expect(page, file).toContain("nativeAppRequest={nativeAppRequest}");
    }
    expect(read("components/join/JoinFlow.tsx")).toContain("useIsNativeApp() || nativeAppRequest");
  });

  it("no remembered-partner launch is left anywhere", () => {
    for (const gone of ["components/join/AppFrontDoor.tsx", "lib/appFrontDoor.ts", "components/native/ManageBillingOnWeb.tsx"]) {
      expect(() => statSync(path.resolve(repoRoot, gone)), gone).toThrow();
    }
    const offenders = webSources().filter((file) =>
      /appFrontDoor|AppFrontDoor|htc_app_side|rememberPartnerSide|forgetAppSide|ManageBillingOnWeb/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("native shell: link-outs and the offline page", () => {
  it("one link-out list: the shell's config IS lib/nativeLinkOut.ts (Phase 3)", () => {
    const rule = shellConfig().plugins?.HightopShell?.openInBrowser;
    expect(rule?.host).toBe("hightopchallenge.com");
    expect(rule?.paths ?? []).toEqual([...APP_LINK_OUT_PATHS]);
    expect([...APP_MARKETING_LINK_OUT_PATHS]).toEqual(["/", "/info", "/faqs", "/advertise"]);
    // Phase 3B.1: every partner page, the TV pairing page and /admin leave the app.
    expect([...APP_WEB_ONLY_PATHS].sort()).toEqual(["/admin", "/owner", "/tv"]);
    // Every marketing entry but the apex root (which rewrites to /info) is a marketing page.
    for (const entry of APP_MARKETING_LINK_OUT_PATHS.filter((p) => p !== "/")) {
      expect(classifyPage(entry)).toBe("marketing");
    }
  });

  it("legal pages stay IN the app; every partner page, /tv and /admin leave it", () => {
    for (const stays of ["/privacy", "/terms", "/rules", "/support", "/delete-account", "/ownership", "/tvguide", "/administrator"]) {
      expect(isAppLinkOutPath(stays), stays).toBe(false);
      expect(webOnlyPageFor(stays), stays).toBeNull();
    }
    for (const leaves of ["/", "/info", "/faqs/x", "/admin", "/admin/venues"]) {
      expect(isAppLinkOutPath(leaves), leaves).toBe(true);
    }
    for (const partnerPage of [
      "/owner",
      "/owner/",
      "/owner/login",
      "/owner/dashboard",
      "/owner/billing",
      "/owner/billing/setup",
      "/owner/signup",
      "/owner/register",
      "/owner/forgot-password",
      "/owner/display",
    ]) {
      expect(isAppLinkOutPath(partnerPage), partnerPage).toBe(true);
      expect(webOnlyPageFor(partnerPage), partnerPage).toBe("/owner");
    }
    expect(webOnlyPageFor("/tv")).toBe("/tv");
  });

  it("never a Subscribe/Pay button in the app: /owner is web-only in BOTH lists and gated at the edge", () => {
    expect(shellConfig().plugins?.HightopShell?.openInBrowser?.paths).toContain("/owner");
    expect([...APP_WEB_ONLY_PATHS]).toContain("/owner");
    // proxy.ts rewrites an app request for any web-only page to its static notice
    // page — this catches Next router navigations the shell never sees, and keeps
    // the real pages static for browsers (no per-page layout gate any more).
    const proxySource = read("proxy.ts");
    expect(proxySource).toContain('webOnlyPage && isNativeUserAgent(request.headers.get("user-agent"))');
    expect(proxySource).toContain("noticeUrl.pathname = webOnlyNoticePath(webOnlyPage);");
    expect(webOnlyNoticePath("/owner")).toBe("/in-app-notice/owner");
    const notice = read("app/in-app-notice/[page]/page.tsx");
    expect(notice).toContain("export const dynamicParams = false;");
    expect(notice).toContain("APP_WEB_ONLY_PATHS.map((entry) => ({ page: entry.slice(1) }))");
    expect(notice).not.toMatch(/\bheaders\(/);
    expect(() => statSync(path.resolve(repoRoot, "components/native/WebOnlyInApp.tsx"))).toThrow();
    for (const layout of ["app/owner/layout.tsx", "app/owner/signup/layout.tsx", "app/owner/billing/setup/layout.tsx", "app/admin/layout.tsx"]) {
      expect(() => statSync(path.resolve(repoRoot, layout)), layout).toThrow();
    }
    // The website's Billing page has no in-app branch left: the app never renders it.
    expect(read("app/owner/billing/page.tsx")).not.toMatch(/inNativeApp|useIsNativeApp/);
  });

  it("the offline page is shown by our wrappers, not by Capacitor's errorPath", () => {
    const config = shellConfig();
    expect(config.server?.errorPath).toBeUndefined();
    expect(config.plugins?.HightopShell?.offlinePage).toBe("offline.html");
    const offline = read("native/www/offline.html");
    expect(offline).toContain('get("url")');
    expect(offline).toContain('url.protocol === "https:"');
    expect(offline).toContain('["play.hightopchallenge.com", "hightopchallenge.com"]');
  });

  it("iOS: the wrapper is compiled in, reads HightopShell and never treats a cancel as offline", () => {
    const swift = read("native/ios/App/App/HightopBridgeViewController.swift");
    expect(swift).toContain('getPluginConfig("HightopShell")');
    expect(swift).toContain("webView.navigationDelegate = wrapper");
    const networkCodes = swift.slice(swift.indexOf("switch error.code"), swift.indexOf("default:", swift.indexOf("switch error.code")));
    expect(networkCodes).toContain("NSURLErrorNotConnectedToInternet");
    expect(networkCodes).not.toContain("NSURLErrorCancelled");
    expect(read("native/ios/App/App.xcodeproj/project.pbxproj")).toContain("HightopBridgeViewController.swift in Sources");
    // Phase 3: the spike controller is gone; the scene roots on the real one.
    expect(read("native/ios/App/App/AppDelegate.swift")).not.toContain("SpikeViewController");
    expect(read("native/ios/App/App/SceneDelegate.swift")).toContain("rootViewController = HightopBridgeViewController()");
  });

  it("Android: the client is installed, reads HightopShell and loads the page from assets", () => {
    const java = read("native/android/app/src/main/java/com/hightopchallenge/app/HightopWebViewClient.java");
    expect(java).toContain('getPluginConfiguration("HightopShell")');
    expect(java).toContain("loadDataWithBaseURL");
    expect(read("native/android/app/src/main/java/com/hightopchallenge/app/MainActivity.java")).toContain(
      "bridge.setWebViewClient(new HightopWebViewClient(bridge))",
    );
  });
});

describe("native shell: Phase 3 production pieces", () => {
  type FullConfig = ShellConfig & {
    appId?: string;
    ios?: { appendUserAgent?: string; webContentsDebuggingEnabled?: boolean };
    android?: { appendUserAgent?: string; webContentsDebuggingEnabled?: boolean };
  };
  const config = (): FullConfig => shellConfig() as FullConfig;
  const nativePackage = (): { version: string; dependencies: Record<string, string> } =>
    JSON.parse(read("native/package.json")) as { version: string; dependencies: Record<string, string> };

  it("one version everywhere: package.json = the UA token = iOS MARKETING_VERSION = Android versionName", () => {
    const version = nativePackage().version;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(config().ios?.appendUserAgent).toBe(`HightopChallengeApp/${version} (ios)`);
    expect(config().android?.appendUserAgent).toBe(`HightopChallengeApp/${version} (android)`);
    const pbx = read("native/ios/App/App.xcodeproj/project.pbxproj");
    expect(pbx.match(/MARKETING_VERSION = ([^;]+);/g)).toEqual([
      `MARKETING_VERSION = ${version};`,
      `MARKETING_VERSION = ${version};`,
    ]);
    expect(read("native/android/app/build.gradle")).toContain(`versionName "${version}"`);
  });

  it("release builds can't be inspected: webContentsDebuggingEnabled is left to Capacitor (debug builds only)", () => {
    expect(config().ios?.webContentsDebuggingEnabled).toBeUndefined();
    expect(config().android?.webContentsDebuggingEnabled).toBeUndefined();
  });

  it("the store id is the same on the shell and in the app-link files", () => {
    expect(config().appId).toBe(NATIVE_APP_ID);
    expect(read("native/android/app/build.gradle")).toContain(`applicationId "${NATIVE_APP_ID}"`);
  });

  it("the HightopShell plugin exists on both platforms and is registered", () => {
    const swift = read("native/ios/App/App/HightopBridgeViewController.swift");
    expect(swift).toContain('public let jsName = "HightopShell"');
    expect(swift).toContain('CAPPluginMethod(name: "openInBrowser"');
    expect(swift).toContain("bridge?.registerPluginInstance(HightopShellPlugin())");
    const plugin = read("native/android/app/src/main/java/com/hightopchallenge/app/HightopShellPlugin.java");
    expect(plugin).toContain('@CapacitorPlugin(name = "HightopShell")');
    expect(plugin).toContain("public void openInBrowser(PluginCall call)");
    const activity = read("native/android/app/src/main/java/com/hightopchallenge/app/MainActivity.java");
    // Must run before super.onCreate builds the bridge.
    expect(activity.indexOf("registerPlugin(HightopShellPlugin.class);")).toBeGreaterThan(-1);
    expect(activity.indexOf("registerPlugin(HightopShellPlugin.class);")).toBeLessThan(activity.indexOf("super.onCreate(savedInstanceState);"));
  });

  it("Universal Links / App Links load only the app's own host, on cold launch and while running", () => {
    const swift = read("native/ios/App/App/HightopBridgeViewController.swift");
    expect(swift).toContain("forName: .capacitorOpenUniversalLink");
    expect(swift).toContain("url.host?.lowercased() == appHost");
    const activity = read("native/android/app/src/main/java/com/hightopchallenge/app/MainActivity.java");
    expect(activity).toContain("protected void onNewIntent(Intent intent)");
    expect(activity).toContain("openAppLink(intent);");
    const manifest = read("native/android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('<intent-filter android:autoVerify="true">');
    expect(manifest).toContain('<data android:scheme="https" android:host="play.hightopchallenge.com" />');
    // Never the apex: its marketing pages are sent out of the app.
    expect(manifest).not.toContain('android:host="hightopchallenge.com"');
    const entitlements = read("native/ios/App/App/App.entitlements");
    expect(entitlements).toContain("<string>applinks:play.hightopchallenge.com</string>");
    expect(entitlements).not.toContain("<string>applinks:hightopchallenge.com</string>");
  });

  it("the apex bridge injection is re-verified whenever Capacitor Android changes", () => {
    const activity = read("native/android/app/src/main/java/com/hightopchallenge/app/MainActivity.java");
    const verified = activity.match(/VERIFIED_CAPACITOR_ANDROID = "([^"]+)"/)?.[1];
    // If this fails you upgraded @capacitor/android: check window.Capacitor exists on
    // an apex page (e.g. https://hightopchallenge.com/privacy) in the emulator, then bump the constant.
    expect(nativePackage().dependencies["@capacitor/android"]).toBe(verified);
  });

  it("iPhone permission strings are written for players", () => {
    const plist = read("native/ios/App/App/Info.plist");
    for (const key of ["NSLocationWhenInUseUsageDescription", "NSCameraUsageDescription", "NSFaceIDUsageDescription"]) {
      expect(plist, key).toMatch(new RegExp(`<key>${key}</key>\\s*<string>[^<]{20,}</string>`));
    }
    expect(plist).not.toContain("<string>armv7</string>");
  });

  it("the iOS debug probe is compiled out of Release builds", () => {
    const swift = read("native/ios/App/App/HightopBridgeViewController.swift");
    const probe = swift.indexOf('environment["HIGHTOP_PROBE_STEPS"]');
    expect(probe).toBeGreaterThan(swift.indexOf("#if DEBUG"));
    expect(probe).toBeLessThan(swift.indexOf("#endif"));
  });
});

describe("web side of the app: runtime, geolocation, install prompt", () => {
  it("the runtime loads only inside the app, from the root layout", () => {
    expect(read("app/layout.tsx")).toContain("<NativeAppRuntime />");
    const runtime = read("components/native/NativeAppRuntime.tsx");
    expect(runtime).toContain("if (!isNativeApp()) return;");
    expect(runtime).toContain('import("@/components/native/NativeAppRuntimeImpl")');
    // The website bundle never statically imports the implementation.
    const offenders = webSources().filter(
      (file) => file !== path.join("components", "native", "NativeAppRuntime.tsx") && read(file).includes('from "@/components/native/NativeAppRuntimeImpl"'),
    );
    expect(offenders).toEqual([]);
  });

  it("no @capacitor/* package is imported by the website", () => {
    const offenders = webSources().filter((file) => /from ["']@capacitor\//.test(read(file)));
    expect(offenders).toEqual([]);
    const rootPackage = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    expect(Object.keys(rootPackage.dependencies ?? {}).filter((name) => name.startsWith("@capacitor/"))).toEqual([]);
  });

  it("the three Back controls register with the Android Back button", () => {
    expect(read("components/navigation/ExitBackButton.tsx")).toContain('useNativeBackHandler("exit"');
    expect(read("components/navigation/WizardFooter.tsx")).toContain('useNativeBackHandler("step"');
    expect(read("components/owner/sheet/useModalOverlay.ts")).toContain('useNativeBackHandler("overlay", open ? requestClose : null)');
  });

  it("geolocation: the iPhone app reads location through the native plugin", () => {
    const geo = read("lib/geolocation.ts");
    expect(geo).toContain('nativePlatform() === "ios" && hasNativeCapability("Geolocation")');
    expect(geo).toContain("if (usesNativeLocation()) return getNativePosition(options);");
    expect(read("components/join/JoinFlow.tsx")).toContain("queryLocationPermission()");
  });
});


describe(".vercelignore keeps only the root native/ shell out of deploys", () => {
  it("anchors every entry to the repo root, so components/native/ still uploads", () => {
    // An unanchored `native` also matched components/native/ and broke the
    // 2026-10-09 production build (Module not found: @/components/native/...).
    const entries = readFileSync(path.join(repoRoot, ".vercelignore"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    expect(entries).toContain("/native");
    for (const entry of entries) expect(entry.startsWith("/")).toBe(true);
  });
});
