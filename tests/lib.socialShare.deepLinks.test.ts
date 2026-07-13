import { describe, expect, it } from "vitest";
import {
  getDeepLinkFallbackDelayMs,
  getFacebookStoryDeepLinkOption,
  getInstagramStoryDeepLinkOption,
  getStoryDeepLinkOptions,
} from "@/lib/socialShare/deepLinks";

describe("social share deep links", () => {
  it("creates an iOS Instagram camera deep link with honest guidance", () => {
    const option = getInstagramStoryDeepLinkOption({
      isIOS: true,
      isAndroid: false,
    });

    expect(option).toMatchObject({
      target: "instagram",
      appName: "Instagram",
      deepLinkUrl: "instagram://camera",
      webFallbackUrl: "https://www.instagram.com/",
      likelyAvailable: true,
      canAttachImage: false,
    });
    expect(option.guidance).toContain("Save the image first");
  });

  it("creates an Android Instagram intent link", () => {
    const option = getInstagramStoryDeepLinkOption({
      isAndroid: true,
    });

    expect(option.deepLinkUrl).toContain("package=com.instagram.android");
    expect(option.likelyAvailable).toBe(true);
  });

  it("creates a Facebook fallback option without claiming direct image attachment", () => {
    const option = getFacebookStoryDeepLinkOption({
      facebookDeepLinkLikely: true,
    });

    expect(option).toMatchObject({
      target: "facebook",
      appName: "Facebook",
      webFallbackUrl: "https://www.facebook.com/stories/create",
      likelyAvailable: true,
      canAttachImage: false,
    });
    expect(option.guidance).toContain("Save the image first");
  });

  it("returns both app options from a capability snapshot", () => {
    const options = getStoryDeepLinkOptions({
      isIOS: false,
      isAndroid: false,
      instagramDeepLinkLikely: false,
      facebookDeepLinkLikely: false,
    });

    expect(options.map((option) => option.target)).toEqual(["instagram", "facebook"]);
    expect(options.every((option) => option.likelyAvailable === false)).toBe(true);
  });

  it("uses a short fallback delay for failed app opens", () => {
    expect(getDeepLinkFallbackDelayMs()).toBeGreaterThanOrEqual(500);
    expect(getDeepLinkFallbackDelayMs()).toBeLessThanOrEqual(1500);
  });
});
