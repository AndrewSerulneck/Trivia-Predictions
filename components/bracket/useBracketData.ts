"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BracketTournamentView } from "@/lib/bracketsEntries";
import { bracketMaxPossible } from "@/lib/brackets/scoring";
import type { BracketKind } from "@/lib/brackets/tree";
import { BRACKET_STATE_STALE_MS, bracketStateCanChange, withSavedEntry } from "@/lib/bracketsView";

// The bracket screen's reads and writes (docs/squares-and-brackets-plan.md Phase 8, cost rules in §6).
// NO polling: the state is read once when the page opens, again only when the player returns to the tab
// after BRACKET_STATE_STALE_MS (and something can still change), once at the moment a bracket locks,
// and after a copy. A save patches the state it already holds instead of re-reading it.

export type BracketLoadStatus = "loading" | "ready" | "error" | "off" | "no-venue";

export type BracketWriteResult = { ok: boolean; outcome: string | null; network?: boolean };

type StateResponse = { ok: true; tournaments: BracketTournamentView[] } | { ok: false; error?: string };
type WriteResponse = { ok?: boolean; outcome?: string; savedAt?: string | null } | null;

/** setTimeout can't take more than 2^31 − 1 ms; a lock further away than a day is re-checked on return instead. */
const MAX_LOCK_TIMER_MS = 24 * 60 * 60_000;

export function useBracketData(identity: { userId: string; venueId: string } | null) {
  const [status, setStatus] = useState<BracketLoadStatus>(identity ? "loading" : "no-venue");
  const [tournaments, setTournaments] = useState<BracketTournamentView[]>([]);
  const tournamentsRef = useRef<BracketTournamentView[]>([]);
  const lastReadAtRef = useRef(0);
  const inFlightRef = useRef(false);
  const aliveRef = useRef(true);

  const userId = identity?.userId ?? "";
  const venueId = identity?.venueId ?? "";

  const load = useCallback(async (): Promise<void> => {
    if (!userId || !venueId || inFlightRef.current) return;
    inFlightRef.current = true;
    lastReadAtRef.current = Date.now();
    try {
      const params = new URLSearchParams({ venueId, userId });
      const response = await fetch(`/api/bracket/state?${params}`, { cache: "no-store" });
      if (response.status === 404) {
        if (aliveRef.current) setStatus("off");
        return;
      }
      const data = (await response.json().catch(() => null)) as StateResponse | null;
      if (!aliveRef.current) return;
      if (!response.ok || !data || !data.ok) {
        // Keep showing what we have; only a first load that fails is an error.
        if (tournamentsRef.current.length === 0) setStatus("error");
        return;
      }
      tournamentsRef.current = data.tournaments;
      setTournaments(data.tournaments);
      setStatus("ready");
    } catch {
      if (aliveRef.current && tournamentsRef.current.length === 0) setStatus("error");
    } finally {
      inFlightRef.current = false;
    }
  }, [userId, venueId]);

  // First read, and a catch-up read on returning to a tab that has been away a while.
  useEffect(() => {
    aliveRef.current = true;
    if (!userId || !venueId) return;
    void Promise.resolve().then(() => load());
    const onVisible = () => {
      if (document.hidden || !aliveRef.current) return;
      const stale = Date.now() - lastReadAtRef.current >= BRACKET_STATE_STALE_MS;
      if (stale && (tournamentsRef.current.length === 0 || bracketStateCanChange(tournamentsRef.current))) void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      aliveRef.current = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, venueId, load]);

  // One read at the moment a live bracket locks, so an editor still open flips to the locked view. A
  // rehearsal runs on its own clock (the server decides its phase), so it is not timed here.
  const lockTimes = tournaments
    .filter((tournament) => !tournament.rehearsal)
    .flatMap((tournament) => (["main", "second"] as const).map((kind) => tournament.kinds[kind]))
    .filter((entry) => entry.phase === "open" && entry.lockAt)
    .map((entry) => Date.parse(entry.lockAt as string))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b)
    .join(",");
  useEffect(() => {
    const next = lockTimes
      .split(",")
      .map(Number)
      .filter((ms) => Number.isFinite(ms) && ms > Date.now())[0];
    if (next === undefined) return;
    const wait = next - Date.now() + 1500;
    if (wait > MAX_LOCK_TIMER_MS) return;
    const timer = window.setTimeout(() => void load(), wait);
    return () => window.clearTimeout(timer);
  }, [lockTimes, load]);

  /** Save (create or replace) a bracket, drafts included. */
  const save = useCallback(
    async (params: {
      tournamentId: string;
      kind: BracketKind;
      picks: ReadonlyArray<number | null>;
      tiebreaker: number | null;
      keepalive?: boolean;
    }): Promise<BracketWriteResult> => {
      try {
        const response = await fetch("/api/bracket/entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: params.keepalive === true,
          body: JSON.stringify({
            venueId,
            userId,
            tournamentId: params.tournamentId,
            kind: params.kind,
            picks: params.picks,
            tiebreaker: params.tiebreaker,
          }),
        });
        const data = (await response.json().catch(() => null)) as WriteResponse;
        if (response.ok && data?.ok) {
          const savedAt = data.savedAt ?? new Date().toISOString();
          const current = tournamentsRef.current;
          const tournament = current.find((t) => t.id === params.tournamentId);
          if (tournament) {
            const next = withSavedEntry(current, {
              tournamentId: params.tournamentId,
              kind: params.kind,
              picks: params.picks,
              tiebreaker: params.tiebreaker,
              savedAt,
              maxPossible: bracketMaxPossible(params.picks, tournament.winnerSeats, params.kind),
            });
            tournamentsRef.current = next;
            if (aliveRef.current) setTournaments(next);
          }
          return { ok: true, outcome: "saved" };
        }
        // A refusal that means the world moved (locked, not open) is worth a fresh read.
        if (data?.outcome === "locked" || data?.outcome === "not_open") void load();
        return { ok: false, outcome: data?.outcome ?? null };
      } catch {
        return { ok: false, outcome: null, network: true };
      }
    },
    [load, userId, venueId],
  );

  /** "Copy my picks from <Venue>": the server copies, then we read the result once. */
  const copy = useCallback(
    async (params: { tournamentId: string; kind: BracketKind; fromVenueId: string }): Promise<BracketWriteResult> => {
      try {
        const response = await fetch("/api/bracket/copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueId, userId, ...params }),
        });
        const data = (await response.json().catch(() => null)) as WriteResponse;
        if (response.ok && data?.ok) {
          await load();
          return { ok: true, outcome: "saved" };
        }
        if (data?.outcome === "locked" || data?.outcome === "not_open") void load();
        return { ok: false, outcome: data?.outcome ?? null };
      } catch {
        return { ok: false, outcome: null, network: true };
      }
    },
    [load, userId, venueId],
  );

  const reload = useCallback(() => {
    setStatus("loading");
    void load();
  }, [load]);

  return { status: identity ? status : ("no-venue" as const), tournaments, save, copy, reload };
}
