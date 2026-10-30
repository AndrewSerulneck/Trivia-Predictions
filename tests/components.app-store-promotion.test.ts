// @vitest-environment jsdom
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreDownloadSection, JoinAppStoreLink, PlayerAppStoreBanner } from "@/components/native/AppStorePromotion";
import { playHost } from "@/lib/domainSplit";
import { APP_STORE_PROMOTION_DISMISSED_KEY } from "@/lib/appStorePromotion";

// The launch gate is read once at module load (10.3 F10), so it is set before the imports above run.
vi.hoisted(() => { process.env.NEXT_PUBLIC_APP_STORE_LINKS_ENABLED = "true"; });

const state = vi.hoisted(() => ({ native: false, pathname: "/venue/demo" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/lib/nativeApp", async (original) => ({ ...await original<typeof import("@/lib/nativeApp")>(), isNativeApp: () => state.native }));
vi.mock("@/lib/appDownloadLink", () => ({ STORE_URLS: { ios: "https://apps.apple.com/us/app/hightop-challenge/id6826962606", android: "https://play.google.com/store/apps/details?id=com.hightopchallenge.app" } }));

function browser(ua: string, hostname = playHost()) {
  vi.stubGlobal("location", new URL(`https://${hostname}/`));
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
}
beforeEach(() => {
  state.native = false;
  state.pathname = "/venue/demo";
  localStorage.clear();
  browser("Android Chrome Safari");
});
afterEach(() => {
  cleanup(); document.head.querySelector('meta[name="apple-itunes-app"]')?.remove();
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("player store surfaces", () => {
  it("shows nothing inside the app or an installed app, once the browser is known", () => {
    state.native = true;
    expect(render(createElement(AppStoreDownloadSection)).container.innerHTML).toBe("");
  });
  it("renders the section on the server in its desktop form, so /info#app has a target (10.3 F7)", () => {
    const html = renderToString(createElement(AppStoreDownloadSection));
    expect(html).toContain('id="app"');
    expect(html).toContain("Download on the App Store");
    expect(html).toContain("Get it on Google Play");
    expect(html).toContain("Play in your browser");
    expect(html).toContain("/share/app-download-qr-v1.png");
  });
  it("renders nothing on the server while the launch gate is off", async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_APP_STORE_LINKS_ENABLED = "false";
    try {
      const react = await import("react");
      const server = await import("react-dom/server");
      const fresh = await import("@/components/native/AppStorePromotion");
      expect(server.renderToString(react.createElement(fresh.AppStoreDownloadSection))).toBe("");
    } finally { process.env.NEXT_PUBLIC_APP_STORE_LINKS_ENABLED = "true"; vi.resetModules(); }
  });
  it("gives desktop both official badges, the permanent QR and browser play", () => {
    browser("Windows Chrome", "hightopchallenge.com");
    render(createElement(AppStoreDownloadSection));
    expect(screen.getByRole("link", { name: /Download Hightop/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Get Hightop/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Play in your browser" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Scan to choose/ }).getAttribute("src")).toBe("/share/app-download-qr-v1.png");
  });
  it("uses one badge on mobile and honors the native server hint at sign-in", () => {
    const view = render(createElement(JoinAppStoreLink, { nativeAppRequest: true }));
    expect(view.container.innerHTML).toBe(""); view.unmount();
    render(createElement(JoinAppStoreLink));
    expect(screen.getByRole("link", { name: /Google Play/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /App Store/ })).toBeNull();
  });
  it("shows the sign-in line on the apex while the split is off, and only on the game host once it is on", () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "false");
    browser("Android Chrome Safari", "hightopchallenge.com");
    const apex = render(createElement(JoinAppStoreLink));
    expect(screen.getByRole("link", { name: /Google Play/ })).toBeTruthy(); apex.unmount();
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "true");
    expect(render(createElement(JoinAppStoreLink)).container.innerHTML).toBe("");
  });
  it("shows the Android bar on an apex player page while the split is off", () => {
    vi.stubEnv("NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED", "false");
    browser("Android Chrome Safari", "hightopchallenge.com");
    render(createElement(PlayerAppStoreBanner));
    expect(screen.getByRole("link", { name: "Get the app" })).toBeTruthy();
  });
  it("persists Android dismissal through remount and suppresses partner routes", () => {
    const view = render(createElement(PlayerAppStoreBanner));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss app download banner" }));
    expect(localStorage.getItem(APP_STORE_PROMOTION_DISMISSED_KEY)).toBe("true");
    view.unmount();
    const next = render(createElement(PlayerAppStoreBanner));
    expect(next.container.innerHTML).toBe(""); next.unmount();
    localStorage.clear(); state.pathname = "/owner/dashboard";
    expect(render(createElement(PlayerAppStoreBanner)).container.innerHTML).toBe("");
  });
  it("still dismisses if storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const view = render(createElement(PlayerAppStoreBanner));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss app download banner" }));
    expect(view.container.innerHTML).toBe("");
  });
  const tag = () => document.head.querySelector('meta[name="apple-itunes-app"]');
  it("keeps the head script's Safari tag through hydration, removes it on a partner page, adds it back (10.3 F8)", () => {
    browser("iPhone Version/26.0 Mobile Safari/604.1");
    const inserted = document.createElement("meta"); // what the head script does while the page is parsed
    inserted.name = "apple-itunes-app"; inserted.content = "app-id=6826962606";
    document.head.appendChild(inserted);
    const view = render(createElement(PlayerAppStoreBanner));
    expect(tag()).toBe(inserted); // the same element, never removed and re-added
    state.pathname = "/owner/dashboard";
    view.rerender(createElement(PlayerAppStoreBanner));
    expect(tag()).toBeNull();
    state.pathname = "/venue/demo";
    view.rerender(createElement(PlayerAppStoreBanner));
    expect(tag()?.getAttribute("content")).toBe("app-id=6826962606");
  });
  it("adds the Safari tag itself when the head script did not, and not for the native app", () => {
    browser("iPhone Version/26.0 Mobile Safari/604.1");
    state.native = true;
    const native = render(createElement(PlayerAppStoreBanner));
    expect(tag()).toBeNull(); native.unmount();
    state.native = false;
    render(createElement(PlayerAppStoreBanner));
    expect(tag()?.getAttribute("content")).toBe("app-id=6826962606");
  });
});
