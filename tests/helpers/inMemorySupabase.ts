// A small in-memory stand-in for `supabaseAdmin`, written for the multi-venue billing Phase 3 tests
// (tests/api.owner.venues-add.test.ts), which drive the add route, the Stripe webhook and the
// billing cron against ONE shared state so they can race each other.
//
// It implements only the query surface those paths use — select / insert / update / delete /
// upsert with eq / neq / in / is / not(…, "is", null) / gte / gt / lte / lt / or("a.neq.0,b.neq.0")
// / order / limit / single / maybeSingle / returns, plus `rpc()` handlers supplied by the test.
// Unique columns raise Postgres's 23505; declared foreign keys cascade or null on delete. Anything
// it does not implement throws loudly rather than being quietly stubbed.

export type Row = Record<string, unknown>;
type Result = { data: unknown; error: { code?: string; message: string } | null };

export type TableSpec = {
  /** Columns whose values must be unique (a 23505 on conflict). */
  unique?: string[];
  /** Columns filled on insert when absent. `updated_at` is also bumped on every update. */
  timestamps?: boolean;
};

export type ForeignKey = {
  table: string;
  column: string;
  references: { table: string; column: string };
  onDelete: "cascade" | "set null";
};

export type InMemoryDb = {
  tables: Record<string, Row[]>;
  /** Every `.from(table)` call, in order — lets a test prove a path never touched a table. */
  fromCalls: string[];
  /** Fail the next matching operation with this error. */
  failNext: (table: string, op: Op, error?: { code?: string; message: string }) => void;
  client: {
    from: (table: string) => TableHandle;
    rpc: (name: string, args: Row) => Promise<Result>;
  };
};

type Op = "select" | "insert" | "update" | "delete" | "upsert";

type Filter = (row: Row) => boolean;

