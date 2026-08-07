// Admin section METADATA — ids, labels, slugs, nav grouping, mobile allowlist.
//
// This module must stay COMPONENT-FREE. It is imported by the `app/admin/*`
// server components (`getAdminSectionBySlug`) and by both shells, so anything
// it imports lands in the client graph of every one of them. A single static
// `import { SomeSection } from ".../sections/SomeSection"` here re-collapses
// the whole ~17k-line admin surface into one eager chunk and silently undoes
// the `next/dynamic` layer in `adminSectionComponents.tsx` — which is exactly
// the defect Phase R4 of docs/admin-mobile-remediation-plan.md closes.
// Component wiring lives in `@/components/admin/adminSectionComponents`.

export type AdminSection =
  | "ad-debug"
  | "ad-placement"
  | "accounts"
  | "venue-users"
  | "user-analytics"
  | "venue-manage"
  | "trivia-list"
  | "trivia-review"
  | "trivia-image-review"
  | "ads-create"
  | "ads-list"
  | "challenge-campaigns"
  | "live-trivia"
  | "live-trivia-inventory"
  | "game-settings"
  | "username-moderation"
  | "category-blitz"
  | "llm-cost"
  | "partner-billing";

export type AdminSectionOption = {
  id: AdminSection;
  label: string;
  slug: string;
  status?: {
    label: string;
    tone: "live" | "planned";
  };
};

export type AdminNavGroup = {
  label: string;
  items: AdminSectionOption[];
};

export const ADMIN_SECTION_OPTIONS: AdminSectionOption[] = [
  { id: "venue-manage",          label: "Venues",                slug: "venue-manage" },
  { id: "accounts",              label: "Accounts",              slug: "accounts",              status: { label: "Ready", tone: "live" } },
  { id: "username-moderation",   label: "Username Moderation",   slug: "username-moderation",   status: { label: "Ready", tone: "live" } },
  { id: "venue-users",           label: "Venue Users",           slug: "venue-users" },
  { id: "user-analytics",        label: "User Analytics",        slug: "user-analytics",        status: { label: "Planned", tone: "planned" } },
  { id: "trivia-list",           label: "Trivia Questions",      slug: "trivia-list",           status: { label: "Ready", tone: "live" } },
  { id: "trivia-review",         label: "Question Review",       slug: "trivia-review",         status: { label: "Ready", tone: "live" } },
  { id: "trivia-image-review",   label: "Image Review",          slug: "trivia-image-review",   status: { label: "Ready", tone: "live" } },
  { id: "ads-list",              label: "Manage Ads",            slug: "ads-list",              status: { label: "Ready", tone: "live" } },
  { id: "ads-create",            label: "Create Ad",             slug: "ads-create",            status: { label: "Ready", tone: "live" } },
  { id: "ad-placement",          label: "Placement Builder",     slug: "ad-placement" },
  { id: "ad-debug",              label: "Ad Analytics",          slug: "ad-debug" },
  { id: "challenge-campaigns",   label: "Rewards Manager",       slug: "challenge-campaigns" },
  { id: "live-trivia",           label: "Live Trivia Schedules", slug: "live-trivia" },
  { id: "live-trivia-inventory", label: "Question Inventory",    slug: "live-trivia-inventory", status: { label: "Ready", tone: "live" } },
  { id: "game-settings",         label: "Game Settings",         slug: "game-settings",         status: { label: "Ready", tone: "live" } },
  { id: "category-blitz",        label: "Category Blitz",        slug: "category-blitz",        status: { label: "Ready", tone: "live" } },
  { id: "llm-cost",              label: "LLM Cost",              slug: "llm-cost",              status: { label: "Ready", tone: "live" } },
  { id: "partner-billing",       label: "Partner Billing",       slug: "partner-billing",       status: { label: "Ready", tone: "live" } },
];

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: "Users & Venues",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["accounts", "username-moderation", "venue-users", "user-analytics", "venue-manage"].includes(opt.id)),
  },
  {
    label: "Content",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["trivia-list", "trivia-review", "trivia-image-review"].includes(opt.id)),
  },
  {
    label: "Advertising",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["ads-list", "ads-create", "ad-placement", "ad-debug"].includes(opt.id)),
  },
  {
    label: "Rewards & Events",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["challenge-campaigns", "live-trivia", "live-trivia-inventory", "category-blitz"].includes(opt.id)),
  },
  {
    label: "Operations",
    items: ADMIN_SECTION_OPTIONS.filter((opt) => ["game-settings", "llm-cost", "partner-billing"].includes(opt.id)),
  },
];

// Hard allowlist for the mobile shell (Phase 3, admin-mobile plan). Adding a
// section to ADMIN_SECTION_OPTIONS must never make it reachable on mobile —
// only editing this literal list does. Never derive this from
// ADMIN_SECTION_OPTIONS.
export const MOBILE_SECTION_ORDER = [
  "venue-manage",
  "partner-billing",
] as const satisfies readonly AdminSection[];

export const MOBILE_SECTIONS: ReadonlySet<AdminSection> = new Set(MOBILE_SECTION_ORDER);

export const MIGRATED_SECTIONS: ReadonlySet<AdminSection> = new Set([
  "accounts",
  "username-moderation",
  "venue-users",
  "venue-manage",
  "trivia-list",
  "trivia-review",
  "trivia-image-review",
  "challenge-campaigns",
  "live-trivia",
  "live-trivia-inventory",
  "game-settings",
  "ad-placement",
  "ad-debug",
  "ads-list",
  "ads-create",
  "category-blitz",
  "llm-cost",
  "partner-billing",
]);

export function getAdminSectionBySlug(slug: string): AdminSectionOption | null {
  const normalized = slug.trim().toLowerCase();
  return ADMIN_SECTION_OPTIONS.find((section) => section.slug === normalized) ?? null;
}

// One definition, imported by both shells (AdminMobileShell previously kept a
// duplicate local copy of this).
export function sectionLabel(id: AdminSection): string {
  return ADMIN_SECTION_OPTIONS.find((option) => option.id === id)?.label ?? id;
}
