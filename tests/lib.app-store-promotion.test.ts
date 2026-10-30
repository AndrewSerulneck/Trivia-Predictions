import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORE_URLS } from "@/lib/appDownloadLink";
import { playHost } from "@/lib/domainSplit";
import {
  appStorePromotionReady, isAppStorePromotionEnabled, isPlayerPromotionPath, isPromotionHost, promotionHosts,
  smartAppBannerScript, storeDevice,
} from "@/lib/appStorePromotion";

const stores = { ios: "https://apps.apple.com/us/app/hightop-challenge/id6826962606", android: "https://play.google.com/store/apps/details?id=com.hightopchallenge.app" };
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Version/26.0 Mobile/15E148 Safari/604.1";
afterEach(() => vi.unstubAllEnvs());

describe("store launch gate", () => {
  it("stays off by default, and needs both approved URL slots even with the flag on", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_LINKS_ENABLED", "");
    expect(isAppStorePromotionEnabled()).toBe(false);
    expect(appStorePromotionReady(stores)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_APP_STORE_LINKS_ENABLED", "true");
    expect(appStorePromotionReady(stores)).toBe(true);
    expect(appStorePromotionReady({ ...stores, ios: "" })).toBe(false);
    expect(appStorePromotionReady({ ...stores, android: "" })).toBe(false);
    expect(appStorePromotionReady({ ...stores, ios: "https://example.com/id123" })).toBe(false);
    expect(appStorePromotionReady({ ...stores, android: "https://play.google.com/store/apps/details?id=other.app" })).toBe(false);
    expect(smartAppBannerScript(stores, false)).toBeNull();
  });

  it("keeps unverified production URLs empty and the example switch off", () => {
    expect(STORE_URLS).toEqual({ ios: "", android: "" });
    expect(readFileSync(".env.example", "utf8")).toContain("NEXT_PUBLIC_APP_STORE_LINKS_ENABLED=false");
  });

  it("recognizes touch iPad desktop UA, while actual desktop keeps both choices", () => {
    expect(storeDevice(iphone)).toBe("ios");
    expect(storeDevice("Macintosh Safari", 5)).toBe("ios");
    expect(storeDevice("Macintosh Safari", 0)).toBe("desktop");
    expect(storeDevice("Android Chrome")).toBe("android");
  });

  it("excludes partner, admin and marketing paths with exact prefix boundaries", () => {
    for (const path of ["/owner", "/owner/dashboard", "/admin", "/tv", "/info", "/app", "/api/app/config"]) expect(isPlayerPromotionPath(path)).toBe(false);
    for (const path of ["/", "/join", "/venue/demo", "/sports-bingo", "/ownership"]) expect(isPlayerPromotionPath(path)).toBe(true);
  });
});

describe("promotion hosts (10.3)", () => {
  it("the split off: the game host and the apex (with www.); the split on: the game host only", () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "false");
    expect(promotionHosts()).toEqual([playHost(), "hightopchallenge.com", "www.hightopchallenge.com"]);
    expect(isPromotionHost("HightopChallenge.com")).toBe(true);
    expect(isPromotionHost("example.com")).toBe(false);
    expect(isPromotionHost(undefined)).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "true");
    expect(promotionHosts()).toEqual([playHost()]);
    expect(isPromotionHost("hightopchallenge.com")).toBe(false);
  });
  it("honours NEXT_PUBLIC_PLAY_HOST / NEXT_PUBLIC_APEX_HOST", () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_PLAY_HOST", "game.example.test");
    vi.stubEnv("NEXT_PUBLIC_APEX_HOST", "example.test");
    expect(promotionHosts()).toEqual(["game.example.test", "example.test", "www.example.test"]);
  });
  it("neither promotion file types the game host out", () => {
    for (const file of ["lib/appStorePromotion.ts", "components/native/AppStorePromotion.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toContain("play.hightopchallenge.com");
    }
  });
});

describe("Smart App Banner before hydration", () => {
  function execute({ hostname = playHost(), pathname = "/", ua = iphone, bridge = false, touchPoints = 1 } = {}) {
    const nodes: Record<string, string>[] = [];
    runInNewContext(smartAppBannerScript(stores, true)!, {
      navigator: { userAgent: ua, maxTouchPoints: touchPoints }, location: { hostname, pathname },
      window: bridge ? { Capacitor: {} } : {},
      document: { createElement: () => ({}), head: { appendChild: (node: Record<string, string>) => nodes.push(node) } },
    });
    return nodes;
  }
  it("adds the correct Apple tag on play Safari", () => {
    expect(execute()).toEqual([{ name: "apple-itunes-app", content: "app-id=6826962606" }]);
    expect(execute({ ua: "Macintosh Version/26.0 Safari/605.1", touchPoints: 5 })).toHaveLength(1);
  });
  it("adds the tag on the apex while the split is off, and not once it is on", () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "false");
    expect(execute({ hostname: "hightopchallenge.com" })).toHaveLength(1);
    expect(execute({ hostname: "www.hightopchallenge.com" })).toHaveLength(1);
    expect(execute({ hostname: "hightopchallenge.com", pathname: "/info" })).toEqual([]);
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "true");
    expect(execute({ hostname: "hightopchallenge.com" })).toEqual([]);
    expect(execute()).toHaveLength(1);
  });
  it("adds nothing on another host, owner, native, Android or another iOS browser", () => {
    expect(execute({ hostname: "example.com" })).toEqual([]);
    expect(execute({ pathname: "/owner/login" })).toEqual([]);
    expect(execute({ bridge: true })).toEqual([]);
    expect(execute({ ua: `${iphone} HightopChallengeApp/1.0.0 (ios)` })).toEqual([]);
    expect(execute({ ua: "Android Chrome Safari" })).toEqual([]);
    expect(execute({ ua: `${iphone} CriOS/100` })).toEqual([]);
    expect(execute({ ua: "Macintosh Version/26.0 Safari/605.1", touchPoints: 0 })).toEqual([]);
  });
  it("keeps root layout independent of request headers/cookies", () => {
    const source = readFileSync("app/layout.tsx", "utf8");
    expect(source).not.toContain('from "next/headers"');
    expect(source).toContain("smartAppBannerScript()");
  });
});
