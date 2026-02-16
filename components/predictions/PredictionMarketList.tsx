"use client";

import { useEffect, useState } from "react";
import { calculatePoints, formatProbability } from "@/lib/predictions";
import { getUserId } from "@/lib/storage";
import type { Prediction } from "@/types";

type SubmitState = Record<string, string>;

export function PredictionMarketList({ markets }: { markets: Prediction[] }) {
  const [messages, setMessages] = useState<SubmitState>({});
  const [pendingByMarket, setPendingByMarket] = useState<Record<string, boolean>>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    setUserId(getUserId());
  }, []);

  const submitPick = async (predictionId: string, outcomeId: string) => {
    if (!userId) {
      setMessages((prev) => ({ ...prev, [predictionId]: "Join a venue first to place picks." }));
      return;
    }

    setPendingByMarket((prev) => ({ ...prev, [predictionId]: true }));
    setMessages((prev) => ({ ...prev, [predictionId]: "" }));

    try {
      const response = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, predictionId, outcomeId }),
      });

      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) {
        throw new Error(payload.error ?? "Failed to place pick.");
      }

      setMessages((prev) => ({ ...prev, [predictionId]: "Pick placed successfully." }));
    } catch (error) {
      setMessages((prev) => ({
        ...prev,
        [predictionId]: error instanceof Error ? error.message : "Failed to place pick.",
      }));
    } finally {
      setPendingByMarket((prev) => ({ ...prev, [predictionId]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {!userId && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          You are not joined to a venue in this browser yet. Use the Join page first to place picks.
        </div>
      )}

      {markets.map((market) => (
        <article key={market.id} className="rounded-lg border border-slate-200 p-3">
          <h2 className="font-medium">{market.question}</h2>
          <p className="mt-1 text-xs text-slate-500">
            Closes: {new Date(market.closesAt).toLocaleString()}
          </p>
          <ul className="mt-3 space-y-2">
            {market.outcomes.map((outcome) => (
              <li
                key={outcome.id}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-sm"
              >
                <span>{outcome.title}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {formatProbability(outcome.probability)} · {calculatePoints(outcome.probability)} pts
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void submitPick(market.id, outcome.id);
                    }}
                    disabled={Boolean(pendingByMarket[market.id])}
                    className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Pick
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {messages[market.id] && (
            <p className="mt-2 text-xs text-slate-600">{messages[market.id]}</p>
          )}
        </article>
      ))}
    </div>
  );
}
