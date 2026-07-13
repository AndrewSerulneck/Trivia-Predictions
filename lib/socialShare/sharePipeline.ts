import type {
  StoryShareFileInput,
  StorySharePipelineResult,
  StoryShareRequest,
} from "./contracts";

export type {
  StoryShareFileInput,
  StorySharePipelineResult,
  StorySharePipelineStatus,
  StoryShareRequest,
} from "./contracts";

const DEFAULT_STORY_FILE_NAME = "hightop-story.png";
const DEFAULT_STORY_FILE_TYPE = "image/png";

function getNavigator(): Navigator | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  return navigator;
}

function getErrorName(error: unknown): string | undefined {
  if (error instanceof DOMException || error instanceof Error) {
    return error.name;
  }
  if (typeof error === "object" && error !== null && "name" in error) {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" ? name : undefined;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error || error instanceof DOMException) {
    return error.message;
  }
  return "";
}

function isCanceledShareError(error: unknown): boolean {
  const name = getErrorName(error);
  if (name === "AbortError" || name === "NotAllowedError") {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return message.includes("cancel") || message.includes("abort");
}

export function createStoryShareFile({
  blob,
  fileName = DEFAULT_STORY_FILE_NAME,
  fileType,
}: StoryShareFileInput): File {
  const type = fileType ?? (blob.type || DEFAULT_STORY_FILE_TYPE);
  return new File([blob], fileName, { type });
}

export function canShareStoryFile(file: File): boolean {
  const nav = getNavigator();
  if (typeof nav?.share !== "function" || typeof nav.canShare !== "function") {
    return false;
  }

  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export async function shareStoryImage({
  blob,
  fileName,
  fileType,
  title,
  text,
  url,
}: StoryShareRequest): Promise<StorySharePipelineResult> {
  if (typeof File === "undefined") {
    return {
      status: "unsupported",
      fallbackRecommended: true,
      reason: "File construction is unavailable in this browser.",
    };
  }

  const file = createStoryShareFile({ blob, fileName, fileType });
  const nav = getNavigator();

  if (typeof nav?.share !== "function") {
    return {
      status: "unsupported",
      fallbackRecommended: true,
      file,
      reason: "Web Share API is unavailable.",
    };
  }

  if (typeof nav.canShare !== "function") {
    return {
      status: "unsupported",
      fallbackRecommended: true,
      file,
      reason: "File sharing support cannot be verified.",
    };
  }

  const shareData: ShareData = {
    files: [file],
    ...(title ? { title } : {}),
    ...(text ? { text } : {}),
    ...(url ? { url } : {}),
  };

  try {
    if (!nav.canShare(shareData)) {
      return {
        status: "unsupported",
        fallbackRecommended: true,
        file,
        reason: "This browser cannot share the captured image file.",
      };
    }
  } catch (error) {
    return {
      status: "unsupported",
      fallbackRecommended: true,
      file,
      reason: "File sharing support check failed.",
      error,
    };
  }

  try {
    await nav.share(shareData);
    return {
      status: "shared",
      fallbackRecommended: false,
      file,
    };
  } catch (error) {
    if (isCanceledShareError(error)) {
      return {
        status: "canceled",
        fallbackRecommended: true,
        file,
        reason: "Share was canceled.",
        error,
      };
    }

    return {
      status: "failed",
      fallbackRecommended: true,
      file,
      reason: "Native share failed.",
      error,
    };
  }
}
