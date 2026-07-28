"use client";

import { useEffect, useState } from "react";

type TiebreakerGame = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
};

const formatKickoff = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function NFLTiebreakerCard({
  venueId,
  userId,
  weekId,
}: {
  venueId: string;
  userId: string;
  weekId: string;
}) {
  const [game, setGame] = useState<TiebreakerGame | null>(null);
  const [savedGuess, setSavedGuess] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!venueId || !weekId) return;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ venueId, weekId });
        if (userId) params.set("userId", userId);

        const response = await fetch(`/api/nfl-pickem/tiebreaker?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.error);

        if (!controller.signal.aborted) {
          setGame(data.game);
          const predicted: number | null = data.guess?.predictedTotal ?? null;
          setSavedGuess(predicted);
          setInputValue(predicted !== null ? String(predicted) : "");
        }
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => controller.abort();
  }, [venueId, weekId, userId]);

  const handleSave = async () => {
    if (!userId || !venueId || !weekId) {
      setError("Please join a venue to answer the tiebreaker");
      return;
    }

    const predictedTotal = Number(inputValue);
    if (!Number.isInteger(predictedTotal) || predictedTotal < 0 || predictedTotal > 200) {
      setError("Enter a whole number between 0 and 200.");
      return;
    }

    const previousGuess = savedGuess;
    // Optimistic: reflect the save immediately, roll back on failure. No
    // blocking spinner — same pattern as submitPick in NFLPickEmGameList.
    setSavedGuess(predictedTotal);
    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/nfl-pickem/tiebreaker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, venueId, weekId, predictedTotal }),
      });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error);
    } catch (err) {
      setSavedGuess(previousGuess);
      setError(err instanceof Error ? err.message : "Failed to save your guess");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !game) return null;

  return (
    <section className="rounded-2xl border border-[#fde68a]/30 bg-slate-900 px-4 py-4">
      <h2 className="text-[12px] font-black uppercase tracking-[0.16em] text-[#fde68a]">Tiebreaker</h2>
      <p className="mt-1 text-[12px] font-semibold text-slate-400">
        If you tie for the most correct picks this week, this decides the winner.
      </p>
      <p className="mt-3 text-[14px] font-bold text-white">
        How many total points will be scored in {game.awayTeam} at {game.homeTeam}?
      </p>

      {error && <p className="mt-2 text-[12px] font-semibold text-rose-400">{error}</p>}

      {game.isLocked ? (
        <p className="mt-3 text-[13px] font-bold text-slate-300">
          {savedGuess !== null ? `Your guess: ${savedGuess}` : "You didn't answer the tiebreaker."}
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={200}
              inputMode="numeric"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              className="w-24 rounded-xl border border-[#fde68a]/30 bg-slate-950 px-3 py-2 text-[14px] font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#fde68a]/40"
              aria-label="Predicted total points"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || inputValue === ""}
              className="tp-clean-button rounded-xl bg-[#fde68a] px-4 py-2 text-[13px] font-black text-[#1a2f72] disabled:opacity-50"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-500">Locks at {formatKickoff(game.startsAt)}</p>
        </>
      )}
    </section>
  );
}
