import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyPage } from "@/lib/domainSplit";
import { isNativeUserAgent } from "@/lib/nativeApp";
import { webOnlyPageFor } from "@/lib/nativeLinkOut";
import { isPlayerRuntimePath, isVenueDisplayPath } from "@/lib/playerRuntimePaths";
import { isPlayerPromotionPath } from "@/lib/appStorePromotion";
import { isTvAppUserAgent, TV_APP_UA_TOKEN, tvAppVersion } from "@/lib/tvApp";
import { TV_DEMO_STEP_MS, TV_DEMO_STEPS } from "@/lib/tvAppDemo";
import { TV_PAIR_POLL_MS, TV_PAIR_TTL_MS } from "@/lib/tvConnectShared";

// Tripwire for docs/fire-tv-app-plan.md Phase 3 (the website side of the Hightop Challenge TV app).
//
//  1. lib/tvApp.ts is the ONLY reader of the TV app's `HightopChallengeTV/` user-agent token and its bridge, and the
//     phone app's reader (lib/nativeApp.ts) never matches it (or proxy.ts would show the TV a "web only" notice).
//  2. /tv-app is public, never bounced across hosts, and a display path (no ads, no player runtime or guards).
//  3. A connection grants a venue id only; the table is server-only; rows are short-lived with no cron.
//  4. Try demo makes no request and shows launch content only (D21), 15 s a screen (D23).
//  5. The Connect screen says "Hightop Challenge" in full, with Option 1 OR Option 2 (D10).

const repoRoot = process.cwd();
const read = (relativePath: string): string => readFileSync(path.resolve(repoRoot, relativePath), "utf8");

const listSourceFiles = (dir: string): string[] =>
  readdirSync(path.resolve(repoRoot, dir)).flatMap((entry) => {
    const rel = path.join(dir, entry);
    if (statSync(path.resolve(repoRoot, rel)).isDirectory()) {
      return entry === "node_modules" || entry.startsWith(".") ? [] : listSourceFiles(rel);
    }
    return /\.(ts|tsx)$/.test(entry) && !/ 2\.(ts|tsx)$/.test(entry) ? [rel] : [];
  });

const TV_UA = "Mozilla/5.0 (Linux; Android 9; AFTMM Build/PS7633) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 HightopChallengeTV/1.0.0";
const PHONE_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 HightopChallengeApp/2.0.1 (android)";

describe("the TV app has one reader and is never the phone app", () => {
  it("only lib/tvApp.ts mentions the TV token or the HightopTV bridge", () => {
    const offenders = ["app", "components", "lib"]
      .flatMap(listSourceFiles)
      .filter((file) => file !== path.join("lib", "tvApp.ts"))
      .filter((file) => {
        const source = read(file);
        return source.includes("HightopChallengeTV") || /\bHightopTV\b/.test(source);
      });
    expect(offenders).toEqual([]);
  });

  it("reads the TV token and its version", () => {
    expect(TV_APP_UA_TOKEN).toBe("HightopChallengeTV/");
    expect(isTvAppUserAgent(TV_UA)).toBe(true);
    expect(tvAppVersion(TV_UA)).toBe("1.0.0");
    expect(isTvAppUserAgent(PHONE_UA)).toBe(false);
    expect(isTvAppUserAgent(null)).toBe(false);
  });

  it("the phone app's reader never matches the TV app", () => {
    expect(isNativeUserAgent(TV_UA)).toBe(false);
    expect(isNativeUserAgent(PHONE_UA)).toBe(true);
  });
});

describe("/tv-app routing", () => {
  it("is a display path: no ads, no player runtime", () => {
    for (const p of ["/tv-app", "/tv-app/demo"]) {
      expect(isVenueDisplayPath(p)).toBe(true);
      expect(isPlayerRuntimePath(p)).toBe(false);
    }
    expect(isVenueDisplayPath("/tv-apps")).toBe(false);
  });

  it("is neutral (served on whatever host the app loads) and never web-only in the phone app's sense", () => {
    expect(classifyPage("/tv-app")).toBe("neutral");
    expect(classifyPage("/tv-app/demo")).toBe("neutral");
    expect(webOnlyPageFor("/tv-app")).toBeNull();
  });

  it("is public at the edge and skipped by the player auth guards", () => {
    expect(read("proxy.ts")).toMatch(/pathname === "\/tv-app" \|\| pathname\.startsWith\("\/tv-app\/"\)/);
    for (const guard of ["components/auth/AuthNavigationGuard.tsx", "components/auth/LoginStuckStateBreaker.tsx"]) {
      expect(read(guard)).toMatch(/isVenueScreenPath\(currentPath\) \|\| isVenueDisplayPath\(currentPath\)/);
    }
  });

  it("never shows the phone app's store banner", () => {
    expect(isPlayerPromotionPath("/tv-app")).toBe(false);
    expect(isPlayerPromotionPath("/tv-app/demo")).toBe(false);
  });
});

