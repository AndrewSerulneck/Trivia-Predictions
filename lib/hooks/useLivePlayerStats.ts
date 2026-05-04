"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type LivePlayerStatRow = {
  id: string;
  game_id: string;
  player_id: number;
  player_name: string;
  team_id: number | null;
  team_name: string;
  league_id: number | null;
  league_name: string;
  game_status: string;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  blk: number;
  turnovers: number;
  total_fantasy_points: number;
  source_updated_at: string;
  created_at: string;
  updated_at: string;
};

type UseLivePlayerStatsParams = {
  gameId?: string;
  rosterPlayerIds?: number[];
  enabled?: boolean;
};

type UseLivePlayerStatsResult = {
  rows: LivePlayerStatRow[];
  loading: boolean;
  error: string;
};

function byPlayerThenGame(a: LivePlayerStatRow, b: LivePlayerStatRow): number {
  if (a.player_name !== b.player_name) {
    return a.player_name.localeCompare(b.player_name);
  }
  return a.game_id.localeCompare(b.game_id);
}

export function useLivePlayerStats(params: UseLivePlayerStatsParams): UseLivePlayerStatsResult {
  const gameId = String(params.gameId ?? "").trim();
  const rosterPlayerIds = useMemo(
    () =>
      (params.rosterPlayerIds ?? [])
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0),
    [params.rosterPlayerIds]
  );
  const enabled = params.enabled !== false;

  const [rows, setRows] = useState<LivePlayerStatRow[]>([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase || !enabled) {
      setRows([]);
      setLoading(false);
      return;
    }
    const client = supabase;

    let active = true;
    setLoading(true);
    setError("");

    const loadInitial = async () => {
      let query = client
        .from("live_player_stats")
        .select(
          "id, game_id, player_id, player_name, team_id, team_name, league_id, league_name, game_status, pts, ast, reb, stl, blk, turnovers, total_fantasy_points, source_updated_at, created_at, updated_at"
        )
        .order("source_updated_at", { ascending: false })
        .limit(500);

      if (gameId) {
        query = query.eq("game_id", gameId);
      }
      if (rosterPlayerIds.length > 0) {
        query = query.in("player_id", rosterPlayerIds);
      }

      const { data, error: loadError } = await query;
      if (!active) {
        return;
      }
      if (loadError) {
        setError(loadError.message ?? "Failed to load live stats.");
        setRows([]);
      } else {
        setRows(((data ?? []) as LivePlayerStatRow[]).sort(byPlayerThenGame));
      }
      setLoading(false);
    };

    void loadInitial();

    const channel = client
      .channel(
        `live-player-stats:${gameId || "all"}:${rosterPlayerIds.length > 0 ? rosterPlayerIds.join("-") : "all"}`
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_player_stats", filter: gameId ? `game_id=eq.${gameId}` : undefined },
        (payload) => {
          if (!active) return;
          const nextRow = (payload.new ?? payload.old ?? null) as LivePlayerStatRow | null;
          if (!nextRow) return;
          if (rosterPlayerIds.length > 0 && !rosterPlayerIds.includes(Number(nextRow.player_id))) {
            return;
          }

          setRows((previous) => {
            const next = [...previous];
            const index = next.findIndex((row) => row.game_id === nextRow.game_id && row.player_id === nextRow.player_id);
            if (payload.eventType === "DELETE") {
              if (index >= 0) next.splice(index, 1);
              return next.sort(byPlayerThenGame);
            }
            if (index >= 0) {
              next[index] = { ...next[index], ...nextRow };
            } else {
              next.push(nextRow);
            }
            return next.sort(byPlayerThenGame);
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [enabled, gameId, rosterPlayerIds]);

  return { rows, loading, error };
}
