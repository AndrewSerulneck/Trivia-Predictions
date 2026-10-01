"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { WizardFooter } from "@/components/navigation/WizardFooter";
import { CreateRewardWizard, type CreateRewardSubmission } from "@/components/rewards/CreateRewardWizard";
import {
  EndRewardScreen,
  RewardDetailScreen,
  RewardHistoryScreen,
  RewardsListScreen,
  type RewardsLoad,
} from "@/components/owner/rewards/RewardStepScreens";
import { useDiscardGuard } from "@/components/owner/sheet/DiscardGuard";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { SlideSteps } from "@/components/owner/sheet/SlideSteps";
import type { OwnerCompetition } from "@/lib/ownerRewardDisplay";
import {
  REWARD_SLIDE_ORDER,
  rewardScreenFor,
  resolveRewardSheetStep,
  type RedemptionCounts,
  type RemoveMode,
  type RewardScreen,
} from "@/lib/ownerRewardFlow";
import {
  fetchRewardContext,
  fetchRewardPrizeCounts,
  removeReward,
  submitReward,
} from "@/lib/ownerRewardRequests";
import { getRewardDefinition } from "@/lib/rewardDefinitions";
import { isRewardWizardStep, type RewardWizardStep, type RewardWizardStepChange } from "@/lib/rewardWizardSteps";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// The Offer Rewards sheet (docs/partner-dashboard-app-redesign-plan.md §4f): the
// shared Create Reward wizard, plus the active list, one reward (with End reward)
// and ended rewards. Hosted by the dashboard, which owns the URL state
// (`useOwnerSheet`) and the rewards list; this owns the screens.
//
// THE WIZARD IS NOT FORKED. It runs with its opt-in props: `animateSteps` (sheet
// presentation), `step` / `onStepChange` (its step mirrors `?step=` so the phone's
// Back gesture steps back one question) and `onRequestSchedule` (swap to the
// Schedule sheet instead of a page load). Its answers stay inside it; it is mounted
// while a wizard step is showing, and the dashboard mounts this whole flow with a
// fresh `key` on every open so a new reward never inherits old answers.
//
// HISTORY. Every forward move is a history entry, exactly like ScheduleGameFlow:
// the in-sheet Back and the phone's Back gesture are the same thing.

export type RewardsChange = {
  /** What to tell the partner, e.g. "Live Trivia Challenge reward created". */
  message: string;
  /** The reward was ended (archived or deleted): nothing to ring. */
  removed?: boolean;
};

type EndingState = { counts: RedemptionCounts | null; error: string | null; busy: boolean };

const IDLE_ENDING: EndingState = { counts: null, error: null, busy: false };

