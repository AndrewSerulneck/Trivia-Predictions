import { highlightRingClass, useScrollWhenHighlighted } from "@/components/owner/dashboard/useHighlightRing";
import { glyphForCompetition, rewardTermsText, type OwnerCompetition } from "@/lib/ownerRewardDisplay";

// One reward as a row: glyph and name. Used by the dashboard's Rewards card and by
// the Rewards sheet's lists, so they cannot drift apart.
//
// A tappable row says only "Tap to see prize details" (Andrew, 2026-10-14: the
// full wording made the dashboard too wordy). The rules and terms live on the
// detail screen it opens (RewardDetailScreen). An ended row (History) opens
// nothing, so it keeps the guest summary and terms sentence.

export const REWARD_ROW_DETAILS_HINT = "Tap to see prize details";

export const RewardRow = ({
  competition,
  onClick,
  ended = false,
  highlighted = false,
}: {
  competition: OwnerCompetition;
  /** Omitted = not tappable (ended rewards in History). */
  onClick?: () => void;
  ended?: boolean;
  /** Just created: ringed and scrolled into view for a moment. */
  highlighted?: boolean;
}) => {
  const ref = useScrollWhenHighlighted<HTMLButtonElement & HTMLDivElement>(highlighted);
  // The guest-facing summary says what to do and what it wins; the terms sentence
  // below it still states how many prizes per period, which the summary does not.
  const summary = onClick ? null : (competition.description?.summary ?? null);
  const terms = onClick ? null : rewardTermsText(competition);
  const body = (
    <>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ht-game-pickem text-lg">
        {glyphForCompetition(competition)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black text-ht-primary">{competition.name}</div>
        {onClick ? <div className="mt-0.5 text-xs font-semibold text-ht-muted">{REWARD_ROW_DETAILS_HINT}</div> : null}
        {summary ? <div className="mt-0.5 text-xs font-semibold leading-snug text-ht-muted">{summary}</div> : null}
        {terms ? <div className="mt-0.5 text-xs font-semibold text-ht-muted">{terms}</div> : null}
        {ended && competition.winnerUsername ? (
          <div className="mt-1 text-xs font-bold text-ht-emerald-300">🏆 Winner: {competition.winnerUsername}</div>
        ) : null}
      </div>
      {onClick ? (
        <span className="shrink-0 text-lg text-slate-500" aria-hidden>
          ›
        </span>
      ) : null}
    </>
  );
  const rowClass = `flex w-full items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-elevated/40 p-3 text-left ${ended ? "opacity-70" : ""}`;

  return onClick ? (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={`${rowClass} ${highlightRingClass(highlighted)} transition active:translate-y-px`}
    >
      {body}
    </button>
  ) : (
    <div ref={ref} className={rowClass}>
      {body}
    </div>
  );
};
