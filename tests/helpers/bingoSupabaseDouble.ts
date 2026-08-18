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
