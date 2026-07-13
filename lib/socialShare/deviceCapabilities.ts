import type { CameraPermissionState, StoryShareCapabilitySnapshot } from "./contracts";

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type BrowserDetectionSource = {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
};

const CAMERA_PERMISSION_NAME = "camera" as PermissionName;

function getNavigator(): NavigatorWithStandalone | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  return navigator as NavigatorWithStandalone;
}

function getBrowserDetectionSource(): BrowserDetectionSource {
  const nav = getNavigator();
  return {
    userAgent: nav?.userAgent,
    platform: nav?.platform,
    maxTouchPoints: nav?.maxTouchPoints,
  };
}

function normalize(value: string | undefined): string {
  return (value ?? "").toLowerCase();
}

function hasGetUserMedia(nav: Navigator | null): boolean {
  return typeof nav?.mediaDevices?.getUserMedia === "function";
}

function isLikelyMobile(source: BrowserDetectionSource): boolean {
  const userAgent = normalize(source.userAgent);
  return /iphone|ipad|ipod|android|mobile/.test(userAgent) || (source.maxTouchPoints ?? 0) > 1;
}

function canUseWebShare(nav: Navigator | null): boolean {
  return typeof nav?.share === "function";
}

function canUseFileShare(nav: Navigator | null): boolean {
  if (typeof nav?.canShare !== "function" || typeof File === "undefined") {
    return false;
  }

  try {
    const file = new File([""], "hightop-story.png", { type: "image/png" });
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function hasStandaloneNavigatorFlag(nav: NavigatorWithStandalone | null): boolean {
  return nav?.standalone === true;
}

export function isIOSBrowser(source: BrowserDetectionSource = getBrowserDetectionSource()): boolean {
  const userAgent = normalize(source.userAgent);
  const platform = normalize(source.platform);
  const touchPoints = source.maxTouchPoints ?? 0;

  return (
    /iphone|ipad|ipod/.test(userAgent) ||
    (platform === "macintel" && touchPoints > 1)
  );
}

export function isAndroidBrowser(source: BrowserDetectionSource = getBrowserDetectionSource()): boolean {
  return /android/.test(normalize(source.userAgent));
}

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const nav = getNavigator();
  if (hasStandaloneNavigatorFlag(nav)) {
    return true;
  }

  if (typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(display-mode: standalone)").matches;
}

export async function getCameraPermissionState(): Promise<CameraPermissionState> {
  const nav = getNavigator();
  if (!hasGetUserMedia(nav)) {
    return "unsupported";
  }

  if (typeof nav?.permissions?.query !== "function") {
    return "unknown";
  }

  try {
    const status = await nav.permissions.query({ name: CAMERA_PERMISSION_NAME });
    if (status.state === "granted" || status.state === "prompt" || status.state === "denied") {
      return status.state;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function detectStoryShareCapabilities(): StoryShareCapabilitySnapshot {
  const nav = getNavigator();
  const source = getBrowserDetectionSource();
  const isIOS = isIOSBrowser(source);
  const isAndroid = isAndroidBrowser(source);
  const hasMediaDevices = hasGetUserMedia(nav);
  const canWebShare = canUseWebShare(nav);
  const canShareFiles = canUseFileShare(nav);
  const isMobile = isLikelyMobile(source) || isIOS || isAndroid;

  return {
    hasMediaDevices,
    hasFrontCamera: hasMediaDevices && isMobile,
    canWebShare,
    canShareFiles,
    isIOS,
    isAndroid,
    isStandalone: isStandaloneDisplayMode(),
    instagramDeepLinkLikely: isMobile,
    facebookDeepLinkLikely: isMobile,
  };
}
