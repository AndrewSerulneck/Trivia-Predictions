// What a venue's share pictures show (docs/native-app-store-plan.md Phase 9e). ONE choice per
// venue (Andrew, 2026-10-22): the bar's name, its address and its Instagram handle, each on or
// off. It applies to every share from the venue — every game and every prize, including ones
// added later — because it is applied once, in `applyShareVenue` (lib/socialShare/shareVenue.ts).
// Pure: shared by the partner panel, the owner/admin routes and the player side.

export type VenueShareDetails = {
  /** Stored without the "@"; null = none set. */
  instagramHandle: string | null;
  showName: boolean;
  showAddress: boolean;
  /** Only does anything when a handle is set. */
  showInstagram: boolean;
};

/** The database defaults: today's pictures (name + address), no handle. */
export const DEFAULT_VENUE_SHARE_DETAILS: VenueShareDetails = {
  instagramHandle: null,
  showName: true,
  showAddress: true,
  showInstagram: true,
};

/** = the venues_instagram_handle_format CHECK (migration 20261023011500). */
const HANDLE_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

export const INSTAGRAM_HANDLE_INVALID_MESSAGE =
  "Enter your Instagram handle, like @thepourhouse, or your instagram.com link.";

export type InstagramHandleParse = { ok: true; handle: string | null } | { ok: false; error: string };

/**
 * "@thepourhouse", "thepourhouse" or an instagram.com/thepourhouse link → "thepourhouse".
 * Blank → null (no handle). Anything else is refused with a plain message. We can't check the
 * partner owns the account; that is accepted (plan Phase 9e).
 */
export const parseInstagramHandle = (input: string | null | undefined): InstagramHandleParse => {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: true, handle: null };

  let candidate = raw;
  const link = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^?#]*)(?:[?#].*)?$/i.exec(raw);
  if (link) {
    const segments = link[1].split("/").filter(Boolean);
    // instagram.com/p/…, /reel/… etc. are posts, not an account.
    if (segments.length !== 1) return { ok: false, error: INSTAGRAM_HANDLE_INVALID_MESSAGE };
    candidate = segments[0];
  }
  candidate = candidate.replace(/^@/, "");
  return HANDLE_PATTERN.test(candidate) ? { ok: true, handle: candidate } : { ok: false, error: INSTAGRAM_HANDLE_INVALID_MESSAGE };
};

/** "@thepourhouse" — how a handle is shown everywhere. */
export const formatInstagramHandle = (handle: string): string => `@${handle}`;

const joinWithAnd = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;

// ── Partner-facing words (Partner Dashboard panel) ──

export const SHARE_DETAILS_COPY = {
  heading: "On shared pictures",
  hint: "When players share a win, their picture can show your bar. This applies to every game and prize at this venue.",
  handleLabel: "Instagram handle",
  handlePlaceholder: "@yourbar",
  handleHint: "Goes in the caption, so posts mention you.",
  showName: "Bar name",
  showAddress: "Address",
  showInstagram: "Instagram handle",
  change: "Change",
  save: "Save",
  saving: "Saving…",
  cancel: "Cancel",
  saved: "Saved. New shares use this.",
  loadFailed: "Couldn't load this setting.",
  retry: "Try again",
  saveFailed: "Couldn't save. Try again.",
} as const;

/** One line for the summary row: "Name, address and @thepourhouse", or "Just the win". */
export const shareDetailsSummary = (details: VenueShareDetails): string => {
  const parts: string[] = [];
  if (details.showName) parts.push("Name");
  if (details.showAddress) parts.push(parts.length ? "address" : "Address");
  if (details.showInstagram && details.instagramHandle) parts.push(formatInstagramHandle(details.instagramHandle));
  return parts.length ? joinWithAnd(parts) : "Just the win";
};
