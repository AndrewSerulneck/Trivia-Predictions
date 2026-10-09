import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyPage, gameHref, homeHref, marketingHref } from "@/lib/domainSplit";
import { isNativeApp, isNativeUserAgent } from "@/lib/nativeApp";
import { APP_LINK_OUT_PATHS, APP_MARKETING_LINK_OUT_PATHS, APP_WEB_ONLY_PATHS, isAppLinkOutPath } from "@/lib/nativeLinkOut";
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
    expect(joinFlow).toContain('marketingHref("/owner/login")');
    expect(joinFlow).toContain("Venue partner? Sign in");
  });

  it("Back's home option resolves through homeHref, and in the app Back is one navigation", () => {
    const exitNavigation = read("components/navigation/exitNavigation.ts");
    expect(exitNavigation).toContain("home ? homeHref(isNativeApp()) : href");
    expect(exitNavigation).toContain('window.addEventListener("pagehide", markLeaving');
    expect(exitNavigation).toContain("IN_APP_BACK_FALLBACK_MS");
    expect(read("components/navigation/ExitBackButton.tsx")).toMatch(/useExitNavigation\(\{\s*href,\s*home,/);
  });
});

describe("the app's front door", () => {
  it("app/page.tsx wraps the sign-in in AppFrontDoor only for the app's User-Agent", () => {
    const page = read("app/page.tsx");
    expect(page).toContain('isNativeUserAgent((await headers()).get("user-agent"))');
    expect(page).toContain("inNativeApp ? <AppFrontDoor>{joinFlow}</AppFrontDoor> : joinFlow");
  });

  it("the partner side is remembered on sign-in and forgotten on sign-out", () => {
    expect(read("app/owner/login/page.tsx")).toContain("rememberPartnerSide();");
    expect(read("app/owner/dashboard/page.tsx")).toContain("rememberPartnerSide();");
    expect(read("app/owner/dashboard/page.tsx")).toContain("forgetAppSide();");
    expect(read("components/navigation/SignOutButton.tsx")).toContain("forgetAppSide();");
  });
});

describe("native shell: link-outs and the offline page", () => {
  it("one link-out list: the shell's config IS lib/nativeLinkOut.ts (Phase 3)", () => {
    const rule = shellConfig().plugins?.HightopShell?.openInBrowser;
    expect(rule?.host).toBe("hightopchallenge.com");
    expect(rule?.paths ?? []).toEqual([...APP_LINK_OUT_PATHS]);
    expect([...APP_MARKETING_LINK_OUT_PATHS]).toEqual(["/", "/info", "/faqs", "/advertise"]);
    expect([...APP_WEB_ONLY_PATHS].sort()).toEqual(["/admin", "/owner/billing/setup", "/owner/register", "/owner/signup"]);
    // Every marketing entry but the apex root (which rewrites to /info) is a marketing page.
    for (const entry of APP_MARKETING_LINK_OUT_PATHS.filter((p) => p !== "/")) {
      expect(classifyPage(entry)).toBe("marketing");
    }
  });

  it("partner sign-in, the dashboard, Billing's status page and legal pages stay IN the app", () => {
    for (const stays of [
      "/privacy",
      "/terms",
      "/rules",
      "/support",
      "/delete-account",
      "/owner",
      "/owner/login",
      "/owner/dashboard",
      "/owner/billing",
      "/owner/forgot-password",
      "/owner/display",
    ]) {
      expect(isAppLinkOutPath(stays), stays).toBe(false);
    }
    for (const leaves of ["/", "/info", "/faqs/x", "/owner/signup", "/owner/signup/", "/owner/register", "/owner/billing/setup", "/admin", "/admin/venues"]) {
      expect(isAppLinkOutPath(leaves), leaves).toBe(true);
    }
    expect(isAppLinkOutPath("/administrator")).toBe(false);
  });

  it("every web-only page renders WebOnlyInApp from its own layout", () => {
    for (const pagePath of APP_WEB_ONLY_PATHS) {
      const layout = read(`app${pagePath}/layout.tsx`);
      expect(layout, pagePath).toContain(`<WebOnlyInApp path="${pagePath}">{children}</WebOnlyInApp>`);
    }
    const gate = read("components/native/WebOnlyInApp.tsx");
    expect(gate).toContain('isNativeUserAgent((await headers()).get("user-agent"))');
    expect(gate).toContain("inNativeApp ? <WebOnlyNotice path={path} /> : <>{children}</>");
  });

  it("Billing in the app: status and invoices only, every action is 'Manage billing on the web'", () => {
    const billing = read("app/owner/billing/page.tsx");
    // Each money action on the website is behind the in-app check.
    expect(billing).toContain("{inNativeApp ? (\n              <ManageBillingOnWeb className=\"mt-5\" />");
    expect(billing).toContain("{inNativeApp ? null : subscription.status === \"cancelled\" ? (");
    expect(billing).toContain("{subscription.isManual || inNativeApp ? null : (\n                <button\n                  type=\"button\"\n                  onClick={handleUpdateCard}");
    expect(billing).toContain("!inNativeApp && subscription.status !== \"cancelled\" && !subscription.cancelAtPeriodEnd ? (");
    expect(billing).toContain("{inNativeApp && !subscription.isManual ? <ManageBillingOnWeb /> : null}");
    expect(billing.match(/href="\/owner\/billing\/setup"/g)?.length).toBe(2);
    const manage = read("components/native/ManageBillingOnWeb.tsx");
    expect(manage).toContain('openInSystemBrowser(marketingUrl("/owner/billing"))');
    // Code only (the header comment names the rule it follows).
    const manageCode = manage.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(manageCode).not.toMatch(/Subscribe\b|Pay now|\$\d/);
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
    // https://hightopchallenge.com/owner/dashboard in the emulator, then bump the constant.
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

