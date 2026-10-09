"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { sharePayload, type SharePayload, type ShareOutcome } from "@/lib/nativeShare";

type ShareLinkButtonProps = {
  payload: SharePayload;
  label: string;
  className?: string;
};

const OUTCOME_COPY: Partial<Record<ShareOutcome, string>> = {
  copied: "Link copied",
  failed: "Couldn't share — try again",
};

/** Opens the phone's share sheet (app) or the browser's (website); copies the link when neither exists. */
export const ShareLinkButton = ({ payload, label, className = "" }: ShareLinkButtonProps) => {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setOutcome(await sharePayload(payload));
    } finally {
      setBusy(false);
    }
  };

  const message = outcome ? OUTCOME_COPY[outcome] : undefined;

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        className={`tp-player-hit-target tp-player-pressable tp-clean-button inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.08] px-4 text-sm font-black text-white transition hover:bg-white/[0.12] disabled:opacity-50 ${className}`}
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        {label}
      </button>
      {message ? (
        <p role="status" className="text-caption font-bold text-slate-300">
          {message}
        </p>
      ) : null}
    </div>
  );
};
