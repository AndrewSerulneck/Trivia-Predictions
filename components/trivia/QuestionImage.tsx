"use client";

import { useState } from "react";
import { toQuestionMedia } from "@/lib/questionMedia";

// A trivia question's picture or video on phones (Live and Speed Trivia). The URL → kind/credit/fit rules live in
// lib/questionMedia.ts, shared with the venue TV. Never clickable, draggable or long-pressable, and video plays
// muted and looping (docs/live-trivia-display-media-and-standings-plan.md D3, D4).
export function QuestionImage({ src, credit }: { src: string; credit?: string | null }) {
  const media = toQuestionMedia(src, credit);
  const [loaded, setLoaded] = useState(false);
  if (!media) return null;

  const contain = media.fit === "contain";
  const visibility = loaded ? "opacity-100" : "opacity-0 absolute inset-0";
  const sizing = contain ? "max-h-[248px] object-contain bg-white/5" : "max-h-[176px] object-cover";
  const className = `w-full rounded-xl transition-opacity duration-300 ${sizing} ${visibility}`;
  const done = () => setLoaded(true);

  return (
    <div className="pointer-events-none relative z-10 mb-3 select-none [-webkit-touch-callout:none]">
      {!loaded ? <div className="h-44 w-full animate-pulse rounded-xl bg-white/10" /> : null}
      {media.kind === "video" ? (
        <video
          ref={(video) => {
            if (!video) return;
            // Already loaded or failed before React was listening (server-rendered): don't stay hidden.
            if (video.readyState >= 2 || video.error) done();
            video.muted = true;
            video.play().catch(() => undefined);
          }}
          src={media.url}
          muted
          autoPlay
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          onLoadedData={done}
          onError={done}
          className={className}
        />
      ) : (
        <img
          ref={(img) => {
            // Already loaded or failed before React was listening (server-rendered): don't stay hidden.
            if (img?.complete) done();
          }}
          src={media.url}
          alt=""
          draggable={false}
          onLoad={done}
          onError={done}
          className={className}
        />
      )}
      {media.credit && loaded ? (
        <p className="mt-1 text-right text-caption text-white/30">{media.credit}</p>
      ) : null}
    </div>
  );
}
