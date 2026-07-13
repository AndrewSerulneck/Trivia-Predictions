import type {
  StoryExternalAppOpenResult,
  StoryExternalAppOption,
  StorySaveImageRequest,
  StorySaveImageResult,
  StoryShareFrameCaptureInput,
  StorySharePlatformAdapter,
  StoryCameraSession,
} from "../contracts";
import { requestFrontCameraSession } from "../cameraSession";
import { detectStoryShareCapabilities, getCameraPermissionState } from "../deviceCapabilities";
import { getDeepLinkFallbackDelayMs, getStoryDeepLinkOptions } from "../deepLinks";
import { canShareStoryFile, createStoryShareFile, shareStoryImage } from "../sharePipeline";
import { renderStoryImage } from "../storyCanvas";

function getDownloadFileName(fileName: string | undefined): string {
  const trimmed = (fileName ?? "").trim();
  return trimmed || "hightop-story.png";
}

function canCreateDownloadAnchor(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  );
}

function canCreateObjectUrl(): boolean {
  return (
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function"
  );
}

function revokeObjectUrl(objectUrl: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(objectUrl);
  }
}

export function saveStoryImageToDownloads({
  blob,
  fileName,
  objectUrl,
}: StorySaveImageRequest): StorySaveImageResult {
  if (!canCreateDownloadAnchor()) {
    return {
      status: "unsupported",
      reason: "Image download requires a browser document.",
    };
  }

  if (!objectUrl && !canCreateObjectUrl()) {
    return {
      status: "unsupported",
      reason: "Image download requires object URL support.",
    };
  }

  let createdObjectUrl: string | null = null;

  try {
    const href = objectUrl ?? URL.createObjectURL(blob);
    if (!objectUrl) {
      createdObjectUrl = href;
    }

    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = getDownloadFileName(fileName);
    anchor.rel = "noopener";
    document.body?.appendChild(anchor);
    anchor.click();
    anchor.remove();

    return { status: "saved" };
  } catch (error) {
    return {
      status: "failed",
      reason: "Image download failed.",
      error,
    };
  } finally {
    if (createdObjectUrl) {
      revokeObjectUrl(createdObjectUrl);
    }
  }
}

export function openExternalStoryApp(option: StoryExternalAppOption): StoryExternalAppOpenResult {
  if (typeof window === "undefined") {
    return {
      status: "unsupported",
      reason: "External app links require a browser window.",
    };
  }

  try {
    window.location.href = option.deepLinkUrl;

    window.setTimeout(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        window.location.href = option.webFallbackUrl;
      }
    }, getDeepLinkFallbackDelayMs());

    return { status: "opened" };
  } catch (error) {
    return {
      status: "failed",
      reason: `Could not open ${option.appName}.`,
      error,
    };
  }
}

export const webStoryPlatform: StorySharePlatformAdapter<CanvasImageSource, StoryCameraSession> = {
  id: "web",
  detectCapabilities: detectStoryShareCapabilities,
  getCameraPermissionState,
  requestFrontCameraSession,
  captureFrame: (input: StoryShareFrameCaptureInput<CanvasImageSource>) => renderStoryImage(input),
  createShareFile: createStoryShareFile,
  canShareFile: canShareStoryFile,
  shareImage: shareStoryImage,
  saveImage: saveStoryImageToDownloads,
  getExternalAppOptions: getStoryDeepLinkOptions,
  openExternalApp: openExternalStoryApp,
};
