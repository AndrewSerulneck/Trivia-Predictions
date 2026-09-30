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
    expect(read("app/owner/competitions/page.tsx")).toContain("@/lib/ownerRewardDisplay");
  });

  it("/owner/schedule redirects to the open sheet (server component, no proxy change)", () => {
    const page = read("app/owner/schedule/page.tsx");
    expect(page).not.toContain('"use client"');
    expect(page).toContain('redirect("/owner/dashboard?sheet=schedule")');
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
});
