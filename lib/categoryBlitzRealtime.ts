"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { roundIntervalSeconds, SUBMISSION_GRACE_MS } from "@/lib/categoryBlitzShared";
import { isCategoryBlitzTestModeEnabled } from "@/lib/categoryBlitzTestMode";
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
  /**
   * Signal that the round-start reveal animation has finished for this round.
   * The auto-scoring timer won't trigger until this is called — prevents the
   * phase transition from tearing down RoundStartReveal mid-animation when
   * endsAt is very close (see Bug 3 fix).
   */
  markRevealDone: (roundId: string) => void;
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
  /** Tracks whether RoundStartReveal's onDone has fired for a given round ID.
   *  The auto-scoring timer won't trigger until this matches currentRoundIdRef,
   *  preventing the phase transition from interrupting the reveal animation
   *  (Bug 3 fix — see docs/category-blitz-scoring-and-bugfix-plan.md). */
  const revealDoneRef     = useRef<string | null>(null);
  /** A "results"/"scoring" transition that arrived (via poll or realtime
   *  round_scored broadcast) for a round whose reveal animation hasn't
   *  finished yet. Applied once markRevealDone catches up for that round —
   *  see settlePhase below (Bug 3 fix, non-timer-trigger case). */
  const pendingPhaseRef   = useRef<{ roundId: string; phase: CategoryBlitzPhase } | null>(null);
  /** Mirrors `phase` for use inside settlePhase, which must read the latest
   *  phase synchronously (not a stale closure) to tell whether this tab is
   *  actually mid-reveal for the round in question — see settlePhase. */
  const phaseRef          = useRef<CategoryBlitzPhase>("idle");
  const lobbyStartsAtRef  = useRef<number | null>(null);  // ms epoch
  const sessionIdRef      = useRef<string | null>(null);
  const userIdRef         = useRef(userId);
  const loadResultsRef    = useRef<(roundId: string) => Promise<void>>(async () => {});

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  // ── Deferred phase transition ─────────────────────────────────────────────
  // A "results"/"scoring" transition can arrive from a source other than this
  // client's own scoring trigger — a round_scored broadcast fired by another
  // player's client, or a stale/refetched round on poll — before this
  // client's RoundStartReveal has finished animating. Route those transitions
  // through here so they wait for markRevealDone instead of interrupting the
  // reveal mid-animation (Bug 3 fix — see docs/category-blitz-scoring-and-bugfix-plan.md).
  //
  // The gate only applies while this tab is actually mid-reveal for `roundId`
  // right now (phase is currently "answering" for that exact round and its
  // reveal hasn't completed yet). If this tab never entered "answering" for
  // the round at all — e.g. the page loaded/reloaded after the round had
  // already moved into scoring/results — there is no reveal to interrupt, so
  // the transition must apply immediately. Gating unconditionally on
  // "has markRevealDone ever fired for this round" deadlocked that case
  // forever, since nothing would ever call markRevealDone for a round whose
  // reveal never mounted in this tab.
  const settlePhase = useCallback((roundId: string, next: "results" | "scoring"): void => {
    const revealInProgress =
      phaseRef.current === "answering" &&
      currentRoundIdRef.current === roundId &&
      revealDoneRef.current !== roundId;
    if (revealInProgress) {
      pendingPhaseRef.current = { roundId, phase: next };
    } else {
      pendingPhaseRef.current = null;
      setPhase(next);
    }
  }, []);

  const markRevealDone = useCallback((roundId: string): void => {
    revealDoneRef.current = roundId;
    if (pendingPhaseRef.current?.roundId === roundId) {
      setPhase(pendingPhaseRef.current.phase);
      pendingPhaseRef.current = null;
    }
  }, []);

  // ── Apply a round from any source (broadcast or API) ─────────────────────
  // Declared early so loadCurrentRound and the realtime handler can call it.

  const applyRoundRef = useRef<(r: CategoryBlitzRound) => void>(() => { /* placeholder */ });

  useEffect(() => {
    applyRoundRef.current = (r: CategoryBlitzRound): void => {
      setRound(r);
      // Only reset the reveal/scoring guards when this is genuinely a new
      // round — a duplicate poll re-delivering the same round shouldn't wipe
      // a reveal that already finished (that would strand the settlePhase
      // guard waiting on a markRevealDone that will never fire again).
      if (currentRoundIdRef.current !== r.id) {
        scoringCalledRef.current = false;
        revealDoneRef.current = null;
      }
      currentRoundIdRef.current = r.id;

      const endsAtMs = new Date(r.endsAt).getTime();
      endsAtRef.current = endsAtMs;

      const remaining = Math.max(0, Math.round((endsAtMs - Date.now()) / 1000));
      const nextStartAtMs = new Date(r.startedAt).getTime() + roundIntervalSeconds(isCategoryBlitzTestModeEnabled()) * 1000;
      const nextStartRemaining = Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000));

      if (r.status === "complete") {
        endsAtRef.current = null;
        setTimeRemaining(0);
        setNextRoundStartsIn(nextStartRemaining);
        settlePhase(r.id, "results");
        return;
      }
      if (r.status === "scoring") {
        endsAtRef.current = null;
        setTimeRemaining(0);
        setNextRoundStartsIn(nextStartRemaining);
        settlePhase(r.id, "scoring");
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

  // ── Load final results for a completed session ────────────────────────────
  // Neither the "complete" branch below nor the realtime "session_ended"
  // handler otherwise fetch round results — a client that lands directly on
  // an already-completed session (fresh page load/reload after the game
  // ended, or a poll that missed every intermediate round_scored broadcast)
  // would show phase "complete" with `results` still null, so CompleteScreen
  // falls back to its empty "session has ended" state and the winner
  // celebration never has data to render. This fetches the last round's
  // results directly, without going through loadResults/settlePhase (which
  // would incorrectly flip phase back to "results").
  const loadFinalResults = useCallback(async (sessionId: string): Promise<void> => {
    try {
      const roundRes = await fetch(`/api/category-blitz/sessions/${sessionId}/current-round`);
      const roundJson = (await roundRes.json()) as { ok: boolean; round?: CategoryBlitzRound | null };
      if (!mountedRef.current || !roundJson.ok || !roundJson.round) return;
      const resultsRes = await fetch(`/api/category-blitz/rounds/${roundJson.round.id}/results`);
      const resultsJson = (await resultsRes.json()) as { ok: boolean; results?: CategoryBlitzRoundResults };
      if (!mountedRef.current || !resultsJson.ok || !resultsJson.results) return;
      setResults(resultsJson.results);
    } catch {
      // Best-effort — CompleteScreen falls back to its own no-standings state.
    }
  }, []);

  // ── Load session from API ─────────────────────────────────────────────────

  const loadSession = useCallback(async () => {
    if (!venueId) return;
    try {
      const userIdParam = userIdRef.current ? `&userId=${encodeURIComponent(userIdRef.current)}` : "";
      const testModeParam = isCategoryBlitzTestModeEnabled() ? "&testMode=1" : "";
      const res = await fetch(`/api/category-blitz/sessions?venueId=${encodeURIComponent(venueId)}${userIdParam}${testModeParam}`);
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
        void loadFinalResults(s.id);
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
  }, [venueId, loadCurrentRound, loadFinalResults]);

  // ── Load results ──────────────────────────────────────────────────────────

  const loadResults = useCallback(async (roundId: string) => {
    try {
      const res = await fetch(`/api/category-blitz/rounds/${roundId}/results`);
      const json = (await res.json()) as { ok: boolean; results?: CategoryBlitzRoundResults };
      if (!mountedRef.current || !json.ok || !json.results) return;
      setResults(json.results);
      settlePhase(roundId, "results");
      endsAtRef.current = null;
      if (round?.startedAt) {
        const nextStartAtMs = new Date(round.startedAt).getTime() + roundIntervalSeconds(isCategoryBlitzTestModeEnabled()) * 1000;
        setNextRoundStartsIn(Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000)));
      }
    } catch {
      // Non-fatal — results panel will handle empty state.
    }
  }, [round, settlePhase]);

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
            const nextStartAtMs = new Date(round.startedAt).getTime() + roundIntervalSeconds(isCategoryBlitzTestModeEnabled()) * 1000;
            setNextRoundStartsIn(Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000)));
          }
        } else {
          // Score POST returned ok:false — reset the guard so the next timer
          // tick retries instead of waiting indefinitely for poll/cron rescue.
          scoringCalledRef.current = false;
          setPhase("scoring");
        }
      } catch {
        // Network or parse error — reset the guard so the next timer tick
        // retries, keeping the backoff implicit (250ms tick cadence).
        if (mountedRef.current) {
          scoringCalledRef.current = false;
          setPhase("scoring");
        }
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

        if (
          remaining === 0 &&
          // Wait out the same grace window the server gives late submissions
          // (SUBMISSION_GRACE_MS) before locking the round into scoring —
          // otherwise this client's own auto-submit-on-expiry POSTs can lose
          // the race against its own scoring trigger and get rejected with
          // "no longer accepting answers".
          Date.now() - endsAtRef.current >= SUBMISSION_GRACE_MS &&
          !scoringCalledRef.current &&
          currentRoundIdRef.current &&
          // Don't trigger scoring until the round-start reveal animation has
          // finished — otherwise the phase flips to "results" mid-reveal and
          // RoundStartReveal unmounts before its onDone fires (Bug 3).
          revealDoneRef.current === currentRoundIdRef.current
        ) {
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
        const nextStartAtMs = new Date(round.startedAt).getTime() + roundIntervalSeconds(isCategoryBlitzTestModeEnabled()) * 1000;
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
        // Usually a no-op (this tab typically already has the last round's
        // results from a prior round_scored broadcast) — but covers a tab
        // that reconnected right at the end and never saw that broadcast.
        if (sessionIdRef.current) void loadFinalResults(sessionIdRef.current);
      })
      .subscribe((status) => {
        if (!mountedRef.current) return;
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [venueId, loadResults, loadCurrentRound, loadFinalResults]);

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

  return { phase, session, round, results, timeRemaining, nextRoundStartsIn, lobbyCountdown, isConnected, error, errorEscalated, viewerRole, retry, markRevealDone };
}
