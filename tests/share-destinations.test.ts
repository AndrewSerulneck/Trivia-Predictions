import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHARE_DESTINATION_COPY, shareTagNudge } from "@/lib/socialShare/copyPresets";
import {
  SHARE_DESTINATIONS,
  planShareDestination,
  xIntentUrl,
  type ShareDestination,
  type ShareDestinationEnv,
} from "@/lib/socialShare/shareDestinations";

// Native-app plan Phase 9d: the share sheet's destinations row and the in-app Instagram Story plugin.

const root = path.resolve(__dirname, "..");
const read = (file: string): string => fs.readFileSync(path.join(root, file), "utf8");

const WEBSITE: ShareDestinationEnv = { instagramStoryDirect: false, canSharePicture: true, inApp: false };
const DESKTOP: ShareDestinationEnv = { instagramStoryDirect: false, canSharePicture: false, inApp: false };
const APP_WITH_INSTAGRAM: ShareDestinationEnv = { instagramStoryDirect: true, canSharePicture: true, inApp: true };
const OLD_APP: ShareDestinationEnv = { instagramStoryDirect: false, canSharePicture: true, inApp: true };

describe("Phase 9d — what one tap does", () => {
  it("offers the plan's seven destinations, in order", () => {
    expect([...SHARE_DESTINATIONS]).toEqual(["instagram-story", "instagram-post", "facebook", "x", "messages", "save", "more"]);
  });

  it.each<[ShareDestination, ShareDestinationEnv, string, boolean]>([
    ["instagram-story", APP_WITH_INSTAGRAM, "instagram-story-native", true],
    ["instagram-story", OLD_APP, "share-sheet", true],
    ["instagram-story", WEBSITE, "share-sheet", true],
    ["instagram-post", APP_WITH_INSTAGRAM, "share-sheet", true],
    ["facebook", WEBSITE, "share-sheet", true],
    ["x", WEBSITE, "share-sheet", true],
    ["x", DESKTOP, "x-intent", true],
    ["messages", WEBSITE, "share-sheet", true],
    ["save", WEBSITE, "download", false],
    ["save", DESKTOP, "download", false],
    ["save", OLD_APP, "share-sheet", false],
    ["more", WEBSITE, "share-sheet", true],
  ])("%s → %s", (destination, env, action, copyCaption) => {
    const plan = planShareDestination(destination, env);
    expect(plan.action).toBe(action);
    expect(plan.copyCaption).toBe(copyCaption);
    expect(plan.hint.length).toBeGreaterThan(0);
  });

  it("Instagram tells the player where the link goes", () => {
    expect(planShareDestination("instagram-story", APP_WITH_INSTAGRAM).hint).toContain("link sticker");
    expect(planShareDestination("instagram-story", WEBSITE).hint).toContain("link sticker");
    expect(planShareDestination("instagram-post", WEBSITE).hint).toContain("paste the caption");
  });

  it("X's post page carries the whole caption, link included", () => {
    const caption = "I just won $15 off my tab at The Pour House! Play on Hightop Challenge: https://hightopchallenge.com/app";
    const url = new URL(xIntentUrl(caption));
    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("text")).toBe(caption);
  });

  it("the tag nudge names the bar, and disappears without one", () => {
    expect(shareTagNudge("The Pour House")).toBe("Tag The Pour House in your post");
    expect(shareTagNudge("  ")).toBeNull();
    expect(shareTagNudge(null)).toBeNull();
  });

  it("every label is Prize-safe screen copy", () => {
    for (const copy of Object.values(SHARE_DESTINATION_COPY)) {
      expect(`${copy.label} ${copy.direct} ${copy.viaSheet}`).not.toMatch(/reward/i);
    }
  });
});

