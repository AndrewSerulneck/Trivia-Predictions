import {
  DashboardSectionCard,
  SectionAddRow,
  SectionEmpty,
  SectionError,
  SectionSeeAll,
  SectionSkeleton,
} from "@/components/owner/dashboard/DashboardSectionCard";
import { DASHBOARD_LIST_LIMIT, type SectionLoad } from "@/components/owner/dashboard/LiveGamesSection";
import {
  glyphForCompetition,
  rewardTermsText,
  splitCompetitions,
  type OwnerCompetition,
} from "@/lib/ownerRewardDisplay";

export const RewardsSection = ({
  load,
  onAdd,
  onOpen,
  onRetry,
}: {
  load: SectionLoad<OwnerCompetition>;
  /** Opens the (Phase 5) rewards sheet on a new reward. */
  onAdd: () => void;
  /** Opens the rewards sheet on an existing reward, or on the full list when omitted. */
  onOpen: (competition?: OwnerCompetition) => void;
  onRetry: () => void;
}) => {
  const active = load.status === "ready" ? splitCompetitions(load.items).active : [];
  const shown = active.slice(0, DASHBOARD_LIST_LIMIT);
  const ready = load.status === "ready";

  return (
    <DashboardSectionCard
      glyph="🏆"
      accentClassName="bg-ht-game-pickem"
      title="Offer Rewards"
      addLabel={ready && active.length > 0 ? "Offer a reward" : undefined}
      onAdd={onAdd}
    >
      {load.status === "loading" ? <SectionSkeleton label="Loading rewards" /> : null}
      {load.status === "error" ? <SectionError message={load.message} onRetry={onRetry} /> : null}
      {ready && active.length === 0 ? (
        <SectionEmpty
          title="Offer your guests a reward"
          hint="Give a prize to top players, like a free appetizer for tonight's trivia winner."
          onAdd={onAdd}
        />
      ) : null}
      {ready && active.length > 0 ? (
        <>
          <ul className="space-y-2">
            {shown.map((competition) => {
              const terms = rewardTermsText(competition);
              return (
                <li key={competition.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(competition)}
                    className="flex w-full items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-elevated/40 p-3 text-left transition active:translate-y-px"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ht-game-pickem text-lg">
                      {glyphForCompetition(competition)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-black text-ht-primary">{competition.name}</div>
                      {terms ? <div className="mt-0.5 text-xs font-semibold text-ht-muted">{terms}</div> : null}
                    </div>
                    <span className="shrink-0 text-lg text-slate-500" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {active.length > DASHBOARD_LIST_LIMIT ? (
            <SectionSeeAll count={active.length} onClick={() => onOpen()} />
          ) : null}
          <SectionAddRow label="+ Offer another reward" onAdd={onAdd} />
        </>
      ) : null}
    </DashboardSectionCard>
  );
};
