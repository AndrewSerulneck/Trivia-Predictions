import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_DOWNLOAD_URL,
  STORE_URLS,
  decideAppLinkDestination,
} from "@/lib/appDownloadLink";
import { JOIN_QR_URL } from "@/lib/joinQr";
import { classifyPage } from "@/lib/domainSplit";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 16) Chrome/133 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/133 Safari/537.36";
const APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) HightopChallengeApp/1.0.0 (ios)";
const LIVE = { ios: "https://apps.apple.com/app/id1", android: "https://play.google.com/store/apps/details?id=x" };

describe("decideAppLinkDestination", () => {
  it("sends devices to their store once listed", () => {
    expect(decideAppLinkDestination(IPHONE, LIVE)).toEqual({ kind: "external", url: LIVE.ios });
    expect(decideAppLinkDestination(IPAD, LIVE)).toEqual({ kind: "external", url: LIVE.ios });
    expect(decideAppLinkDestination(ANDROID, LIVE)).toEqual({ kind: "external", url: LIVE.android });
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
