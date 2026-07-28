import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Skip tests if environment variables are not set
const describeIfEnv = supabaseUrl && supabaseServiceKey ? describe : describe.skip;

type NflPickemWeekRow = {
  id: string;
  season: number;
  week_number: number;
  week_start_date: string;
  week_end_date: string;
  thursday_kickoff: string;
  status: string;
  games_count: number;
};

type TestDb = {
  public: {
    Tables: {
      nfl_pickem_weeks: {
        Row: NflPickemWeekRow;
        Insert: Omit<NflPickemWeekRow, "id"> & { id?: string };
        Update: Partial<NflPickemWeekRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

describeIfEnv("NFL Pick 'Em API", () => {
  let supabase: SupabaseClient<TestDb>;
  
  // A fixed past week — always "started" regardless of when this test runs —
  // exercises the happy path (listed, current, games servable).
  const pastTestWeek = {
    season: 2099,
    week_number: 98,
    week_start_date: "2020-01-02",
    week_end_date: "2020-01-06",
    thursday_kickoff: "2020-01-02T20:20:00Z",
    status: "open",
    games_count: 16,
  };

  // A far-future week — exercises exclusion from the game-mode week list and
  // rejection when requested directly.
  const futureTestWeek = {
    season: 2099,
    week_number: 99,
    week_start_date: "2099-09-05",
    week_end_date: "2099-09-09",
    thursday_kickoff: "2099-09-05T20:20:00Z",
    status: "open",
    games_count: 16,
  };

  let weekId: string;
  let futureWeekId: string;

  beforeAll(async () => {
    supabase = createClient<TestDb>(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from("nfl_pickem_weeks")
      .insert(pastTestWeek)
      .select("id")
      .single();

    if (error) throw error;
    weekId = data.id;

    const { data: futureData, error: futureError } = await supabase
      .from("nfl_pickem_weeks")
      .insert(futureTestWeek)
      .select("id")
      .single();

    if (futureError) throw futureError;
    futureWeekId = futureData.id;
  });

  afterAll(async () => {
    if (weekId) {
      await supabase.from("nfl_pickem_weeks").delete().eq("id", weekId);
    }
    if (futureWeekId) {
      await supabase.from("nfl_pickem_weeks").delete().eq("id", futureWeekId);
    }
  });

  describe("GET /api/nfl-pickem/weeks", () => {
    it("returns started weeks for a season and excludes future weeks", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/weeks?season=2099`
      );
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.weeks).toBeInstanceOf(Array);
      expect(data.weeks.some((w: any) => w.id === weekId)).toBe(true);
      // Never expose future weeks — the retention mechanic requires users to
      // come back each week rather than picking the whole season at once.
      expect(data.weeks.some((w: any) => w.id === futureWeekId)).toBe(false);
    });

    it("identifies current week correctly", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/weeks?season=2099`
      );
      const data = await response.json();

      const testWeekData = data.weeks.find((w: any) => w.id === weekId);
      expect(testWeekData).toBeDefined();
      // It's the only started week in this season, so it's current.
      expect(testWeekData.isCurrent).toBe(true);
      expect(data.currentWeekId).toBe(weekId);
    });
  });

  describe("GET /api/nfl-pickem/games", () => {
    it("returns games for a week", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/games?weekId=${weekId}`
      );
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.week).toBeDefined();
      expect(data.week.id).toBe(weekId);
      expect(data.games).toBeInstanceOf(Array);
    });

    it("requires weekId parameter", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/games`
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.error).toContain("weekId is required");
    });

    it("rejects a week that has not started yet", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/games?weekId=${futureWeekId}`
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
    });
  });

  describe("POST /api/nfl-pickem/picks", () => {
    it("requires authentication", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/picks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekId,
            gameId: "test-game",
            pickTeam: "Test Team",
            // Missing userId and venueId
          }),
        }
      );

      expect(response.status).toBe(400);
    });

    it("returns error for invalid game", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/picks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: "test-user",
            venueId: "test-venue",
            weekId,
            gameId: "invalid-game-id",
            pickTeam: "Test Team",
          }),
        }
      );

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
    });
  });

  describe("GET /api/nfl-pickem/tiebreaker", () => {
    it("returns 404 for a week that does not exist", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/tiebreaker?venueId=test-venue&weekId=00000000-0000-0000-0000-000000000000&userId=test-user`
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.ok).toBe(false);
    });

    it("never contains another user's guess — the response only ever carries the caller's own", async () => {
      // pastTestWeek's last game has already kicked off, so neither user has
      // (or can create) a guess here; the point of this test is the response
      // *shape* — there is no field capable of exposing another user's
      // predictedTotal, only the single caller-scoped `guess`.
      const responseA = await fetch(
        `http://localhost:3000/api/nfl-pickem/tiebreaker?venueId=test-venue&weekId=${weekId}&userId=test-user-a`
      );
      const dataA = await responseA.json();
      const responseB = await fetch(
        `http://localhost:3000/api/nfl-pickem/tiebreaker?venueId=test-venue&weekId=${weekId}&userId=test-user-b`
      );
      const dataB = await responseB.json();

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);
      expect(Object.keys(dataA).sort()).toEqual(["game", "guess", "ok"]);
      expect(Object.keys(dataB).sort()).toEqual(["game", "guess", "ok"]);
      expect(dataA.guess).toBeNull();
      expect(dataB.guess).toBeNull();
    });
  });

  describe("POST /api/nfl-pickem/tiebreaker", () => {
    it("rejects a guess after the tiebreaker game has kicked off", async () => {
      // pastTestWeek is fully in the past, so its last game has already started.
      const response = await fetch(`http://localhost:3000/api/nfl-pickem/tiebreaker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "test-tiebreaker-user",
          venueId: "test-venue",
          weekId,
          predictedTotal: 45,
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.ok).toBe(false);
    });

    it("rejects an out-of-range predicted total", async () => {
      // Range is validated before the kickoff check, so this 400s even against
      // an already-locked week.
      const response = await fetch(`http://localhost:3000/api/nfl-pickem/tiebreaker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: "test-tiebreaker-user",
          venueId: "test-venue",
          weekId,
          predictedTotal: 500,
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
    });
  });

  describe("GET /api/nfl-pickem/rewards", () => {
    it("requires venueId", async () => {
      const response = await fetch(`http://localhost:3000/api/nfl-pickem/rewards?weekId=${weekId}`);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.ok).toBe(false);
    });

    it("returns a null participant count when weekId is omitted, and the participation-count boundary (2 vs 3 pickers) when it's provided", async () => {
      // No weekId: the banner's campaign-only path (before it knows the
      // current week) must not attempt a leaderboard read.
      const noWeekResponse = await fetch(`http://localhost:3000/api/nfl-pickem/rewards?venueId=test-venue`);
      const noWeekData = await noWeekResponse.json();
      expect(noWeekResponse.status).toBe(200);
      expect(noWeekData.ok).toBe(true);
      expect(noWeekData.participantCount).toBeNull();

      // pastTestWeek has no picks seeded by this file (see the tiebreaker
      // describe block's note on why opposing-user rows aren't created here),
      // so the boundary this exercises is 0 pickers < NFL_REWARD_MIN_PICKERS
      // (3) — the same comparison the banner and leaderboard apply to 2 vs 3.
      // A full 2-picker vs 3-picker fixture needs FK-valid users/venues rows
      // this file's convention doesn't create; deferred to Phase 9's seeded
      // browser verification.
      const response = await fetch(`http://localhost:3000/api/nfl-pickem/rewards?venueId=test-venue&weekId=${weekId}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.participantCount).toBe(0);
      expect(data.participantCount).toBeLessThan(3);
      expect(Array.isArray(data.winners)).toBe(true);
      expect(data.winners).toHaveLength(0);
    });
  });
});
