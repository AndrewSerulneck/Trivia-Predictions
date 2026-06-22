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
  sinceIso?: string;
  leagueName?: string;
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
  const sinceIso = String(params.sinceIso ?? "").trim();
  const sinceTs = Date.parse(sinceIso);
  const leagueName = String(params.leagueName ?? "NBA").trim() || "NBA";
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
      // Defer state updates to avoid synchronous setState in effect body
      Promise.resolve().then(() => setRows([]));
      Promise.resolve().then(() => setLoading(false));
      return;
    }
    const client = supabase;

  let active = true;
  // Defer synchronous state updates to avoid calling setState directly in effect body
  Promise.resolve().then(() => setLoading(true));
  Promise.resolve().then(() => setError(""));

    const loadInitial = async () => {
      let query = client
        .from("live_player_stats")
        .select(
          "id, game_id, player_id, player_name, team_id, team_name, league_id, league_name, game_status, pts, ast, reb, stl, blk, turnovers, total_fantasy_points, source_updated_at, created_at, updated_at"
        )
        .eq("league_name", leagueName)
        .order("source_updated_at", { ascending: false })
        .limit(500);

      if (gameId) {
        query = query.eq("game_id", gameId);
      }
      if (rosterPlayerIds.length > 0) {
        query = query.in("player_id", rosterPlayerIds);
      }
      if (Number.isFinite(sinceTs)) {
        query = query.gte("source_updated_at", new Date(sinceTs).toISOString());
      }

      const { data, error: loadError } = await query;
      if (!active) {
        return;
      }
      if (loadError) {
        setError(loadError.message ?? "Failed to load live stats.");
        Promise.resolve().then(() => setRows([]));
      } else {
        Promise.resolve().then(() => setRows(((data ?? []) as LivePlayerStatRow[]).sort(byPlayerThenGame)));
      }
      Promise.resolve().then(() => setLoading(false));
    };

    void loadInitial();

    const sportKey =
      leagueName === "WNBA" ? "basketball_wnba" :
      leagueName === "MLB"  ? "baseball_mlb"    :
                              "basketball_nba";

    const channel = client
      .channel(`live-stats:${sportKey}`)
      .on(
        "broadcast",
        { event: "stat_update" },
        (payload) => {
          if (!active) return;
          const nextRow = (payload.payload ?? null) as LivePlayerStatRow | null;
          if (!nextRow) return;
          if (gameId && String(nextRow.game_id ?? "").trim() !== gameId) {
            return;
          }
          if (Number.isFinite(sinceTs)) {
            const rowTs = Date.parse(String(nextRow.source_updated_at ?? ""));
            if (!Number.isFinite(rowTs) || rowTs < sinceTs) {
              return;
            }
          }
          if (rosterPlayerIds.length > 0 && !rosterPlayerIds.includes(Number(nextRow.player_id))) {
            return;
          }

          setRows((previous) => {
            const next = [...previous];
            const index = next.findIndex((row) => row.game_id === nextRow.game_id && row.player_id === nextRow.player_id);
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
  }, [enabled, gameId, leagueName, rosterPlayerIds, sinceIso, sinceTs]);

  return { rows, loading, error };
}
