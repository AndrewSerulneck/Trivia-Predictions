import { beforeEach, describe, expect, it, vi } from "vitest";

// docs/fire-tv-app-plan.md Phase 3 — the TV connect lifecycle: create → claim → read once → expired.
// lib/tvConnect.ts runs against a tiny in-memory stand-in for `tv_device_pairings` that understands exactly the
// query shapes the module uses (filters are applied, so a wrong filter fails a test).

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  nextId: 1,
  log: [] as string[],
  failInsertWith: null as null | { code: string; message: string },
  collisionsLeft: 0,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const from = (table: string) => {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Record<string, unknown> | null = null;
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const matches = () => db.rows.filter((row) => filters.every((f) => f(row)));
    const run = () => {
      db.log.push(`${table}:${op}`);
      if (op === "insert") {
        if (db.collisionsLeft > 0) {
          db.collisionsLeft -= 1;
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        if (db.failInsertWith) return { data: null, error: db.failInsertWith };
        if (db.rows.some((row) => row.pair_code === payload?.pair_code)) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        db.rows.push({ id: `row-${db.nextId++}`, venue_id: null, claimed_at: null, ...payload });
        return { data: null, error: null };
      }
      const hit = matches();
      if (op === "delete") {
        db.rows = db.rows.filter((row) => !hit.includes(row));
        return { data: hit, error: null };
      }
      if (op === "update") {
        for (const row of hit) Object.assign(row, payload);
        return { data: hit.map((row) => ({ id: row.id })), error: null };
      }
      return { data: hit, error: null };
    };
    const query = {
      select: () => query,
      insert: (value: Record<string, unknown>) => ((op = "insert"), (payload = value), query),
      update: (value: Record<string, unknown>) => ((op = "update"), (payload = value), query),
      delete: () => ((op = "delete"), query),
      eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
      is: (column: string, value: unknown) => (filters.push((row) => (row[column] ?? null) === value), query),
      lt: (column: string, value: string) => (filters.push((row) => String(row[column]) < value), query),
      gt: (column: string, value: string) => (filters.push((row) => String(row[column]) > value), query),
      maybeSingle: async () => {
        const result = run();
        const list = (result.data ?? []) as Record<string, unknown>[];
        return { data: list[0] ?? null, error: result.error };
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return query;
  };
  return { supabaseAdmin: { from } };
});

import { claimTvPairing, createTvPairing, hashPollSecret, parsePollSecret, readTvPairingStatus } from "@/lib/tvConnect";
import { TV_PAIR_TTL_MS } from "@/lib/tvConnectShared";

const T0 = Date.parse("2026-11-22T20:00:00.000Z");
const OWNER_VENUES = ["venue-1", "venue-2"];

beforeEach(() => {
  db.rows = [];
  db.nextId = 1;
  db.log = [];
  db.failInsertWith = null;
  db.collisionsLeft = 0;
});

const create = async (nowMs = T0) => {
  const created = await createTvPairing(nowMs);
  if (!created) throw new Error("create failed");
  return created;
};

describe("createTvPairing", () => {
  it("stores a 6-character code and only the secret's hash, expiring in 10 minutes", async () => {
    const created = await create();
    expect(created.pairCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(parsePollSecret(created.pollSecret)).toBe(created.pollSecret);
    expect(created.expiresAt).toBe(new Date(T0 + TV_PAIR_TTL_MS).toISOString());
    expect(db.rows).toHaveLength(1);
    const row = db.rows[0] as Row;
    expect(row.pair_code).toBe(created.pairCode);
    expect(row.poll_secret_hash).toBe(hashPollSecret(created.pollSecret));
    expect(row.poll_secret_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(created.pollSecret);
  });

  it("deletes expired rows first, in one statement (no cron)", async () => {
    db.rows.push({ id: "old", pair_code: "AAAAAA", poll_secret_hash: "x", venue_id: null, expires_at: new Date(T0 - 1).toISOString() });
    db.rows.push({ id: "live", pair_code: "BBBBBB", poll_secret_hash: "y", venue_id: null, expires_at: new Date(T0 + 60_000).toISOString() });
    await create();
    expect(db.log[0]).toBe("tv_device_pairings:delete");
    expect(db.rows.map((row) => row.id)).toEqual(["live", "row-1"]);
  });

  it("retries a code collision, then gives up after 3 tries", async () => {
    db.collisionsLeft = 2;
    expect(await createTvPairing(T0)).not.toBeNull();
    db.collisionsLeft = 3;
    expect(await createTvPairing(T0)).toBeNull();
  });

  it("returns null on any other insert error", async () => {
    db.failInsertWith = { code: "42501", message: "permission denied" };
    expect(await createTvPairing(T0)).toBeNull();
  });
});

describe("claim and status", () => {
  it("waiting → claimed by the owner → connected once → expired", async () => {
    const { pairCode, pollSecret } = await create();
    expect(await readTvPairingStatus(pollSecret, T0 + 3_000)).toMatchObject({ ok: true, state: "waiting" });

    expect(await claimTvPairing({ rawPairCode: pairCode, venueId: "venue-2", ownerVenueIds: OWNER_VENUES }, T0 + 5_000)).toEqual({
      ok: true,
    });
    expect(await readTvPairingStatus(pollSecret, T0 + 6_000)).toEqual({ ok: true, state: "connected", venueId: "venue-2" });
    // Read once: the row is gone, so a replayed secret learns nothing.
    expect(db.rows).toHaveLength(0);
    expect(await readTvPairingStatus(pollSecret, T0 + 9_000)).toEqual({ ok: true, state: "expired" });
  });

  it("accepts a typed code with look-alikes and lowercase", async () => {
    db.rows.push({
      id: "r",
      pair_code: "7K3M10",
      poll_secret_hash: "h",
      venue_id: null,
      claimed_at: null,
      expires_at: new Date(T0 + 60_000).toISOString(),
    });
    expect(await claimTvPairing({ rawPairCode: "7k3mio", venueId: "venue-1", ownerVenueIds: OWNER_VENUES }, T0)).toEqual({ ok: true });
  });

  it("refuses a venue the owner doesn't hold, without touching the row", async () => {
    const { pairCode, pollSecret } = await create();
    const result = await claimTvPairing({ rawPairCode: pairCode, venueId: "someone-else", ownerVenueIds: OWNER_VENUES }, T0);
    expect(result).toMatchObject({ ok: false, code: "not_your_venue" });
    expect(await readTvPairingStatus(pollSecret, T0 + 1_000)).toMatchObject({ state: "waiting" });
  });

  it("a code can be claimed only once", async () => {
    const { pairCode } = await create();
    await claimTvPairing({ rawPairCode: pairCode, venueId: "venue-1", ownerVenueIds: OWNER_VENUES }, T0);
    const second = await claimTvPairing({ rawPairCode: pairCode, venueId: "venue-2", ownerVenueIds: OWNER_VENUES }, T0 + 1);
    expect(second).toMatchObject({ ok: false, code: "expired" });
    expect((db.rows[0] as Row).venue_id).toBe("venue-1");
  });

  it("an expired code can't be claimed, and the TV sees expired", async () => {
    const { pairCode, pollSecret } = await create();
    const late = T0 + TV_PAIR_TTL_MS + 1;
    expect(await claimTvPairing({ rawPairCode: pairCode, venueId: "venue-1", ownerVenueIds: OWNER_VENUES }, late)).toMatchObject({
      ok: false,
      code: "expired",
    });
    expect(await readTvPairingStatus(pollSecret, late)).toEqual({ ok: true, state: "expired" });
  });

  it("rejects malformed input before any read", async () => {
    for (const input of [
      { rawPairCode: "SHORT", venueId: "venue-1" },
      { rawPairCode: "7K3M9U", venueId: "venue-1" },
      { rawPairCode: 123456, venueId: "venue-1" },
      { rawPairCode: "7K3M9Q", venueId: "" },
    ]) {
      expect(await claimTvPairing({ ...input, ownerVenueIds: OWNER_VENUES }, T0)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(db.log).toEqual([]);
  });

  it("an unknown secret reads as expired", async () => {
    expect(await readTvPairingStatus("A".repeat(43), T0)).toEqual({ ok: true, state: "expired" });
  });
});

describe("parsePollSecret", () => {
  it("accepts only a 43-character base64url secret", () => {
    expect(parsePollSecret("a".repeat(43))).toBe("a".repeat(43));
    for (const bad of [null, "", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}/`]) {
      expect(parsePollSecret(bad)).toBeNull();
    }
  });
});
