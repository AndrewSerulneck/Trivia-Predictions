"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ROUND_INTERVAL_SECONDS } from "@/lib/categoryBlitzShared";
import type {
  CategoryBlitzRound,
  CategoryBlitzRoundResults,
  CategoryBlitzSession,
  CategoryBlitzViewerRole,
} from "@/types";

// ── Phase model ───────────────────────────────────────────────────────────────

export type CategoryBlitzPhase =
  | "idle"       // no active session found
  | "lobby"      // session exists, waiting for host to start
  | "answering"  // round is active, timer running
  | "scoring"    // timer expired, awaiting server scoring
  | "results"    // round scored, results visible
  | "complete";  // session ended

export interface CategoryBlitzSessionState {
  phase:           CategoryBlitzPhase;
  session:         CategoryBlitzSession | null;
  round:           CategoryBlitzRound | null;
  results:         CategoryBlitzRoundResults | null;
  timeRemaining:   number;        // seconds remaining in current round (0 when not answering)
  nextRoundStartsIn: number | null;
  /** Seconds until the lobby's round starts, or null when there's no known start time (e.g. a manual session). */
  lobbyCountdown:  number | null;
  isConnected:     boolean;
  error:           string | null;
  /**
   * True once `error` has persisted across several consecutive poll failures
   * (see ESCALATE_AFTER_FAILURES) — distinguishes a real, ongoing outage from
   * a single transient blip so the UI can escalate from a quiet "Reconnecting…"
   * badge to a blocking error state that the player can actually act on.
   */
  errorEscalated:  boolean;
  /** null outside an active/scoring round, or when viewer identity can't be resolved. */
  viewerRole:      CategoryBlitzViewerRole | null;
  /** Manually re-attempt loading the session — for the escalated error state's retry action. */
  retry: () => void;
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
// After this many consecutive loadSession failures (~1 minute at POLL_INTERVAL_MS),
// treat the outage as persistent rather than a transient blip and escalate.
const ESCALATE_AFTER_FAILURES = 4;

export function useCategoryBlitzSession(venueId: string, userId: string): CategoryBlitzSessionState {
  const [phase,         setPhase]         = useState<CategoryBlitzPhase>("idle");
  const [session,       setSession]       = useState<CategoryBlitzSession | null>(null);
  const [round,         setRound]         = useState<CategoryBlitzRound | null>(null);
  const [results,       setResults]       = useState<CategoryBlitzRoundResults | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [nextRoundStartsIn, setNextRoundStartsIn] = useState<number | null>(null);
  const [lobbyCountdown, setLobbyCountdown] = useState<number | null>(null);
  const [isConnected,   setIsConnected]   = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [errorEscalated, setErrorEscalated] = useState(false);
  const [viewerRole,    setViewerRole]    = useState<CategoryBlitzViewerRole | null>(null);

  const mountedRef        = useRef(true);
  const errorStreakRef    = useRef(0);       // consecutive loadSession failures
  const scoringCalledRef  = useRef(false);  // prevent double-trigger per round
  const currentRoundIdRef = useRef<string | null>(null);
  const endsAtRef         = useRef<number | null>(null);  // ms epoch
  const lobbyStartsAtRef  = useRef<number | null>(null);  // ms epoch
  const sessionIdRef      = useRef<string | null>(null);
  const userIdRef         = useRef(userId);
  const loadResultsRef    = useRef<(roundId: string) => Promise<void>>(async () => {});

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (venueId) return;
    const resetId = window.setTimeout(() => {
      setPhase("idle");
      setSession(null);
      setRound(null);
      setResults(null);
      setTimeRemaining(0);
      setNextRoundStartsIn(null);
      setLobbyCountdown(null);
      setError(null);
      setErrorEscalated(false);
      setIsConnected(false);
      setViewerRole(null);
      endsAtRef.current = null;
      lobbyStartsAtRef.current = null;
      currentRoundIdRef.current = null;
      scoringCalledRef.current = false;
      errorStreakRef.current = 0;
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [venueId]);

  // ── Apply a round from any source (broadcast or API) ─────────────────────
  // Declared early so loadCurrentRound and the realtime handler can call it.

  const applyRoundRef = useRef<(r: CategoryBlitzRound) => void>(() => { /* placeholder */ });

  useEffect(() => {
    applyRoundRef.current = (r: CategoryBlitzRound): void => {
      setRound(r);
      currentRoundIdRef.current = r.id;
      scoringCalledRef.current = false;

      const endsAtMs = new Date(r.endsAt).getTime();
      endsAtRef.current = endsAtMs;

      const remaining = Math.max(0, Math.round((endsAtMs - Date.now()) / 1000));
      const nextStartAtMs = new Date(r.startedAt).getTime() + ROUND_INTERVAL_SECONDS * 1000;
      const nextStartRemaining = Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000));

      if (r.status === "complete") {
        endsAtRef.current = null;
        setTimeRemaining(0);
        setNextRoundStartsIn(nextStartRemaining);
        setPhase("results");
        return;
      }
      if (r.status === "scoring") {
        endsAtRef.current = null;
        setTimeRemaining(0);
        setNextRoundStartsIn(nextStartRemaining);
        setPhase("scoring");
        return;
      }
      // active
      setTimeRemaining(remaining);
      setNextRoundStartsIn(null);
      setPhase(remaining > 0 ? "answering" : "scoring");
    };
  });

