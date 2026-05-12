import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type LiveStatsRow = {
  game_id: string;
  player_id: number;
  player_name: string;
  team_name: string;
  total_fantasy_points: number;
  game_status: string;
  source_updated_at: string;
};

function toClientErrorStatus(message: string): number {
  const normalized = message.toLowerCase();
  if (normalized.includes("required") || normalized.includes("invalid")) {
    return 400;
  }
  return 500;
}

export async function GET(request: Request) {
  try {
    if (!supabaseAdmin) {
      throw new Error("Supabase admin client is not configured.");
    }

    const { searchParams } = new URL(request.url);
    const gameId = String(searchParams.get("gameId") ?? "").trim();
    const rosterPlayerIds = String(searchParams.get("rosterPlayerIds") ?? "")
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
    const limitRaw = Number.parseInt(String(searchParams.get("limit") ?? "60"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(10, Math.min(200, limitRaw)) : 60;

    if (!gameId) {
      return NextResponse.json({ ok: true, rows: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("live_player_stats")
      .select("game_id, player_id, player_name, team_name, total_fantasy_points, game_status, source_updated_at")
      .eq("game_id", gameId)
      .in("sport_key", ["nba", "basketball_nba", "NBA"])
      .order("team_name", { ascending: true })
      .order("total_fantasy_points", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(error.message ?? "Failed to load live player stats.");
    }

    let rows = ((data as LiveStatsRow[] | null) ?? []).map((row) => ({
      gameId: String(row.game_id ?? "").trim(),
      playerId: Number(row.player_id ?? 0),
      playerName: String(row.player_name ?? "").trim(),
      teamName: String(row.team_name ?? "").trim(),
      fantasyPoints: Number(Number(row.total_fantasy_points ?? 0).toFixed(2)),
      gameStatus: String(row.game_status ?? "").trim(),
      sourceUpdatedAt: String(row.source_updated_at ?? "").trim(),
    }));

    // Fallback: if game-based rows are empty, resolve using roster player IDs.
    if (rows.length === 0 && rosterPlayerIds.length > 0) {
      const sinceIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { data: rosterRows, error: rosterError } = await supabaseAdmin
        .from("live_player_stats")
        .select("game_id, player_id, player_name, team_name, total_fantasy_points, game_status, source_updated_at")
        .in("player_id", rosterPlayerIds)
        .in("sport_key", ["nba", "basketball_nba", "NBA"])
        .gte("source_updated_at", sinceIso)
        .order("source_updated_at", { ascending: false })
        .limit(Math.max(limit, rosterPlayerIds.length * 4));

      if (rosterError) {
        throw new Error(rosterError.message ?? "Failed to load roster fallback live stats.");
      }

      const latestByPlayer = new Map<number, LiveStatsRow>();
      for (const row of (rosterRows as LiveStatsRow[] | null) ?? []) {
        const playerId = Number(row.player_id ?? 0);
        if (!Number.isFinite(playerId) || playerId <= 0 || latestByPlayer.has(playerId)) {
          continue;
        }
        latestByPlayer.set(playerId, row);
      }
      rows = Array.from(latestByPlayer.values()).map((row) => ({
        gameId: String(row.game_id ?? "").trim(),
        playerId: Number(row.player_id ?? 0),
        playerName: String(row.player_name ?? "").trim(),
        teamName: String(row.team_name ?? "").trim(),
        fantasyPoints: Number(Number(row.total_fantasy_points ?? 0).toFixed(2)),
        gameStatus: String(row.game_status ?? "").trim(),
        sourceUpdatedAt: String(row.source_updated_at ?? "").trim(),
      }));
    }

    return NextResponse.json({ ok: true, rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load live player stats.";
    return NextResponse.json({ ok: false, error: message }, { status: toClientErrorStatus(message) });
  }
}
