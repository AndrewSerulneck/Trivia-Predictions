"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aperture, Camera, Check, Image as ImageIcon, RotateCcw, Share2, X } from "lucide-react";
import {
  createStoryShareAnalyticsId,
  trackStoryCameraPermissionResult,
  trackStoryCaptureCompleted,
  trackStoryShareAttempted,
  trackStoryShareCompleted,
  trackStoryShareOpened,
  type StoryShareAnalyticsContext,
} from "@/lib/analytics";
import {
  normalizeCameraSessionError,
  type StoryCameraSession,
  type StoryCameraSessionError,
} from "@/lib/socialShare/cameraSession";
import { setScrollLock } from "@/lib/scrollLock";
import { StoryCanvasRenderError } from "@/lib/socialShare/storyCanvas";
import { webStoryPlatform } from "@/lib/socialShare/platform/webStoryPlatform";
import type { StorySharePipelineResult } from "@/lib/socialShare/sharePipeline";
import {
  prepareStorySharePayload,
  type PreparedStorySharePayload,
} from "@/lib/socialShare/storyPayloads";
import { CameraViewport, type CameraViewportState } from "./CameraViewport";
import { ShareActionsSheet } from "./ShareActionsSheet";
import { StoryOverlayEditor, StoryOverlayPreview } from "./StoryOverlayEditor";
import { StoryShareStatusToast, type StoryShareStatusTone } from "./StoryShareStatusToast";

interface StoryCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  preparedStory?: PreparedStorySharePayload;
  onCaptureComplete?: (blob: Blob) => void;
}

const SCROLL_LOCK_OWNER = "story-capture-modal";
const FALLBACK_PAYLOAD_DATE = "2026-07-11T00:00:00.000Z";

type StoryCaptureState = "idle" | "capturing" | "captured" | "failed";
type StoryNativeShareState = "idle" | "sharing" | "shared" | "fallback";

function cameraErrorToState(error: StoryCameraSessionError): CameraViewportState {
  if (error.code === "permission-denied") return "denied";
  if (error.code === "unsupported-browser" || error.code === "insecure-context") return "unsupported";
  return "error";
}

function getPrimaryButtonLabel(state: CameraViewportState): string {
  if (state === "requesting") return "Opening";
  if (state === "denied" || state === "unsupported" || state === "error") return "Try again";
  if (state === "active") return "Camera ready";
  return "Start camera";
}

function getStatusCopy(state: CameraViewportState, error: StoryCameraSessionError | null): string {
  if (state === "active") return "Frame preview is live.";
  if (state === "requesting") return "Waiting for camera permission.";
  if (state === "denied") return "Enable camera access in your browser settings, then try again.";
  if (state === "unsupported") return error?.message ?? "This browser cannot open the camera here.";
  if (state === "error") return error?.message ?? "Camera capture failed.";
  return "No photo is taken until you start the camera.";
}

function getCaptureStatusCopy(captureState: StoryCaptureState, captureError: string | null): string | null {
  if (captureState === "capturing") return "Flattening story image.";
  if (captureState === "captured") return "Story image captured.";
  if (captureState === "failed") return captureError ?? "Capture failed.";
  return null;
}

function getShareStatusCopy(shareState: StoryNativeShareState, shareResult: StorySharePipelineResult | null): string | null {
  if (shareState === "sharing") return "Opening share sheet.";
  if (shareResult?.status === "shared") return "Shared successfully.";
  if (shareResult?.status === "canceled") return "Share canceled. Fallbacks are ready.";
  if (shareResult?.status === "unsupported") return "Share sheet unavailable. Fallbacks are ready.";
  if (shareResult?.status === "failed") return "Share failed. Fallbacks are ready.";
  return null;
}

