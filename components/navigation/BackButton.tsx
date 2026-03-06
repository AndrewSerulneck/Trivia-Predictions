"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  href?: string;
  label?: string;
};

export function BackButton({ href = "/", label = "Back" }: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(href);
  };

  const triggerBackHaptic = () => {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    navigator.vibrate(14);
  };

  return (
    <button
      type="button"
      onMouseDown={triggerBackHaptic}
      onClick={handleBack}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-emerald-300 bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-200 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 active:scale-95 active:brightness-90"
    >
      <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
        ←
      </span>
      {label}
    </button>
  );
}
