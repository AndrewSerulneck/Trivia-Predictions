// Client-safe Rewards feature flags. No "server-only" import and no Supabase
// dependency — kept here (mirroring lib/categoryBlitzShared.ts's flag helpers)
// so the server win engine, API routes, and the client wizard/panel UI all read
// the same flag from one place instead of hand-syncing duplicate copies.

const truthy = (value: string | undefined): boolean => {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

/**
 * Master flag for the Rewards rollout (see docs/rewards-system-plan.md §6). Off =
 * today's single-winner Challenges/Competitions behavior, fully inert; the new
 * count-based multi-winner engine, Create Reward wizard, and multi-winner card
 * states only activate when this is on. Same reversible convention as
 * NEXT_PUBLIC_DOMAIN_SPLIT_ENABLED / NEXT_PUBLIC_CATEGORY_BLITZ_GLOBAL_ROOM.
 */
export const isRewardsEnabled = (): boolean =>
  truthy(process.env.NEXT_PUBLIC_REWARDS_ENABLED);
