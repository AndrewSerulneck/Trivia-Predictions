"use client";

import { AlertTriangle, Check, Info, Loader2 } from "lucide-react";

export type StoryShareStatusTone = "idle" | "loading" | "success" | "warning" | "error";

interface StoryShareStatusToastProps {
  tone: StoryShareStatusTone;
  message: string | null;
}

export function StoryShareStatusToast({ tone, message }: StoryShareStatusToastProps) {
  if (!message || tone === "idle") {
    return null;
  }

  const icon =
    tone === "loading" ? (
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    ) : tone === "success" ? (
      <Check className="h-4 w-4" aria-hidden="true" />
    ) : tone === "error" ? (
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
    ) : (
      <Info className="h-4 w-4" aria-hidden="true" />
    );

  const toneClass =
    tone === "success"
      ? "border-emerald-200/30 bg-emerald-400/15 text-emerald-100"
      : tone === "error"
      ? "border-rose-200/30 bg-rose-400/15 text-rose-100"
      : tone === "warning"
      ? "border-amber-200/30 bg-amber-300/15 text-amber-100"
      : "border-cyan-200/30 bg-cyan-300/15 text-cyan-100";

  return (
    <div className={`flex items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.1em] ${toneClass}`}>
      {icon}
      <span className="min-w-0 truncate">{message}</span>
    </div>
  );
}