function getShareToastTone(shareState: StoryNativeShareState, shareResult: StorySharePipelineResult | null): StoryShareStatusTone {
  if (shareState === "sharing") return "loading";
  if (shareResult?.status === "shared") return "success";
  if (shareResult?.status === "failed") return "error";
  if (shareResult?.status === "unsupported" || shareResult?.status === "canceled") return "warning";
  return "idle";
}

function getStoryShareFileName(preparedStory: PreparedStorySharePayload): string {
  const game = preparedStory.payload.gameType === "live-trivia" ? "live-trivia" : "category-blitz";
  const safeUsername = preparedStory.payload.username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `hightop-${game}${safeUsername ? `-${safeUsername}` : ""}.png`;
}

function buildStoryShareAnalyticsContext(
  preparedStory: PreparedStorySharePayload,
  storyShareId: string
): StoryShareAnalyticsContext {
  return {
    storyShareId,
    gameType: preparedStory.payload.gameType,
    venueId: preparedStory.payload.venueId,
    userId: preparedStory.payload.userId,
    templateVariant: preparedStory.templateVariant,
    finalRank: preparedStory.payload.finalRank ?? null,
    finalPoints: preparedStory.payload.finalPoints ?? null,
    correctRate: preparedStory.payload.correctRate ?? null,
    isChampion: preparedStory.payload.isChampion ?? null,
  };
}

