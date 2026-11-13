// Partner business type — "What kind of business are you?" at sign-up.
// docs/partner-business-type-plan.md.
//
// The ONE home of the list: its values (as stored in
// `venue_owners.business_type`), their on-screen labels, the parser and the
// label lookup. No other app file spells a value — pinned by
// tests/partner-business-type-contract.test.ts, which also checks the
// migration's CHECK constraint lists exactly these values.
//
// Stored on the partner, not the venue: a trivia DJ is a kind of customer whose
// venues are bars. Every type operates the same; nothing reads this for
// behaviour. `null` means UNKNOWN — never treat it as Bar/Restaurant.
//
// Pure, no `server-only`: the signup wizard (browser), the signup route and the
// admin screens all import it.

export const BUSINESS_TYPES = ["bar_restaurant", "trivia_dj", "hotel", "movie_theater", "other"] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number];

/** On-screen labels, in display order. US spelling; "Trivia DJ", not "Trivia DJ / host" (Andrew, 2026-11-12). */
export const BUSINESS_TYPE_LABELS: Readonly<Record<BusinessType, string>> = {
  bar_restaurant: "Bar/Restaurant",
  trivia_dj: "Trivia DJ",
  hotel: "Hotel",
  movie_theater: "Movie theater",
  other: "Other",
};

/** What a partner list shows for `null` (unknown). */
export const BUSINESS_TYPE_UNKNOWN_LABEL = "—";

/** A trivia DJ adds client venues, so the sign-up address step reads "first venue". */
export const isTriviaDj = (value: unknown): boolean => value === "trivia_dj";

export const isBusinessType = (value: unknown): value is BusinessType =>
  typeof value === "string" && (BUSINESS_TYPES as ReadonlyArray<string>).includes(value);

/**
 * A stored or submitted value → its type, or `null` for anything else.
 * Exact match after trimming; never guesses ("Bar" is not `bar_restaurant`).
 */
export const parseBusinessType = (value: unknown): BusinessType | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return isBusinessType(trimmed) ? trimmed : null;
};

/** The on-screen label, or "—" when the type is unknown. */
export const businessTypeLabel = (value: BusinessType | null | undefined): string =>
  value ? BUSINESS_TYPE_LABELS[value] : BUSINESS_TYPE_UNKNOWN_LABEL;
