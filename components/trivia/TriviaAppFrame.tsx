"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TriviaGame } from "@/components/trivia/TriviaGame";
import { UserStatusHeader } from "@/components/ui/UserStatusHeader";
import { HightopLogo } from "@/components/ui/HightopLogo";

export function TriviaAppFrame() {
  const router = useRouter();

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const priorBodyOverflow = document.body.style.overflow;
    const priorHtmlOverflow = document.documentElement.style.overflow;
    const priorBodyOverflowX = document.body.style.overflowX;
    const priorHtmlOverflowX = document.documentElement.style.overflowX;
    const priorBodyOverscroll = document.body.style.overscrollBehavior;
    const priorHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const priorBodyTouchAction = document.body.style.touchAction;
    const priorHtmlTouchAction = document.documentElement.style.touchAction;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflowX = "hidden";
    document.documentElement.style.overflowX = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.touchAction = "pan-y";
    document.documentElement.style.touchAction = "pan-y";

    return () => {
      document.body.style.overflow = priorBodyOverflow;
      document.documentElement.style.overflow = priorHtmlOverflow;
      document.body.style.overflowX = priorBodyOverflowX;
      document.documentElement.style.overflowX = priorHtmlOverflowX;
      document.body.style.overscrollBehavior = priorBodyOverscroll;
      document.documentElement.style.overscrollBehavior = priorHtmlOverscroll;
      document.body.style.touchAction = priorBodyTouchAction;
      document.documentElement.style.touchAction = priorHtmlTouchAction;
    };
  }, []);

  return (
    <div className="tp-trivia-compact fixed inset-0 z-[60] overflow-hidden px-1.5 py-2 touch-pan-y md:px-3 md:py-3">
      <div className="mx-auto flex h-full w-full max-w-[22.5rem] flex-col gap-1.5 overflow-hidden sm:max-w-md">
        <header className="tp-hud-card shrink-0 p-1.5 sm:p-2">
          <div className="space-y-1">
            <div className="text-center">
              <HightopLogo size="sm" className="mx-auto mb-1" />
              <p className="text-sm font-black uppercase tracking-[0.08em] text-slate-900 sm:text-base">
                Hightop Challenge
              </p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-3xl">Trivia</h1>
            </div>
            <UserStatusHeader variant="trivia" />
          </div>
        </header>

        <main className="tp-comic-card min-h-0 flex-1 overflow-hidden p-1.5 sm:p-2">
          <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) {
                  router.back();
                  return;
                }
                router.push("/");
              }}
              className="inline-flex min-h-[30px] items-center justify-center gap-1 rounded-xl border-2 border-slate-900 bg-emerald-500 px-3 py-1 text-sm font-semibold text-white shadow-[2px_2px_0_#0f172a] sm:min-h-[40px] sm:rounded-full sm:border-4 sm:px-4 sm:py-2 sm:text-sm sm:shadow-[4px_4px_0_#0f172a]"
            >
              <span aria-hidden="true">←</span>
              Back
            </button>
            <div className="min-h-0 flex-1 overflow-hidden">
              <TriviaGame />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
