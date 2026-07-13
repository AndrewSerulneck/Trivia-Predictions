"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, Image as ImageIcon, Info, Smartphone, X } from "lucide-react";
import { trackStoryShareFallbackUsed, type StoryShareAnalyticsContext } from "@/lib/analytics";
import type {
  StoryExternalAppOption,
  StoryExternalAppTarget,
  StoryShareCapabilitySnapshot,
} from "@/lib/socialShare/contracts";
import { webStoryPlatform } from "@/lib/socialShare/platform/webStoryPlatform";
import type { StorySharePipelineResult } from "@/lib/socialShare/sharePipeline";

interface ShareActionsSheetProps {
  imageBlob: Blob | null;
  fileName?: string;
  shareResult?: StorySharePipelineResult | null;
  capabilities?: StoryShareCapabilitySnapshot;
  analyticsContext?: StoryShareAnalyticsContext;
  onRetryNativeShare?: () => void;
  onClose?: () => void;
  className?: string;
}

type FallbackStatus = {
  kind: "idle" | "downloaded" | "download_failed" | "opened" | "open_failed";
  target?: StoryExternalAppTarget;
};

function getFallbackIntro(shareResult?: StorySharePipelineResult | null): string {
  if (!shareResult) {
    return "Save the image or open an app manually.";
  }
  if (shareResult.status === "unsupported") {
    return "This browser cannot hand the image to the native share sheet.";
  }
  if (shareResult.status === "canceled") {
    return "The share sheet was dismissed. Your image is still available.";
  }
  if (shareResult.status === "failed") {
    return "Native sharing did not complete. Your image is still available.";
  }
  return "Your image is ready.";
}

function getDownloadFileName(fileName: string | undefined): string {
  const trimmed = (fileName ?? "").trim();
  return trimmed || "hightop-story.png";
}

export function ShareActionsSheet({
  imageBlob,
  fileName,
  shareResult,
  capabilities,
  analyticsContext,
  onRetryNativeShare,
  onClose,
  className = "",
}: ShareActionsSheetProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<FallbackStatus>({ kind: "idle" });
  const resolvedCapabilities = useMemo(() => capabilities ?? webStoryPlatform.detectCapabilities(), [capabilities]);
  const deepLinkOptions = useMemo(() => webStoryPlatform.getExternalAppOptions(resolvedCapabilities), [resolvedCapabilities]);
  const downloadFileName = getDownloadFileName(fileName);
  const intro = getFallbackIntro(shareResult);

  useEffect(() => {
    let canceled = false;
    if (!imageBlob) {
      Promise.resolve().then(() => {
        if (!canceled) {
          setObjectUrl(null);
        }
      });
      return () => {
        canceled = true;
      };
    }

    const nextUrl = URL.createObjectURL(imageBlob);
    Promise.resolve().then(() => {
      if (!canceled) {
        setObjectUrl(nextUrl);
      }
    });
    return () => {
      canceled = true;
      URL.revokeObjectURL(nextUrl);
    };
  }, [imageBlob]);

  const handleDownload = useCallback(() => {
    if (!objectUrl || !imageBlob) {
      return;
    }

    const result = webStoryPlatform.saveImage({
      blob: imageBlob,
      fileName: downloadFileName,
      objectUrl,
    });
    if (analyticsContext) {
      trackStoryShareFallbackUsed({
        ...analyticsContext,
        fallbackMode: "download",
        resultReason: result.reason ?? result.status,
      });
    }
    setStatus({ kind: result.status === "saved" ? "downloaded" : "download_failed" });
  }, [analyticsContext, downloadFileName, imageBlob, objectUrl]);

  const handleOpenDeepLink = useCallback((option: StoryExternalAppOption) => {
    const result = webStoryPlatform.openExternalApp(option);
    if (analyticsContext) {
      trackStoryShareFallbackUsed({
        ...analyticsContext,
        fallbackMode: "deep-link",
        externalAppTarget: option.target,
        resultReason: result.reason ?? result.status,
      });
    }
    setStatus({
      kind: result.status === "opened" ? "opened" : "open_failed",
      target: option.target,
    });
  }, [analyticsContext]);

  return (
    <section className={`rounded-2xl border border-white/[0.12] bg-slate-950/[0.96] p-4 text-white shadow-[0_18px_44px_rgba(0,0,0,0.44)] ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase leading-none tracking-[0.14em] text-cyan-100/80">
            Share options
          </p>
          <h2 className="mt-1 text-lg font-black leading-tight text-white">Keep your story image</h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="tp-clean-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.08] text-white transition hover:bg-white/[0.12] active:scale-95"
            aria-label="Close share options"
            title="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-sm font-bold leading-snug text-slate-300">{intro}</p>

      <div className="mt-4 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
        <div className="flex aspect-[9/16] items-center justify-center overflow-hidden rounded-xl border border-white/[0.12] bg-white/[0.06]">
          {objectUrl ? (
            <img src={objectUrl} alt="Captured story" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-7 w-7 text-slate-500" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!objectUrl}
            className="tp-clean-button inline-flex h-11 items-center justify-center gap-2 rounded-full border border-cyan-200/40 bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.12] disabled:text-slate-400 active:scale-[0.99]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Save image
          </button>
          {onRetryNativeShare ? (
            <button
              type="button"
              onClick={onRetryNativeShare}
              disabled={!imageBlob}
              className="tp-clean-button inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.08] px-4 text-sm font-black text-white transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
            >
              <Smartphone className="h-4 w-4" aria-hidden="true" />
              Try share sheet
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {deepLinkOptions.map((option) => (
          <button
            key={option.target}
            type="button"
            onClick={() => handleOpenDeepLink(option)}
            disabled={!objectUrl || !option.likelyAvailable}
            className="tp-clean-button flex w-full items-center justify-between gap-3 rounded-xl border border-white/[0.10] bg-white/[0.06] px-3 py-3 text-left transition hover:bg-white/[0.10] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.99]"
          >
            <span className="min-w-0">
              <span className="block text-sm font-black text-white">{option.label}</span>
              <span className="mt-0.5 block text-xs font-bold leading-snug text-slate-400">{option.guidance}</span>
            </span>
            <ExternalLink className="h-4 w-4 shrink-0 text-cyan-100/80" aria-hidden="true" />
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200/[0.18] bg-amber-300/[0.08] px-3 py-2.5 text-amber-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-xs font-bold leading-snug">
          Browser links can open an app, but they cannot guarantee a direct story upload. Saving the image keeps the fallback reliable.
        </p>
      </div>

      {status.kind === "downloaded" ? (
        <p className="mt-3 text-center text-xs font-black uppercase tracking-[0.12em] text-emerald-300">Image saved</p>
      ) : status.kind === "download_failed" ? (
        <p className="mt-3 text-center text-xs font-black uppercase tracking-[0.12em] text-rose-300">Save failed</p>
      ) : status.kind === "opened" ? (
        <p className="mt-3 text-center text-xs font-black uppercase tracking-[0.12em] text-cyan-300">
          Opening {status.target === "instagram" ? "Instagram" : "Facebook"}
        </p>
      ) : status.kind === "open_failed" ? (
        <p className="mt-3 text-center text-xs font-black uppercase tracking-[0.12em] text-rose-300">
          Could not open {status.target === "instagram" ? "Instagram" : "Facebook"}
        </p>
      ) : null}
    </section>
  );
}