describe("tv_device_pairings", () => {
  const name = readdirSync("supabase/migrations").find((file) => file.endsWith("_tv_device_pairings.sql"));
  const sql = (name ? read(`supabase/migrations/${name}`) : "").replace(/--.*$/gm, "");

  it("is server-only: RLS forced, browser roles revoked, service_role granted", () => {
    expect(sql).toMatch(/alter table public\.tv_device_pairings enable row level security;/);
    expect(sql).toMatch(/alter table public\.tv_device_pairings force row level security;/);
    expect(sql).toMatch(/revoke all on table public\.tv_device_pairings from anon, authenticated;/);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.tv_device_pairings to service_role;/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated)/i);
  });

  it("stores a venue id and the secret's hash only, and expires in 10 minutes", () => {
    expect(sql).toMatch(/poll_secret_hash text not null/);
    expect(sql).not.toMatch(/poll_secret text|owner_id|session/i);
    expect(sql).toMatch(/expires_at timestamptz not null default \(now\(\) \+ interval '10 minutes'\)/);
    expect(TV_PAIR_TTL_MS).toBe(10 * 60_000);
  });

  it("needs no cron, and the TV polls at most every 3 s", () => {
    expect(read("vercel.json")).not.toMatch(/tv-app|tv_device/);
    expect(TV_PAIR_POLL_MS).toBe(3_000);
    expect(TV_PAIR_TTL_MS / TV_PAIR_POLL_MS).toBeLessThanOrEqual(200);
  });

  it("the TV polls only while visible and never regenerates a code by itself", () => {
    const screen = read("components/venue-screen/TvConnectScreen.tsx");
    expect(screen).toMatch(/document\.visibilityState === "visible"/);
    expect(screen).toMatch(/window\.addEventListener\("keydown", renew\)/);
    expect(screen).not.toMatch(/setInterval/);
  });
});

