// Instagram Story straight from the app (Phase 9d, docs/native-app-store-plan.md): Meta's "Sharing to
// Stories" opens Instagram's Story editor with the picture already in it. Our own plugin
// `InstagramStories` in native/ (iOS: pasteboard + instagram-stories://; Android: the
// com.instagram.share.ADD_TO_STORY intent), sent with the Meta App ID from capacitor.config.json.
// Old app builds don't have the plugin: check `canShareToInstagramStory()` first and fall back to the
// share sheet. The website never reaches this (hasNativeCapability is false in a browser).

import { callNative, hasNativeCapability } from "@/lib/nativeApp";

export type InstagramStoryOutcome = "opened" | "unavailable" | "failed";

/** One bridge call, made once when the share sheet opens: does this phone have Instagram? */
export const canShareToInstagramStory = async (): Promise<boolean> => {
  if (!hasNativeCapability("InstagramStories")) return false;
  try {
    const result = await callNative("InstagramStories", "isAvailable");
    return typeof result === "object" && result !== null && (result as { available?: unknown }).available === true;
  } catch {
    return false;
  }
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the picture."));
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
};

const isNotInstalled = (error: unknown): boolean => {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  const message = error instanceof Error ? error.message : "";
  return code === "NOT_INSTALLED" || message.includes("NOT_INSTALLED");
};

/** Opens Instagram's Story editor with the picture as the background. */
export const shareToInstagramStory = async (
  picture: Blob,
  colors: { top: string; bottom: string } = { top: "#020617", bottom: "#020617" },
): Promise<InstagramStoryOutcome> => {
  if (!hasNativeCapability("InstagramStories")) return "unavailable";
  try {
    await callNative("InstagramStories", "shareToStory", {
      data: await blobToBase64(picture),
      topColor: colors.top,
      bottomColor: colors.bottom,
    });
    return "opened";
  } catch (error) {
    return isNotInstalled(error) ? "unavailable" : "failed";
  }
};
