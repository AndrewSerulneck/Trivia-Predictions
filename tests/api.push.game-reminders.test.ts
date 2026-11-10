// "Remind me" (docs/cancelled-prizes-pick-windows-away-mode-plan.md, Phase C3): POST/DELETE
// /api/push/game-reminders and lib/gameReminderOptIns.ts. Bound to the signed session, only the session
// profile's own bar, only a game that is really on; no location check (it is for players away).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isSessionEnforced: vi.fn(() => true),
  resolveRequestUserId: vi.fn(() => ({ userId: "user-1" as string | null, forbidden: false })),
  findUpcomingScheduleOccurrence: vi.fn(),
  profileVenue: "bar-1" as string | null,
  upsert: vi.fn(),
  deleteEq: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/serverSession", () => ({
  isSessionEnforced: mocks.isSessionEnforced,
  resolveRequestUserId: mocks.resolveRequestUserId,
}));
vi.mock("@/lib/liveShowdownEngine", () => ({ findUpcomingScheduleOccurrence: mocks.findUpcomingScheduleOccurrence }));
vi.mock("@/lib/supabaseAdmin", () => {
  const deleteChain = {
    eq: (column: string, value: string) => {
      mocks.deleteEq(column, value);
      return deleteChain;
    },
    then: (resolve: (value: { error: null }) => void) => resolve({ error: null }),
  };
  return {
    supabaseAdmin: {
      from: (table: string) => {
        if (table === "users") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: mocks.profileVenue === null ? null : { venue_id: mocks.profileVenue },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === "push_game_reminder_optins") return { upsert: mocks.upsert, delete: () => deleteChain };
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
});

import { DELETE, POST } from "@/app/api/push/game-reminders/route";

const SCHEDULE = "8b1f6a52-1c1e-4d4e-9a63-0d3f7c2b1a90";
const START = "2026-11-13T01:00:00.000Z";

const call = (method: "POST" | "DELETE", body: Record<string, unknown>) =>
  (method === "POST" ? POST : DELETE)(
    new Request("https://play.example/api/push/game-reminders", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  mocks.isSessionEnforced.mockReturnValue(true);
  mocks.resolveRequestUserId.mockReturnValue({ userId: "user-1", forbidden: false });
  mocks.profileVenue = "bar-1";
  mocks.findUpcomingScheduleOccurrence.mockResolvedValue({
    scheduleId: SCHEDULE,
    venueId: "bar-1",
    occurrenceDate: "2026-11-12",
    startMs: Date.parse(START),
    endMs: Date.parse(START) + 1,
    timezone: "America/New_York",
  });
  mocks.upsert.mockReset().mockResolvedValue({ error: null });
  mocks.deleteEq.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/push/game-reminders", () => {
  it("refuses outright without sessions (the dev server shares the production database)", async () => {
    mocks.isSessionEnforced.mockReturnValue(false);
    expect((await call("POST", { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: START })).status).toBe(503);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("a forged userId is 403 and no session is 401", async () => {
    mocks.resolveRequestUserId.mockReturnValue({ userId: null, forbidden: true });
    expect((await call("POST", { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: START, userId: "x" })).status).toBe(403);
    mocks.resolveRequestUserId.mockReturnValue({ userId: null, forbidden: false });
    expect((await call("POST", { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: START })).status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed game", async () => {
    for (const body of [
      { venueId: "", scheduleId: SCHEDULE, startsAt: START },
      { venueId: "bar-1", scheduleId: "not-a-uuid", startsAt: START },
      { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: "soon" },
    ]) {
      expect((await call("POST", body)).status).toBe(400);
    }
  });

  it("saves the session player's reminder, keyed by the schedule's own occurrence date", async () => {
    const res = await call("POST", { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: START });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, occurrenceDate: "2026-11-12", startsAt: START });
    expect(mocks.findUpcomingScheduleOccurrence).toHaveBeenCalledWith("bar-1", SCHEDULE, Date.parse(START), expect.any(Number));
    expect(mocks.upsert).toHaveBeenCalledWith(
      { user_id: "user-1", schedule_id: SCHEDULE, occurrence_date: "2026-11-12", venue_id: "bar-1", starts_at: START },
      { onConflict: "user_id,schedule_id,occurrence_date", ignoreDuplicates: true },
    );
  });

  it("only for the bar the signed-in profile belongs to", async () => {
    mocks.profileVenue = "bar-2";
    expect((await call("POST", { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: START })).status).toBe(403);
    mocks.profileVenue = null;
    expect((await call("POST", { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: START })).status).toBe(403);
    expect(mocks.findUpcomingScheduleOccurrence).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("a game that isn't on (cancelled, moved, started) is 409", async () => {
    mocks.findUpcomingScheduleOccurrence.mockResolvedValue(null);
    const res = await call("POST", { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: START });
    expect(res.status).toBe(409);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("a failed write is 500", async () => {
    mocks.upsert.mockResolvedValue({ error: { message: "boom" } });
    expect((await call("POST", { venueId: "bar-1", scheduleId: SCHEDULE, startsAt: START })).status).toBe(500);
  });
});

describe("DELETE /api/push/game-reminders", () => {
  it("removes only the session player's own row", async () => {
    const res = await call("DELETE", { scheduleId: SCHEDULE, occurrenceDate: "2026-11-12", userId: "user-1" });
    expect(res.status).toBe(200);
    expect(mocks.deleteEq.mock.calls).toEqual([
      ["user_id", "user-1"],
      ["schedule_id", SCHEDULE],
      ["occurrence_date", "2026-11-12"],
    ]);
  });

  it("rejects a malformed game and refuses without a session", async () => {
    expect((await call("DELETE", { scheduleId: SCHEDULE, occurrenceDate: "Thursday" })).status).toBe(400);
    mocks.resolveRequestUserId.mockReturnValue({ userId: null, forbidden: false });
    expect((await call("DELETE", { scheduleId: SCHEDULE, occurrenceDate: "2026-11-12" })).status).toBe(401);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });
});
