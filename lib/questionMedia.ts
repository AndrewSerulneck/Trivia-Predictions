// The one place a trivia question's stored media URL becomes something a screen can render — the venue TV
// (components/venue-screen/TvQuestionMedia.tsx) and phones (components/trivia/QuestionImage.tsx) both read this.
// Plan: docs/live-trivia-display-media-and-standings-plan.md. Client-safe: no server-only imports.
//
// Kind comes from the file extension until questions store it explicitly (plan Phase 6). A GIF is an image: <img>
// animates it. Video plays muted and looping on every screen (plan D3).

export type QuestionMediaKind = "image" | "video";

export type QuestionMedia = {
  kind: QuestionMediaKind;
  url: string;
  credit: string | null;
  /** Maps are shown whole ("contain"); photos fill their frame ("cover"). */
  fit: "contain" | "cover";
};

const VIDEO_EXTENSION = /\.(mp4|webm|m4v|mov)$/i;

const MAPS_CREDIT = "Map: Natural Earth / U.S. Census";
const WIKIMEDIA_CREDIT = "Wikimedia Commons";

/** Only http(s) or a root-relative path on our own site; anything else (javascript:, data:, //host) is dropped. */
const safeUrl = (raw: string): string | null => {
  if (raw.startsWith("/")) return raw.startsWith("//") ? null : raw;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const pathOf = (url: string): string => {
  try {
    return new URL(url, "https://local.invalid").pathname;
  } catch {
    return url;
  }
};

export const toQuestionMedia = (
  rawUrl: string | null | undefined,
  credit?: string | null,
): QuestionMedia | null => {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return null;
  const url = safeUrl(trimmed);
  if (!url) return null;

  const path = pathOf(url);
  const isLocalMap = path.startsWith("/maps/");
  const isWikimedia = url.includes("wikimedia.org");
  const explicitCredit = String(credit ?? "").trim();

  return {
    kind: VIDEO_EXTENSION.test(path) ? "video" : "image",
    url,
    credit: explicitCredit || (isLocalMap ? MAPS_CREDIT : isWikimedia ? WIKIMEDIA_CREDIT : null),
    fit: isLocalMap || isWikimedia ? "contain" : "cover",
  };
};
