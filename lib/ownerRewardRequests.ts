import type { CreateRewardSubmission, RewardCreationContextDTO } from "@/components/rewards/CreateRewardWizard";
import type { RedemptionCounts, RemoveMode } from "@/lib/ownerRewardFlow";
import { removeOutcomeMessage } from "@/lib/ownerRewardFlow";

// The Partner Dashboard's reward requests, moved out of the old
// app/owner/competitions/page.tsx unchanged in behaviour. Client-side fetch
// wrappers over the existing /api/owner/* routes; nothing new is called.

/** The venue's schedule as the wizard needs it for one reward definition. */
export const fetchRewardContext = async (venueId: string, definitionId: string): Promise<RewardCreationContextDTO> => {
  const res = await fetch(
    `/api/owner/rewards/context?venueId=${encodeURIComponent(venueId)}&definitionId=${encodeURIComponent(definitionId)}`,
    { cache: "no-store" },
  );
  const json = (await res.json()) as { ok: boolean; context?: RewardCreationContextDTO; error?: string };
  if (!json.ok || !json.context) throw new Error(json.error ?? "Couldn't check that game's schedule.");
  return json.context;
};

export const submitReward = async (
  submission: CreateRewardSubmission,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  const res = await fetch("/api/owner/rewards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(submission),
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  if (!json.ok) return { ok: false, error: json.error ?? "Couldn't create that reward." };
  return { ok: true };
};

/** The prize counts the remove choice is made on — "delete anyway" is only fair if the partner sees its cost. */
export const fetchRewardPrizeCounts = async (id: string): Promise<RedemptionCounts> => {
  const res = await fetch(`/api/owner/competitions/${id}`, { cache: "no-store" });
  const json = (await res.json()) as { ok: boolean; counts?: RedemptionCounts; error?: string };
  if (!json.ok || !json.counts) throw new Error(json.error ?? "Couldn't check this reward's prizes.");
  return json.counts;
};

/** Archive or delete a reward; resolves to the sentence to show the partner. */
export const removeReward = async (id: string, mode: RemoveMode): Promise<string> => {
  const res = await fetch(`/api/owner/competitions/${id}?mode=${mode}`, { method: "DELETE" });
  const json = (await res.json()) as {
    ok: boolean;
    error?: string;
    outcome?: "archived" | "deleted";
    redeemedKept?: number;
  };
  if (!json.ok) throw new Error(json.error ?? "Couldn't remove that reward.");
  return removeOutcomeMessage(json.outcome, json.redeemedKept);
};
