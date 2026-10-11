/**
 * A stand-in for `supabaseAdmin.from("billing_subscription_venues")` that holds no rows.
 *
 * Multi-venue billing Phase 1 (lib/venueBilling.ts) reads that table whenever a venue's own
 * anchor bill can't answer for it (no bill, or a cancelled one). Tests written before Phase 1
 * hand-roll a mock per table; returning this for the new table keeps them exactly as they were
 * — "no venue is on anyone else's bill", which is production's state until Phase 3.
 *
 * Any chain (`select`, `eq`, `in`, `is`, `limit`, `order`, `returns`, …) resolves to an empty
 * list; `maybeSingle` / `single` resolve to `data: null`.
 */
export const EMPTY_MEMBERSHIP_TABLE = "billing_subscription_venues";

export const emptyMembershipTable = (): Record<string, unknown> => {
  const builder: Record<string, unknown> = {};
  const settle = () => Promise.resolve({ data: [], error: null });
  for (const op of ["select", "eq", "in", "is", "neq", "not", "limit", "order", "or", "gte", "lte", "lt", "gt"]) {
    builder[op] = () => builder;
  }
  builder.returns = () => settle();
  builder.maybeSingle = () => Promise.resolve({ data: null, error: null });
  builder.single = () => Promise.resolve({ data: null, error: null });
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    settle().then(resolve, reject);
  return builder;
};
