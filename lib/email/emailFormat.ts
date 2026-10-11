/**
 * Small helpers shared by the partner email builders (welcomeEmail.ts, venueAddedEmail.ts).
 * The wording itself lives in lib/email/partnerEmailCopy.ts.
 */

/** "$100.00" — every amount in a partner email is shown with cents. */
export const formatEmailAmount = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

/**
 * The only values in a partner email that are not authored copy — venue and owner names — are
 * typed by partners (since self-serve signup, by an unauthenticated stranger) and are
 * interpolated into an HTML string, so they must be escaped there.
 *
 * The everyday case is not an attack, it is punctuation: "Bar & Grill" is one of the most common
 * bar names there is, and a raw `&` in HTML starts an entity reference. `<` is the one that
 * actually breaks the layout.
 *
 * The PLAIN TEXT version of an email must NOT be escaped — it is not markup, and escaping it
 * would put a literal "&amp;" in front of the partner.
 *
 * Only `& < >`. Quotes and apostrophes are left alone: the values go into element TEXT, never an
 * attribute, and "Joe's Bar" / "O'Neil" are common enough that `&#39;` would be noise.
 */
export const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Fill `{placeholders}` in a line of copy. Unknown placeholders are left as written, so a typo in
 * partnerEmailCopy.ts shows up visibly in the preview instead of silently vanishing.
 */
export const fillTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match
  );
