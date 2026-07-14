// Pure, client-safe TV pairing helpers — no "server-only" import and no Supabase
// dependency, so both the server (lib/tvPairing.ts, which re-exports this) and
// the client (app/owner/display/page.tsx's claim form, prefilling from a
// `?code=` deep link) can normalize a pairing code identically instead of
// hand-syncing two copies. Same pattern as lib/categoryBlitzShared.ts.

/**
 * Normalize user/QR-supplied code input to the stored form: uppercase, strip
 * whitespace and hyphens (the code may be displayed grouped as "XK4-9PM").
 */
export function normalizePairingCode(input: string): string {
  return String(input ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}
