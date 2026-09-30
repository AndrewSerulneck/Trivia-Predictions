import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Static tripwire for the Partner Dashboard body (redesign plan Phase 3).
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const dashboard = read("app/owner/dashboard/page.tsx");

describe("owner dashboard body", () => {
  it("no longer renders the six placeholder tiles", () => {
    expect(dashboard).not.toContain("tiles");
    expect(dashboard).not.toContain("Run your room");
  });

  it("wraps the useOwnerSheet consumer in Suspense (Next 16 useSearchParams rule)", () => {
    expect(dashboard).toMatch(/<Suspense[\s\S]*<DashboardBody/);
    expect(dashboard).toContain("useOwnerSheet");
  });

  it("loads schedules and rewards for the selected venue, in separate parallel effects", () => {
    expect(dashboard).toContain("/api/owner/schedule?venueId=");
    expect(dashboard).toContain("/api/owner/competitions?venueId=");
    expect(dashboard).toMatch(/<DashboardBody key=\{selectedVenueId\}/);
  });

  it("keeps the list helpers in lib/, not in the pages", () => {
    for (const page of ["app/owner/schedule/page.tsx", "app/owner/competitions/page.tsx"]) {
      const src = read(page);
      expect(src).not.toMatch(/function (displayWindow|recurrenceLabel|dateChip|glyphForCompetition)\b/);
    }
    expect(read("components/owner/schedule/ScheduleGameRow.tsx")).toContain("@/lib/ownerScheduleDisplay");
    expect(read("components/owner/schedule/ScheduleGameFlow.tsx")).toContain("@/lib/ownerScheduleForm");
    expect(read("components/owner/rewards/RewardRow.tsx")).toContain("@/lib/ownerRewardDisplay");
    expect(read("components/owner/rewards/RewardStepScreens.tsx")).toContain("@/lib/ownerRewardDisplay");
  });

  it("/owner/schedule redirects to the open sheet (server component, no proxy change)", () => {
    const page = read("app/owner/schedule/page.tsx");
    expect(page).not.toContain('"use client"');
    expect(page).toContain('redirect("/owner/dashboard?sheet=schedule")');
  });

  it("/owner/competitions redirects to the open Rewards sheet (server component, no proxy change)", () => {
    const page = read("app/owner/competitions/page.tsx");
    expect(page).not.toContain('"use client"');
    expect(page).toContain('redirect("/owner/dashboard?sheet=rewards")');
    expect(page).not.toContain("CreateRewardWizard");
  });

  it("the dashboard hosts the rewards flow, one fresh instance per open, and no placeholder sheet", () => {
    expect(dashboard).toMatch(/<RewardsFlow\s+key=\{rewardsSession\}/);
    expect(dashboard).not.toContain("Coming soon");
    expect(dashboard).not.toContain("<OwnerSheet");
  });

  it("the Rewards sheet runs the shared wizard with its opt-in props, never a fork", () => {
    const flow = read("components/owner/rewards/RewardsFlow.tsx");
    expect(flow).toContain('import { CreateRewardWizard');
    expect(flow).toMatch(/<CreateRewardWizard[\s\S]*animateSteps[\s\S]*onRequestSchedule=/);
    // The admin host passes none of them: its markup must stay exactly as it was.
    const admin = read("components/admin/sections/ChallengesSection.tsx");
    for (const prop of ["animateSteps", "onRequestSchedule", "onStepChange"]) expect(admin).not.toContain(prop);
  });

  it("the dashboard hosts the schedule flow, one fresh instance per open", () => {
    expect(dashboard).toMatch(/<ScheduleGameFlow\s+key=\{scheduleSession\}/);
    expect(dashboard).not.toContain("SHEET_TITLES");
  });

  it("uses the plan's empty-state copy", () => {
    const live = read("components/owner/dashboard/LiveGamesSection.tsx");
    const rewards = read("components/owner/dashboard/RewardsSection.tsx");
    expect(live).toContain("Schedule a live game");
    expect(live).toContain("Pick a game and a time. Your whole room plays together.");
    expect(rewards).toContain("Offer your guests a reward");
    expect(rewards).toContain("+ Offer another reward");
  });

  it("Phase 6: confirmations are a toast + ring; only the server advisory stays a banner", () => {
    expect(dashboard).toContain("<DashboardToast");
    expect(dashboard).toContain("highlightId={highlightId}");
    expect(dashboard).toContain("HIGHLIGHT_MS");
    expect(read("components/owner/dashboard/DashboardNotice.tsx")).not.toContain("success:");
  });

  it("Phase 6: both flows guard Close with the discard prompt (no drafts saved)", () => {
    for (const file of ["components/owner/schedule/ScheduleGameFlow.tsx", "components/owner/rewards/RewardsFlow.tsx"]) {
      const src = read(file);
      expect(src).toContain("useDiscardGuard");
      expect(src).toMatch(/closeGuard=\{closeGuard\}/);
    }
  });

  it("Phase 6: the dashed add-cards use a border that clears 3:1 against the card", () => {
    const card = read("components/owner/dashboard/DashboardSectionCard.tsx");
    expect(card).not.toContain("border-ht-soft");
    expect(card.match(/!border-dashed !border-slate-500/g)).toHaveLength(2);
  });

  it("Phase 6: the first-visit ☰ pulse respects reduced motion", () => {
    const bar = read("components/owner/OwnerAppBar.tsx");
    expect(bar).toContain("motion-safe:animate-");
    expect(bar).toContain("motion-reduce:hidden");
  });

  it("Phase 6: the Partner Manual describes the new navigation, not the old buttons", () => {
    const manual = read("lib/partnerManual.ts");
    expect(manual).toContain("tap the logo in the top-left");
    expect(manual).toContain("Tap Offer Rewards on your dashboard");
    expect(manual).not.toMatch(/[Cc]lick/);
  });
});
