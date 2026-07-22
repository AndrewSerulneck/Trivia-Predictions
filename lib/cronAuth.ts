import "server-only";
import crypto from "node:crypto";

/**
 * Shared authorization gate for /api/cron/* routes. Extracted from 11 copies of
 * the same isAuthorized() that had drifted in two ways worth fixing everywhere
 * at once:
 *
 * - Case-folding the bearer token before comparing (`.toLowerCase()` on both
 *   sides) shrinks a mixed-case secret's search space from 62^n to 36^n.
 *   Comparison here is case-sensitive and constant-time (crypto.timingSafeEqual
 *   over equal-length buffers) so neither case nor a byte-by-byte early exit
 *   leaks anything about the secret.
 * - A handful of routes fell back to trusting the `x-vercel-cron` header when
 *   CRON_SECRET was unset. That header is attacker-settable on any request to
 *   the public route URL — it is not a Vercel-signed value — so treating it as
 *   authorization lets anyone who knows the convention hit the route. These
 *   routes include prize-minting logic (resolve-live-trivia-winners), so this
 *   fails closed instead: no CRON_SECRET configured means no request passes.
 */
function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const bearer = request.headers.get("authorization") ?? "";
  if (timingSafeEqualStrings(bearer, `Bearer ${secret}`)) return true;

  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  return timingSafeEqualStrings(headerSecret, secret);
}