describe("Phase 9d — the sheet", () => {
  const modal = read("components/social-share/StoryCaptureModal.tsx");

  it("is the one share sheet (StoryCaptureModal, not a fork) and uses the pure plan", () => {
    expect(modal).toContain("planShareDestination(destination");
    expect(modal).toContain("<ShareDestinationRow");
    expect(modal).toContain("<ShareCaption");
    expect(modal).toContain("Take a selfie instead");
  });

  it("starts the clipboard write inside the tap, before any await", () => {
    const body = modal.slice(modal.indexOf("const pickDestination = useCallback"));
    const copyAt = body.indexOf("copyText(activePreparedStory.shareText)");
    expect(copyAt).toBeGreaterThan(-1);
    expect(copyAt).toBeLessThan(body.indexOf("await "));
  });

  it("never adds a url next to the picture (Instagram drops out of the iPhone share sheet)", () => {
    const call = modal.slice(modal.indexOf("webStoryPlatform.shareImage({"));
    expect(call.slice(0, call.indexOf("});"))).not.toMatch(/\burl\s*:/);
  });

  it("reads the clipboard only through lib/copyText.ts and haptics only through haptic()", () => {
    for (const file of ["components/social-share/StoryCaptureModal.tsx", "components/social-share/ShareDestinations.tsx"]) {
      const source = read(file);
      expect(source).not.toContain("navigator.clipboard");
      expect(source).not.toContain("navigator.vibrate");
      expect(source).not.toContain("playHaptic");
    }
  });
});

describe("Phase 9d — the in-app Instagram Stories plugin", () => {
  const config = JSON.parse(read("native/capacitor.config.json")) as {
    plugins?: { InstagramStories?: { facebookAppId?: string } };
  };

  it("carries the Meta App ID from the plan's §7 (public), never an App Secret", () => {
    const plan = read("docs/native-app-store-plan.md");
    const appId = config.plugins?.InstagramStories?.facebookAppId ?? "";
    expect(appId).toMatch(/^\d{10,20}$/);
    expect(plan).toContain(`App ID, for Instagram Story direct-share (Phase 9d): ${appId}`);
    expect(read("native/capacitor.config.json").toLowerCase()).not.toContain("secret");
  });

  it("exists on iOS, is compiled in and registered, and can see Instagram", () => {
    const swift = read("native/ios/App/App/InstagramStoriesPlugin.swift");
    expect(swift).toContain('public let jsName = "InstagramStories"');
    expect(swift).toContain('CAPPluginMethod(name: "isAvailable"');
    expect(swift).toContain('CAPPluginMethod(name: "shareToStory"');
    expect(swift).toContain("com.instagram.sharedSticker.backgroundImage");
    expect(swift).toContain("instagram-stories://share?source_application=");
    expect(swift).toContain('"NOT_INSTALLED"');
    expect(read("native/ios/App/App/HightopBridgeViewController.swift")).toContain("bridge?.registerPluginInstance(InstagramStoriesPlugin())");
    expect(read("native/ios/App/App.xcodeproj/project.pbxproj")).toContain("InstagramStoriesPlugin.swift in Sources");
    expect(read("native/ios/App/App/Info.plist")).toMatch(/<key>LSApplicationQueriesSchemes<\/key>\s*<array>\s*<string>instagram-stories<\/string>/);
  });

  it("exists on Android, is registered before the bridge, and can see Instagram", () => {
    const java = read("native/android/app/src/main/java/com/hightopchallenge/app/InstagramStoriesPlugin.java");
    expect(java).toContain('@CapacitorPlugin(name = "InstagramStories")');
    expect(java).toContain('"com.instagram.share.ADD_TO_STORY"');
    expect(java).toContain('putExtra("source_application"');
    expect(java).toContain('".fileprovider"');
    expect(java).toContain('"NOT_INSTALLED"');
    const activity = read("native/android/app/src/main/java/com/hightopchallenge/app/MainActivity.java");
    expect(activity.indexOf("registerPlugin(InstagramStoriesPlugin.class);")).toBeGreaterThan(-1);
    expect(activity.indexOf("registerPlugin(InstagramStoriesPlugin.class);")).toBeLessThan(activity.indexOf("super.onCreate(savedInstanceState);"));
    const manifest = read("native/android/app/src/main/AndroidManifest.xml");
    expect(manifest).toMatch(/<queries>\s*<package android:name="com\.instagram\.android" \/>\s*<\/queries>/);
    expect(read("native/android/app/src/main/res/xml/file_paths.xml")).toContain("<cache-path");
  });

  it("is capability-checked before every call (old app builds fall back to the share sheet)", () => {
    expect(read("lib/nativeApp.ts")).toContain('| "InstagramStories"');
    const bridge = read("lib/nativeInstagramStories.ts");
    expect(bridge.match(/hasNativeCapability\("InstagramStories"\)/g)?.length).toBe(2);
  });
});
