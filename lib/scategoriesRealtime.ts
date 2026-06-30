"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ScategoriesRound, ScategoriesRoundResults, ScategoriesSession } from "@/types";

// ── Phase model ───────────────────────────────────────────────────────────────

export type ScategoriesPhase =
  | "idle"       // no active session found
  | "lobby"      // session exists, waiting for host to start
  | "answering"  // round is active, timer running
  | "scoring"    // timer expired, awaiting server scoring
  | "results"    // round scored, results visible
  | "complete";  // session ended

export interface ScategoriesSessionState {
  phase:           ScategoriesPhase;
  session:         ScategoriesSession | null;
  round:           ScategoriesRound | null;
  results:         ScategoriesRoundResults | null;
  timeRemaining:   number;        // seconds remaining in current round (0 when not answering)
  isConnected:     boolean;
  error:           string | null;
}

// ── Broadcast payload types ───────────────────────────────────────────────────

type RoundStartedPayload = {
  round: {
    id:         string;
    letter:     string;
    categories: string[];
    startedAt:  string;
    endsAt:     string;
  };
};

type RoundScoredPayload = {
  roundId: string;
  totals: { userId: string; username: string; points: number }[];
};

// ── Hook ──────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 15_000;   // fallback poll when realtime drops
const TIMER_TICK_MS   = 250;       // timer precision

