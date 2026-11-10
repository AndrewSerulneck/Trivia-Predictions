import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// A tiny in-memory Supabase: select + eq / in / or(hidden) + maybeSingle, and a record of every write.
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as string[],
  session: null as string | null,
}));

vi.mock("@/lib/supabaseAdmin", () => {
  const query = (table: string) => {
    let rows = [...(db.tables[table] ?? [])];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        rows = rows.filter((row) => row[column] === value);
        return builder;
      },
      in: (column: string, values: unknown[]) => {
        rows = rows.filter((row) => values.includes(row[column]));
        return builder;
      },
      or: () => {
        rows = rows.filter((row) => row.hidden !== true);
        return builder;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) => Promise.resolve(resolve({ data: rows, error: null })),
      insert: () => {
        db.writes.push(`insert:${table}`);
        return builder;
      },
      update: () => {
        db.writes.push(`update:${table}`);
        return builder;
      },
      upsert: () => {
        db.writes.push(`upsert:${table}`);
        return builder;
      },
    };
    return builder;
  };
  return { supabaseAdmin: { from: query } };
});

vi.mock("@/lib/serverSession", () => ({
  isSessionEnforced: () => true,
  readSession: () => db.session,
  createSessionCookie: (userId: string) => `tp_sess=${userId}; HttpOnly`,
}));

import { GET } from "@/app/api/player/venues/route";
import { POST } from "@/app/api/player/venues/open/route";

const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
const stale = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  db.writes = [];
  db.session = "u-a-home";
  db.tables = {
    users: [
      { id: "u-a-home", account_id: "acct-a", auth_id: null, username: "amy", venue_id: "home", points: 40, created_at: "2026-01-01" },
      { id: "u-a-away", account_id: "acct-a", auth_id: null, username: "amy", venue_id: "away", points: 75, created_at: "2026-02-01" },
      { id: "u-a-old", account_id: "acct-a", auth_id: null, username: "amy", venue_id: "old", points: 5, created_at: "2025-01-01" },
      { id: "u-b", account_id: "acct-b", auth_id: null, username: "bob", venue_id: "bobs", points: 1, created_at: "2026-01-01" },
    ],
    venue_presence_sessions: [
      { user_id: "u-a-home", venue_id: "home", last_verified_at: recent },
      { user_id: "u-a-away", venue_id: "away", last_verified_at: recent },
      { user_id: "u-a-old", venue_id: "old", last_verified_at: stale },
      // A God Mode-style lease on another bar's row never counts as a check-in at that bar.
      { user_id: "u-a-home", venue_id: "bobs", last_verified_at: recent },
      { user_id: "u-b", venue_id: "bobs", last_verified_at: recent },
    ],
    venues: [{ id: "home" }, { id: "away" }, { id: "old" }, { id: "bobs" }, { id: "hidden", hidden: true }],
  };
});

const list = async (query: string) => {
  const response = await GET(new Request(`https://play.example/api/player/venues?${query}`));
  return { status: response.status, body: (await response.json()) as { ok: boolean; venues: Array<{ venueId: string }> } };
};

const open = (body: Record<string, unknown>) =>
  POST(
    new Request("https://play.example/api/player/venues/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

describe("GET /api/player/venues (Your bars)", () => {
  it("lists the signed-in player's account's bars from the last 90 days", async () => {
    const { body } = await list("userId=u-a-home");
    expect(body.venues.map((venue) => venue.venueId).sort()).toEqual(["away", "home"]);
  });

  it("adds the requested bar when the account has a profile there, even if it is older", async () => {
    const { body } = await list("userId=u-a-home&venueId=old");
    expect(body.venues.map((venue) => venue.venueId)).toContain("old");
    const other = await list("userId=u-a-home&venueId=bobs");
    expect(other.body.venues.map((venue) => venue.venueId)).not.toContain("bobs");
  });

  it("answers an empty list with no session", async () => {
    db.session = null;
    expect((await list("userId=u-a-home")).body).toEqual({ ok: true, venues: [] });
  });

  it("never shows another account's bars (stale session on a shared phone)", async () => {
    expect((await list("userId=u-b")).body.venues).toEqual([]);
    expect((await list("")).body.venues).toEqual([]);
  });
});

describe("POST /api/player/venues/open (view-only)", () => {
  it("switches the session to the account's existing profile at that bar, with no write", async () => {
    const response = await open({ venueId: "away", userId: "u-a-home" });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("tp_sess=u-a-away");
    const body = (await response.json()) as { user: { id: string; venueId: string; points: number } };
    expect(body.user).toMatchObject({ id: "u-a-away", venueId: "away", points: 75 });
    expect(db.writes).toEqual([]);
  });

  it("never creates a profile at a bar the account never joined", async () => {
    const response = await open({ venueId: "bobs", userId: "u-a-home" });
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.writes).toEqual([]);
  });

  it("refuses when the browser is signed in as another player", async () => {
    expect((await open({ venueId: "away", userId: "u-b" })).status).toBe(404);
    expect((await open({ venueId: "away" })).status).toBe(404);
  });

  it("refuses a hidden bar, a missing venue id and a missing session", async () => {
    db.tables.users.push({ id: "u-a-hidden", account_id: "acct-a", username: "amy", venue_id: "hidden", points: 0 });
    expect((await open({ venueId: "hidden", userId: "u-a-home" })).status).toBe(404);
    expect((await open({ userId: "u-a-home" })).status).toBe(400);
    db.session = null;
    expect((await open({ venueId: "away", userId: "u-a-home" })).status).toBe(401);
  });
});