export const RewardsFlow = ({
  venueId,
  venueName,
  nav,
  rewards,
  initialReward,
  onChanged,
  onRequestSchedule,
}: {
  venueId: string;
  venueName: string;
  nav: UseOwnerSheetResult;
  rewards: RewardsLoad;
  /** The reward the partner tapped on the dashboard, if any. */
  initialReward: OwnerCompetition | null;
  /** A reward was created or removed: refetch the list and tell the partner. */
  onChanged: (change: RewardsChange) => void;
  /** The wizard's "Schedule Live Trivia" link: the host swaps to the Schedule sheet. */
  onRequestSchedule: () => void;
}) => {
  const [selected, setSelected] = useState<OwnerCompetition | null>(initialReward);
  const [ending, setEnding] = useState<EndingState>(IDLE_ENDING);
  // Set when the wizard was opened from the list, so its Cancel returns there instead of closing.
  const [addedFromList, setAddedFromList] = useState(false);
  // Which reward definition the partner submitted, for the confirmation line. A ref, not state:
  // the wizard calls onCreated from the click's closure, which predates any state set in onSubmit.
  const submittedDefinitionId = useRef<string | null>(null);
  // Which reward's End screen is showing: a prize-count reply for any other is ignored.
  const endingRewardId = useRef<string | null>(null);
  // A reward was ended: once the sheet has slid away, start over, so the browser's
  // Forward can't reopen a spent End screen stuck busy. (The wizard needs no reset: it
  // lives inside the sheet, which unmounts it after the exit.)
  const [finished, setFinished] = useState(false);

  const open = nav.sheet === "rewards";
  const rawStep = nav.displayStepFor("rewards");
  const step = resolveRewardSheetStep({ rawStep, hasReward: selected !== null });
  const screen = rewardScreenFor(step);

  // The wizard step to render, held while another pane is on its way in or out
  // (SlideSteps renders the outgoing pane live for its exit).
  const [wizardStep, setWizardStep] = useState<RewardWizardStep>("definition");
  if (isRewardWizardStep(step) && step !== wizardStep) setWizardStep(step);

  // A stale or hand-edited `?step=` (or one whose reward a reload lost) is corrected: popped back
  // to the screen under it when this sheet pushed one, so no screen gets two entries (F3).
  const urlStep = nav.step;
  const correctStep = nav.correctStep;
  useEffect(() => {
    if (open && urlStep !== null && urlStep !== step) correctStep(step);
  }, [open, urlStep, step, correctStep]);

  const venues = useMemo(() => [{ id: venueId, name: venueName }], [venueId, venueName]);

  // The wizard keeps its answers inside itself, so "has the partner entered anything?" is
  // wizard-agnostic: past the Definition step (they picked a reward and are answering questions).
  const { closeGuard, dialog, closeWithoutAsking } = useDiscardGuard({
    open,
    dirty: open && screen === "wizard" && step !== "definition",
    title: "Discard this reward?",
    message: "Nothing is saved until you create it.",
    onDiscard: nav.closeSheet,
  });

  const go = (target: string) => nav.goToStep(target);

  const openReward = (reward: OwnerCompetition) => {
    setSelected(reward);
    go("detail");
  };

  const startEnding = (reward: OwnerCompetition) => {
    setSelected(reward);
    setEnding(IDLE_ENDING);
    endingRewardId.current = reward.id;
    go("end");
    fetchRewardPrizeCounts(reward.id).then(
      (counts) => {
        if (endingRewardId.current === reward.id) setEnding((prev) => ({ ...prev, counts }));
      },
      (err: unknown) => {
        if (endingRewardId.current !== reward.id) return;
        setEnding((prev) => ({
          ...prev,
          error: err instanceof Error ? err.message : "Couldn't check this reward's prizes.",
        }));
      },
    );
  };

  const performRemove = async (mode: RemoveMode) => {
    if (!selected || ending.busy) return;
    setEnding((prev) => ({ ...prev, busy: true, error: null }));
    try {
      const message = await removeReward(selected.id, mode);
      onChanged({ message, removed: true });
      setFinished(true);
      closeWithoutAsking();
    } catch (err) {
      setEnding((prev) => ({
        ...prev,
        busy: false,
        error: err instanceof Error ? err.message : "Couldn't remove that reward.",
      }));
    }
  };

  const handleWizardStep = (next: RewardWizardStep, change: RewardWizardStepChange) => {
    if (change === "forward") nav.goToStep(next);
    else if (change === "back") nav.goBack(next);
    else nav.correctStep(next); // "replace" = the wizard corrected a step whose data a reload lost
  };

  const renderScreen = (id: RewardScreen): ReactNode => {
    switch (id) {
      case "all":
        return (
          <RewardsListScreen
            rewards={rewards}
            onOpen={openReward}
            onAdd={() => {
              setAddedFromList(true);
              go("definition");
            }}
            onOpenHistory={() => go("history")}
          />
        );
      case "detail":
        return selected ? <RewardDetailScreen reward={selected} onEnd={() => startEnding(selected)} /> : null;
      case "end":
        return selected ? (
          <EndRewardScreen
            name={selected.name}
            counts={ending.counts}
            busy={ending.busy}
            error={ending.error}
            onArchive={() => void performRemove("archive")}
            onDelete={() => void performRemove("delete")}
          />
        ) : null;
      case "history":
        return <RewardHistoryScreen rewards={rewards} />;
      case "wizard":
        return (
          <CreateRewardWizard
            variant="owner"
            venues={venues}
            defaultVenueId={venueId}
            scheduleLinkHref="/owner/dashboard?sheet=schedule"
            fetchContext={fetchRewardContext}
            onSubmit={async (submission: CreateRewardSubmission) => {
              submittedDefinitionId.current = submission.definitionId;
              return submitReward(submission);
            }}
            onCreated={() => {
              const definitionId = submittedDefinitionId.current;
              const name = definitionId ? getRewardDefinition(definitionId)?.name : null;
              onChanged({ message: name ? `${name} reward created` : "Reward created" });
              closeWithoutAsking();
            }}
            onCancel={() => (addedFromList ? nav.goBack("all") : closeWithoutAsking())}
            animateSteps
            // The swap to Schedule is the flow's own move, not a Back: don't ask.
            onRequestSchedule={() => closeWithoutAsking(onRequestSchedule)}
            step={wizardStep}
            onStepChange={handleWizardStep}
          />
        );
    }
  };

  // The wizard carries its own inline footers; the other screens get a plain Back.
  const backTo: Partial<Record<RewardScreen, string>> = { detail: "all", end: "detail", history: "all" };
  const backTarget = backTo[screen];
  const footer: ReactNode = backTarget ? (
    <WizardFooter variant="inline" tone="dark" onBack={() => nav.goBack(backTarget)} />
  ) : undefined;

  const resetIfFinished = () => {
    if (!finished) return;
    endingRewardId.current = null;
    setEnding(IDLE_ENDING);
    setSelected(null);
    setAddedFromList(false);
    setFinished(false);
  };

  return (
    <>
      <OwnerSheet
        open={open}
        onRequestClose={nav.closeSheet}
        closeGuard={closeGuard}
        onExited={resetIfFinished}
        title={screen === "wizard" ? "Offer a reward" : "Rewards"}
        footer={footer}
        // `step`, not `screen`: the wizard slides its own steps inside one pane, and each starts at the top too.
        scrollKey={step}
      >
        <SlideSteps steps={REWARD_SLIDE_ORDER} current={screen} renderStep={renderScreen} />
      </OwnerSheet>
      {dialog}
    </>
  );
};
