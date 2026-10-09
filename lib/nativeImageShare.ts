// Share a picture through the phone's own share sheet (Phase 4a.1, docs/native-app-store-plan.md).
// Android's web view can't give a File to navigator.share, so in the app we write the picture to the
// app's cache with @capacitor/filesystem and pass its file:// URI to @capacitor/share. A fixed folder
// and the story's own file name mean the cache never grows past one picture per story name; the OS
// clears the cache folder itself (we don't delete right after sharing: the receiving app may still be
// reading it).

import { callNative, hasNativeCapability } from "@/lib/nativeApp";

export type NativeImageShareOutcome = "shared" | "canceled" | "failed" | "unavailable";

export type NativeImageShareRequest = {
  blob: Blob;
  fileName: string;
  title?: string;
  text?: string;
};

const SHARE_FOLDER = "hightop-share";

const safeFileName = (name: string): string => {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/\.{2,}/g, ".").replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "hightop-story.png";
};

const blobToBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  // In slices: String.fromCharCode(...bytes) overflows the call stack on a full-size story picture.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const isCancel = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("cancel") || message.includes("abort");
};

/** True when this copy of the app can attach a picture to the share sheet. */
export const canShareImageNatively = (): boolean => hasNativeCapability("Share") && hasNativeCapability("Filesystem");

export const shareImageNatively = async ({
  blob,
  fileName,
  title,
  text,
}: NativeImageShareRequest): Promise<NativeImageShareOutcome> => {
  if (!canShareImageNatively()) return "unavailable";
  let uri: string;
  try {
    const written = await callNative("Filesystem", "writeFile", {
      path: `${SHARE_FOLDER}/${safeFileName(fileName)}`,
      data: await blobToBase64(blob),
      directory: "CACHE",
      recursive: true,
    });
    uri = typeof written === "object" && written !== null ? String((written as { uri?: unknown }).uri ?? "") : "";
  } catch {
    return "failed";
  }
  if (!uri) return "failed";
  try {
    await callNative("Share", "share", {
      files: [uri],
      ...(title ? { title, dialogTitle: title } : {}),
      ...(text ? { text } : {}),
    });
    return "shared";
  } catch (error) {
    return isCancel(error) ? "canceled" : "failed";
  }
};
