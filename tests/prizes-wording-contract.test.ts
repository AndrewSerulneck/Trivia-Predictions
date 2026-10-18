import { describe, expect, it } from "vitest";
import { scanAllWording, scanSource } from "@/tests/helpers/rewardWordingScan";

// The rename "Rewards" -> "Prizes" (docs/rewards-to-prizes-rename-plan.md). On screen a partner or
// player reads PRIZE; code, routes and the database keep the word `reward`. This test scans every
// string literal, template literal and JSX text in app/, components/, lib/ and llms.txt for the
// old word. Each current hit is listed below with the phase that will reword it, or `keep`.
//
// Rules for this file:
//  - A NEW hit fails the test. Reword it (say "prize"), do not add it here.
//  - Each phase deletes its own entries when it rewords them (an entry that no longer matches
//    anything also fails, so the list can only shrink).
//  - Phase 5 removes the `phase` tags: only `keep` entries remain.

type Allowed = { file: string; text: string; phase: 2 | 3 | 4 | "keep"; reason?: string };

const ALLOWED: readonly Allowed[] = [
  {"file":"app/api/admin/route.ts","text":"reward-context","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"app/api/admin/route.ts","text":"Unknown resource. Use resource=trivia, resource=ads, resource=ads-geography, resource=ads-debug, resource=pickem-unsettled, resource=pickem-matchups, resource=predictions-pending, resource=challenge-campaigns, resource=reward-context, resource=venue-screen-sponsors, or resource=live-showdown-schedules.","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"app/api/admin/route.ts","text":"rewards","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"app/api/admin/route.ts","text":"Unknown resource. Use trivia, ads, venues, ads-track, predictions-settle, predictions-auto-settle, pickem-settle, challenge-campaigns, rewards, or live-showdown-schedules.","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"app/api/bingo/squares/route.ts","text":"Squares tagged POSSIBLE are implemented but should be validated against live feed edge cases before high-stakes rewards.","phase":"keep","reason":"server-only or developer-facing text, not shown to players or partners"},
  {"file":"app/api/cron/pickem-settle/route.ts","text":"NFL Pick 'Em reward accrual failed.","phase":"keep","reason":"server-only or developer-facing text, not shown to players or partners"},
  {"file":"app/api/cron/resolve-live-trivia-winners/route.ts","text":"Failed to resolve weekly places rewards.","phase":"keep","reason":"server-only or developer-facing text, not shown to players or partners"},
  {"file":"app/api/nfl-pickem/rewards/route.ts","text":"[NFL Pick 'Em] Error fetching rewards:","phase":"keep","reason":"server log tag, not on screen"},
  {"file":"app/info/page.tsx","text":"A per-question countdown rewards quick thinking and pulls players back to beat their best.","phase":"keep","reason":"the verb 'rewards' (plan section 2), not the feature name"},
  {"file":"app/info/page.tsx","text":"A countdown timer keeps every round high-energy — and rewards the users that think the fastest.","phase":"keep","reason":"the verb 'rewards' (plan section 2), not the feature name"},
  {"file": "app/owner/dashboard/page.tsx", "text": "rewards", "phase": "keep", "reason": "code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"app/owner/dashboard/page.tsx","text":"rewards-","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"components/admin/sections/ChallengesSection.tsx","text":"/api/admin?resource=reward-context&venueId=","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"components/admin/sections/ChallengesSection.tsx","text":"rewards","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"components/nfl-pickem/NFLPickEmLeaderboard.tsx","text":"/api/nfl-pickem/rewards?","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"components/nfl-pickem/NFLPickEmRewardBanner.tsx","text":"/api/nfl-pickem/rewards?","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file": "components/owner/results/ResultsSheet.tsx", "text": "reward", "phase": "keep", "reason": "the Results step's old URL value, read as an alias forever and never written (plan section 2)"},
  {"file":"components/owner/results/resultsApi.ts","text":"/api/owner/history/rewards/","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"components/owner/results/resultsApi.ts","text":"rewards","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"components/rewards/CreateRewardWizard.tsx","text":"reward-pos-value","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"components/rewards/CreateRewardWizard.tsx","text":"reward-gift-card-amount","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file": "lib/challengeCampaigns.ts", "text": "Failed to load ranked-place rewards.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file":"lib/challengeCampaigns.ts","text":"[rewards] prize-win notification failed after","phase":"keep","reason":"server log tag, not on screen"},
  {"file": "lib/liveTriviaRankedRewards.ts", "text": "A weekly places reward must be for exactly one venue.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file": "lib/liveTriviaRankedRewards.ts", "text": "A weekly places reward must repeat weekly.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file": "lib/liveTriviaRankedRewards.ts", "text": "A weekly places reward has no valid prize ladder.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file": "lib/liveTriviaRankedRewards.ts", "text": "A weekly places reward has no week start (active days are missing).", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file": "lib/liveTriviaRankedRewards.ts", "text": "The reward has no readable created_at.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file": "lib/liveTriviaRankedRewards.ts", "text": "Failed to plan this reward's weeks.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file": "lib/liveTriviaWinnerRewards.ts", "text": "Failed to deactivate reward.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file":"lib/nflPickEmRewardAccrual.ts","text":"Failed to load NFL picks awaiting reward accrual.","phase":"keep","reason":"server-only or developer-facing text, not shown to players or partners"},
  {"file":"lib/nflPickEmRewardAccrual.ts","text":"Failed to accrue NFL reward points.","phase":"keep","reason":"server-only or developer-facing text, not shown to players or partners"},
  {"file":"lib/nflPickEmRewardAccrual.ts","text":"[nfl-pickem-reward] accrued","phase":"keep","reason":"server log tag, not on screen"},
  {"file": "lib/nflPickEmWinnerRewards.ts", "text": "Failed to deactivate reward.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file":"lib/ownerRewardRequests.ts","text":"/api/owner/rewards/context?venueId=","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"lib/ownerRewardRequests.ts","text":"/api/owner/rewards","phase":"keep","reason":"code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"lib/pos/providers.ts","text":"Redeem prizes from Toast's own Rewards button.","phase":"keep","reason":"third-party product name (Toast's own button)"},
  {"file": "lib/rankedRewardBackfill.ts", "text": "No active, unresolved weekly places reward with id", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file": "lib/results/resultsDisplay.ts", "text": "reward", "phase": "keep", "reason": "code identifier (route, resource name, JSON key or DOM id), not on screen"},
  {"file":"lib/results/rewardPlacement.ts","text":"[Results] reward-cycle-undated","phase":"keep","reason":"server log tag, not on screen"},
  {"file":"lib/results/rewardSource.ts","text":"[Results] reward-rows-capped","phase":"keep","reason":"server log tag, not on screen"},
  {"file": "lib/rewardGameSlotCascade.ts", "text": "Failed to update reward.", "phase": "keep", "reason": "server-only or developer-facing text, not shown to players or partners"},
  {"file":"lib/rewardGameSlotCascade.ts","text":"[rewards] failed to prune game-winner slots for campaign","phase":"keep","reason":"server log tag, not on screen"},
  {"file":"lib/rewardGameSlotCascade.ts","text":"[rewards] game-winner slot cascade failed for schedule","phase":"keep","reason":"server log tag, not on screen"},
];

const keyOf = (file: string, text: string): string => `${file}\u0000${text}`;

describe("prizes wording (rename Rewards -> Prizes)", () => {
  const hits = scanAllWording();
  const allowedKeys = new Set(ALLOWED.map((entry) => keyOf(entry.file, entry.text)));
  const hitKeys = new Set(hits.map((hit) => keyOf(hit.file, hit.text)));

  it("no new on-screen text says 'reward' (say 'prize')", () => {
    const fresh = [...hitKeys].filter((key) => !allowedKeys.has(key)).map((key) => key.replace("\u0000", ": "));
    expect(fresh).toEqual([]);
  });

  it("every allow-list entry still matches a real hit (delete entries you have reworded)", () => {
    const stale = ALLOWED.filter((entry) => !hitKeys.has(keyOf(entry.file, entry.text))).map(
      (entry) => `${entry.file}: ${entry.text}`,
    );
    expect(stale).toEqual([]);
  });

  it("every `keep` entry says why", () => {
    expect(ALLOWED.filter((entry) => entry.phase === "keep" && !entry.reason)).toEqual([]);
  });

  it("the scanner sees words in strings, templates and JSX but not identifiers, imports or comments", () => {
    const source = [
      'import { x } from "@/lib/rewards";',
      "// a reward comment",
      "const rewardName = 1;",
      'const a = "Create Reward";',
      "const b = `win a reward ${rewardName}`;",
      "const c = <p>Your rewards</p>;",
      'const d = <i aria-label="reward details" />;',
    ].join("\n");
    expect(scanSource("x.tsx", source).map((hit) => hit.text)).toEqual([
      "Create Reward",
      "win a reward",
      "Your rewards",
      "reward details",
    ]);
  });
});
