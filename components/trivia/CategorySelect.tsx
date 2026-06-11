"use client";

import { useRouter } from "next/navigation";
import { TRIVIA_CATEGORIES, ALL_CATEGORIES_SENTINEL } from "@/lib/triviaCategories";
import { getVenueId } from "@/lib/storage";
import { navigateBackToVenue, runVenueGameReturnTransition } from "@/lib/venueGameTransition";

const BUTTON_POP_CLASS =
  "transition-all duration-150 transform active:scale-95 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300";

function triggerHaptic(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}

type Props = {
  onSelect: (category: string | null) => void;
};

export function CategorySelect({ onSelect }: Props) {
  const router = useRouter();

  const returnToVenueHome = () => {
    const venueId = getVenueId()?.trim() ?? "";
    if (!venueId) {
      router.push("/");
      return;
    }
    const targetPath = `/venue/${encodeURIComponent(venueId)}`;
    void runVenueGameReturnTransition({
      gameKey: "speed-trivia",
      navigate: () =>
        navigateBackToVenue({
          venuePath: targetPath,
          fallbackNavigate: () => {
            router.push(targetPath);
          },
        }),
    });
  };

  const AllIcon = ALL_CATEGORIES_SENTINEL.icon;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between gap-2 px-3.5"
          style={{ paddingTop: "max(env(safe-area-inset-top), 10px)", paddingBottom: "12px" }}
        >
          <button
            type="button"
            onMouseDown={() => triggerHaptic(14)}
            onClick={returnToVenueHome}
            className="tp-exit-pill tp-clean-button inline-flex items-center gap-1.5 px-3 font-black text-[12px]"
          >
            ← Back
          </button>
          <div
            className="font-black uppercase tracking-[0.06em] text-[#facc15] text-[17px]"
            style={{ textShadow: "0 1px 0 #000, 0 0 14px rgba(250,204,21,0.5)" }}
          >
            Speed Trivia
          </div>
          {/* Spacer to balance the header */}
          <div className="w-[72px]" />
        </div>

        {/* Content */}
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3.5"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <div className="mb-4">
            <p className="font-black uppercase tracking-[0.16em] text-[#84cc16] text-[10.5px]">
              Speed Trivia
            </p>
            <h1 className="mt-1 font-black text-white text-[24px]">Choose a Category</h1>
          </div>

          {/* All Categories button */}
          <button
            type="button"
            onMouseDown={() => triggerHaptic(14)}
            onClick={() => onSelect(null)}
            className={`${BUTTON_POP_CLASS} mb-3 flex w-full items-center gap-3 rounded-[14px] border border-[rgba(250,204,21,0.45)] bg-[rgba(250,204,21,0.1)] px-4 py-3.5`}
            style={{ boxShadow: "0 0 0 1px rgba(250,204,21,0.15), 0 6px 16px rgba(250,204,21,0.12)" }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(250,204,21,0.3)] bg-[rgba(250,204,21,0.12)]">
              <AllIcon size={20} className="text-[#facc15]" />
            </div>
            <div className="text-left">
              <p className="font-black text-white text-[15px] leading-tight">
                {ALL_CATEGORIES_SENTINEL.label}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Mix of every category</p>
            </div>
          </button>

          {/* Category grid */}
          <div className="grid grid-cols-2 gap-2">
            {TRIVIA_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.slug}
                  type="button"
                  onMouseDown={() => triggerHaptic(12)}
                  onClick={() => onSelect(cat.dbValue)}
                  className={`${BUTTON_POP_CLASS} flex flex-col items-center gap-2 rounded-[14px] border border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.06)] px-3 py-4`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[rgba(250,204,21,0.25)] bg-[rgba(250,204,21,0.1)]">
                    <Icon size={20} className="text-[#facc15]" />
                  </div>
                  <p className="font-black text-white text-[13px] leading-tight text-center">
                    {cat.label}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
