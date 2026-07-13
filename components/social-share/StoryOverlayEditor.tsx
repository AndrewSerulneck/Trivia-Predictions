"use client";

import { MessageSquareText } from "lucide-react";
import type { PreparedStorySharePayload } from "@/lib/socialShare/storyPayloads";

interface StoryOverlayPreviewProps {
  preparedStory: PreparedStorySharePayload;
  caption: string;
}

interface StoryOverlayEditorProps extends StoryOverlayPreviewProps {
  onCaptionChange: (caption: string) => void;
  disabled?: boolean;
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 60;

function truncateCaption(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

export function StoryOverlayPreview({ preparedStory, caption }: StoryOverlayPreviewProps) {
  const visibleCaption = caption.trim() || preparedStory.caption;

  return (
    <>
      <div
        className="tp-story-face-safe-zone pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-[40%] border border-white/[0.12] opacity-60 sm:block"
        aria-hidden="true"
      />
      <div className="tp-story-preview-bottom-card absolute inset-x-5 bottom-7 rounded-[24px] border px-4 py-3 text-white shadow-[0_14px_34px_rgba(0,0,0,0.38)] backdrop-blur-md">
        <div className="flex flex-wrap gap-2">
          {preparedStory.stats.map((stat) => (
            <div key={`${stat.label}:${stat.value}`} className="tp-story-stat-chip rounded-full border px-3 py-1">
              <span className="tp-story-stat-label text-[10px] font-black uppercase tracking-[0.12em]">{stat.label}</span>
              <span className="ml-1.5 text-sm font-black tabular-nums text-white">{stat.value}</span>
            </div>
          ))}
        </div>
        {visibleCaption ? (
          <p className="tp-story-preview-caption mt-2 text-sm font-black leading-snug">{visibleCaption}</p>
        ) : null}
      </div>
    </>
  );
}

export function StoryOverlayEditor({
  preparedStory,
  caption,
  onCaptionChange,
  disabled = false,
  maxLength = DEFAULT_MAX_LENGTH,
}: StoryOverlayEditorProps) {
  const visibleCaption = caption.trim() || preparedStory.caption || "";
  const remaining = Math.max(0, maxLength - caption.length);

  return (
    <section className="tp-story-caption-editor rounded-2xl border p-3">
      <label className="tp-story-caption-label flex items-center gap-2 text-[11px] font-black uppercase leading-none tracking-[0.14em]">
        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
        Caption
      </label>
      <textarea
        value={caption}
        onChange={(event) => onCaptionChange(truncateCaption(event.target.value, maxLength))}
        disabled={disabled}
        rows={2}
        maxLength={maxLength}
        className="mt-2 block min-h-[4.25rem] w-full resize-none rounded-xl border border-white/[0.12] bg-slate-950/[0.72] px-3 py-2 text-sm font-bold leading-snug text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-200/70 focus:shadow-[0_0_0_2px_rgba(34,211,238,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={preparedStory.caption ?? "Add your own line"}
        aria-label="Story caption"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs font-bold text-slate-400">{visibleCaption || preparedStory.headline}</p>
        <span className="shrink-0 text-[11px] font-black tabular-nums text-slate-500">{remaining}</span>
      </div>
    </section>
  );
}
