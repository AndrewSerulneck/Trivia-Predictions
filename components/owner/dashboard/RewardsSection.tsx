import {
  DashboardSectionCard,
  SectionAddRow,
  SectionEmpty,
  SectionError,
  SectionSeeAll,
  SectionSkeleton,
} from "@/components/owner/dashboard/DashboardSectionCard";
import { DASHBOARD_LIST_LIMIT, type SectionLoad } from "@/components/owner/dashboard/LiveGamesSection";
import { RewardRow } from "@/components/owner/rewards/RewardRow";
import { splitCompetitions, type OwnerCompetition } from "@/lib/ownerRewardDisplay";

export const RewardsSection = ({
  load,
  onAdd,
  onOpen,
  onRetry,
}: {
  load: SectionLoad<OwnerCompetition>;
  /** Opens the rewards sheet on a new reward. */
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
            {shown.map((competition) => (
              <li key={competition.id}>
                <RewardRow competition={competition} onClick={() => onOpen(competition)} />
              </li>
            ))}
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
