"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShareWinButton } from "@/components/social-share/ShareWinButton";
import type { BracketStandingView } from "@/lib/bracketsEntries";
import type { BracketKind } from "@/lib/brackets/tree";
import { filterBracketStandings } from "@/lib/bracketsView";

// One venue's standings for one bracket (docs/squares-and-brackets-plan.md Phase 8): rank, username,
// points. Read when the tab opens and when the player taps Refresh — never polled. "Find a player"
// filters the list that is already here; usernames only, never another player's picks.

const PAGE_SIZE = 50;

type Response = { ok: true; standings: BracketStandingView[] } | { ok: false; error?: string };

export function BracketStandings({
  identity,
  tournamentId,
  kind,
  isComplete,
}: {
  identity: { userId: string; venueId: string };
  tournamentId: string;
  kind: BracketKind;
  /** The bracket has finished (phase "complete"): only then is a podium place a result worth sharing. */
  isComplete: boolean;
}) {
  const [rows, setRows] = useState<BracketStandingView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ venueId: identity.venueId, userId: identity.userId, tournamentId, kind });
      const response = await fetch(`/api/bracket/standings?${params}`, { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as Response | null;
      if (!aliveRef.current) return;
      if (!response.ok || !data || !data.ok) {
        setFailed(true);
        return;
      }
      setRows(data.standings);
      setFailed(false);
    } catch {
      if (aliveRef.current) setFailed(true);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }, [identity.userId, identity.venueId, kind, tournamentId]);

  useEffect(() => {
    aliveRef.current = true;
    void Promise.resolve().then(load);
    return () => {
      aliveRef.current = false;
    };
  }, [load]);

  const me = rows?.find((row) => row.mine) ?? null;
  const filtered = useMemo(() => filterBracketStandings(rows ?? [], query), [rows, query]);
  const visible = query.trim() ? filtered : filtered.slice(0, shown);

  if (rows === null) {
    return failed ? (
      <section className="space-y-2 rounded-2xl bg-black/25 px-4 py-6 text-center">
        <h2 className="text-xl font-black [font-family:var(--ht-font-display)]">Standings didn&apos;t load</h2>
        <p className="text-footnote font-semibold text-orange-100/80">Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="tp-player-hit-target tp-player-pressable rounded-2xl !border-0 bg-amber-300 px-5 py-2.5 text-base font-black text-slate-950"
        >
          Try again
        </button>
      </section>
    ) : (
      <p className="py-8 text-center text-footnote font-semibold text-orange-100/80" aria-live="polite">
        Loading standings…
      </p>
    );
  }

  return (
    <section aria-label="Standings" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-footnote font-black text-orange-100/80" aria-live="polite">
          {rows.length === 0
            ? "Nobody has a bracket here yet"
            : me
              ? `You're #${me.rank} of ${rows.length}`
              : `${rows.length} ${rows.length === 1 ? "player" : "players"}`}
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="tp-player-pressable !rounded-full !border-0 bg-white/10 !px-3 text-footnote !font-black text-white disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isComplete && me && me.rank >= 1 && me.rank <= 3 ? (
        <ShareWinButton gameType="bracket" result={{ finalRank: me.rank, finalPoints: me.score }} />
      ) : null}

      {rows.length > 0 ? (
        <>
          <label className="block">
            <span className="sr-only">Find a player</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a player"
              autoComplete="off"
              className="w-full px-3 py-2 text-base font-semibold text-white"
            />
          </label>

          {visible.length === 0 ? (
            <p className="px-1 py-4 text-center text-footnote font-semibold text-orange-100/80">No player named &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ol className="divide-y divide-white/10 rounded-2xl bg-black/25 px-3">
              {visible.map((row) => (
                <li key={`${row.rank}-${row.username}`} className="flex items-center gap-3 py-2.5">
                  <span className="w-9 shrink-0 text-right text-base font-black tabular-nums text-orange-200">{row.rank}</span>
                  <span className={`min-w-0 flex-1 truncate text-base font-black ${row.mine ? "text-amber-200" : "text-white"}`}>
                    {row.mine ? `${row.username} (you)` : row.username}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-base font-black tabular-nums">{row.score.toLocaleString("en-US")}</span>
                    <span className="block text-caption font-semibold text-orange-100/70">best {row.maxPossible.toLocaleString("en-US")}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}

          {!query.trim() && filtered.length > shown ? (
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE_SIZE)}
              className="tp-player-hit-target tp-player-pressable w-full !rounded-2xl !border-0 bg-white/10 px-4 py-2.5 text-base !font-black text-white"
            >
              Show more
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
