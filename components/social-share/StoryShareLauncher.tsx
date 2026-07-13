"use client";

import { useMemo, useState } from "react";
import { Camera, Share2 } from "lucide-react";
import type { StorySharePayload } from "@/lib/socialShare/contracts";
import { prepareStorySharePayload } from "@/lib/socialShare/storyPayloads";
import { StoryCaptureModal } from "./StoryCaptureModal";

interface StoryShareLauncherProps {
  payload: StorySharePayload;
  buttonLabel?: string;
  eyebrow?: string;
  title?: string;
  className?: string;
}

function getDefaultLauncherTitle(payload: StorySharePayload): string {
  if (payload.isChampion) {
    return payload.gameType === "live-trivia" ? "Share the champion shot" : "Share the blitz win";
  }
  return payload.gameType === "live-trivia" ? "Share your trivia run" : "Share your blitz run";
}

export function StoryShareLauncher({
  payload,
  buttonLabel = "Create story",
  eyebrow = "Story share",
  title,
  className = "",
}: StoryShareLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const preparedStory = useMemo(() => prepareStorySharePayload(payload), [payload]);
  const launcherTitle = title ?? getDefaultLauncherTitle(payload);

  return (
    <>
      <section className={`rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.08] px-4 py-4 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200/30 bg-cyan-300/15 text-cyan-200">
            <Camera className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase leading-none tracking-[0.14em] text-cyan-300">{eyebrow}</p>
            <p className="mt-1 text-base font-black leading-tight text-white">{launcherTitle}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="tp-clean-button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-cyan-200/40 bg-cyan-300 px-4 text-sm font-black text-slate-950 shadow-[0_12px_28px_rgba(34,211,238,0.18)] transition hover:bg-cyan-200 active:scale-[0.99]"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            {buttonLabel}
          </button>
        </div>
      </section>

      <StoryCaptureModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={preparedStory.headline}
        subtitle={preparedStory.subheadline}
        preparedStory={preparedStory}
      />
    </>
  );
}