export function useScategoriesSession(venueId: string): ScategoriesSessionState {
  const [phase,         setPhase]         = useState<ScategoriesPhase>("idle");
  const [session,       setSession]       = useState<ScategoriesSession | null>(null);
  const [round,         setRound]         = useState<ScategoriesRound | null>(null);
  const [results,       setResults]       = useState<ScategoriesRoundResults | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isConnected,   setIsConnected]   = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const mountedRef        = useRef(true);
  const scoringCalledRef  = useRef(false);  // prevent double-trigger per round
  const currentRoundIdRef = useRef<string | null>(null);
  const endsAtRef         = useRef<number | null>(null);  // ms epoch

  // ── Apply a round from any source (broadcast or API) ─────────────────────
  // Declared early so loadCurrentRound and the realtime handler can call it.

  const applyRoundRef = useRef<(r: ScategoriesRound) => void>(() => { /* placeholder */ });

  useEffect(() => {
    applyRoundRef.current = (r: ScategoriesRound): void => {
      setRound(r);
      currentRoundIdRef.current = r.id;
      scoringCalledRef.current = false;

      const endsAtMs = new Date(r.endsAt).getTime();
      endsAtRef.current = endsAtMs;

      const remaining = Math.max(0, Math.round((endsAtMs - Date.now()) / 1000));

      if (r.status === "complete") {
        endsAtRef.current = null;
        setTimeRemaining(0);
        setPhase("results");
        return;
      }
      if (r.status === "scoring") {
        endsAtRef.current = null;
        setTimeRemaining(0);
        setPhase("scoring");
        return;
      }
      // active
      setTimeRemaining(remaining);
      setPhase(remaining > 0 ? "answering" : "scoring");
    };
  });

  // ── Load current round ────────────────────────────────────────────────────
  // Declared before loadSession so it can be called from within loadSession.

  const loadCurrentRound = useCallback(async (sessionId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/scategories/sessions/${sessionId}/current-round`);
      const json = (await res.json()) as { ok: boolean; round?: ScategoriesRound | null };
      if (!mountedRef.current || !json.ok || !json.round) return;
      applyRoundRef.current(json.round);
    } catch {
      // Non-fatal — realtime will deliver the round when it starts.
    }
  }, []);

  // ── Load session from API ─────────────────────────────────────────────────

  const loadSession = useCallback(async () => {
    if (!venueId) return;
    try {
      const res = await fetch(`/api/scategories/sessions?venueId=${encodeURIComponent(venueId)}`);
      const json = (await res.json()) as { ok: boolean; session?: ScategoriesSession | null; error?: string };
      if (!mountedRef.current) return;

      if (!json.ok) {
        setError(json.error ?? "Failed to load session.");
        return;
      }

      const s = json.session ?? null;
      setSession(s);
      if (!s) {
        setPhase("idle");
        return;
      }
      if (s.status === "complete") {
        setPhase("complete");
        return;
      }
      if (s.status === "lobby") {
        setPhase("lobby");
        return;
      }
      // Session is active/scoring — load the current round.
      await loadCurrentRound(s.id);
    } catch {
      if (mountedRef.current) setError("Failed to connect to game.");
    }
  }, [venueId, loadCurrentRound]);

  // ── Load results ──────────────────────────────────────────────────────────

  const loadResults = useCallback(async (roundId: string) => {
    try {
      const res = await fetch(`/api/scategories/rounds/${roundId}/results`);
      const json = (await res.json()) as { ok: boolean; results?: ScategoriesRoundResults };
      if (!mountedRef.current || !json.ok || !json.results) return;
      setResults(json.results);
      setPhase("results");
      endsAtRef.current = null;
    } catch {
      // Non-fatal — results panel will handle empty state.
    }
  }, []);

  // ── Scoring trigger ref ────────────────────────────────────────────────────
  // Updated every render so the timer interval always calls the latest version.

  const triggerScoringRef = useRef<(roundId: string) => Promise<void>>(async () => { /* placeholder */ });

  useEffect(() => {
    triggerScoringRef.current = async (roundId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/scategories/rounds/${roundId}/score`, { method: "POST" });
        const json = (await res.json()) as { ok: boolean; results?: ScategoriesRoundResults };
        if (!mountedRef.current) return;
        if (json.ok && json.results) {
          setResults(json.results);
          setPhase("results");
          endsAtRef.current = null;
        } else {
          setPhase("scoring");
        }
      } catch {
        if (mountedRef.current) setPhase("scoring");
      }
    };
  });

  // ── Timer tick ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      if (endsAtRef.current === null) {
        setTimeRemaining(0);
        return;
      }
      const remaining = Math.max(0, Math.round((endsAtRef.current - Date.now()) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0 && !scoringCalledRef.current && currentRoundIdRef.current) {
        scoringCalledRef.current = true;
        void triggerScoringRef.current(currentRoundIdRef.current);
      }
    }, TIMER_TICK_MS);

    return () => clearInterval(interval);
  }, []);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!venueId || !supabase) return;

    const client = supabase;
    let active = true;

    const channel = client
      .channel(`scategories-session:${venueId}`)
      .on("broadcast", { event: "round_started" }, (msg) => {
        if (!active || !mountedRef.current) return;
        const payload = msg.payload as RoundStartedPayload | null;
        if (!payload?.round) return;
        const { id, letter, categories, startedAt, endsAt } = payload.round;
        applyRoundRef.current({
          id,
          sessionId: "",  // not available in broadcast payload — session is tracked separately
          venueId,
          letter,
          categorySetIndex: 0,
          categories,
          startedAt,
          endsAt,
          status: "active",
          createdAt: startedAt,
        });
      })
      .on("broadcast", { event: "round_scored" }, (msg) => {
        if (!active || !mountedRef.current) return;
        const payload = msg.payload as RoundScoredPayload | null;
        if (!payload?.roundId) return;
        void loadResults(payload.roundId);
      })
      .on("broadcast", { event: "session_ended" }, () => {
        if (!active || !mountedRef.current) return;
        setPhase("complete");
        endsAtRef.current = null;
      })
      .subscribe((status) => {
        if (!mountedRef.current) return;
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [venueId, loadResults]);

  // ── Initial load + fallback poll ──────────────────────────────────────────

  const loadSessionRef = useRef(loadSession);

  useEffect(() => {
    loadSessionRef.current = loadSession;
  });

  useEffect(() => {
    mountedRef.current = true;

    const initialLoad = async () => { await loadSessionRef.current(); };
    void initialLoad();

    const poll = setInterval(async () => {
      if (phase === "answering") return;  // timer running — realtime handles it
      await loadSessionRef.current();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(poll);
    };
  }, [venueId]);  // eslint-disable-line react-hooks/exhaustive-deps

  return { phase, session, round, results, timeRemaining, isConnected, error };
}
