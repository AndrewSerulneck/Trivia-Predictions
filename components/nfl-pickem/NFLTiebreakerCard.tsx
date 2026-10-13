"use client";

import { Check } from "lucide-react";

import { haptic } from "@/lib/haptics";

import { ButtonSpinner } from "@/components/ui/ButtonSpinner";

import { useEffect, useRef, useState } from "react";

type TiebreakerGame = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  startsAt: string;
  isLocked: boolean;
};

// How long the Save button stays green with "Saved!" after a successful save.
const SAVED_FLASH_MS = 2500;

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
  const savingRef = useRef(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
  }, []);

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
    if (savingRef.current || game?.isLocked) return;
    if (!userId || !venueId || !weekId) {
      setError("Please join a venue to answer the tiebreaker");
      return;
    }

    const predictedTotal = inputValue.trim() === "" ? NaN : Number(inputValue);
    if (!Number.isInteger(predictedTotal) || predictedTotal < 0 || predictedTotal > 200) {
      setError("Enter a whole number between 0 and 200.");
      return;
    }

    const previousGuess = savedGuess;
    // Optimistic: reflect the save immediately, roll back on failure. No
    // blocking spinner — same pattern as submitPick in NFLPickEmGameList.
    setSavedGuess(predictedTotal);
    savingRef.current = true;
    setSaveMessage("");
    setJustSaved(false);
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
      setSaveMessage("Tiebreaker saved");
      setJustSaved(true);
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => setJustSaved(false), SAVED_FLASH_MS);
      haptic("success");
    } catch (err) {
      setSavedGuess(previousGuess);
      setError(err instanceof Error ? err.message : "Failed to save your guess");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading || !game) return null;

  // The saved guess is confirmed on screen only while the box still shows it;
  // once the player types a different number it is an unsaved edit again.
  const showSavedGuess = savedGuess !== null && !saving && inputValue.trim() === String(savedGuess);

  return (
    <section className="rounded-2xl border border-[#fde68a]/30 bg-slate-900 px-4 py-4">
      <h2 className="text-caption font-black uppercase tracking-[0.16em] text-[#fde68a]">Tiebreaker</h2>
      <p className="mt-1 text-caption font-semibold text-slate-400">
        If you tie for the most correct picks this week, this decides the winner.
      </p>
      <p className="mt-3 text-[14px] font-bold text-white">
        How many total points will be scored in {game.awayTeam} at {game.homeTeam}?
      </p>

      <p role="status" className="sr-only">{saveMessage}</p>
      {error && <p role="alert" className="mt-2 text-caption font-semibold text-rose-400">{error}</p>}

      {game.isLocked ? (
        <p className="mt-3 text-footnote font-bold text-slate-300">
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
              disabled={saving}
              value={inputValue}
              onChange={(event) => {
                setInputValue(event.target.value);
                setJustSaved(false);
              }}
              className="w-24 rounded-xl border border-[#fde68a]/30 bg-slate-950 px-3 py-2 text-[14px] font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#fde68a]/40"
              aria-label="Predicted total points"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || inputValue === ""}
              className={`tp-player-hit-target tp-player-pressable tp-clean-button inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-footnote font-black transition-all duration-300 disabled:opacity-50 ${
                justSaved ? "scale-105 bg-emerald-400 text-emerald-950" : "scale-100 bg-[#fde68a] text-[#1a2f72]"
              }`}
              aria-busy={saving}
            >
              {saving ? <ButtonSpinner /> : null}
              {justSaved ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : null}
              {saving ? "Saving…" : justSaved ? "Saved!" : "Save"}
            </button>
          </div>
          {showSavedGuess && (
            <p className="mt-2 inline-flex items-center gap-1 text-caption font-bold text-emerald-400">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              Your guess of {savedGuess} is saved
            </p>
          )}
          <p className="mt-2 text-caption font-semibold text-slate-500">Locks at {formatKickoff(game.startsAt)}</p>
        </>
      )}
    </section>
  );
}
