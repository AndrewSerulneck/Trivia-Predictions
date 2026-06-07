import React from "react";
import { AdAnalyticsDashboard } from "@/components/admin/AdAnalyticsDashboard";
import { AdPlacementBuilder } from "@/components/admin/AdPlacementBuilder";
import { AccountsSection } from "@/components/admin/sections/AccountsSection";
import { AdsCreateSection } from "@/components/admin/sections/AdsCreateSection";
import { AdsListSection } from "@/components/admin/sections/AdsListSection";
import { ChallengesSection } from "@/components/admin/sections/ChallengesSection";
import { PickEmSettlementSection } from "@/components/admin/sections/PickEmSettlementSection";
import { SchedulesSection } from "@/components/admin/sections/SchedulesSection";
import { TriviaCreateSection } from "@/components/admin/sections/TriviaCreateSection";
import { TriviaPendingReviewSection } from "@/components/admin/sections/TriviaPendingReviewSection";
import { TriviaAnswerGraderSection } from "@/components/admin/sections/TriviaAnswerGraderSection";
import { TriviaListSection } from "@/components/admin/sections/TriviaListSection";
import { UserAnalyticsSection } from "@/components/admin/sections/UserAnalyticsSection";
import { UsersSection } from "@/components/admin/sections/UsersSection";
import { VenuesSection } from "@/components/admin/sections/VenuesSection";
import LegacySectionPlaceholder from "@/components/admin/sections/LegacySectionPlaceholder";
import type { Venue } from "@/types";

export type AdminSection =
  | "ad-debug"
  | "ad-placement"
  | "accounts"
  | "pickem-settlement"
  | "venue-users"
  | "user-analytics"
  | "venue-manage"
  | "trivia-create"
  | "trivia-list"
  | "trivia-review"
  | "answer-grading"
  | "ads-create"
  | "ads-list"
  | "challenge-campaigns"
  | "live-trivia";

export type AdminSectionOption = {
  id: AdminSection;
  label: string;
  slug: string;
  status?: {
    label:string;
    tone: "live" | "planned";
  };
  component: React.ComponentType<any>;
};

export type AdminNavGroup = {
  label: string;
  items: AdminSectionOption[];
};

function VenueUsersSection({ venues = [] }: { venues?: Venue[] }) {
  return <UsersSection venues={venues} />;
}

function VenueProfilesSection({
  venues = [],
  onVenueCreated,
}: {
  venues?: Venue[];
  onVenueCreated?: (venue: Venue) => void;
}) {
  return <VenuesSection venues={venues} onVenueCreated={onVenueCreated ?? (() => undefined)} />;
}

function ChallengeManagerSection({ venues = [] }: { venues?: Venue[] }) {
  return <ChallengesSection venues={venues} />;
}

function LiveTriviaSchedulesSection({ venues = [] }: { venues?: Venue[] }) {
  return <SchedulesSection venues={venues} />;
}

function PlacementBuilderSection({ venues = [] }: { venues?: Venue[] }) {
  return <AdPlacementBuilder venues={venues} />;
}

export const ADMIN_SECTION_OPTIONS: AdminSectionOption[] = [
  { id: "accounts",              label: "Accounts",              slug: "accounts",              status: { label: "Ready", tone: "live" }, component: AccountsSection },
  { id: "venue-users",           label: "Venue Users",           slug: "venue-users",           component: VenueUsersSection },
  { id: "user-analytics",        label: "User Analytics",        slug: "user-analytics",        status: { label: "Planned", tone: "planned" }, component: UserAnalyticsSection },
  { id: "venue-manage",          label: "Venue Profiles",        slug: "venue-manage",          component: VenueProfilesSection },
  { id: "trivia-list",           label: "Trivia Questions",      slug: "trivia-list",           status: { label: "Ready", tone: "live" }, component: TriviaListSection },
  { id: "trivia-create",         label: "Create Question",       slug: "trivia-create",         status: { label: "Ready", tone: "live" }, component: TriviaCreateSection },
  { id: "trivia-review",         label: "Question Review",       slug: "trivia-review",         status: { label: "Ready", tone: "live" }, component: TriviaPendingReviewSection },
  { id: "answer-grading",        label: "Answer Grader",         slug: "answer-grading",        status: { label: "Ready", tone: "live" }, component: TriviaAnswerGraderSection },
  { id: "ads-list",              label: "Manage Ads",            slug: "ads-list",              status: { label: "Ready", tone: "live" }, component: AdsListSection },
  { id: "ads-create",            label: "Create Ad",             slug: "ads-create",            status: { label: "Ready", tone: "live" }, component: AdsCreateSection },
  { id: "ad-placement",          label: "Placement Builder",     slug: "ad-placement",          component: PlacementBuilderSection },
  { id: "ad-debug",              label: "Ad Analytics",          slug: "ad-debug",              component: AdAnalyticsDashboard },
  { id: "challenge-campaigns",   label: "Challenge Manager",     slug: "challenge-campaigns",   component: ChallengeManagerSection },
  { id: "live-trivia",           label: "Live Trivia Schedules", slug: "live-trivia",           component: LiveTriviaSchedulesSection },
  { id: "pickem-settlement",     label: "Pick 'Em Settlement",   slug: "pickem-settlement",     status: { label: "Ready", tone: "live" }, component: PickEmSettlementSection },
];

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Users & Venues",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["accounts", "venue-users", "user-analytics", "venue-manage"].includes(opt.id)),
  },
  {
    label: "Content",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["trivia-list", "trivia-create", "trivia-review", "answer-grading"].includes(opt.id)),
  },
  {
    label: "Advertising",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["ads-list", "ads-create", "ad-placement", "ad-debug"].includes(opt.id)),
  },
  {
    label: "Challenges & Events",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["challenge-campaigns", "live-trivia"].includes(opt.id)),
  },
  {
    label: "Operations",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["pickem-settlement"].includes(opt.id)),
  },
];

export const MIGRATED_SECTIONS: ReadonlySet<AdminSection> = new Set([
  "accounts",
  "venue-users",
  "venue-manage",
  "trivia-list",
  "trivia-create",
  "trivia-review",
  "answer-grading",
  "challenge-campaigns",
  "live-trivia",
  "ad-placement",
  "ad-debug",
  "ads-list",
  "ads-create",
  "pickem-settlement",
]);

export function getAdminSectionBySlug(slug: string): AdminSectionOption | null {
  const normalized = slug.trim().toLowerCase();
  return ADMIN_SECTION_OPTIONS.find((section) => section.slug === normalized) ?? null;
}
