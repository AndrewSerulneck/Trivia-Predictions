"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getUserId } from "@/lib/storage";
import { VenueEntryRulesPanel } from "@/components/venue/VenueEntryRulesPanel";

type PickEmPick = {
  id: string;
  sportSlug: string;
  league: string;
  gameLabel: string;
  selectedTeam: string;
  startsAt: string;
  status: "pending" | "won" | "lost" | "push" | "canceled";
  updatedAt?: string;
};

type PickEmPayload = {
  ok: boolean;
  picks?: PickEmPick[];
  error?: string;
};

function formatStatus(status: PickEmPick["status"]): string {
  if (status === "won") return "Correct";
  if (status === "lost") return "Incorrect";
  if (status === "push") return "Push";
  if (status === "canceled") return "Canceled";
  return "Pending";
}

function statusClass(status: PickEmPick["status"]): string {
  if (status === "won") return "bg-emerald-100 text-emerald-800";
  if (status === "lost") return "bg-rose-100 text-rose-800";
  if (status === "push") return "bg-sky-100 text-sky-800";
  if (status === "canceled") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function formatLocalDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown time";
  }
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PickEmRecentPicks() {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [picks, setPicks] = useState<PickEmPick[]>([]);

  useEffect(() => {
    setUserId(getUserId() ?? "");
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!userId) {
        setLoading(false);
        setPicks([]);
        return;
      }

      setLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(
          `/api/pickem/picks?userId=${encodeURIComponent(userId)}&includeSettled=true&limit=60`,
          { cache: "no-store" }
        );
        const payload = (await response.json()) as PickEmPayload;
        if (!payload.ok) {
          throw new Error(payload.error ?? "Failed to load Pick 'Em picks.");
        }
        setPicks(payload.picks ?? []);
      } catch (error) {
        setPicks([]);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load Pick 'Em picks.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [userId]);

  const recentPicks = useMemo(() => picks.slice(0, 12), [picks]);
  const activePickCount = useMemo(
    () => picks.filter((pick) => pick.status === "pending").length,
    [picks]
  );

  return (
    <div className="space-y-4">
      <VenueEntryRulesPanel
        gameKey="pickem"
        shouldDisplay={Boolean(userId) && !loading && activePickCount === 0}
      />
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Your Pick &apos;Em Picks</h3>
        </div>

        {errorMessage ? (
          <p className="mt-2 text-sm text-rose-700">{errorMessage}</p>
        ) : loading ? (
          <p className="mt-2 text-sm text-slate-600">Loading your picks...</p>
        ) : recentPicks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No picks yet. Choose a sport above to start playing.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {recentPicks.map((pick) => (
              <li key={pick.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">{pick.gameLabel}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass(pick.status)}`}>
                    {formatStatus(pick.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-700">
                  Picked: <span className="font-semibold">{pick.selectedTeam}</span>
                </p>
                <p className="mt-1 text-xs text-slate-600">Game start: {formatLocalDateTime(pick.startsAt)}</p>
                {pick.status === "pending" ? (
                  <Link
                    href={`/pickem?sport=${encodeURIComponent(pick.sportSlug)}`}
                    className="mt-2 inline-flex text-xs font-semibold text-blue-700 underline"
                  >
                    Open this sport
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
