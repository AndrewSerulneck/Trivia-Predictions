import { SHARE_DESTINATION_COPY } from "./copyPresets";

/**
 * The share sheet's destinations (docs/native-app-store-plan.md Phase 9d). Pure: which apps the
 * row offers, and what one tap does on this phone.
 *
 * A web page can't send a picture to one chosen app — only the phone's share sheet can, and the
 * player picks the app there. So on the website every destination copies the caption + link and
 * opens the share sheet with the picture, then says which app to pick. Three exceptions:
 * - Instagram Story inside the app opens Instagram's Story editor directly (Meta's "Sharing to
 *   Stories", our `InstagramStories` plugin), when this app build has it and Instagram is installed;
 * - X with no picture share (most desktops) opens x.com's post page with the caption + link;
 * - Save downloads the picture on the website; in the app it is the share sheet ("Save Image"),
 *   because the app's web view can't download.
 */

export const SHARE_DESTINATIONS = [
  "instagram-story",
  "instagram-post",
  "facebook",
  "x",
  "messages",
  "save",
  "more",
] as const;

export type ShareDestination = (typeof SHARE_DESTINATIONS)[number];

export type ShareDestinationAction = "instagram-story-native" | "share-sheet" | "x-intent" | "download";

export type ShareDestinationEnv = {
  /** In the app, this build has the plugin and Instagram is installed (asked once when the sheet opens). */
  instagramStoryDirect: boolean;
  /** The phone can hand this picture to its share sheet (Web Share with files, or the app's native share). */
  canSharePicture: boolean;
  /** Inside the iPhone/Android app. */
  inApp: boolean;
};

export type ShareDestinationPlan = {
  /** Copy the caption + link before acting (so it can be pasted in the app the player picks). */
  copyCaption: boolean;
  action: ShareDestinationAction;
  /** What the sheet says after the tap. */
  hint: string;
};

export const shareDestinationLabel = (destination: ShareDestination): string => SHARE_DESTINATION_COPY[destination].label;

export const planShareDestination = (destination: ShareDestination, env: ShareDestinationEnv): ShareDestinationPlan => {
  const copy = SHARE_DESTINATION_COPY[destination];
  if (destination === "instagram-story" && env.instagramStoryDirect) {
    return { copyCaption: true, action: "instagram-story-native", hint: copy.direct };
  }
  if (destination === "x" && !env.canSharePicture) {
    return { copyCaption: true, action: "x-intent", hint: copy.direct };
  }
  if (destination === "save") {
    return env.inApp
      ? { copyCaption: false, action: "share-sheet", hint: copy.viaSheet }
      : { copyCaption: false, action: "download", hint: copy.direct };
  }
  return { copyCaption: true, action: "share-sheet", hint: copy.viaSheet };
};

/** x.com's post page with the caption (which already ends with the app link). */
export const xIntentUrl = (caption: string): string => `https://x.com/intent/post?text=${encodeURIComponent(caption)}`;
