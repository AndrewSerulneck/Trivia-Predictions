"use client";

import { useMemo, useState } from "react";
import { Image as ImageIcon, Share2 } from "lucide-react";
import type { StorySharePayload } from "@/lib/socialShare/contracts";
import { applyShareVenue } from "@/lib/socialShare/shareVenue";
import { prepareStorySharePayload, storyPayloadContentKey } from "@/lib/socialShare/storyPayloads";
import { StoryCaptureModal } from "./StoryCaptureModal";
import { useShareVenue } from "./useShareVenue";

interface StoryShareLauncherProps {
  payload: StorySharePayload;
  buttonLabel?: string;
  eyebrow?: string;
  title?: string;
  className?: string;
  /** "card" is the full panel; "button" is the one pill (Phase 9c `ShareWinButton`). */
  variant?: "card" | "button";
}

function getDefaultLauncherTitle(payload: StorySharePayload): string {
  return payload.isChampion ? "Share your win" : "Share your result";
}

/**
 * The open share sheet. Mounted only while open, so a closed button costs nothing (9f.3, R7) and every
 * open starts fresh. It holds the payload steady: the same content keeps the same prepared story however
 * often the host re-renders with a new object or a new `achievedAtIso`, so the pictures are drawn once and
 * an edited caption survives (R5). `achievedAtIso` is pinned to the moment the sheet opened.
 */
function StoryShareSheet({ payload, onClose }: { payload: StorySharePayload; onClose: () => void }) {
  const { venue, ready: venueReady } = useShareVenue(payload.venueId, true);
  const [openedAtIso] = useState(payload.achievedAtIso);
  const contentKey = storyPayloadContentKey(payload);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `contentKey` is the payload's content; the object's identity must not matter.
  const stablePayload = useMemo(() => ({ ...payload, achievedAtIso: openedAtIso }), [contentKey, openedAtIso]);
  const preparedStory = useMemo(() => prepareStorySharePayload(applyShareVenue(stablePayload, venue)), [stablePayload, venue]);

  return (
    <StoryCaptureModal
      isOpen
      onClose={onClose}
      title={preparedStory.headline}
      subtitle={preparedStory.subheadline}
      preparedStory={preparedStory}
      venueReady={venueReady}
    />
  );
}

export function StoryShareLauncher({
  payload,
  buttonLabel = "Create story",
  eyebrow = "Story share",
  title,
  className = "",
  variant = "card",
}: StoryShareLauncherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const launcherTitle = title ?? getDefaultLauncherTitle(payload);

  const openButton = (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="tp-player-hit-target tp-player-pressable tp-clean-button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-cyan-200/40 bg-cyan-300 px-4 text-sm font-black text-slate-950 shadow-[0_12px_28px_rgba(34,211,238,0.18)] transition hover:bg-cyan-200 "
    >
      <Share2 className="h-4 w-4" aria-hidden="true" />
      {buttonLabel}
    </button>
  );

  return (
    <>
      {variant === "button" ? (
        <div className={className}>{openButton}</div>
      ) : (
      <section className={`rounded-2xl border border-cyan-300/30 bg-cyan-300/[0.08] px-4 py-4 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200/30 bg-cyan-300/15 text-cyan-200">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-caption font-black uppercase leading-none tracking-[0.14em] text-cyan-300">{eyebrow}</p>
            <p className="mt-1 text-base font-black leading-tight text-white">{launcherTitle}</p>
          </div>
          {openButton}
        </div>
      </section>
      )}

      {isOpen ? <StoryShareSheet payload={payload} onClose={() => setIsOpen(false)} /> : null}
    </>
  );
}
