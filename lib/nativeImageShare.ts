// Share a picture (or an animated Story's MP4) through the phone's own share sheet (Phase 4a.1,
// docs/native-app-store-plan.md). Android's web view can't give a File to navigator.share, so in the app
// we write the file to the app's cache with @capacitor/filesystem and pass its file:// URI to
// @capacitor/share. A fixed folder and the story's own file name mean the cache never grows past one
// file per story name; the OS clears the cache folder itself (we don't delete right after sharing: the
// receiving app may still be reading it).
// The file crosses the bridge in pieces (docs/share-win-celebration-plan.md Phase 3.2): one base64 string
// for a 4 MB video meant ~25 MB peak in Android's Java heap. Before a video is written, every other
// `.mp4` in the folder is deleted, so the cache holds one video at most. The app's Instagram Story
// button writes its video with the same writer and hands the plugin only the URI.

import { callNative, hasNativeCapability } from "@/lib/nativeApp";

export type NativeImageShareOutcome = "shared" | "canceled" | "failed" | "unavailable";

export type NativeImageShareRequest = {
  blob: Blob;
  fileName: string;
  title?: string;
  text?: string;
};

const SHARE_FOLDER = "hightop-share";

/** Bytes per bridge call: a multiple of 3, so each piece's base64 stands alone (no padding mid-file). */
export const SHARE_FILE_PIECE_BYTES = 768 * 1024;

const isVideoName = (name: string): boolean => name.toLowerCase().endsWith(".mp4");

const safeFileName = (name: string): string => {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/\.{2,}/g, ".").replace(/^\.+/, "");
  if (cleaned.length === 0) return "hightop-story.png";
  // Shorten the name, never the extension: the share sheet and the cleanup below go by it.
  const dot = cleaned.lastIndexOf(".");
  const extension = dot > 0 && cleaned.length - dot <= 5 ? cleaned.slice(dot) : "";
  return `${cleaned.slice(0, cleaned.length - extension.length).slice(0, 80 - extension.length)}${extension}`;
};

/** One piece of the file as base64. Only this piece is ever in memory as text. */
const pieceToBase64 = async (piece: Blob): Promise<string> => {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(piece);
  });
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
};

/** Deletes every `.mp4` in the share folder except `keep`. Best effort: a failure here never stops the share. */
const removeOtherVideos = async (keep: string): Promise<void> => {
  try {
    const listing = await callNative("Filesystem", "readdir", { path: SHARE_FOLDER, directory: "CACHE" });
    const files = typeof listing === "object" && listing !== null ? (listing as { files?: unknown }).files : undefined;
    if (!Array.isArray(files)) return;
    for (const entry of files) {
      const name = typeof entry === "string" ? entry : typeof entry === "object" && entry !== null ? (entry as { name?: unknown }).name : undefined;
      if (typeof name !== "string" || name === keep || !isVideoName(name)) continue;
      try {
        await callNative("Filesystem", "deleteFile", { path: `${SHARE_FOLDER}/${name}`, directory: "CACHE" });
      } catch {
        // Already gone, or in use: the OS clears the cache in time.
      }
    }
  } catch {
    // No folder yet (first share), or readdir failed: nothing to clean.
  }
};

/** Writes the file to the app cache in pieces and returns its file:// URI, or null if it couldn't. */
export const writeShareFileNatively = async (blob: Blob, fileName: string): Promise<string | null> => {
  if (!hasNativeCapability("Filesystem")) return null;
  const name = safeFileName(fileName);
  const path = `${SHARE_FOLDER}/${name}`;
  if (isVideoName(name)) await removeOtherVideos(name);
  try {
    let uri = "";
    for (let start = 0; start === 0 || start < blob.size; start += SHARE_FILE_PIECE_BYTES) {
      const data = await pieceToBase64(blob.slice(start, start + SHARE_FILE_PIECE_BYTES));
      if (start === 0) {
        const written = await callNative("Filesystem", "writeFile", { path, data, directory: "CACHE", recursive: true });
        uri = typeof written === "object" && written !== null ? String((written as { uri?: unknown }).uri ?? "") : "";
        if (!uri) return null;
      } else {
        await callNative("Filesystem", "appendFile", { path, data, directory: "CACHE" });
      }
    }
    return uri;
  } catch {
    return null;
  }
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
  const uri = await writeShareFileNatively(blob, fileName);
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
