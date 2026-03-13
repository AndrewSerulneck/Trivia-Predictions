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
    const priorBodyOverscroll = document.body.style.overscrollBehavior;
    const priorHtmlOverscroll = document.documentElement.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.documentElement.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = priorBodyOverflow;
      document.documentElement.style.overflow = priorHtmlOverflow;
      document.body.style.overscrollBehavior = priorBodyOverscroll;
      document.documentElement.style.overscrollBehavior = priorHtmlOverscroll;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden px-2 py-2 md:px-3 md:py-3">
      <div className="mx-auto flex h-full w-full max-w-md flex-col gap-2 overflow-hidden">
        <header className="tp-hud-card shrink-0 p-2">
          <div className="space-y-2">
            <div className="text-center">
              <p className="text-lg font-black uppercase tracking-[0.22em] text-slate-900">Hightop Challenge</p>
              <h1 className="text-4xl font-black tracking-tight text-slate-900">Trivia</h1>
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
