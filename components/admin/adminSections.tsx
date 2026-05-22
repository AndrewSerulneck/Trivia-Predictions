import React from "react";
import { AdsCreateSection } from "@/components/admin/sections/AdsCreateSection";
import { AdsListSection } from "@/components/admin/sections/AdsListSection";
import { PickEmSettlementSection } from "@/components/admin/sections/PickEmSettlementSection";
import LegacySectionPlaceholder from "@/components/admin/sections/LegacySectionPlaceholder";

export type AdminSection =
  | "ad-debug"
  | "ad-placement"
  | "pickem-settlement"
  | "venue-users"
  | "venue-manage"
  | "trivia-create"
  | "trivia-list"
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

export const ADMIN_SECTION_OPTIONS: AdminSectionOption[] = [
  { id: "venue-users",           label: "Venue Users",           slug: "venue-users",           component: () => <LegacySectionPlaceholder sectionName="Venue Users" /> },
  { id: "venue-manage",          label: "Venue Profiles",        slug: "venue-manage",          component: () => <LegacySectionPlaceholder sectionName="Venue Profiles" /> },
  { id: "trivia-list",           label: "Trivia Questions",      slug: "trivia-list",           status: { label: "Ready", tone: "live" }, component: () => <LegacySectionPlaceholder sectionName="Trivia Questions" /> },
  { id: "trivia-create",         label: "Create Question",       slug: "trivia-create",         status: { label: "Ready", tone: "live" }, component: () => <LegacySectionPlaceholder sectionName="Create Question" /> },
  { id: "ads-list",              label: "Manage Ads",            slug: "ads-list",              status: { label: "Ready", tone: "live" }, component: AdsListSection },
  { id: "ads-create",            label: "Create Ad",             slug: "ads-create",            status: { label: "Ready", tone: "live" }, component: AdsCreateSection },
  { id: "ad-placement",          label: "Placement Builder",     slug: "ad-placement",          component: () => <LegacySectionPlaceholder sectionName="Placement Builder" /> },
  { id: "ad-debug",              label: "Ad Analytics",          slug: "ad-debug",              component: () => <LegacySectionPlaceholder sectionName="Ad Analytics" /> },
  { id: "challenge-campaigns",   label: "Challenge Manager",     slug: "challenge-campaigns",   component: () => <LegacySectionPlaceholder sectionName="Challenge Manager" /> },
  { id: "live-trivia",           label: "Live Trivia Schedules", slug: "live-trivia",           component: () => <LegacySectionPlaceholder sectionName="Live Trivia Schedules" /> },
  { id: "pickem-settlement",     label: "Pick 'Em Settlement",   slug: "pickem-settlement",     status: { label: "Ready", tone: "live" }, component: PickEmSettlementSection },
];

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Users & Venues",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["venue-users", "venue-manage"].includes(opt.id)),
  },
  {
    label: "Content",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["trivia-list", "trivia-create"].includes(opt.id)),
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
  "venue-users",
  "venue-manage",
  "trivia-list",
  "trivia-create",
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
