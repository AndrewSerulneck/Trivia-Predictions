// Single home for the facts the legal/support pages (/privacy, /terms, /rules,
// /support) and their links share, so a name, address, email or date changes in
// ONE place. Plain data — no server-only, safe for server and client components.
//
// Native app store plan: docs/native-app-store-plan.md Phase 1a.

/** Registered business name shown as the publisher/operator (a New Jersey LLC, Andrew 2026-10-08). */
export const LEGAL_ENTITY_NAME = "Hightop Challenge LLC";

/** State whose law governs the Terms (where the LLC is organized). */
export const GOVERNING_LAW_STATE = "New Jersey";

/** Public contact for support, privacy requests and account help. */
export const SUPPORT_EMAIL = "support@hightopchallenge.com";

/** "Last updated" date printed on each legal page. Bump when its text changes. */
export const LEGAL_LAST_UPDATED = "October 8, 2026";

export type LegalLink = { label: string; href: string };

/** The legal/support pages, in display order. Hrefs are marketing (apex) paths. */
export const LEGAL_LINKS: readonly LegalLink[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Use", href: "/terms" },
  { label: "Official Rules", href: "/rules" },
  { label: "Support", href: "/support" },
] as const;

/**
 * Every public legal/support page path, including the account-deletion explainer (Phase 1b),
 * which is linked from Support and Privacy rather than from the link rows. A signed-in player
 * must be able to read these: components/auth/AuthNavigationGuard.tsx allowlists them.
 */
export const LEGAL_PAGE_PATHS: readonly string[] = [...LEGAL_LINKS.map((link) => link.href), "/delete-account"];