  // ── Load current round ────────────────────────────────────────────────────
  // Declared before loadSession so it can be called from within loadSession.

  const loadCurrentRound = useCallback(async (sessionId: string): Promise<void> => {
    try {
      const userIdParam = userIdRef.current ? `?userId=${encodeURIComponent(userIdRef.current)}` : "";
      const res = await fetch(`/api/category-blitz/sessions/${sessionId}/current-round${userIdParam}`);
      const json = (await res.json()) as {
        ok: boolean;
        round?: CategoryBlitzRound | null;
        viewerRole?: CategoryBlitzViewerRole | null;
      };
      if (!mountedRef.current || !json.ok || !json.round) return;
      setViewerRole(json.viewerRole ?? null);
      applyRoundRef.current(json.round);
      if (json.round.status === "complete") {
        await loadResultsRef.current(json.round.id);
      }
    } catch {
      // Non-fatal — realtime will deliver the round when it starts.
    }
  }, []);

  // ── Load session from API ─────────────────────────────────────────────────

  const loadSession = useCallback(async () => {
    if (!venueId) return;
    try {
      const userIdParam = userIdRef.current ? `&userId=${encodeURIComponent(userIdRef.current)}` : "";
      const res = await fetch(`/api/category-blitz/sessions?venueId=${encodeURIComponent(venueId)}${userIdParam}`);
      const json = (await res.json()) as { ok: boolean; session?: CategoryBlitzSession | null; error?: string };
      if (!mountedRef.current) return;

      if (!json.ok) {
        errorStreakRef.current += 1;
        setError(json.error ?? "Failed to load session.");
        setErrorEscalated(errorStreakRef.current >= ESCALATE_AFTER_FAILURES);
        return;
      }

      errorStreakRef.current = 0;
      setError(null);
      setErrorEscalated(false);
      const s = json.session ?? null;
      setSession(s);
      sessionIdRef.current = s?.id ?? null;
      if (!s) {
        setRound(null);
        setResults(null);
        setTimeRemaining(0);
        setNextRoundStartsIn(null);
        setLobbyCountdown(null);
        setViewerRole(null);
        endsAtRef.current = null;
        lobbyStartsAtRef.current = null;
        setPhase("idle");
        return;
      }
      if (s.status === "complete") {
        setRound(null);
        setViewerRole(null);
        endsAtRef.current = null;
        lobbyStartsAtRef.current = null;
        setLobbyCountdown(null);
        setPhase("complete");
        return;
      }
      if (s.status === "lobby") {
        setRound(null);
        setResults(null);
        setViewerRole(null);
        setTimeRemaining(0);
        setNextRoundStartsIn(null);
        endsAtRef.current = null;
        lobbyStartsAtRef.current = s.startsAt ? new Date(s.startsAt).getTime() : null;
        setPhase("lobby");
        return;
      }
      // Session is active/scoring — load the current round.
      lobbyStartsAtRef.current = null;
      await loadCurrentRound(s.id);
    } catch {
      if (!mountedRef.current) return;
      errorStreakRef.current += 1;
      setError("Failed to connect to game.");
      setErrorEscalated(errorStreakRef.current >= ESCALATE_AFTER_FAILURES);
    }
  }, [venueId, loadCurrentRound]);

