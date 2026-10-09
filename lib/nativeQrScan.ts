// In-app QR scanner (Phase 4b, docs/native-app-store-plan.md).
//
// Two jobs, both pure of React:
//  1. `parseHightopQr(text)` decides whether a scanned code is OURS. Only an https link on
//     play.hightopchallenge.com / hightopchallenge.com, pointing at the join page (`/` or `/join`),
//     passes. Everything else (another site, a partner or admin page, a look-alike host, plain text)
//     is "not a Hightop code". The scanned text is NEVER navigated to: the caller builds its own
//     in-app path from the validated venue id (`joinPathForScan`).
//  2. `scanQr()` opens the phone's scanner through @capacitor/barcode-scanner and returns one outcome.
//     The camera permission prompt happens inside the plugin, only when this is called (a tap).
//
// The scanned text is never logged, stored or sent anywhere.

import { callNative, hasNativeCapability } from "@/lib/nativeApp";

/** Hosts a scanned link may point at. The permanent join QR is the first (lib/joinQr.ts). */
export const HIGHTOP_QR_HOSTS: readonly string[] = ["play.hightopchallenge.com", "hightopchallenge.com"];

/** Paths that mean "join": the QR printed on merch is the bare host. */
const JOIN_PATHS: readonly string[] = ["/", "/join"];

const VENUE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_SCAN_LENGTH = 2048;

/** Shown for a code that isn't ours — and for a venue id we can't find, so a scan never reveals a hidden venue. */
export const NOT_A_HIGHTOP_CODE_MESSAGE = "That's not a Hightop code.";

/** What a valid Hightop code asks for: a specific venue (`?v=`), or just "join" (the printed QR). */
export type HightopQrTarget = { venueId: string | null };

export const parseHightopQr = (scanned: string): HightopQrTarget | null => {
  const text = scanned.trim();
  if (text.length === 0 || text.length > MAX_SCAN_LENGTH || !/^https:\/\//i.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  if (!HIGHTOP_QR_HOSTS.includes(url.hostname.toLowerCase())) return null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  if (!JOIN_PATHS.includes(path)) return null;
  const venue = url.searchParams.get("v");
  if (venue === null) return { venueId: null };
  return VENUE_ID_PATTERN.test(venue) ? { venueId: venue } : null;
};

/** The in-app path for a valid scan. Built from the validated id only, never from the scanned text. */
export const joinPathForScan = (target: HightopQrTarget): string =>
  target.venueId ? `/?v=${encodeURIComponent(target.venueId)}` : "/";

export type QrScanOutcome =
  | { status: "scanned"; target: HightopQrTarget }
  | { status: "invalid" }
  | { status: "canceled" }
  | { status: "denied" }
  | { status: "failed" }
  | { status: "unavailable" };

// @capacitor/barcode-scanner option values (its enums are numbers; we don't import the package into the website).
const QR_CODE_HINT = 0;
const CAMERA_BACK = 1;
const ORIENTATION_PORTRAIT = 1;

/** Error codes the plugin rejects with: ...-0006 the player closed the scanner, ...-0007 camera access refused. */
const CODE_CANCELED = /-0*6$/;
const CODE_DENIED = /-0*7$/;

const classifyScanError = (error: unknown): "canceled" | "denied" | "failed" => {
  const code = typeof error === "object" && error !== null ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (CODE_CANCELED.test(code) || message.includes("cancel")) return "canceled";
  if (CODE_DENIED.test(code) || message.includes("permission") || message.includes("camera access")) return "denied";
  return "failed";
};

/** True when this copy of the app has the scanner. Old app builds don't; the web shows no button. */
export const canScanQr = (): boolean => hasNativeCapability("CapacitorBarcodeScanner");

export const scanQr = async (): Promise<QrScanOutcome> => {
  if (!canScanQr()) return { status: "unavailable" };
  try {
    const result = await callNative("CapacitorBarcodeScanner", "scanBarcode", {
      hint: QR_CODE_HINT,
      scanInstructions: "Point your camera at a Hightop Challenge QR code.",
      scanButton: false,
      cameraDirection: CAMERA_BACK,
      scanOrientation: ORIENTATION_PORTRAIT,
      cancelButtonAccessibilityLabel: "Close the scanner",
      torchButtonOnAccessibilityLabel: "Turn the flashlight off",
      torchButtonOffAccessibilityLabel: "Turn the flashlight on",
      android: { scanningLibrary: "zxing" },
    });
    const text = typeof result === "object" && result !== null ? (result as { ScanResult?: unknown }).ScanResult : undefined;
    const target = typeof text === "string" ? parseHightopQr(text) : null;
    return target ? { status: "scanned", target } : { status: "invalid" };
  } catch (error) {
    return { status: classifyScanError(error) };
  }
};
