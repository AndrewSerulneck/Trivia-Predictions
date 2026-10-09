// Share a link or message (Phase 4a, docs/native-app-store-plan.md): "Invite a friend" and "Share my win".
// In the app → the phone's share sheet (@capacitor/share). On the website → the browser's share sheet
// (navigator.share), else copy the text to the clipboard. The caller shows the returned outcome.

import { callNative, hasNativeCapability } from "@/lib/nativeApp";
import { JOIN_QR_URL } from "@/lib/joinQr";

export type SharePayload = { title: string; text: string; url: string };
export type ShareOutcome = "shared" | "copied" | "canceled" | "failed";

/** The invite everyone shares. The link is the permanent join URL (lib/joinQr.ts). */
export const INVITE_FRIEND_PAYLOAD: SharePayload = {
  title: "Hightop Challenge",
  text: "Come play Hightop Challenge with me — trivia, bingo and more at our venue.",
  url: JOIN_QR_URL,
};

const isCancel = (error: unknown): boolean => {
  const name = typeof error === "object" && error !== null ? (error as { name?: unknown }).name : undefined;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return name === "AbortError" || message.includes("cancel") || message.includes("abort");
};

const copyToClipboard = async (payload: SharePayload): Promise<ShareOutcome> => {
  try {
    await navigator.clipboard.writeText(`${payload.text} ${payload.url}`);
    return "copied";
  } catch {
    return "failed";
  }
};

export const sharePayload = async (payload: SharePayload): Promise<ShareOutcome> => {
  if (hasNativeCapability("Share")) {
    try {
      await callNative("Share", "share", { title: payload.title, text: payload.text, url: payload.url, dialogTitle: payload.title });
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "canceled";
      // Fall through to the website behaviour rather than leave the player with nothing.
    }
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "canceled";
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) return copyToClipboard(payload);
  return "failed";
};
