"use client";

import { useCallback, useState } from "react";
import type { QuestionMedia } from "@/lib/questionMedia";

/* ------------------------------------------------------------------ *
 * <TvQuestionMedia /> — a Live Trivia question's picture or video on the venue TV.
 * Plan: docs/live-trivia-display-media-and-standings-plan.md.
 *
 * - A fixed-size frame, so AutoScaleToFit measures the same box before and after the file loads.
 * - A file that fails to load removes the whole frame (no broken-image icon on a TV); the question still shows.
 * - Video is muted, looping, with no controls (D3). `muted` is set on the element as well as in the markup:
 *   React drops the attribute from server HTML, and browsers only autoplay a video they know is muted.
 * - Never clickable, draggable or long-pressable (D4).
 * - Owns its left gap (marginLeft), so a removed frame leaves no hole in the row.
 * ------------------------------------------------------------------ */

type TvQuestionMediaProps = {
  media: QuestionMedia;
  width: number;
  height: number;
  /** Space between the question text and the frame. */
  gap: number;
};

export function TvQuestionMedia({ media, width, height, gap }: TvQuestionMediaProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = media.url;
  const fail = useCallback(() => setFailedUrl(url), [url]);

  // The display page is server-rendered, so a file can fail before hydration attaches onError (that event is
  // never replayed). On mount, check whether it already failed. decode() rejects only for a broken image, and
  // resolves for SVG maps that report no natural size.
  const checkImage = useCallback(
    (img: HTMLImageElement | null) => {
      if (img?.complete && typeof img.decode === "function") img.decode().catch(fail);
    },
    [fail],
  );
  const startMutedLoop = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video) return;
      if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
        fail();
        return;
      }
      video.muted = true;
      video.play().catch(() => undefined);
    },
    [fail],
  );

  if (failedUrl === media.url) return null;
  const fill = {
    width: "100%",
    height: "100%",
    objectFit: media.fit,
    display: "block",
  } as const;

  return (
    <figure
      className="pointer-events-none flex shrink-0 select-none flex-col"
      style={{ marginLeft: gap, marginTop: 0, marginRight: 0, marginBottom: 0, width, WebkitTouchCallout: "none" }}
      data-question-media={media.kind}
    >
      <div
        className="overflow-hidden"
        style={{
          width,
          height,
          borderRadius: 28,
          background: "rgba(15,23,42,0.72)",
          border: "1px solid rgba(148,163,184,0.18)",
          padding: media.fit === "contain" ? 24 : 0,
        }}
      >
        {media.kind === "video" ? (
          <video
            key={media.url}
            ref={startMutedLoop}
            src={media.url}
            muted
            autoPlay
            loop
            playsInline
            preload="auto"
            disablePictureInPicture
            disableRemotePlayback
            controls={false}
            onError={fail}
            style={fill}
          />
        ) : (
          <img key={media.url} ref={checkImage} src={media.url} alt="" draggable={false} onError={fail} style={fill} />
        )}
      </div>
      {media.credit ? (
        <figcaption style={{ marginTop: 10, fontSize: 20, fontWeight: 600, color: "rgba(148,163,184,0.7)", textAlign: "right" }}>
          {media.credit}
        </figcaption>
      ) : null}
    </figure>
  );
}
