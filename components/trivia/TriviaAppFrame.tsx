"use client";

import { useEffect } from "react";
import { BackButton } from "@/components/navigation/BackButton";
import { TriviaGame } from "@/components/trivia/TriviaGame";
import { UserStatusHeader } from "@/components/ui/UserStatusHeader";

export function TriviaAppFrame() {
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
    <div className="fixed inset-0 z-[60] overflow-hidden px-2 py-2 touch-pan-y md:px-3 md:py-3">
      <div className="mx-auto flex h-full w-full max-w-md flex-col gap-2 overflow-hidden">
        <header className="tp-hud-card shrink-0 p-2">
          <div className="space-y-1.5">
            <div className="text-center">
              <p className="text-base font-black uppercase tracking-[0.12em] text-slate-900">Hightop Challenge</p>
              <h1 className="text-3xl font-black tracking-tight text-slate-900">Trivia</h1>
            </div>
            <UserStatusHeader variant="trivia" />
          </div>
        </header>

        <main className="tp-comic-card min-h-0 flex-1 overflow-hidden p-2">
          <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
            <BackButton label="Back" />
            <div className="min-h-0 flex-1 overflow-hidden">
              <TriviaGame />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
