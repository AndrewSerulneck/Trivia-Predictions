"use client";

import { Copy, Download, Facebook, Instagram, MessageCircle, MoreHorizontal } from "lucide-react";
import type { ComponentType } from "react";
import { SHARE_COPY_CAPTION_LABEL } from "@/lib/socialShare/copyPresets";
import {
  SHARE_DESTINATIONS,
  shareDestinationLabel,
  type ShareDestination,
} from "@/lib/socialShare/shareDestinations";

type IconProps = { className?: string; "aria-hidden"?: boolean };

// X has no Lucide icon (the bird is retired), so it is drawn as its letter.
const DESTINATION_ICONS: Record<ShareDestination, ComponentType<IconProps> | null> = {
  "instagram-story": Instagram,
  "instagram-post": Instagram,
  facebook: Facebook,
  x: null,
  messages: MessageCircle,
  save: Download,
  more: MoreHorizontal,
};

type ShareCaptionProps = {
  caption: string;
  onCopy: () => void;
  disabled?: boolean;
};

/** The pre-written caption (headline + app link) and its one copy button (Phase 9d). */
export function ShareCaption({ caption, onCopy, disabled = false }: ShareCaptionProps) {
  return (
    <div className="shrink-0 rounded-2xl bg-white/[0.06] p-3">
      <p className="select-text text-sm font-bold leading-snug text-slate-200">{caption}</p>
      <button
        type="button"
        onClick={onCopy}
        disabled={disabled}
        className="tp-player-pressable tp-clean-button mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.10] px-4 text-sm font-black text-white transition hover:bg-white/[0.16] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        {SHARE_COPY_CAPTION_LABEL}
      </button>
    </div>
  );
}

type ShareDestinationRowProps = {
  onPick: (destination: ShareDestination) => void;
  disabled?: boolean;
  /** "Tag <bar> in your post" — text only, no lookup (Andrew, 2026-10-22). */
  nudge?: string | null;
};

/** One row of apps: one tap each (Phase 9d). Scrolls sideways on a narrow phone. */
export function ShareDestinationRow({ onPick, disabled = false, nudge }: ShareDestinationRowProps) {
  return (
    <div>
      <div className="-mx-4 flex overflow-x-auto px-3 pb-1" role="group" aria-label="Share to">
        {SHARE_DESTINATIONS.map((destination) => {
          const Icon = DESTINATION_ICONS[destination];
          const label = shareDestinationLabel(destination);
          return (
            <button
              key={destination}
              type="button"
              onClick={() => onPick(destination)}
              disabled={disabled}
              className="tp-player-pressable flex w-[5.25rem] shrink-0 flex-col items-center gap-1 rounded-xl !border-0 !bg-transparent [&:not(:disabled)]:!min-h-0 [&:not(:disabled)]:!p-1 transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.10] text-white">
                {Icon ? <Icon className="h-5 w-5" aria-hidden /> : <span className="text-lg font-black leading-none" aria-hidden="true">X</span>}
              </span>
              <span className="text-center text-caption font-black leading-tight text-slate-200">{label}</span>
            </button>
          );
        })}
      </div>
      {nudge ? <p className="mt-1 text-center text-caption font-bold text-slate-400">{nudge}</p> : null}
    </div>
  );
}
