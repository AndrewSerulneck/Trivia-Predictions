import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyPage,
  decideDomainSplit,
  gameHref,
  gameUrl,
  hostKind,
  isDomainSplitEnabled,
  marketingHref,
} from "@/lib/domainSplit";

const ENV_KEYS = [
  "NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED",
  "NEXT_PUBLIC_APEX_HOST",
  "NEXT_PUBLIC_PLAY_HOST",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_PLAY_URL",
  "NEXT_PUBLIC_COOKIE_DOMAIN",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const enableSplit = () => {
  process.env.NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED = "true";
  process.env.NEXT_PUBLIC_APEX_HOST = "hightopchallenge.com";
  process.env.NEXT_PUBLIC_PLAY_HOST = "play.hightopchallenge.com";
};

describe("classifyPage", () => {
  it("treats marketing surfaces as marketing", () => {
    for (const p of ["/info", "/info/pricing", "/faqs", "/advertise", "/owner", "/owner/dashboard"]) {
      expect(classifyPage(p)).toBe("marketing");
    }
  });

  it("treats player game surfaces as game", () => {
    for (const p of ["/", "/join", "/venue/brunswick-grove", "/venue/x/screen", "/trivia/live"]) {
      expect(classifyPage(p)).toBe("game");
    }
  });

  it("treats APIs, assets, and admin as neutral (never redirected)", () => {
    for (const p of ["/api/owner/billing", "/api/trivia", "/_next/static/x.js", "/admin", "/brand/logo.png", "/favicon.ico", "/x.png"]) {
      expect(classifyPage(p)).toBe("neutral");
    }
  });

  it("treats the TV pairing page as neutral so it works on the apex (Phase 5b)", () => {
    for (const p of ["/tv", "/tv/help"]) {
      expect(classifyPage(p)).toBe("neutral");
    }
    // Not over-broad: /tvshows is still a game page.
    expect(classifyPage("/tvshows")).toBe("game");
  });
});

describe("hostKind", () => {
  it("classifies apex, www, and play hosts", () => {
    enableSplit();
    expect(hostKind("hightopchallenge.com")).toBe("apex");
    expect(hostKind("www.hightopchallenge.com")).toBe("apex");
    expect(hostKind("hightopchallenge.com:443")).toBe("apex");
    expect(hostKind("play.hightopchallenge.com")).toBe("play");
    expect(hostKind("localhost:3000")).toBe("other");
    expect(hostKind("preview-abc.vercel.app")).toBe("other");
    expect(hostKind(null)).toBe("other");
  });
});

describe("decideDomainSplit", () => {
  it("is a no-op when the flag is off", () => {
    process.env.NEXT_PUBLIC_APEX_HOST = "hightopchallenge.com";
    process.env.NEXT_PUBLIC_PLAY_HOST = "play.hightopchallenge.com";
    expect(isDomainSplitEnabled()).toBe(false);
    expect(decideDomainSplit("hightopchallenge.com", "/venue/x")).toEqual({ action: "none" });
    expect(decideDomainSplit("play.hightopchallenge.com", "/info")).toEqual({ action: "none" });
  });

  it("is a no-op for unknown/preview hosts even when enabled", () => {
    enableSplit();
    expect(decideDomainSplit("localhost:3000", "/venue/x")).toEqual({ action: "none" });
    expect(decideDomainSplit("preview.vercel.app", "/info")).toEqual({ action: "none" });
  });

  it("rewrites apex `/` to the marketing /info experience", () => {
    enableSplit();
    expect(decideDomainSplit("hightopchallenge.com", "/")).toEqual({ action: "rewrite", path: "/info" });
    expect(decideDomainSplit("www.hightopchallenge.com", "/")).toEqual({ action: "rewrite", path: "/info" });
  });

  it("redirects game pages hit on the apex to the play host", () => {
    enableSplit();
    expect(decideDomainSplit("hightopchallenge.com", "/join")).toEqual({
      action: "redirect",
      host: "play.hightopchallenge.com",
    });
    expect(decideDomainSplit("hightopchallenge.com", "/venue/brunswick-grove")).toEqual({
      action: "redirect",
      host: "play.hightopchallenge.com",
    });
  });

  it("serves marketing pages on the apex without redirect", () => {
    enableSplit();
    expect(decideDomainSplit("hightopchallenge.com", "/info")).toEqual({ action: "none" });
    expect(decideDomainSplit("hightopchallenge.com", "/owner/dashboard")).toEqual({ action: "none" });
  });

  it("redirects marketing pages hit on the play host back to the apex", () => {
    enableSplit();
    expect(decideDomainSplit("play.hightopchallenge.com", "/info")).toEqual({
      action: "redirect",
      host: "hightopchallenge.com",
    });
    expect(decideDomainSplit("play.hightopchallenge.com", "/owner/login")).toEqual({
      action: "redirect",
      host: "hightopchallenge.com",
    });
  });

  it("serves the game (including `/`) on the play host without redirect", () => {
    enableSplit();
    expect(decideDomainSplit("play.hightopchallenge.com", "/")).toEqual({ action: "none" });
    expect(decideDomainSplit("play.hightopchallenge.com", "/venue/x")).toEqual({ action: "none" });
  });

  it("never redirects the TV pairing page off the apex (Phase 5b)", () => {
    enableSplit();
    expect(decideDomainSplit("hightopchallenge.com", "/tv")).toEqual({ action: "none" });
    expect(decideDomainSplit("play.hightopchallenge.com", "/tv")).toEqual({ action: "none" });
  });

  it("never redirects neutral routes (APIs/assets) on either host", () => {
    enableSplit();
    expect(decideDomainSplit("hightopchallenge.com", "/api/trivia")).toEqual({ action: "none" });
    expect(decideDomainSplit("play.hightopchallenge.com", "/api/owner/billing")).toEqual({ action: "none" });
  });
});

describe("link + url helpers", () => {
  it("keeps game links relative while the split is off", () => {
    expect(gameHref("/join")).toBe("/join");
    expect(marketingHref("/info")).toBe("/info");
    // gameUrl is always absolute; falls back to the apex/site URL when off.
    process.env.NEXT_PUBLIC_SITE_URL = "https://hightopchallenge.com";
    expect(gameUrl("/venue/x/screen")).toBe("https://hightopchallenge.com/venue/x/screen");
  });

  it("emits absolute cross-host links once enabled", () => {
    enableSplit();
    process.env.NEXT_PUBLIC_SITE_URL = "https://hightopchallenge.com";
    process.env.NEXT_PUBLIC_PLAY_URL = "https://play.hightopchallenge.com";
    expect(gameHref("/join")).toBe("https://play.hightopchallenge.com/join");
    expect(gameUrl("/venue/x/screen")).toBe("https://play.hightopchallenge.com/venue/x/screen");
    expect(marketingHref("/owner/login")).toBe("https://hightopchallenge.com/owner/login");
  });

  it("derives play base from the play host when NEXT_PUBLIC_PLAY_URL is unset", () => {
    enableSplit();
    expect(gameUrl("/x")).toBe("https://play.hightopchallenge.com/x");
  });
});
