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
  
  const testWeek = {
    season: 2099,
    week_number: 99, // Test week
    week_start_date: "2099-09-05",
    week_end_date: "2099-09-09",
    thursday_kickoff: "2099-09-05T20:20:00Z",
    status: "open",
    games_count: 16,
  };

  let weekId: string;

  beforeAll(async () => {
    supabase = createClient<TestDb>(supabaseUrl, supabaseServiceKey);

    // Insert test week
    const { data, error } = await supabase
      .from("nfl_pickem_weeks")
      .insert(testWeek)
      .select("id")
      .single();

    if (error) throw error;
    weekId = data.id;
  });

  afterAll(async () => {
    if (!weekId) return;

    // Clean up
    await supabase.from("nfl_pickem_weeks").delete().eq("id", weekId);
  });

  describe("GET /api/nfl-pickem/weeks", () => {
    it("returns weeks for a season", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/weeks?season=2099`
      );
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.weeks).toBeInstanceOf(Array);
      expect(data.weeks.some((w: any) => w.id === weekId)).toBe(true);
    });

    it("identifies current week correctly", async () => {
      const response = await fetch(
        `http://localhost:3000/api/nfl-pickem/weeks?season=2099`
      );
      const data = await response.json();

      const testWeekData = data.weeks.find((w: any) => w.id === weekId);
      expect(testWeekData).toBeDefined();
      // Since it's in 2099, it shouldn't be "current"
      expect(testWeekData.isCurrent).toBe(false);
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
});
