import { readdirSync, readFileSync } from "node:fs";
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
    expect(dashboard).toMatch(/<DashboardBody\s+key=\{selectedVenueId\}/);
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
    expect(dashboard).toMatch(/<RewardsFlow\s+key=\{`rewards-\$\{rewardsSession\}`\}/);
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
    expect(dashboard).toMatch(/<ScheduleGameFlow\s+key=\{`schedule-\$\{scheduleSession\}`\}/);
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
    // Keyed per change, not by text: a second identical confirmation needs a fresh timer.
    expect(dashboard).toContain("key={toast.id}");
    expect(dashboard).not.toContain("key={toast.message}");
  });

  it("Review: the flows' own closes skip the Back-gesture prompt; the user's closes stay guarded", () => {
    for (const file of ["components/owner/schedule/ScheduleGameFlow.tsx", "components/owner/rewards/RewardsFlow.tsx"]) {
      const src = read(file);
      expect(src).toContain("closeWithoutAsking");
      expect(src).toMatch(/onRequestClose=\{nav\.closeSheet\}/);
      // Only the guard's own onDiscard and the sheet's onRequestClose may call closeSheet directly.
      expect(src.match(/nav\.closeSheet/g)).toHaveLength(2);
    }
  });

  it("Join Merch: the store is hosted by the PAGE in its own Suspense, outside the venue body (Phase 4.1, F2)", () => {
    const body = dashboard.slice(dashboard.indexOf("const DashboardBody"), dashboard.indexOf("type MerchStoreHostProps"));
    expect(body).not.toContain("MerchStoreSheet");
    expect(body).not.toMatch(/merch/i);
    expect(dashboard).toMatch(/const MerchStoreHost[\s\S]*useOwnerSheet\(\)[\s\S]*<MerchStoreSheet\s+nav=\{sheet\}/);
    const page = dashboard.slice(dashboard.indexOf("const OwnerDashboardPage"));
    // Rendered on every branch (loading / no venue / venue): after the conditional, not
    // inside it. (Phase 4 wrapped the venue body in the reveal div — still a sibling.)
    expect(page).toMatch(/<\/Suspense>\s*<\/div>\s*\)\s*:\s*null\}\s*<Suspense fallback=\{null\}>\s*<MerchStoreHost/);
    expect(page).toContain("venue={selectedVenue ?? null}");
    expect(page).toContain("venueLoading={loading}");
  });

  it("Join Merch: the page owns one cart PER VENUE, so a venue switch never moves a cart (Phase 4.1, F1)", () => {
    const page = dashboard.slice(dashboard.indexOf("const OwnerDashboardPage"));
    expect(page).toContain("useVenueMerchCart(selectedVenue?.id ?? null)");
    expect(dashboard).not.toContain("useState<MerchCart>");
  });

  it("Join Merch: the store is EXEMPT from the discard prompt (closing never loses the cart) and look-only", () => {
    const store = read("components/owner/store/MerchStoreSheet.tsx");
    expect(store).toContain('tone="light"');
    // URL-driven: open exactly when ?sheet=store (hoisted into `open` since Phase 3).
    expect(store).toMatch(/const open = nav\.sheet === "store";/);
    expect(store).toMatch(/open=\{open\}/);
    expect(store).toMatch(/onRequestClose=\{nav\.closeSheet\}/);
    expect(store).not.toContain("useDiscardGuard");
    expect(store).not.toContain("closeGuard");
    for (const entry of readdirSync(join(process.cwd(), "components/owner/store"), { recursive: true })) {
      const rel = `components/owner/store/${String(entry)}`;
      if (!/\.tsx?$/.test(rel)) continue;
      expect(read(rel), rel).not.toContain("fetch(");
    }
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
    expect(manual).toContain("tap the arrow in the top-left");
    expect(manual).toContain("Tap Offer Rewards on your dashboard");
    expect(manual).not.toMatch(/[Cc]lick/);
  });
});

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 5 (finding F4): the
// first paint was HTML -> JS -> /api/owner/venues -> THEN schedule + competitions.
// Three invocations, three `requireOwnerAuth` calls, 9 queries. Now: one call.
describe("Phase 5: the dashboard's first load is one round trip", () => {
  const page = dashboard.slice(dashboard.indexOf("const OwnerDashboardPage"));
  const body = dashboard.slice(dashboard.indexOf("const DashboardBody"), dashboard.indexOf("type MerchStoreHostProps"));

  it("fetches /api/owner/dashboard from the page, and never the venues route", () => {
    expect(page).toContain('fetch("/api/owner/dashboard"');
    // The three-call sequence is what this phase removed.
    expect(dashboard).not.toContain("/api/owner/venues");
  });

  it("hands both section lists to DashboardBody as a seed for the venue they belong to", () => {
    expect(page).toContain("initial={initialLists}");
    // A seed from another venue must never be adopted: the body is keyed by venue.
    expect(body).toContain("initial && initial.venueId === venueId ? initial : null");
  });

  it("suppresses only the FIRST per-list fetch, so Retry and the post-save refetch still work", () => {
    expect(body).toContain("if (prefetched && gamesAttempt === 0) return;");
    expect(body).toContain("if (prefetched && rewardsAttempt === 0) return;");
    // Still present, still the path a Retry / venue switch / post-save refetch takes.
    expect(body).toContain("/api/owner/schedule?venueId=");
    expect(body).toContain("/api/owner/competitions?venueId=");
  });

  it("still lifts the loader through onReady, which a seeded body satisfies at mount", () => {
    expect(body).toMatch(/games\.status !== "loading" && rewards\.status !== "loading"/);
    expect(body).toContain("if (sectionsAnswered) onReady();");
  });
});

describe("Phase 5: GET /api/owner/dashboard", () => {
  const route = read("app/api/owner/dashboard/route.ts");

  it("runs requireOwnerAuth exactly once", () => {
    expect(route.match(/requireOwnerAuth\(/g)).toHaveLength(1);
  });

  it("shares the venue query and the display_name fallback with /api/owner/venues", () => {
    // One copy of the query, or the switcher can disagree with itself depending on
    // which route filled it.
    for (const file of ["app/api/owner/dashboard/route.ts", "app/api/owner/venues/route.ts"]) {
      const src = read(file);
      expect(src, file).toContain('from "@/lib/ownerVenueList"');
      expect(src, file).not.toContain("display_name");
      expect(src, file).not.toContain('.from("venues")');
    }
    expect(read("lib/ownerVenueList.ts")).toContain("display_name ?? v.name");
  });

  it("reuses the shared listers rather than copying their queries", () => {
    expect(route).toContain('from "@/lib/ownerSchedule"');
    expect(route).toContain('from "@/lib/ownerCompetitions"');
    expect(route).toContain("listOwnerSchedules(venueId)");
    expect(route).toContain("listOwnerCompetitions(auth.ownerId, venueId)");
  });

  it("gates an attacker-supplied venueId on the shared ownsVenue predicate", () => {
    expect(route).toContain("ownsVenue(auth, requestedVenueId)");
    // Never hand-rolled: `venueIds.includes` at a call site is the bug this avoids.
    expect(route).not.toContain("venueIds.includes");
  });

  it("loads the two lists in parallel, each with its own ok/error", () => {
    expect(route).toContain("Promise.all");
    expect(route).toMatch(/type ListPayload<T> = \{ ok: true; items: T\[\] \} \| \{ ok: false; error: string \}/);
  });
});