describe("Try demo (D21, D23)", () => {
  it("shows launch content only: Live Trivia and idle", () => {
    const modes = new Set(TV_DEMO_STEPS.map((step) => step.build(0).mode));
    expect([...modes].sort()).toEqual(["idle", "live-trivia", "live-trivia-pregame"]);
    const phases = TV_DEMO_STEPS.flatMap((step) => {
      const state = step.build(0);
      return state.mode === "live-trivia" ? [state.liveTrivia.phase] : [];
    });
    expect(phases).toEqual(["question", "reveal", "intermission", "final"]);
  });

  it("is 15 s a screen, on a fake venue, with no request", () => {
    expect(TV_DEMO_STEP_MS).toBe(15_000);
    for (const step of TV_DEMO_STEPS) expect(step.build(0).venue.id).toBe("demo");
    const demo = read("components/venue-screen/TvDemo.tsx");
    expect(demo).toMatch(/poll=\{false\}/);
    expect(demo).not.toMatch(/fetch\(/);
    expect(read("lib/tvAppDemo.ts")).not.toMatch(/fetch\(|supabase/);
    expect(read("components/venue-screen/VenueScreenClient.tsx")).toMatch(/if \(!poll\) return;/);
  });
});

describe("Connect screen copy (D10)", () => {
  const screen = read("components/venue-screen/TvConnectScreen.tsx");
  it("says Hightop Challenge in full, with two equal options and Try demo", () => {
    expect(screen).toContain("Hightop Challenge");
    expect(screen).toContain("Option 1");
    expect(screen).toContain("Option 2");
    expect(screen).toMatch(/>\s*OR\s*</);
    expect(screen).toContain("Try demo");
    expect(screen).toContain('router.push("/tv-app/demo")');
  });
});

// Phase 4: the Fire OS shell in native-tv/ must speak the same contract as lib/tvApp.ts.
describe("the Fire OS app (native-tv/) matches the website", () => {
  const nativeRoot = "native-tv";
  const kotlin = (name: string) => read(`${nativeRoot}/app/src/main/java/com/hightopchallenge/tv/${name}`);
  const listNativeText = (dir: string): string[] =>
    readdirSync(path.resolve(repoRoot, dir)).flatMap((entry) => {
      const rel = path.join(dir, entry);
      if (statSync(path.resolve(repoRoot, rel)).isDirectory()) {
        return entry.startsWith(".") || entry === "build" || entry === "out" ? [] : listNativeText(rel);
      }
      return /\.(kt|kts|xml|pro|properties|mjs|md)$/.test(entry) && !/ 2\./.test(entry) ? [rel] : [];
    });

  it("never sends the phone app's token", () => {
    const offenders = listNativeText(nativeRoot).filter((file) => read(file).includes("HightopChallengeApp/"));
    expect(offenders).toEqual([]);
  });

  it("uses the same UA token, bridge name and bridge methods", () => {
    const policy = kotlin("TvPolicy.kt");
    expect(policy).toContain(`const val TV_UA_TOKEN = "${TV_APP_UA_TOKEN}"`);
    expect(policy).toContain('const val TV_BRIDGE_NAME = "HightopTV"');
    const bridge = kotlin("TvBridge.kt");
    const webBridge = read("lib/tvApp.ts");
    for (const method of ["getVenueId", "setVenueId", "clearVenueId"]) {
      expect(webBridge).toContain(`${method}?:`);
      expect(bridge).toMatch(new RegExp(`@JavascriptInterface\\s+fun ${method}\\(`));
    }
    expect(read(`${nativeRoot}/app/proguard-rules.pro`)).toContain("com.hightopchallenge.tv.TvBridge");
    expect(kotlin("MainActivity.kt")).toContain("addJavascriptInterface(TvBridge(prefs), TV_BRIDGE_NAME)");
  });

  it("starts on /tv-app, allows only the site's hosts, and its versionName parses as a UA version", () => {
    const gradle = read(`${nativeRoot}/app/build.gradle.kts`);
    expect(gradle).toContain('val siteStartUrl = "https://hightopchallenge.com/tv-app"');
    expect(gradle).toContain('val siteHosts = "hightopchallenge.com,www.hightopchallenge.com,play.hightopchallenge.com"');
    const versionName = /versionName = "([^"]+)"/.exec(gradle)?.[1] ?? "";
    expect(tvAppVersion(`Base HightopChallengeTV/${versionName}`)).toBe(versionName);
  });

  it("is a separate app from the phone app", () => {
    const tvId = /applicationId = "([^"]+)"/.exec(read(`${nativeRoot}/app/build.gradle.kts`))?.[1];
    const phoneId = /applicationId "([^"]+)"/.exec(read("native/android/app/build.gradle"))?.[1];
    expect(tvId).toBe("com.hightopchallenge.tv");
    expect(phoneId).toBeTruthy();
    expect(tvId).not.toBe(phoneId);
  });

  it("is a TV app with https only and no extra permissions", () => {
    const manifest = read(`${nativeRoot}/app/src/main/AndroidManifest.xml`);
    expect(manifest).toMatch(/android\.software\.leanback" android:required="true"/);
    expect(manifest).toMatch(/android\.hardware\.touchscreen" android:required="false"/);
    expect(manifest).toContain("android.intent.category.LEANBACK_LAUNCHER");
    expect(manifest).toContain('android:banner="@drawable/tv_banner"');
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    const permissions = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(permissions).toEqual(["android.permission.ACCESS_NETWORK_STATE", "android.permission.INTERNET"]);
    expect(read(`${nativeRoot}/app/src/main/res/xml/network_security_config.xml`)).toContain(
      'cleartextTrafficPermitted="false"',
    );
  });

  it("keeps the screen on natively, so the web keep-awake hook stands down in the app", () => {
    expect(kotlin("MainActivity.kt")).toContain("FLAG_KEEP_SCREEN_ON");
    const hook = read("lib/useKeepScreenAwake.ts");
    expect(hook).toContain('import { isTvApp } from "@/lib/tvApp"');
    expect(hook).toMatch(/if \(isTvApp\(\)\) \{\s+setStatus\(\{ method: "native"/);
  });
});
