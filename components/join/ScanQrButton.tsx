"use client";

import { useState } from "react";
import { ScanLine } from "lucide-react";
import { joinPathForScan, NOT_A_HIGHTOP_CODE_MESSAGE, scanQr, type QrScanOutcome } from "@/lib/nativeQrScan";
import { useHasNativeCapability } from "@/lib/useIsNativeApp";

type ScanQrButtonProps = {
  /**
   * A Hightop code for one venue was scanned. `path` is the in-app path to open (built by us, never the
   * scanned text). Return a message to show it under the button (e.g. "You need to be at …").
   */
  onVenueScanned: (venueId: string, path: string) => void | string | Promise<void | string>;
  /** Shown after the plain join code (the printed QR, no venue in it) is scanned. */
  joinCodeMessage: string;
  className?: string;
};

const MESSAGES: Partial<Record<QrScanOutcome["status"], string>> = {
  invalid: NOT_A_HIGHTOP_CODE_MESSAGE,
  denied: "Camera access is off. Turn it on for Hightop Challenge in your phone's Settings to scan.",
  failed: "Couldn't scan. Try again.",
};

/**
 * "Scan QR code" (Phase 4b). App only: renders nothing on the website or in an app build without the
 * scanner. The camera permission prompt appears only when this is tapped.
 */
export const ScanQrButton = ({ onVenueScanned, joinCodeMessage, className = "" }: ScanQrButtonProps) => {
  const available = useHasNativeCapability("CapacitorBarcodeScanner");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!available) return null;

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const outcome = await scanQr();
      if (outcome.status !== "scanned") setMessage(MESSAGES[outcome.status] ?? "");
      else if (outcome.target.venueId) {
        const reply = await onVenueScanned(outcome.target.venueId, joinPathForScan(outcome.target));
        setMessage(typeof reply === "string" ? reply : "");
      } else setMessage(joinCodeMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        className="tp-player-hit-target tp-player-pressable tp-clean-button inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800 px-6 py-2 text-base font-black text-white transition-all motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        <ScanLine className="h-5 w-5" aria-hidden="true" />
        Scan QR code
      </button>
      {message ? (
        <p role="status" className="text-center text-footnote font-bold text-slate-300">
          {message}
        </p>
      ) : null}
    </div>
  );
};
