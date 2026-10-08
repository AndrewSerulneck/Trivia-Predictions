import { RewardRow } from "@/components/owner/rewards/RewardRow";
import type { SectionLoad } from "@/components/owner/dashboard/LiveGamesSection";
import { StepHeading } from "@/components/owner/sheet/StepHeading";
import type { RedemptionCounts } from "@/lib/ownerRewardFlow";
import {
  formatDateLabel,
  formatTimeLabel,
  rewardTermsText,
  splitCompetitions,
  type OwnerCompetition,
} from "@/lib/ownerRewardDisplay";
import type { ChallengeLeaderboardEntry } from "@/types";

// The screens around the Create Reward wizard inside the Rewards sheet
// (docs/partner-dashboard-app-redesign-plan.md §4f): the active list, one
// reward, ending it, and ended rewards. Presentational — RewardsFlow owns state.

const TEXT_LINK_CLASS = "min-h-11 px-2 text-sm font-black text-ht-cyan-300 underline-offset-2 hover:underline";
const EMPTY_CLASS =
  "rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3 py-4 text-center text-sm font-semibold text-ht-muted";

export type RewardsLoad = SectionLoad<OwnerCompetition>;

const RewardsUnavailable = ({ load }: { load: RewardsLoad }) => (
  <p className={EMPTY_CLASS}>
    {load.status === "error" ? load.message : "Loading your rewards…"}
  </p>
);

