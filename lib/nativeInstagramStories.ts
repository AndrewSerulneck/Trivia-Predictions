// Instagram Story straight from the app (Phase 9d, docs/native-app-store-plan.md): Meta's "Sharing to
// Stories" opens Instagram's Story editor with the picture already in it. Our own plugin
// `InstagramStories` in native/ (iOS: pasteboard + instagram-stories://; Android: the
// com.instagram.share.ADD_TO_STORY intent), sent with the Meta App ID from capacitor.config.json.
// Old app builds don't have the plugin: check `getInstagramStorySupport()` first and fall back to the
// share sheet. The website never reaches this (hasNativeCapability is false in a browser).
// An animated Story (an MP4) goes the same way as a picture (docs/share-win-celebration-plan.md Phase 3):
// iOS `com.instagram.sharedSticker.backgroundVideo`, Android ADD_TO_STORY with `video/mp4`. The video never
// crosses the bridge as one string (Phase 3.2): it is written to the app cache in pieces
// (`writeShareFileNatively`) and the plugin gets only its file:// URI as `path`. Only app builds whose
// `isAvailable` says `videoFile: true` read a path; every other build sends a video through the share sheet.

import { callNative, hasNativeCapability, nativePlatform } from "@/lib/nativeApp";
import { writeShareFileNatively } from "@/lib/nativeImageShare";

export type InstagramStoryOutcome = "opened" | "unavailable" | "failed";

/** What Instagram's Story editor can take from this app build: a picture, and (Phase 3 builds) a video. */
export type InstagramStorySupport = { picture: boolean; video: boolean };

export const NO_INSTAGRAM_STORY: InstagramStorySupport = { picture: false, video: false };

/** The website's switch for one-tap video (NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF): a comma list of
 *  platforms (`ios`, `android`, `ios,android`). Unset, empty or `none` = on everywhere. Pictures are never affected. */
export const instagramStoryVideoOff = (
  platform: string | null,
  raw: string | undefined = process.env.NEXT_PUBLIC_INSTAGRAM_STORY_VIDEO_OFF,
): boolean => platform !== null && (raw ?? "").split(",").map((item) => item.trim().toLowerCase()).includes(platform);

/** One bridge call, made once when the share sheet opens: does this phone have Instagram, and can this
 *  app build hand it a video file? Only a Phase 3.2 build answers `videoFile`; an older build (including a
 *  Phase 3 test build that answers `video` and expects base64) stays false. The video also needs the
 *  Filesystem plugin to write the file. */
export const getInstagramStorySupport = async (): Promise<InstagramStorySupport> => {
  if (!hasNativeCapability("InstagramStories")) return NO_INSTAGRAM_STORY;
  try {
    const result = await callNative("InstagramStories", "isAvailable");
    if (typeof result !== "object" || result === null) return NO_INSTAGRAM_STORY;
    const { available, videoFile } = result as { available?: unknown; videoFile?: unknown };
    const picture = available === true;
    const video = picture && videoFile === true && hasNativeCapability("Filesystem") && !instagramStoryVideoOff(nativePlatform());
    return { picture, video };
  } catch {
    return NO_INSTAGRAM_STORY;
  }
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
};

const isNotInstalled = (error: unknown): boolean => {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const message = error instanceof Error ? error.message : "";
  return code === "NOT_INSTALLED" || message.includes("NOT_INSTALLED");
};

export type InstagramStoryOptions = {
  /** The caption + link the sheet already copied. On iPhone the picture replaces the whole pasteboard,
   *  so the plugin puts this back in the same item (Phase 9f.2); Android leaves the clipboard alone and
   *  ignores it, and so does an app build from before 9f.2. */
  caption?: string;
  colors?: { top: string; bottom: string };
  /** The story's own file name (the sheet's `getStoryShareFileName`), so the share-sheet path and this one
   *  reuse one cache file. Used for a video only. */
  fileName?: string;
};

/** Opens Instagram's Story editor with the picture (or, for a `video/*` file, the video) as the
 *  background. Send a video only when `getInstagramStorySupport()` said `video`. A picture still crosses
 *  as base64 `data` (every build since 9d reads it; ~1–2 MB); a video crosses as a cache file `path`. */
export const shareToInstagramStory = async (
  media: Blob,
  { caption = "", colors = { top: "#020617", bottom: "#020617" }, fileName = "hightop-story.mp4" }: InstagramStoryOptions = {},
): Promise<InstagramStoryOutcome> => {
  if (!hasNativeCapability("InstagramStories")) return "unavailable";
  const isVideo = media.type.startsWith("video/");
  let source: { data: string } | { path: string };
  try {
    if (isVideo) {
      // Always a .mp4 name: the writer's one-video cleanup goes by the extension.
      const path = await writeShareFileNatively(media, /\.mp4$/i.test(fileName) ? fileName : "hightop-story.mp4");
      if (!path) return "failed";
      source = { path };
    } else {
      source = { data: await blobToBase64(media) };
    }
  } catch {
    return "failed";
  }
  try {
    await callNative("InstagramStories", "shareToStory", {
      ...source,
      mediaType: isVideo ? "video" : "image",
      topColor: colors.top,
      bottomColor: colors.bottom,
      caption,
    });
    return "opened";
  } catch (error) {
    return isNotInstalled(error) ? "unavailable" : "failed";
  }
};
