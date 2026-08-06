"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { AdminSection } from "@/components/admin/adminSectionMeta";
import type { Venue } from "@/types";

// Single shared set of code-split section components (next/dynamic memoizes
// per module-scope call, so importing these from both the desktop and mobile
// shells still loads each section's chunk exactly once).
//
// Every import below MUST stay a `dynamic(() => import(...))`. A plain static
// import here defeats the split for every consumer at once — see
// `@/components/admin/adminSectionMeta` for why the metadata was separated out.

function SectionLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-sm text-slate-400">
      Loading…
    </div>
  );
}

export const AccountsSection = dynamic(
  () => import("@/components/admin/sections/AccountsSection").then((m) => m.AccountsSection),
  { loading: SectionLoading }
);
export const UsersSection = dynamic(
  () => import("@/components/admin/sections/UsersSection").then((m) => m.UsersSection),
  { loading: SectionLoading }
);
export const UserAnalyticsSection = dynamic(
  () => import("@/components/admin/sections/UserAnalyticsSection").then((m) => m.UserAnalyticsSection),
  { loading: SectionLoading }
);
export const VenuesSection = dynamic(
  () => import("@/components/admin/sections/VenuesSection").then((m) => m.VenuesSection),
  { loading: SectionLoading }
);
export const MobileVenuesSection = dynamic(
  () => import("@/components/admin/mobile/MobileVenuesSection").then((m) => m.MobileVenuesSection),
  { loading: SectionLoading }
);
export const ChallengesSection = dynamic(
  () => import("@/components/admin/sections/ChallengesSection").then((m) => m.ChallengesSection),
  { loading: SectionLoading }
);
export const SchedulesSection = dynamic(
  () => import("@/components/admin/sections/SchedulesSection").then((m) => m.SchedulesSection),
  { loading: SectionLoading }
);
export const TriviaListSection = dynamic(
  () => import("@/components/admin/sections/TriviaListSection").then((m) => m.TriviaListSection),
  { loading: SectionLoading }
);
export const TriviaPendingReviewSection = dynamic(
  () => import("@/components/admin/sections/TriviaPendingReviewSection").then((m) => m.TriviaPendingReviewSection),
  { loading: SectionLoading }
);
export const TriviaImageReviewSection = dynamic(
  () => import("@/components/admin/sections/TriviaImageReviewSection").then((m) => m.TriviaImageReviewSection),
  { loading: SectionLoading }
);
export const AdPlacementBuilder = dynamic(
  () => import("@/components/admin/AdPlacementBuilder").then((m) => m.AdPlacementBuilder),
  { loading: SectionLoading }
);
export const AdAnalyticsDashboard = dynamic(
  () => import("@/components/admin/AdAnalyticsDashboard").then((m) => m.AdAnalyticsDashboard),
  { loading: SectionLoading }
);
export const AdsListSection = dynamic(
  () => import("@/components/admin/sections/AdsListSection").then((m) => m.AdsListSection),
  { loading: SectionLoading }
);
export const AdsCreateSection = dynamic(
  () => import("@/components/admin/sections/AdsCreateSection").then((m) => m.AdsCreateSection),
  { loading: SectionLoading }
);
export const GameSettingsSection = dynamic(
  () => import("@/components/admin/sections/GameSettingsSection").then((m) => m.GameSettingsSection),
  { loading: SectionLoading }
);
export const CategoryBlitzSection = dynamic(
  () => import("@/components/admin/sections/CategoryBlitzSection").then((m) => m.CategoryBlitzSection),
  { loading: SectionLoading }
);
export const BillingSection = dynamic(
  () => import("@/components/admin/sections/BillingSection").then((m) => m.BillingSection),
  { loading: SectionLoading }
);
export const LiveTriviaInventorySection = dynamic(
  () => import("@/components/admin/sections/LiveTriviaInventorySection").then((m) => m.LiveTriviaInventorySection),
  { loading: SectionLoading }
);
export const UsernameModerationSection = dynamic(
  () => import("@/components/admin/sections/UsernameModerationSection").then((m) => m.UsernameModerationSection),
  { loading: SectionLoading }
);
export const LlmCostSection = dynamic(
  () => import("@/components/admin/sections/LlmCostSection").then((m) => m.LlmCostSection),
  { loading: SectionLoading }
);

// ─── Legacy AdminConsole section renderers ────────────────────────────────────
//
// `AdminConsole` (the older duplicate console behind `/admin/[section]`) picks
// one section from a lookup rather than a `switch`, so it needs a map. This map
// points at the DYNAMIC wrappers above, not at static imports. The old map lived
// in `adminSections.tsx` next to the metadata, and *its* static imports were
// what dragged all ~20 sections into the eager bundle of `/admin` as well —
// keeping it here gives `AdminConsole` the same code-splitting as `AdminShell`
// and means no third registry module has to exist. See Phase R4 of
// docs/admin-mobile-remediation-plan.md.
//
// These are render FUNCTIONS returning an element, not a `Record<_,
// ComponentType<Props>>`: the sections have genuinely different prop shapes
// (some take no props, some take `venues?`, `VenuesSection` takes three required
// callbacks), and `ComponentType<P>` is invariant in `P` because of its
// `ComponentClass` branch — so a uniform component-type map only typechecks
// with `any` (which the old `component: React.ComponentType<any>` field used,
// against CLAUDE.md) or with a wrapper component per section. A function per
// entry is the same shape `AdminShell.renderContent()` already uses.

export type AdminConsoleSectionContext = { venues: Venue[] };

export const ADMIN_CONSOLE_SECTION_RENDERERS: Record<
  AdminSection,
  (ctx: AdminConsoleSectionContext) => ReactElement
> = {
  "venue-manage": ({ venues }) => (
    <VenuesSection
      venues={venues}
      onVenueCreated={() => undefined}
      onVenueUpdated={() => undefined}
      onVenueDeleted={() => undefined}
    />
  ),
  accounts: () => <AccountsSection />,
  "username-moderation": () => <UsernameModerationSection />,
  "venue-users": ({ venues }) => <UsersSection venues={venues} />,
  "user-analytics": ({ venues }) => <UserAnalyticsSection venues={venues} />,
  "trivia-list": () => <TriviaListSection />,
  "trivia-review": () => <TriviaPendingReviewSection />,
  "trivia-image-review": () => <TriviaImageReviewSection />,
  "ads-list": ({ venues }) => <AdsListSection venues={venues} />,
  "ads-create": ({ venues }) => <AdsCreateSection venues={venues} />,
  "ad-placement": ({ venues }) => <AdPlacementBuilder venues={venues} />,
  "ad-debug": () => <AdAnalyticsDashboard />,
  "challenge-campaigns": ({ venues }) => <ChallengesSection venues={venues} />,
  "live-trivia": ({ venues }) => <SchedulesSection venues={venues} />,
  "live-trivia-inventory": () => <LiveTriviaInventorySection />,
  "game-settings": ({ venues }) => <GameSettingsSection venues={venues} />,
  "category-blitz": ({ venues }) => <CategoryBlitzSection venues={venues} />,
  "llm-cost": () => <LlmCostSection />,
  "partner-billing": () => <BillingSection />,
};