/** Every active reward, with "offer another" and the ended-rewards entry. */
export const RewardsListScreen = ({
  rewards,
  onOpen,
  onAdd,
  onOpenHistory,
}: {
  rewards: RewardsLoad;
  onOpen: (competition: OwnerCompetition) => void;
  onAdd: () => void;
  onOpenHistory: () => void;
}) => {
  const active = rewards.status === "ready" ? splitCompetitions(rewards.items).active : [];
  return (
    <div className="space-y-3">
      <StepHeading>Your rewards</StepHeading>
      {rewards.status !== "ready" ? (
        <RewardsUnavailable load={rewards} />
      ) : active.length === 0 ? (
        <p className={EMPTY_CLASS}>No rewards running.</p>
      ) : (
        <ul className="space-y-2">
          {active.map((competition) => (
            <li key={competition.id}>
              <RewardRow competition={competition} onClick={() => onOpen(competition)} />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="min-h-12 w-full rounded-[14px] border-2 border-dashed border-ht-soft px-4 py-3 text-sm font-black text-ht-cyan-300 transition active:translate-y-px"
      >
        + Offer another reward
      </button>
      <div className="flex justify-center">
        <button type="button" onClick={onOpenHistory} className={TEXT_LINK_CLASS}>
          Ended rewards
        </button>
      </div>
    </div>
  );
};

/** Ended rewards, read-only — an ended reward can't be edited or removed again. */
export const RewardHistoryScreen = ({ rewards }: { rewards: RewardsLoad }) => {
  const ended = rewards.status === "ready" ? splitCompetitions(rewards.items).ended : [];
  return (
    <div className="space-y-3">
      <StepHeading>Ended rewards</StepHeading>
      {rewards.status !== "ready" ? (
        <RewardsUnavailable load={rewards} />
      ) : ended.length === 0 ? (
        <p className={EMPTY_CLASS}>No ended rewards yet.</p>
      ) : (
        <ul className="space-y-2">
          {ended.map((competition) => (
            <li key={competition.id}>
              <RewardRow competition={competition} ended />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="py-2.5">
    <p className="text-caption font-black uppercase tracking-wider text-ht-muted">{label}</p>
    <p className="font-bold text-ht-primary">{value}</p>
  </div>
);

/** One reward: its terms, dates and top progress, and End reward. */
export const RewardDetailScreen = ({
  reward,
  onEnd,
}: {
  reward: OwnerCompetition;
  onEnd: () => void;
}) => {
  const terms = rewardTermsText(reward);
  const timezone = "America/New_York"; // display-only fallback; the engine stores naive local strings
  const topEntries: ChallengeLeaderboardEntry[] = reward.leaderboard?.topEntries ?? [];
  const isEnded = !reward.isActive || Boolean(reward.winnerUserId);

  return (
    <div className="space-y-4">
      <StepHeading>{reward.name}</StepHeading>

      <div className="divide-y divide-ht-hairline rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3">
        {terms ? <DetailRow label="Terms" value={terms} /> : null}
        <DetailRow
          label="Runs"
          value={`${formatDateLabel(reward.startDate, timezone)} ${formatTimeLabel(reward.startTime)} – ${formatDateLabel(reward.endDate, timezone)} ${formatTimeLabel(reward.endTime)}`}
        />
        <DetailRow label="How it's won" value={reward.challengeMode === "progress" ? "Progress" : "Leaderboard"} />
      </div>

      {topEntries.length > 0 ? (
        <div className="space-y-1 rounded-xl border border-ht-hairline bg-ht-elevated/40 p-3">
          <p className="text-caption font-black uppercase tracking-wider text-ht-muted">Top players</p>
          {topEntries.slice(0, 3).map((entry) => (
            <div key={entry.userId} className="flex items-center justify-between text-xs">
              <span className="font-bold text-ht-secondary">
                #{entry.rank} {entry.username}
              </span>
              <span className="font-black text-ht-primary">{entry.points} pts</span>
            </div>
          ))}
        </div>
      ) : null}

      {isEnded ? (
        reward.winnerUsername ? (
          <div className="rounded-xl bg-ht-emerald-500/10 px-3 py-2 text-xs font-bold text-ht-emerald-300">
            🏆 Winner: {reward.winnerUsername}
          </div>
        ) : null
      ) : (
        <button
          type="button"
          onClick={onEnd}
          className="min-h-11 w-full rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 text-sm font-black text-ht-rose-300 transition active:translate-y-px"
        >
          End reward
        </button>
      )}
    </div>
  );
};

/**
 * The remove-reward choice (was RemoveRewardDialog on the old Rewards page, same
 * words). Archiving and deleting are genuinely different outcomes for prizes
 * players are holding, so both are offered with the cost of each spelled out —
 * not a single "are you sure?" that silently picks one. Archive is first and
 * primary because it is the recoverable one; deleting is available, just never
 * the accidental path. `counts: null` = still loading them.
 */
export const EndRewardScreen = ({
  name,
  counts,
  busy,
  error,
  onArchive,
  onDelete,
}: {
  name: string;
  counts: RedemptionCounts | null;
  busy: boolean;
  error: string | null;
  onArchive: () => void;
  onDelete: () => void;
}) => {
  const loading = counts === null && error === null;
  const disabled = counts === null || busy;

  return (
    <div className="space-y-4">
      <div>
        <h3 data-step-heading className="ht-h2 outline-none">
          Remove &ldquo;{name}&rdquo;?
        </h3>
        {loading ? (
          <p className="mt-2 text-sm font-semibold text-ht-muted">Checking prizes…</p>
        ) : counts === null ? null : counts.awarded === 0 ? (
          <p className="mt-2 text-sm font-semibold text-ht-muted">
            No prizes have been awarded from this reward yet, so nothing players hold is affected.
          </p>
        ) : (
          <p className="mt-2 text-sm font-semibold text-ht-muted">
            This reward has awarded <span className="font-black text-ht-primary">{counts.awarded}</span>{" "}
            {counts.awarded === 1 ? "prize" : "prizes"}
            {counts.unredeemed > 0 ? (
              <>
                , and <span className="font-black text-ht-amber-300">{counts.unredeemed}</span>{" "}
                {counts.unredeemed === 1 ? "is" : "are"} still unredeemed in{" "}
                {counts.unredeemed === 1 ? "a player's" : "players'"} wallet
                {counts.unredeemed === 1 ? "" : "s"}.
              </>
            ) : (
              ", all of which have already been redeemed."
            )}
          </p>
        )}
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300"
        >
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        <button
          type="button"
          onClick={onArchive}
          disabled={disabled}
          className="min-h-11 w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition active:translate-y-px disabled:opacity-60"
        >
          Archive — stop it, keep prizes
        </button>
        <p className="px-1 text-caption font-semibold text-ht-muted">
          The reward stops running. Every prize already awarded still works.
        </p>

        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="mt-3 min-h-11 w-full rounded-xl border border-ht-rose-500/40 bg-ht-rose-500/10 px-4 py-3 text-sm font-black text-ht-rose-300 transition active:translate-y-px disabled:opacity-60"
        >
          Delete anyway
        </button>
        <p className="px-1 text-caption font-semibold text-ht-muted">
          {!counts || counts.unredeemed === 0
            ? "Removes the reward for good. Prizes already redeemed stay in your records."
            : `Removes the reward for good and voids ${counts.unredeemed} unredeemed ${counts.unredeemed === 1 ? "prize" : "prizes"}. Prizes already redeemed stay in your records.`}
        </p>
      </div>
    </div>
  );
};
