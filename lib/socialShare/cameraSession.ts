import type {
  StoryCameraErrorCode,
  StoryCameraSession,
  StoryCameraSessionError,
} from "./contracts";

export type {
  StoryCameraErrorCode,
  StoryCameraSession,
  StoryCameraSessionError,
} from "./contracts";

const FRONT_CAMERA_EXACT_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { exact: "user" },
    width: { ideal: 1080 },
    height: { ideal: 1920 },
    aspectRatio: { ideal: 9 / 16 },
  },
};

const FRONT_CAMERA_FALLBACK_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: "user",
    width: { ideal: 1080 },
    height: { ideal: 1920 },
    aspectRatio: { ideal: 9 / 16 },
  },
};

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

function isConstraintRejection(error: unknown): boolean {
  const name = getErrorName(error);
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError";
}

function createCameraSessionError(
  code: StoryCameraErrorCode,
  message: string,
  cause?: unknown
): StoryCameraSessionError {
  return {
    code,
    message,
    name: getErrorName(cause),
    cause,
  };
}

function assertCameraSupported(): Navigator {
  const nav = getNavigator();
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw createCameraSessionError(
      "insecure-context",
      "Camera access requires a secure browser context."
    );
  }

  if (typeof nav?.mediaDevices?.getUserMedia !== "function") {
    throw createCameraSessionError(
      "unsupported-browser",
      "This browser does not support camera capture."
    );
  }

  return nav;
}

export function normalizeCameraSessionError(error: unknown): StoryCameraSessionError {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    const code = (error as { code: string }).code;
    if (
      code === "permission-denied" ||
      code === "no-camera" ||
      code === "insecure-context" ||
      code === "unsupported-browser" ||
      code === "unknown"
    ) {
      return error as StoryCameraSessionError;
    }
  }

  const name = getErrorName(error);
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return createCameraSessionError(
        "permission-denied",
        "Camera permission was denied.",
        error
      );
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return createCameraSessionError(
        "no-camera",
        "No compatible front-facing camera was found.",
        error
      );
    case "NotSupportedError":
      return createCameraSessionError(
        "unsupported-browser",
        "This browser does not support camera capture.",
        error
      );
    case "TypeError":
      if (typeof window !== "undefined" && window.isSecureContext === false) {
        return createCameraSessionError(
          "insecure-context",
          "Camera access requires a secure browser context.",
          error
        );
      }
      break;
  }

  return createCameraSessionError(
    "unknown",
    "Camera capture failed unexpectedly.",
    error
  );
}

export function stopCameraStream(stream: MediaStream | null | undefined): void {
  if (!stream || typeof stream.getTracks !== "function") {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export async function requestFrontCameraSession(): Promise<StoryCameraSession> {
  const nav = assertCameraSupported();

  try {
    const stream = await nav.mediaDevices.getUserMedia(FRONT_CAMERA_EXACT_CONSTRAINTS);
    return {
      stream,
      constraints: FRONT_CAMERA_EXACT_CONSTRAINTS,
      usedFallback: false,
      stop: () => stopCameraStream(stream),
    };
  } catch (error) {
    if (!isConstraintRejection(error)) {
      throw normalizeCameraSessionError(error);
    }
  }

  try {
    const stream = await nav.mediaDevices.getUserMedia(FRONT_CAMERA_FALLBACK_CONSTRAINTS);
    return {
      stream,
      constraints: FRONT_CAMERA_FALLBACK_CONSTRAINTS,
      usedFallback: true,
      stop: () => stopCameraStream(stream),
    };
  } catch (error) {
    throw normalizeCameraSessionError(error);
  }
}
