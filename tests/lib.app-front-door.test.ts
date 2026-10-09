import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_SIDE_COOKIE,
  chooseAppLaunchDestination,
  isAppLaunchEntry,
  parseRememberedAppSide,
} from "@/lib/appFrontDoor";

// docs/native-app-store-plan.md Phase 2E item 4: the app's front-door choice,
// including Andrew's QR rule (a launch through a link or the printed join QR is
// a player, so it always gets the player sign-in).

describe("chooseAppLaunchDestination", () => {
  it("nothing remembered → front door", () => {
    expect(
      chooseAppLaunchDestination({ rememberedSide: null, partnerSession: "unchecked", launchedFromLink: false }),
    ).toBe("front-door");
    expect(
      chooseAppLaunchDestination({ rememberedSide: null, partnerSession: "valid", launchedFromLink: false }),
    ).toBe("front-door");
  });

  it('"partner" + a valid session → the Partner Dashboard', () => {
    expect(
      chooseAppLaunchDestination({ rememberedSide: "partner", partnerSession: "valid", launchedFromLink: false }),
    ).toBe("partner-dashboard");
  });

  it('"partner" + a not-yet-checked session → the dashboard, which checks it with its own first-load call', () => {
    expect(
      chooseAppLaunchDestination({ rememberedSide: "partner", partnerSession: "unchecked", launchedFromLink: false }),
    ).toBe("partner-dashboard");
  });

  it('"partner" + an expired session → front door', () => {
    expect(
      chooseAppLaunchDestination({ rememberedSide: "partner", partnerSession: "expired", launchedFromLink: false }),
    ).toBe("front-door");
  });

  it('QR rule: "partner" + a valid session but launched from a link or QR → front door (player sign-in)', () => {
    for (const partnerSession of ["valid", "unchecked", "expired"] as const) {
      expect(
        chooseAppLaunchDestination({ rememberedSide: "partner", partnerSession, launchedFromLink: true }),
      ).toBe("front-door");
    }
  });
});

describe("parseRememberedAppSide", () => {
  it("reads only an exact partner value", () => {
    expect(parseRememberedAppSide(`${APP_SIDE_COOKIE}=partner`)).toBe("partner");
    expect(parseRememberedAppSide(`a=1; ${APP_SIDE_COOKIE}=partner; b=2`)).toBe("partner");
    expect(parseRememberedAppSide(`${APP_SIDE_COOKIE}=`)).toBeNull();
    expect(parseRememberedAppSide(`${APP_SIDE_COOKIE}=player`)).toBeNull();
    expect(parseRememberedAppSide(`x${APP_SIDE_COOKIE}=partner`)).toBeNull();
    expect(parseRememberedAppSide("")).toBeNull();
    expect(parseRememberedAppSide(undefined)).toBeNull();
  });
});

describe("isAppLaunchEntry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubPage = ({ userAgent, historyLength, navType }: { userAgent: string; historyLength: number; navType: string }) => {
    vi.stubGlobal("window", {
      navigator: { userAgent },
      history: { length: historyLength },
      performance: { getEntriesByType: () => [{ type: navType }] },
    });
  };

  const APP_UA = "Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 HightopChallengeApp/0.1.0 (ios)";

  it("is true only for the app's first page of a fresh launch", () => {
    stubPage({ userAgent: APP_UA, historyLength: 1, navType: "navigate" });
    expect(isAppLaunchEntry()).toBe(true);
  });

  it("is false in a browser, after tapping around, or on a reload", () => {
    stubPage({ userAgent: "Mozilla/5.0 (iPhone) Safari/604.1", historyLength: 1, navType: "navigate" });
    expect(isAppLaunchEntry()).toBe(false);
    stubPage({ userAgent: APP_UA, historyLength: 2, navType: "navigate" });
    expect(isAppLaunchEntry()).toBe(false);
    stubPage({ userAgent: APP_UA, historyLength: 1, navType: "reload" });
    expect(isAppLaunchEntry()).toBe(false);
  });

  it("is false on the server", () => {
    expect(isAppLaunchEntry()).toBe(false);
  });
});