export function StoryCaptureModal({
  isOpen,
  onClose,
  title = "Victory story",
  subtitle = "Hightop Challenge",
  preparedStory,
  onCaptureComplete,
}: StoryCaptureModalProps) {
  const [state, setState] = useState<CameraViewportState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<StoryCameraSessionError | null>(null);
  const [captionState, setCaptionState] = useState<{ key: string; value: string } | null>(null);
  const [captureState, setCaptureState] = useState<StoryCaptureState>("idle");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedImageUrl, setCapturedImageUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [nativeShareState, setNativeShareState] = useState<StoryNativeShareState>("idle");
  const [shareResult, setShareResult] = useState<StorySharePipelineResult | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [storyShareId, setStoryShareId] = useState(() => createStoryShareAnalyticsId());
  const sessionRef = useRef<StoryCameraSession | null>(null);
  const requestIdRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wasOpenRef = useRef(false);

  const fallbackPreparedStory = useMemo(() => prepareStorySharePayload({
    gameType: "live-trivia",
    venueId: "local-preview",
    venueName: null,
    userId: "local-user",
    username: "You",
    title,
    subtitle,
    finalRank: null,
    finalPoints: null,
    correctRate: null,
    isChampion: false,
    achievedAtIso: FALLBACK_PAYLOAD_DATE,
  }), [subtitle, title]);

  const basePreparedStory = preparedStory ?? fallbackPreparedStory;
  const preparedStoryKey = `${basePreparedStory.payload.gameType}:${basePreparedStory.payload.venueId}:${basePreparedStory.payload.userId}:${basePreparedStory.payload.achievedAtIso}:${basePreparedStory.templateVariant}`;
  const caption = captionState?.key === preparedStoryKey ? captionState.value : basePreparedStory.caption ?? "";
  const activePreparedStory = useMemo(() => prepareStorySharePayload(
    {
      ...basePreparedStory.payload,
      funnyCaption: caption.trim() ? caption : basePreparedStory.payload.funnyCaption ?? null,
    },
    {
      templateVariant: basePreparedStory.templateVariant,
      width: basePreparedStory.renderSpec.width,
      height: basePreparedStory.renderSpec.height,
      mirrorPreview: basePreparedStory.renderSpec.mirrorPreview,
    }
  ), [basePreparedStory, caption]);
  const analyticsContext = useMemo(
    () => buildStoryShareAnalyticsContext(activePreparedStory, storyShareId),
    [activePreparedStory, storyShareId]
  );
  const analyticsContextRef = useRef(analyticsContext);

  useEffect(() => {
    analyticsContextRef.current = analyticsContext;
  }, [analyticsContext]);

  const stopSession = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setStream(null);
  }, []);

  const closeModal = useCallback(() => {
    stopSession();
    onClose();
  }, [onClose, stopSession]);

  const resetCapturedImage = useCallback(() => {
    setCapturedBlob(null);
    setCapturedImageUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return null;
    });
    setCaptureState("idle");
    setCaptureError(null);
    setNativeShareState("idle");
    setShareResult(null);
    setFallbackOpen(false);
  }, []);

  const handleCaptionChange = useCallback((nextCaption: string) => {
    setCaptionState({ key: preparedStoryKey, value: nextCaption });
    resetCapturedImage();
  }, [preparedStoryKey, resetCapturedImage]);

  const startCamera = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    stopSession();
    setError(null);
    setState("requesting");

    try {
      const session = await webStoryPlatform.requestFrontCameraSession();
      if (requestIdRef.current !== requestId) {
        session.stop();
        return;
      }
      sessionRef.current = session;
      setStream(session.stream);
      setState("active");
      trackStoryCameraPermissionResult({
        ...analyticsContext,
        permissionState: "granted",
        usedCameraFallback: session.usedFallback,
      });
    } catch (unknownError) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      const normalized = normalizeCameraSessionError(unknownError);
      setError(normalized);
      setState(cameraErrorToState(normalized));
      trackStoryCameraPermissionResult({
        ...analyticsContext,
        permissionState:
          normalized.code === "permission-denied"
            ? "denied"
            : normalized.code === "unsupported-browser" || normalized.code === "insecure-context"
            ? "unsupported"
            : "unknown",
        cameraErrorCode: normalized.code,
      });
    }
  }, [analyticsContext, stopSession]);

  const captureStoryImage = useCallback(async () => {
    const video = videoRef.current;
    if (!video || state !== "active") {
      return;
    }

    setCaptureState("capturing");
    setCaptureError(null);
    setCapturedBlob(null);
    setCapturedImageUrl((currentUrl) => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
      return null;
    });

    try {
      const blob = await webStoryPlatform.captureFrame({
        source: video,
        spec: activePreparedStory.renderSpec,
      });
      const objectUrl = URL.createObjectURL(blob);
      setCapturedBlob(blob);
      setCapturedImageUrl(objectUrl);
      setCaptureState("captured");
      setNativeShareState("idle");
      setShareResult(null);
      setFallbackOpen(false);
      trackStoryCaptureCompleted({
        ...analyticsContext,
        imageWidth: activePreparedStory.renderSpec.width,
        imageHeight: activePreparedStory.renderSpec.height,
      });
      onCaptureComplete?.(blob);
    } catch (unknownError) {
      const message = unknownError instanceof StoryCanvasRenderError
        ? unknownError.message
        : "Story capture failed unexpectedly.";
      setCaptureError(message);
      setCaptureState("failed");
    }
  }, [activePreparedStory.renderSpec, analyticsContext, onCaptureComplete, state]);

  const shareCapturedStory = useCallback(async () => {
    if (!capturedBlob || nativeShareState === "sharing") {
      return;
    }

    setNativeShareState("sharing");
    setShareResult(null);
    trackStoryShareAttempted(analyticsContext);

    const result = await webStoryPlatform.shareImage({
      blob: capturedBlob,
      fileName: getStoryShareFileName(activePreparedStory),
      title: activePreparedStory.headline,
      text: activePreparedStory.caption ?? activePreparedStory.subheadline,
    });

    setShareResult(result);
    trackStoryShareCompleted({
      ...analyticsContext,
      shareStatus: result.status,
      fallbackRecommended: result.fallbackRecommended,
      resultReason: result.reason ?? null,
    });
    if (result.status === "shared") {
      setNativeShareState("shared");
      setFallbackOpen(false);
      return;
    }

    setNativeShareState("fallback");
    setFallbackOpen(true);
  }, [activePreparedStory, analyticsContext, capturedBlob, nativeShareState]);

  useEffect(() => {
    setScrollLock(SCROLL_LOCK_OWNER, isOpen, "modal");
    return () => setScrollLock(SCROLL_LOCK_OWNER, false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeModal, isOpen]);

  useEffect(() => {
    return () => {
      setCapturedImageUrl((currentUrl) => {
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      requestIdRef.current += 1;
      const shouldResetStoryShareId = wasOpenRef.current;
      wasOpenRef.current = false;
      Promise.resolve().then(() => {
        stopSession();
        setState("idle");
        setError(null);
        resetCapturedImage();
        if (shouldResetStoryShareId) {
          setStoryShareId(createStoryShareAnalyticsId());
        }
      });
      return;
    }

    wasOpenRef.current = true;
    const openedAnalyticsContext = analyticsContextRef.current;
    trackStoryShareOpened(openedAnalyticsContext);

    const capabilities = webStoryPlatform.detectCapabilities();
    if (!capabilities.hasMediaDevices) {
      Promise.resolve().then(() => {
        setState("unsupported");
        setError({
          code: "unsupported-browser",
          message: "This browser does not support camera capture.",
        });
        trackStoryCameraPermissionResult({
          ...openedAnalyticsContext,
          permissionState: "unsupported",
          cameraErrorCode: "unsupported-browser",
        });
      });
      return;
    }

    let canceled = false;
    void webStoryPlatform.getCameraPermissionState().then((permissionState) => {
      if (canceled || !isOpen) {
        return;
      }
      if (permissionState === "denied") {
        if (sessionRef.current) {
          return;
        }
        setState("denied");
        setError({
          code: "permission-denied",
          message: "Camera permission was denied.",
        });
        trackStoryCameraPermissionResult({
          ...openedAnalyticsContext,
          permissionState,
          cameraErrorCode: "permission-denied",
        });
      } else if (permissionState === "unsupported") {
        if (sessionRef.current) {
          return;
        }
        setState("unsupported");
        setError({
          code: "unsupported-browser",
          message: "This browser does not support camera capture.",
        });
        trackStoryCameraPermissionResult({
          ...openedAnalyticsContext,
          permissionState,
          cameraErrorCode: "unsupported-browser",
        });
      } else {
        if (sessionRef.current) {
          return;
        }
        setState("idle");
        setError(null);
        trackStoryCameraPermissionResult({
          ...openedAnalyticsContext,
          permissionState,
        });
      }
    });

    return () => {
      canceled = true;
      stopSession();
    };
  }, [isOpen, resetCapturedImage, stopSession]);

  if (!isOpen) {
    return null;
  }

  const canStart = state !== "requesting" && state !== "active";
  const canCapture = state === "active" && captureState !== "capturing";
  const canShare = capturedBlob !== null && nativeShareState !== "sharing";
  const shareStatusCopy = getShareStatusCopy(nativeShareState, shareResult);
  const captureStatusCopy = getCaptureStatusCopy(captureState, captureError);
  const statusCopy = shareStatusCopy ?? captureStatusCopy ?? getStatusCopy(state, error);
  const captureButtonLabel = captureState === "capturing" ? "Capturing" : captureState === "captured" ? "Retake" : "Capture";
  const shareButtonLabel = nativeShareState === "sharing" ? "Sharing" : nativeShareState === "shared" ? "Shared" : "Share";
  const showFallbackActions = fallbackOpen && capturedBlob !== null;

  return (
    <div className="tp-story-capture-modal fixed inset-0 z-[6200] bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label="Story camera capture">
      <div className="tp-story-capture-shell mx-auto flex h-full min-h-0 w-full max-w-[30rem] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase leading-none tracking-[0.14em] text-cyan-100/80">
              Story capture
            </p>
            <h1 className="mt-1 truncate text-xl font-black leading-tight text-white">{title}</h1>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="tp-clean-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.08] text-white shadow-[0_8px_22px_rgba(0,0,0,0.32)] transition hover:bg-white/[0.12] active:scale-95"
            aria-label="Close story capture"
            title="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 pb-3">
          <div className="relative flex min-h-0 flex-1">
            <CameraViewport
              stream={stream}
              state={state}
              title={activePreparedStory.headline}
              subtitle={activePreparedStory.subheadline}
              errorMessage={error?.message}
              className={activePreparedStory.visual.previewClassName}
              videoRef={videoRef}
            >
              <StoryOverlayPreview preparedStory={activePreparedStory} caption={caption} />
            </CameraViewport>
            {capturedImageUrl ? (
              <div className="absolute inset-0 z-[5] overflow-hidden rounded-[32px] border border-emerald-200/40 bg-slate-950">
                <img
                  src={capturedImageUrl}
                  alt="Captured story preview"
                  className="h-full w-full object-cover"
                />
                <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-400 px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-slate-950">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Captured
                </div>
              </div>
            ) : null}
          </div>
          <StoryOverlayEditor
            preparedStory={activePreparedStory}
            caption={caption}
            onCaptionChange={handleCaptionChange}
            disabled={captureState === "capturing" || nativeShareState === "sharing"}
          />
          {showFallbackActions ? (
            <ShareActionsSheet
              imageBlob={capturedBlob}
              fileName={getStoryShareFileName(activePreparedStory)}
              shareResult={shareResult}
              analyticsContext={analyticsContext}
              onRetryNativeShare={shareCapturedStory}
              onClose={() => setFallbackOpen(false)}
            />
          ) : null}
        </main>

        <footer className="shrink-0 border-t border-white/10 bg-slate-950/[0.92] px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur">
          <p className="min-h-[1.25rem] text-center text-sm font-bold leading-snug text-slate-300">{statusCopy}</p>
          <div className="mt-2">
            <StoryShareStatusToast tone={getShareToastTone(nativeShareState, shareResult)} message={shareStatusCopy} />
          </div>
          {capturedBlob ? (
            <div className="mt-2 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-300">
              <ImageIcon className="h-4 w-4" aria-hidden="true" />
              PNG ready
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={startCamera}
              disabled={!canStart}
              className="tp-clean-button inline-flex h-12 items-center justify-center gap-2 rounded-full border border-cyan-200/40 bg-cyan-300 px-5 text-sm font-black text-slate-950 shadow-[0_12px_28px_rgba(34,211,238,0.22)] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.12] disabled:text-slate-400 active:scale-[0.99]"
            >
              {state === "denied" || state === "unsupported" || state === "error" ? (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Camera className="h-4 w-4" aria-hidden="true" />
              )}
              {getPrimaryButtonLabel(state)}
            </button>
            <button
              type="button"
              onClick={captureStoryImage}
              disabled={!canCapture || nativeShareState === "sharing"}
              className="tp-clean-button inline-flex h-12 items-center justify-center gap-2 rounded-full border border-emerald-200/40 bg-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_12px_28px_rgba(52,211,153,0.18)] transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.12] disabled:text-slate-400 active:scale-[0.99]"
            >
              {captureState === "captured" ? (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Aperture className="h-4 w-4" aria-hidden="true" />
              )}
              {captureButtonLabel}
            </button>
            <button
              type="button"
              onClick={shareCapturedStory}
              disabled={!canShare}
              className="tp-clean-button inline-flex h-12 items-center justify-center gap-2 rounded-full border border-amber-200/40 bg-amber-300 px-5 text-sm font-black text-slate-950 shadow-[0_12px_28px_rgba(251,191,36,0.16)] transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.12] disabled:text-slate-400 active:scale-[0.99]"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              {shareButtonLabel}
            </button>
            <button
              type="button"
              onClick={closeModal}
              className="tp-clean-button h-12 rounded-full border border-white/[0.12] bg-white/[0.08] px-5 text-sm font-black text-white transition hover:bg-white/[0.12] active:scale-[0.99]"
            >
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
