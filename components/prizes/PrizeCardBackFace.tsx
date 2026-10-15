"use client";

import { PRIZE_CARD } from "@/lib/themeTokens";
import type { PrizeCardBack } from "@/lib/prizeCardFace";

/**
 * The back of a prize card (docs/prize-gift-card-redesign-plan.md §2.8): a "Redeemed {date, time}"
 * stamp once redeemed, then Won / For / Terms / Expires, then the one action staff use. Nothing
 * here is greyed out — once a prize is redeemed its details must stay readable, so staff can tell
 * an early tap by mistake. No glow on the back: the text gets full contrast.
 *
 * Drawn by `PrizeCard`, which owns the flip; this file only lays the back out.
 */

export type PrizeCardBackAction = {
  /** "Redeem" / "Show gift card" — the wallet's prizeActionOf decides, never this file. */
  label: string;
  onPress: () => void;
};

type PrizeCardBackFaceProps = {
  back: PrizeCardBack;
  action?: PrizeCardBackAction;
  size: "list" | "large";
};

const TONE_CLASS = { urgent: PRIZE_CARD.urgentText, soon: PRIZE_CARD.soonText } as const;

export const PrizeCardBackFace = ({ back, action, size }: PrizeCardBackFaceProps) => (
  <div className={`flex h-full flex-col gap-2 max-[359px]:gap-1.5 ${size === "large" ? "p-5 max-[359px]:p-4" : "p-4 max-[359px]:p-3.5"}`}>
    {/* Only the details scroll (a long one, or a stamped one on a 320 px phone); the action never
        scrolls out of sight. Sub-360 px spacing is tighter so fewer values wrap; the bottom fade (the
        12 px of padding it sits on stays clear when everything fits) says "more below" when it doesn't. */}
    <div data-prize-card-back-details className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pb-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-12px),transparent)] max-[359px]:space-y-2">
      {back.stamp ? (
        <p data-prize-card-stamp className={`w-fit rounded-full px-2.5 py-1 text-caption font-bold ${PRIZE_CARD.stamp}`}>
          {back.stamp}
        </p>
      ) : null}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 max-[359px]:gap-x-3 max-[359px]:gap-y-1">
        {back.rows.map((row) => (
          <div key={row.key} data-prize-card-back-row={row.key} className="contents">
            <dt className={`text-caption font-semibold uppercase tracking-[0.14em] max-[359px]:tracking-[0.06em] ${PRIZE_CARD.labelText}`}>{row.label}</dt>
            <dd className={`line-clamp-2 text-footnote ${row.tone ? TONE_CLASS[row.tone] : ""}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>

    {action ? (
      // PrizeCard ignores taps from inside [data-prize-card-action], so this never also flips the card.
      <button
        type="button"
        data-prize-card-action
        onClick={action.onPress}
        className={`tp-player-hit-target tp-player-pressable shrink-0 self-end !rounded-full !border-0 px-5 py-2.5 text-sm !font-bold ${PRIZE_CARD.action}`}
      >
        {action.label}
      </button>
    ) : null}
  </div>
);