  // ── Load results ──────────────────────────────────────────────────────────

  const loadResults = useCallback(async (roundId: string) => {
    try {
      const res = await fetch(`/api/category-blitz/rounds/${roundId}/results`);
      const json = (await res.json()) as { ok: boolean; results?: CategoryBlitzRoundResults };
      if (!mountedRef.current || !json.ok || !json.results) return;
      setResults(json.results);
      setPhase("results");
      endsAtRef.current = null;
      if (round?.startedAt) {
        const nextStartAtMs = new Date(round.startedAt).getTime() + ROUND_INTERVAL_SECONDS * 1000;
        setNextRoundStartsIn(Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000)));
      }
    } catch {
      // Non-fatal — results panel will handle empty state.
    }
  }, [round]);

  useEffect(() => {
    loadResultsRef.current = loadResults;
  }, [loadResults]);

  // ── Scoring trigger ref ────────────────────────────────────────────────────
  // Updated every render so the timer interval always calls the latest version.

  const triggerScoringRef = useRef<(roundId: string) => Promise<void>>(async () => { /* placeholder */ });

  useEffect(() => {
    triggerScoringRef.current = async (roundId: string): Promise<void> => {
      try {
        const res = await fetch(`/api/category-blitz/rounds/${roundId}/score`, { method: "POST" });
        const json = (await res.json()) as { ok: boolean; results?: CategoryBlitzRoundResults };
        if (!mountedRef.current) return;
        if (json.ok && json.results) {
          setResults(json.results);
          setPhase("results");
          endsAtRef.current = null;
          if (round?.startedAt) {
            const nextStartAtMs = new Date(round.startedAt).getTime() + ROUND_INTERVAL_SECONDS * 1000;
            setNextRoundStartsIn(Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000)));
          }
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
      } else {
        const remaining = Math.max(0, Math.round((endsAtRef.current - Date.now()) / 1000));
        setTimeRemaining(remaining);

        if (remaining === 0 && !scoringCalledRef.current && currentRoundIdRef.current) {
          scoringCalledRef.current = true;
          void triggerScoringRef.current(currentRoundIdRef.current);
        }
      }

      if (phase === "lobby" && lobbyStartsAtRef.current !== null) {
        setLobbyCountdown(Math.max(0, Math.round((lobbyStartsAtRef.current - Date.now()) / 1000)));
      } else {
        setLobbyCountdown(null);
      }

      if ((phase === "results" || phase === "scoring") && round?.startedAt) {
        const nextStartAtMs = new Date(round.startedAt).getTime() + ROUND_INTERVAL_SECONDS * 1000;
        setNextRoundStartsIn(Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000)));
      } else {
        setNextRoundStartsIn(null);
      }
    }, TIMER_TICK_MS);

    return () => clearInterval(interval);
  }, [phase, round?.startedAt]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!venueId || !supabase) return;

    const client = supabase;
    let active = true;

    const channel = client
      .channel(`category-blitz-session:${venueId}`)
      .on("broadcast", { event: "round_started" }, (msg) => {
        if (!active || !mountedRef.current) return;
        const payload = msg.payload as RoundStartedPayload | null;
        if (!payload?.round) return;
        // Refetch via the API rather than applying the broadcast payload
        // directly — it's the only source that also resolves viewerRole
        // (spectator vs player) for this specific user.
        if (sessionIdRef.current) {
          void loadCurrentRound(sessionIdRef.current);
        }
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
        setViewerRole(null);
        endsAtRef.current = null;
        setNextRoundStartsIn(null);
      })
      .subscribe((status) => {
        if (!mountedRef.current) return;
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [venueId, loadResults, loadCurrentRound]);

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

  const retry = useCallback(() => {
    void loadSessionRef.current();
  }, []);

  return { phase, session, round, results, timeRemaining, nextRoundStartsIn, lobbyCountdown, isConnected, error, errorEscalated, viewerRole, retry };
}
