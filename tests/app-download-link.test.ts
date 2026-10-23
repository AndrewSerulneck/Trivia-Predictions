import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_DOWNLOAD_URL,
  STORE_URLS,
  decideAppLinkDestination,
} from "@/lib/appDownloadLink";
import { JOIN_QR_URL } from "@/lib/joinQr";
import { buildAppAskPage } from "@/lib/appDownloadPage";
import { classifyPage } from "@/lib/domainSplit";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 16) Chrome/133 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/133 Safari/537.36";
const APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) HightopChallengeApp/1.0.0 (ios)";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Safari/605.1.15";
const LIVE = { ios: "https://apps.apple.com/app/id1", android: "https://play.google.com/store/apps/details?id=x" };

describe("decideAppLinkDestination", () => {
  it("asks a phone first once its store is listed", () => {
    expect(decideAppLinkDestination(IPHONE, LIVE)).toEqual({ kind: "ask", device: "ios", storeUrl: LIVE.ios });
    expect(decideAppLinkDestination(IPAD, LIVE)).toEqual({ kind: "ask", device: "ios", storeUrl: LIVE.ios });
    expect(decideAppLinkDestination(ANDROID, LIVE)).toEqual({ kind: "ask", device: "android", storeUrl: LIVE.android });
  });
  it("a Mac-looking Safari might be an iPad; other Mac browsers are desktop", () => {
    expect(decideAppLinkDestination(IPAD_DESKTOP_UA, LIVE)).toEqual({ kind: "ask", device: "ipad-maybe", storeUrl: LIVE.ios });
    expect(decideAppLinkDestination(DESKTOP, LIVE)).toEqual({ kind: "site", path: "/info#app", host: "apex" });
    expect(decideAppLinkDestination(IPAD_DESKTOP_UA + " Edg/120", LIVE)).toEqual({ kind: "site", path: "/info#app", host: "apex" });
    // App Store not live: a Mac Safari is just desktop.
    expect(decideAppLinkDestination(IPAD_DESKTOP_UA, { ios: "", android: LIVE.android })).toEqual({ kind: "site", path: "/info#app", host: "apex" });
    expect(decideAppLinkDestination(IPAD_DESKTOP_UA, { ios: "", android: "" })).toEqual({ kind: "external", url: JOIN_QR_URL });
  });
  it("sends desktop and unknown to /info#app once listed", () => {
    for (const ua of [DESKTOP, "", null, undefined]) {
      expect(decideAppLinkDestination(ua, LIVE)).toEqual({ kind: "site", path: "/info#app", host: "apex" });
    }
  });
  it("sends everyone to the player sign-in while no listing is live", () => {
    const none = { ios: "", android: "" };
    for (const ua of [IPHONE, ANDROID, DESKTOP, null]) {
      expect(decideAppLinkDestination(ua, none)).toEqual({ kind: "external", url: JOIN_QR_URL });
    }
  });
  it("one store live: the other device still reaches the sign-in", () => {
    expect(decideAppLinkDestination(ANDROID, { ios: LIVE.ios, android: "" })).toEqual({ kind: "external", url: JOIN_QR_URL });
  });
  it("inside the app goes to the front door, never a store", () => {
    expect(decideAppLinkDestination(APP, LIVE)).toEqual({ kind: "site", path: "/", host: "play" });
  });
  it("ships with no store URLs set until the listings are live", () => {
    expect(STORE_URLS).toEqual({ ios: "", android: "" });
  });
});

describe("the Get the app? page", () => {
  it("has the store button and the browser link, both plain links", () => {
    const html = buildAppAskPage("ios", LIVE.ios);
    expect(html).toContain(`<a class="get" href="${LIVE.ios}">Get the app</a>`);
    expect(html).toContain(`href="${JOIN_QR_URL}">No thanks, play in the browser</a>`);
    expect(html).not.toContain("<script");
  });
  it("the maybe-iPad form falls back to the website without a touch screen", () => {
    const html = buildAppAskPage("ipad-maybe", LIVE.ios);
    expect(html).toContain("Get the iPad app");
    expect(html).toContain('href="/info#app">Continue to the website</a>');
    expect(html).toContain("maxTouchPoints>1");
  });
  it("escapes the store URL and keeps text at 12px or more", () => {
    expect(buildAppAskPage("android", 'https://x/?a=1&b="2"')).toContain("a=1&amp;b=&quot;2&quot;");
    const sizes = [...buildAppAskPage("ios", LIVE.ios).matchAll(/font-size:(\d+)px/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});

describe("/app plumbing", () => {
  it("the permanent URL is a literal on the apex", () => {
    expect(APP_DOWNLOAD_URL).toBe("https://hightopchallenge.com/app");
    expect(readFileSync("lib/appDownloadLink.ts", "utf8")).not.toMatch(/process\.env/);
  });
  it("is never bounced across hosts and is public in the edge gate", () => {
    expect(classifyPage("/app")).toBe("neutral");
    expect(classifyPage("/application")).toBe("game");
    expect(readFileSync("proxy.ts", "utf8")).toContain('pathname === "/app"');
  });
  it("the route is uncached", () => {
    expect(readFileSync("app/app/route.ts", "utf8")).toContain("private, no-store");
  });
});
