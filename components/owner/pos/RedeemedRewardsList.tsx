"use client";

import { useEffect, useState } from "react";
import { HightopLoader } from "@/components/ui/HightopLoader";
import type { RedeemedReward, RedeemedRewardHow } from "@/lib/pos/redeemedRewards";

// "Rewards redeemed" — newest 50 at this venue (docs/pos-rewards-integration-plan.md Phase 2f).
// One request when it mounts, no polling. A Square gift card row reads "Square gift card":
// it means the coupon became a card, so the amount/balance/last-used come from Square's webhooks.

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rewards: RedeemedReward[] };

const HOW_LABEL: Record<RedeemedRewardHow, string> = {
  guest_confirm: "Confirmed by guest",
  square_gift_card: "Square gift card",
  other: "Register",
};

const money = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

const when = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const cardLine = (reward: RedeemedReward): string | null => {
  if (reward.how !== "square_gift_card") return null;
  const parts: string[] = [];
  if (reward.amountCents !== null) parts.push(money(reward.amountCents));
  if (reward.balanceCents !== null) parts.push(`${money(reward.balanceCents)} left`);
  parts.push(reward.lastUsedAt ? `last used ${when(reward.lastUsedAt)}` : "not used yet");
  return parts.join(" · ");
};

export const RedeemedRewardsList = ({ venueId }: { venueId: string }) => {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/owner/pos/redeemed?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; rewards?: RedeemedReward[] };
        if (cancelled) return;
        setState(res.ok && json.ok && Array.isArray(json.rewards) ? { status: "ready", rewards: json.rewards } : { status: "error" });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  return (
    <section aria-label="Rewards redeemed" className="space-y-2 rounded-xl border border-ht-hairline bg-ht-elevated/50 p-4">
      <p className="font-black text-ht-primary">Rewards redeemed</p>
      {state.status === "loading" ? <HightopLoader size="sm" delayMs={0} className="py-4" /> : null}
      {state.status === "error" ? (
        <p className="text-sm font-semibold text-ht-muted">Couldn&apos;t load redeemed rewards. Close and reopen to try again.</p>
      ) : null}
      {state.status === "ready" && state.rewards.length === 0 ? (
        <p className="text-sm font-semibold text-ht-muted">No rewards have been redeemed here yet.</p>
      ) : null}
      {state.status === "ready" && state.rewards.length > 0 ? (
        <ul className="divide-y divide-ht-hairline">
          {state.rewards.map((reward) => {
            const card = cardLine(reward);
            return (
              <li key={reward.id} className="py-2">
                <p className="text-sm font-black text-ht-primary">
                  {reward.username ?? "A guest"} · {reward.prize}
                </p>
                <p className="text-xs font-semibold text-ht-muted">
                  {when(reward.redeemedAt)} · {HOW_LABEL[reward.how]}
                </p>
                {card ? <p className="text-xs font-semibold text-ht-muted">{card}</p> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};
