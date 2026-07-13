import type {
  StoryExternalAppOption,
  StoryExternalAppTarget,
  StoryShareCapabilitySnapshot,
} from "./contracts";

export type StoryDeepLinkTarget = StoryExternalAppTarget;

export interface StoryDeepLinkDeviceHints {
  isIOS?: boolean;
  isAndroid?: boolean;
  instagramDeepLinkLikely?: boolean;
  facebookDeepLinkLikely?: boolean;
}

export type StoryDeepLinkOption = StoryExternalAppOption;

function pickInstagramDeepLink(hints: StoryDeepLinkDeviceHints): string {
  if (hints.isAndroid) {
    return "intent://camera#Intent;scheme=instagram;package=com.instagram.android;end";
  }
  return "instagram://camera";
}

function pickFacebookDeepLink(hints: StoryDeepLinkDeviceHints): string {
  if (hints.isAndroid) {
    return "intent://#Intent;scheme=fb;package=com.facebook.katana;end";
  }
  return "fb://";
}

export function getInstagramStoryDeepLinkOption(
  hints: StoryDeepLinkDeviceHints = {}
): StoryDeepLinkOption {
  return {
    target: "instagram",
    label: "Open Instagram",
    appName: "Instagram",
    deepLinkUrl: pickInstagramDeepLink(hints),
    webFallbackUrl: "https://www.instagram.com/",
    likelyAvailable: hints.instagramDeepLinkLikely === true || hints.isIOS === true || hints.isAndroid === true,
    canAttachImage: false,
    guidance: "Save the image first, then choose it from your camera roll in Instagram.",
  };
}

export function getFacebookStoryDeepLinkOption(
  hints: StoryDeepLinkDeviceHints = {}
): StoryDeepLinkOption {
  return {
    target: "facebook",
    label: "Open Facebook",
    appName: "Facebook",
    deepLinkUrl: pickFacebookDeepLink(hints),
    webFallbackUrl: "https://www.facebook.com/stories/create",
    likelyAvailable: hints.facebookDeepLinkLikely === true || hints.isIOS === true || hints.isAndroid === true,
    canAttachImage: false,
    guidance: "Save the image first, then add it manually to a Facebook story or post.",
  };
}

export function getStoryDeepLinkOptions(
  capabilities?: Pick<
    StoryShareCapabilitySnapshot,
    "isIOS" | "isAndroid" | "instagramDeepLinkLikely" | "facebookDeepLinkLikely"
  >
): StoryDeepLinkOption[] {
  return [
    getInstagramStoryDeepLinkOption(capabilities),
    getFacebookStoryDeepLinkOption(capabilities),
  ];
}

export function getDeepLinkFallbackDelayMs(): number {
  return 900;
}