type TableHandle = {
  select: (columns?: string) => Builder;
  insert: (rows: Row | Row[]) => Builder;
  update: (patch: Row) => Builder;
  delete: () => Builder;
  upsert: (rows: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => Builder;
};

type Builder = {
  select: (columns?: string) => Builder;
  eq: (column: string, value: unknown) => Builder;
  neq: (column: string, value: unknown) => Builder;
  in: (column: string, values: unknown[]) => Builder;
  is: (column: string, value: null) => Builder;
  not: (column: string, operator: string, value: unknown) => Builder;
  gte: (column: string, value: number | string) => Builder;
  gt: (column: string, value: number | string) => Builder;
  lte: (column: string, value: number | string) => Builder;
  lt: (column: string, value: number | string) => Builder;
  or: (expression: string) => Builder;
  order: (column: string, options?: { ascending?: boolean }) => Builder;
  limit: (count: number) => Builder;
  returns: () => Builder;
  single: () => Promise<Result>;
  maybeSingle: () => Promise<Result>;
  then: <T>(onFulfilled: (value: Result) => T, onRejected?: (reason: unknown) => T) => Promise<T>;
};

let idCounter = 0;
const newId = (): string => {
  idCounter += 1;
  return `00000000-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
};

const compare = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
};

export function createInMemoryDb(
  tables: Record<string, Row[]>,
  specs: Record<string, TableSpec> = {},
  foreignKeys: ForeignKey[] = [],
  rpcs: Record<string, (args: Row, db: InMemoryDb) => Result | Promise<Result>> = {}
): InMemoryDb {
  const pendingFailures: Array<{ table: string; op: Op; error: { code?: string; message: string } }> = [];
  const fromCalls: string[] = [];

  const rowsOf = (table: string): Row[] => {
    const rows = tables[table];
    if (!rows) throw new Error(`Unexpected table in in-memory db: ${table}`);
    return rows;
  };

  const takeFailure = (table: string, op: Op) => {
    const index = pendingFailures.findIndex((f) => f.table === table && f.op === op);
    if (index === -1) return null;
    return pendingFailures.splice(index, 1)[0].error;
  };

  const now = () => new Date().toISOString();

  const uniqueViolation = (table: string, candidate: Row, ignore?: Row): boolean =>
    (specs[table]?.unique ?? []).some((column) =>
      rowsOf(table).some(
        (row) => row !== ignore && candidate[column] !== undefined && candidate[column] !== null && row[column] === candidate[column]
      )
    );

  const cascadeDelete = (table: string, removed: Row[]) => {
    for (const fk of foreignKeys.filter((k) => k.references.table === table)) {
      const keys = new Set(removed.map((row) => row[fk.references.column]));
      const children = rowsOf(fk.table);
      if (fk.onDelete === "set null") {
        for (const child of children) if (keys.has(child[fk.column])) child[fk.column] = null;
      } else {
        const doomed = children.filter((child) => keys.has(child[fk.column]));
        tables[fk.table] = children.filter((child) => !keys.has(child[fk.column]));
        cascadeDelete(fk.table, doomed);
      }
    }
  };

  const makeBuilder = (table: string, op: Op, payload?: Row | Row[], upsertOptions?: { onConflict?: string; ignoreDuplicates?: boolean }): Builder => {
    const filters: Filter[] = [];
    let orderBy: { column: string; ascending: boolean } | null = null;
    let limitTo: number | null = null;
    let wantsRows = op === "select";

    const execute = (): Result => {
      const failure = takeFailure(table, op);
      if (failure) return { data: null, error: failure };
      const rows = rowsOf(table);

      if (op === "insert" || op === "upsert") {
        const incoming = (Array.isArray(payload) ? payload : [payload ?? {}]).map((row) => ({ ...row }));
        const written: Row[] = [];
        for (const row of incoming) {
          const conflictColumn = upsertOptions?.onConflict;
          const existing = conflictColumn ? rows.find((r) => r[conflictColumn] === row[conflictColumn]) : undefined;
          if (op === "upsert" && existing) {
            if (!upsertOptions?.ignoreDuplicates) {
              Object.assign(existing, row, specs[table]?.timestamps ? { updated_at: now() } : {});
              written.push(existing);
            }
            continue;
          }
          const fresh: Row = {
            id: newId(),
            ...(specs[table]?.timestamps ? { created_at: now(), updated_at: now() } : {}),
            ...row,
          };
          if (uniqueViolation(table, fresh)) {
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${table}` } };
          }
          rows.push(fresh);
          written.push(fresh);
        }
        return { data: wantsRows ? written.map((r) => ({ ...r })) : null, error: null };
      }

      let matched = rows.filter((row) => filters.every((f) => f(row)));
      if (orderBy) {
        const { column, ascending } = orderBy;
        matched = [...matched].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
      }
      if (limitTo !== null) matched = matched.slice(0, limitTo);

      if (op === "update") {
        for (const row of matched) {
          const next = { ...row, ...(payload as Row) };
          if (uniqueViolation(table, next, row)) {
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${table}` } };
          }
          Object.assign(row, payload as Row, specs[table]?.timestamps ? { updated_at: now() } : {});
        }
        return { data: wantsRows ? matched.map((r) => ({ ...r })) : null, error: null };
      }
      if (op === "delete") {
        tables[table] = rows.filter((row) => !matched.includes(row));
        cascadeDelete(table, matched);
        return { data: wantsRows ? matched.map((r) => ({ ...r })) : null, error: null };
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    };

    const builder: Builder = {
      select: () => {
        wantsRows = true;
        return builder;
      },
      eq: (column, value) => (filters.push((row) => row[column] === value), builder),
      neq: (column, value) => (filters.push((row) => row[column] !== value), builder),
      in: (column, values) => (filters.push((row) => values.includes(row[column])), builder),
      is: (column, value) => (filters.push((row) => (row[column] ?? null) === value), builder),
      not: (column, operator, value) => {
        if (operator !== "is" || value !== null) throw new Error(`in-memory db: unsupported not(${operator}, ${String(value)})`);
        filters.push((row) => (row[column] ?? null) !== null);
        return builder;
      },
      gte: (column, value) => (filters.push((row) => compare(row[column], value) >= 0), builder),
      gt: (column, value) => (filters.push((row) => compare(row[column], value) > 0), builder),
      lte: (column, value) => (filters.push((row) => compare(row[column], value) <= 0), builder),
      lt: (column, value) => (filters.push((row) => compare(row[column], value) < 0), builder),
      or: (expression) => {
        const clauses = expression.split(",").map((part) => {
          const [column, operator, raw] = part.split(".");
          if (operator !== "neq") throw new Error(`in-memory db: unsupported or() clause ${part}`);
          return (row: Row) => String(row[column]) !== raw;
        });
        filters.push((row) => clauses.some((clause) => clause(row)));
        return builder;
      },
      order: (column, options) => {
        orderBy = { column, ascending: options?.ascending ?? true };
        return builder;
      },
      limit: (count) => {
        limitTo = count;
        return builder;
      },
      returns: () => builder,
      single: async () => {
        const result = execute();
        if (result.error) return result;
        const list = Array.isArray(result.data) ? result.data : [];
        return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { message: `expected 1 row, got ${list.length}` } };
      },
      maybeSingle: async () => {
        const result = execute();
        if (result.error) return result;
        const list = Array.isArray(result.data) ? result.data : [];
        return { data: list[0] ?? null, error: null };
      },
      then: (onFulfilled, onRejected) => Promise.resolve().then(() => execute()).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const db: InMemoryDb = {
    tables,
    fromCalls,
    failNext: (table, op, error = { message: `injected ${op} failure on ${table}` }) => {
      pendingFailures.push({ table, op, error });
    },
    client: {
      from: (table: string) => {
        fromCalls.push(table);
        rowsOf(table);
        return {
          select: () => makeBuilder(table, "select"),
          insert: (rows) => makeBuilder(table, "insert", rows),
          update: (patch) => makeBuilder(table, "update", patch),
          delete: () => makeBuilder(table, "delete"),
          upsert: (rows, options) => makeBuilder(table, "upsert", rows, options),
        };
      },
      rpc: async (name: string, args: Row) => {
        const handler = rpcs[name];
        if (!handler) return { data: null, error: { code: "PGRST202", message: `function ${name} not found` } };
        return handler(args, db);
      },
    },
  };
  return db;
}
