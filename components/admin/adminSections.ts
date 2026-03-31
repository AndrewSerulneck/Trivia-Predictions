export type AdminSection =
  | "ad-debug"
  | "prediction-settlement"
  | "venue-users"
  | "venue-manage"
  | "venue-create"
  | "trivia-create"
  | "trivia-list"
  | "ads-create"
  | "ads-list";

export type AdminSectionOption = {
  id: AdminSection;
  label: string;
  slug: string;
};

export const ADMIN_SECTION_OPTIONS: AdminSectionOption[] = [
  { id: "venue-users", label: "Venue User Management", slug: "venue-users" },
  { id: "venue-manage", label: "Venue Profile Management", slug: "venue-manage" },
  { id: "venue-create", label: "Create Venue", slug: "venue-create" },
  { id: "trivia-create", label: "Create Trivia Question", slug: "trivia-create" },
  { id: "trivia-list", label: "Trivia Questions", slug: "trivia-list" },
  { id: "ads-create", label: "Create Advertisement", slug: "ads-create" },
  { id: "ads-list", label: "Manage Advertisements", slug: "ads-list" },
  { id: "prediction-settlement", label: "Prediction Settlement", slug: "prediction-settlement" },
  { id: "ad-debug", label: "Ad Debug Snapshot", slug: "ad-debug" },
];

export function getAdminSectionBySlug(slug: string): AdminSectionOption | null {
  const normalized = slug.trim().toLowerCase();
  return ADMIN_SECTION_OPTIONS.find((section) => section.slug === normalized) ?? null;
}
