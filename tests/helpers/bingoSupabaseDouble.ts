// The in-memory `supabaseAdmin` stand-in the Sports Bingo settlement tests run `refreshSportsBingo
// Progress` against. It lived as a byte-identical copy at the top of three test files before Phase 3
// of docs/prop-bingo-code-review-fix-plan.md needed a fourth; the plan's own handoff called for
// extracting it at exactly that point.
//
// It implements only the query surface `lib/sportsBingo.ts` actually uses — `select`/`update`/
// `insert` with `eq`/`in`/`is`/`order`/`limit`/`single`/`maybeSingle` and a thenable terminator.
// Anything else should fail loudly rather than be quietly stubbed.

export type Row = Record<string, unknown>;

export type BingoTestDb = {
  sports_bingo_cards: Row[];
  sports_bingo_squares: Row[];
  notifications: Row[];
};

type Builder = {
  eq: (column: string, value: unknown) => Builder;
  in: (column: string, values: unknown[]) => Builder;
  is: (column: string, value: unknown) => Builder;
  order: (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => Builder;
  limit: (count: number) => Builder;
  select: (columns?: string) => Builder;
  single: () => Promise<{ data: Row | null; error: { message: string } | null }>;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  then: (
    onFulfilled?: (value: { data: Row[]; error: null }) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise<unknown>;
};

export type SupabaseAdminDouble = {
  rpc: (name: string, args: Row) => Promise<{ data: Row; error: null }>;
  removeChannel: () => Promise<string>;
  from: (table: string) => {
    select: () => Builder;
    update: (patch: Row) => Builder;
    insert: (row: Row) => Promise<{ data: null; error: null }>;
  };
};

/**
 * `db` is the live object the test asserts against — rows are mutated in place, so an `update`
 * through the double is visible to the test immediately without a re-read.
 */
export function createSupabaseAdminDouble(db: Record<string, Row[]>): SupabaseAdminDouble {
  const tableRows = (table: string): Row[] => {
    const rows = db[table];
    if (!rows) {
      throw new Error(`Unexpected table in test double: ${table}`);
    }
    return rows;
  };

  const makeBuilder = (table: string, mode: "select" | "update", patch?: Row): Builder => {
    const filters: Array<(row: Row) => boolean> = [];
    let orderColumn: string | null = null;
    let ascending = true;
    let nullsFirst = false;
    let limitCount = Number.POSITIVE_INFINITY;

    const resolveRows = (): Row[] => {
      let rows = tableRows(table).filter((row) => filters.every((predicate) => predicate(row)));
      if (orderColumn) {
        const column = orderColumn;
        rows = [...rows].sort((left, right) => {
          const leftValue = left[column] ?? null;
          const rightValue = right[column] ?? null;
          if (leftValue === null && rightValue === null) return 0;
          if (leftValue === null) return nullsFirst ? -1 : 1;
          if (rightValue === null) return nullsFirst ? 1 : -1;
          const comparison = String(leftValue).localeCompare(String(rightValue));
          return ascending ? comparison : -comparison;
        });
      }
      rows = rows.slice(0, limitCount);
      if (mode === "update" && patch) {
        for (const row of rows) {
          Object.assign(row, patch);
        }
      }
      return rows.map((row) => ({ ...row }));
    };

    const builder: Builder = {
      eq(column, value) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column, values) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      is(column, value) {
        filters.push((row) => (row[column] ?? null) === value);
        return builder;
      },
      order(column, options) {
        orderColumn = column;
        ascending = options?.ascending !== false;
        nullsFirst = Boolean(options?.nullsFirst);
        return builder;
      },
      limit(count) {
        limitCount = count;
        return builder;
      },
      select() {
        return builder;
      },
      single() {
        const rows = resolveRows();
        return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows" } });
      },
      maybeSingle() {
        return Promise.resolve({ data: resolveRows()[0] ?? null, error: null });
      },
      then(onFulfilled, onRejected) {
        return Promise.resolve({ data: resolveRows(), error: null }).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };

  return {
    removeChannel: async () => "ok",
    rpc: async (name, args) => {
      if (name !== "apply_sports_bingo_grading") throw new Error(`Unexpected RPC ${name}`);
      const card = db.sports_bingo_cards.find((row) => row.id === args.p_card_id);
      const state = card?.grading_state as Row | undefined;
      if (!card || card.status !== "active" || card.updated_at !== args.p_expected_updated_at || (state?.lastObservedAt && String(args.p_observed_at) <= String(state.lastObservedAt))) return { data: { applied: false }, error: null };
      const proposed = args.p_squares as Row[];
      const squares = db.sports_bingo_squares.filter((row) => row.card_id === card.id);
      if (proposed.some((item) => !squares.some((square) => square.id === item.id && JSON.stringify(square.resolver) === JSON.stringify(item.expected_resolver)))) return { data: { applied: false }, error: null };
      let changed = 0;
      for (const next of proposed) {
        const square = squares.find((row) => row.id === next.id)!;
        if (square.status !== next.status) {
          square.status = next.status;
          square.resolved_at = next.status === "pending" ? null : args.p_observed_at;
          changed += 1;
        }
      }
      const notification = args.p_notification as Row | null;
      if (notification && (args.p_status !== "active" || !card.near_win_notified_at)) db.notifications.push({ ...notification, user_id: card.user_id });
      Object.assign(card, { status: args.p_status, grading_state: args.p_state, last_cron_processed_at: args.p_observed_at, updated_at: args.p_observed_at, settled_at: args.p_status === "active" ? null : args.p_observed_at, won_line: args.p_won_line });
      if (args.p_status === "won") card.won_notified_at = args.p_observed_at;
      if (args.p_status === "active" && notification) card.near_win_notified_at = args.p_observed_at;
      return { data: { applied: true, updated_squares: changed }, error: null };
    },
    from: (table: string) => ({
      select: () => makeBuilder(table, "select"),
      update: (patch: Row) => makeBuilder(table, "update", patch),
      insert: (row: Row) => {
        tableRows(table).push({ ...row });
        return Promise.resolve({ data: null, error: null });
      },
    }),
  };
}
