"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/errors";
import type { PickEmGame } from "@/types";

type FetchStatus = "idle" | "loading" | "success" | "error";

export function PickEmSettlementSection() {
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [games, setGames] = useState<PickEmGame[]>([]);
  const [settling, setSettling] = useState<Record<string, boolean>>({});

  const fetchGames = useCallback(async () => {
    setStatus("loading");
    setError(null);
    try {
      // Assuming an API route to get unsettled pickem games
      const response = await fetch("/api/admin?resource=pickem-unsettled");
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to fetch games");
      }
      const data = await response.json();
      setGames(data.items || []);
      setStatus("success");
    } catch (err) {
      setError(getErrorMessage(err, "An unexpected error occurred."));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void fetchGames();
  }, [fetchGames]);

  const handleSettleGame = async (gameId: string, winningTeamId: string) => {
    setSettling((prev) => ({ ...prev, [gameId]: true }));
    setError(null);
    try {
      const response = await fetch("/api/admin/settle-pickem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, winningTeamId }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to settle game");
      }
      // Refresh games list after settlement
      void fetchGames();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to settle game."));
    } finally {
      setSettling((prev) => ({ ...prev, [gameId]: false }));
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-900 text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Pick 'Em Settlement</h1>
        <button
          onClick={fetchGames}
          className="px-4 py-2 text-sm font-medium rounded-md text-white bg-slate-700 hover:bg-slate-600"
        >
          Refresh Games
        </button>
      </div>

      {status === "loading" && <p>Loading games...</p>}
      {status === "error" && <p className="text-red-500">{error}</p>}
      {status === "success" && (
        <div className="space-y-4">
          {games.map((game) => (
            <div key={game.id} className="bg-slate-800 p-4 rounded-lg">
              <h2 className="text-lg font-semibold">{game.home_team} vs {game.away_team}</h2>
              <p className="text-sm text-slate-400">{new Date(game.start_time).toLocaleString()}</p>
              <div className="mt-4">
                <p className="text-sm font-medium mb-2">Select Winner:</p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleSettleGame(game.id, game.home_team_id)}
                    disabled={settling[game.id]}
                    className="flex-1 px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {settling[game.id] ? "Settling..." : game.home_team}
                  </button>
                  <button
                    onClick={() => handleSettleGame(game.id, game.away_team_id)}
                    disabled={settling[game.id]}
                    className="flex-1 px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {settling[game.id] ? "Settling..." : game.away_team}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {games.length === 0 && <p>No unsettled games found.</p>}
        </div>
      )}
    </div>
  );
}
