"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  SUBMISSION_GRACE_MS,
  nextRoundStartAtMs,
  type CategoryBlitzContinuousTiming,
} from "@/lib/categoryBlitzShared";
import { isCategoryBlitzTestModeEnabled } from "@/lib/categoryBlitzTestMode";
import type {
  CategoryBlitzRound,
  CategoryBlitzMode,
  CategoryBlitzRoundResults,
  CategoryBlitzSession,
} from "@/types";

/**
 * `nextRoundStartAtMs` (the server's next-round anchor) is shared from
 * `lib/categoryBlitzShared` so the client "next round in" countdown and the
 * venue TV screen stay in lockstep. Continuous sessions pass their per-venue
 * timing; scheduled sessions pass null and fall back to the shared constants.
 */

/**
 * Dev-only structured logging for tracing the reveal/scoring gate on the
 * client — free to leave in since it never runs in production builds.
 */
function debugLog(...args: unknown[]): void {
  if (process.env.NODE_ENV === "production") return;
  console.debug(...args);
}

// ── Phase model ───────────────────────────────────────────────────────────────

export type CategoryBlitzPhase =
  | "idle"       // no active session found
  | "lobby"      // session exists, waiting for host to start
  | "answering"  // round is active, timer running
  | "scoring"    // timer expired, awaiting server scoring
  | "reveal"     // round scored, playing the per-answer grading cascade
  | "results"    // reveal finished, full results/leaderboard visible
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
  /** Manually re-attempt loading the session — for the escalated error state's retry action. */
  retry: () => void;
  /**
   * Signal that the round-start reveal animation has finished for this round.
   * The auto-scoring timer won't trigger until this is called — prevents the
   * phase transition from tearing down RoundStartReveal mid-animation when
   * endsAt is very close (see Bug 3 fix).
   */
  markRevealDone: (roundId: string) => void;
  /**
   * Signal that the results-reveal grading cascade has finished for `roundId`,
   * advancing the phase from "reveal" to "results". Mirrors markRevealDone for
   * the round-start reveal: `resultsRevealDoneRef` dedupes per round so a
   * duplicate poll/broadcast delivery can neither replay a finished cascade nor
   * skip one that hasn't played yet (see settleResultsPhase / Phase 3).
   */
  markResultsRevealDone: (roundId: string) => void;
  /**
   * Dismiss the current "complete" session client-side, forcing the phase
   * back to "idle" immediately instead of waiting out the server's
   * RECENTLY_COMPLETED_GRACE_MS window (see lib/categoryBlitz.ts →
   * getRecentlyCompletedSession). Used to fast-path off the no-standings
   * "session has ended" fallback within a few seconds of an admin ending a
   * session — the poll/realtime paths would otherwise keep re-delivering the
   * same completed session as "complete" for up to 3 minutes.
   */
  dismissComplete: () => void;
}

// ── Broadcast payload types ───────────────────────────────────────────────────

type RoundStartedPayload = {
  round: {
    id:         string;
    letter:     string;
    categories: string[];
    startedAt:  string;
    endsAt:     string;
    mode:       CategoryBlitzMode;
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
  /** The live-events channel this client subscribes to, handed back by the
   *  sessions API. The server derives it from the (possibly pooled) room, so
   *  the shared-room mapping never lives in client code — this side only ever
   *  sees an opaque channel string. Null until the first sessions response
   *  lands; the realtime effect stays dormant until then (the fallback poll
   *  covers that brief gap). With pooling off it equals this venue's own
   *  channel, so behavior is unchanged. */
  const [realtimeChannel, setRealtimeChannel] = useState<string | null>(null);

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
  /** Tracks whether the results-reveal grading cascade has finished for a given
   *  round ID (set by markResultsRevealDone). While unset for the current
   *  round, a "results" transition enters the "reveal" phase so the cascade
   *  plays; once set, later re-deliveries of the same round skip straight to
   *  "results" instead of replaying it. Reset per new round in applyRoundRef.
   *  This is the server-anchored dedupe key that replaces the old client-only
   *  `showCascade`/`gradedRoundId` race (Phase 3). */
  const resultsRevealDoneRef = useRef<string | null>(null);
  /** A "results"/"scoring" transition that arrived (via poll or realtime
   *  round_scored broadcast) for a round whose reveal animation hasn't
   *  finished yet. Applied once markRevealDone catches up for that round —
   *  see settlePhase below (Bug 3 fix, non-timer-trigger case). */
  const pendingPhaseRef   = useRef<{ roundId: string; phase: CategoryBlitzPhase } | null>(null);
  /** A NEW active round that arrived while this tab was still playing the
   *  PREVIOUS round's grading cascade ("reveal"). Deferred so it can't cut the
   *  cascade short and drop the viewer onto a blank "answering" board — the
   *  exact "graded answers vanish instantly" bug. Applied by
   *  markResultsRevealDone once the cascade finishes. This is the exit-side
   *  mirror of pendingPhaseRef/settlePhase's entry guard (Phase 3). */
  const pendingActiveRoundRef = useRef<CategoryBlitzRound | null>(null);
  /** Mirrors `phase` for use inside settlePhase, which must read the latest
   *  phase synchronously (not a stale closure) to tell whether this tab is
   *  actually mid-reveal for the round in question — see settlePhase. */
  const phaseRef          = useRef<CategoryBlitzPhase>("idle");
  const lobbyStartsAtRef  = useRef<number | null>(null);  // ms epoch
  const sessionIdRef      = useRef<string | null>(null);
  /** Session ID that dismissComplete() has fast-forwarded past — loadSession
   *  treats further "complete" deliveries of this same session as if there
   *  were no session at all, so a dismissed session can't resurrect the
   *  fallback screen on the next poll (see dismissComplete below). */
  const dismissedSessionIdRef = useRef<string | null>(null);
  const userIdRef         = useRef(userId);
  const loadResultsRef    = useRef<(roundId: string) => Promise<void>>(async () => {});
  /** Per-venue continuous-mode timing (round + intermission seconds), or null
   *  for scheduled sessions. Read synchronously inside the timing callbacks so
   *  the "next round in" countdown uses the venue's real continuous cadence
   *  without adding `session` to their dependency arrays. */
  const continuousTimingRef = useRef<CategoryBlitzContinuousTiming | null>(null);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    continuousTimingRef.current =
      session?.sessionType === "continuous" &&
      typeof session.roundDurationSeconds === "number" &&
      typeof session.intermissionSeconds === "number"
        ? {
            roundDurationSeconds: session.roundDurationSeconds,
            intermissionSeconds: session.intermissionSeconds,
          }
        : null;
  }, [session]);

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
      setRealtimeChannel(null);
      endsAtRef.current = null;
      lobbyStartsAtRef.current = null;
      currentRoundIdRef.current = null;
      scoringCalledRef.current = false;
      errorStreakRef.current = 0;
      pendingActiveRoundRef.current = null;
      dismissedSessionIdRef.current = null;
    }, 0);
    return () => window.clearTimeout(resetId);
  }, [venueId]);

  // ── Results-reveal gate ────────────────────────────────────────────────────
  // A round becoming scored enters the "reveal" phase (grading cascade) rather
  // than jumping straight to "results" — UNLESS this viewer has already played
  // the reveal for that round, in which case a re-delivery (duplicate poll /
  // another player's round_scored broadcast) must not replay it. The "reveal"
  // phase is a first-class server-anchored state instead of a client-derived
  // boolean, so a results payload that briefly lands empty can no longer skip
  // the cascade: the component holds a loading beat inside "reveal" until the
  // viewer's graded answers populate (Phase 3).
  const enterResultsOrReveal = useCallback((roundId: string): void => {
    if (resultsRevealDoneRef.current === roundId) {
      setPhase("results");
    } else {
      setPhase("reveal");
    }
  }, []);

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
  // reveal never mounted in this tab. A settled "results" transition routes
  // through enterResultsOrReveal so the grading cascade always gets to play.
  const settlePhase = useCallback((roundId: string, next: "results" | "scoring"): void => {
    const revealInProgress =
      phaseRef.current === "answering" &&
      currentRoundIdRef.current === roundId &&
      revealDoneRef.current !== roundId;
    if (revealInProgress) {
      pendingPhaseRef.current = { roundId, phase: next };
      return;
    }
    pendingPhaseRef.current = null;
    if (next === "results") {
      enterResultsOrReveal(roundId);
    } else {
      setPhase(next);
    }
  }, [enterResultsOrReveal]);

  const markRevealDone = useCallback((roundId: string): void => {
    debugLog(`[categoryBlitzRealtime] revealDoneRef set for round ${roundId} via markRevealDone (normal onDone)`);
    revealDoneRef.current = roundId;
    if (pendingPhaseRef.current?.roundId === roundId) {
      const { phase: pending } = pendingPhaseRef.current;
      pendingPhaseRef.current = null;
      if (pending === "results") {
        enterResultsOrReveal(roundId);
      } else {
        setPhase(pending);
      }
    }
  }, [enterResultsOrReveal]);

  // Advance from the grading cascade ("reveal") to the full results screen.
  // Records the round as revealed so a later re-delivery of the same round
  // (enterResultsOrReveal) skips the cascade instead of replaying it.
  const markResultsRevealDone = useCallback((roundId: string): void => {
    resultsRevealDoneRef.current = roundId;
    if (phaseRef.current === "reveal") {
      setPhase("results");
    }
    // A next round that arrived mid-cascade was deferred by applyRoundRef's exit
    // guard; it is applied once we settle into "results" (see the effect below,
    // which is declared after applyRoundRef so it may read it — this callback
    // is declared before it and must not).
  }, []);

  // ── Apply a round from any source (broadcast or API) ─────────────────────
  // Declared early so loadCurrentRound and the realtime handler can call it.

  const applyRoundRef = useRef<(r: CategoryBlitzRound, opts?: { forceReveal?: boolean }) => void>(() => { /* placeholder */ });

  useEffect(() => {
    applyRoundRef.current = (r: CategoryBlitzRound, opts?: { forceReveal?: boolean }): void => {
      // ── Exit guard: never interrupt an in-progress grading cascade ──────────
      // If a NEW active round arrives while this tab is still playing the
      // PREVIOUS round's reveal cascade, defer it instead of flipping straight
      // to the blank "answering" board — that mid-reveal interruption is the
      // "graded answers vanish instantly, every field says no answer" bug.
      // markResultsRevealDone applies the deferred round the instant the cascade
      // finishes. Only "reveal" is guarded: once the cascade has settled into
      // the resting "results" screen, a new active round legitimately means the
      // (server-guaranteed, scored_at + intermission) review window is over, so
      // that flip to answering is correct and must NOT be blocked. Bails before
      // any state mutation so the still-playing reveal keeps its round/guards.
      if (
        r.status === "active" &&
        phaseRef.current === "reveal" &&
        currentRoundIdRef.current !== null &&
        currentRoundIdRef.current !== r.id
      ) {
        pendingActiveRoundRef.current = r;
        return;
      }

      setRound(r);
      // Only reset the reveal/scoring guards when this is genuinely a new
      // round — a duplicate poll re-delivering the same round shouldn't wipe
      // a reveal that already finished (that would strand the settlePhase
      // guard waiting on a markRevealDone that will never fire again).
      if (currentRoundIdRef.current !== r.id) {
        scoringCalledRef.current = false;
        revealDoneRef.current = null;
        resultsRevealDoneRef.current = null;
      } else if (opts?.forceReveal && r.status !== "active" && revealDoneRef.current !== r.id) {
        // A visibility-regain resync (see the visibilitychange effect below)
        // found this SAME round already progressed past "active" server-side
        // while this tab still thinks it's "answering" — meaning this tab's
        // own RoundStartReveal onAnimationComplete callback (Framer Motion,
        // requestAnimationFrame-driven) was still pending when the tab got
        // backgrounded and never fired, since rAF callbacks don't get a
        // second chance to complete once missed. Treat the reveal as
        // already-seen so settlePhase below doesn't defer this transition
        // forever waiting on a callback that will never come. Gated on
        // `r.status !== "active"` so a resync of a round that's genuinely
        // still ticking can't cut off a reveal actually playing right now.
        debugLog(`[categoryBlitzRealtime] revealDoneRef set for round ${r.id} via forceReveal (visibility resync)`);
        revealDoneRef.current = r.id;
      }
      currentRoundIdRef.current = r.id;

      const endsAtMs = new Date(r.endsAt).getTime();
      endsAtRef.current = endsAtMs;

      const remaining = Math.max(0, Math.round((endsAtMs - Date.now()) / 1000));
      const nextStartAtMs = nextRoundStartAtMs(r, isCategoryBlitzTestModeEnabled(), continuousTimingRef.current);
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

  // ── Apply a round deferred by the exit guard ───────────────────────────────
  // When the grading cascade finishes, markResultsRevealDone settles the phase
  // to "results". If a next round arrived while that cascade was still playing,
  // applyRoundRef stashed it (rather than interrupting the reveal). Apply it now
  // that we've left "reveal" — by this point phaseRef has synced to "results",
  // so applyRoundRef's exit guard won't re-defer it, and it advances cleanly
  // into the new round's answering board. Declared AFTER the applyRoundRef
  // assignment above so it may read the ref (react-hooks/immutability ordering).
  useEffect(() => {
    if (phase !== "results") return;
    const pendingActive = pendingActiveRoundRef.current;
    if (!pendingActive) return;
    pendingActiveRoundRef.current = null;
    applyRoundRef.current(pendingActive);
  }, [phase]);

  // ── Load current round ────────────────────────────────────────────────────
  // Declared before loadSession so it can be called from within loadSession.

  const loadCurrentRound = useCallback(async (sessionId: string, opts?: { forceReveal?: boolean }): Promise<void> => {
    try {
      const userIdParam = userIdRef.current ? `?userId=${encodeURIComponent(userIdRef.current)}` : "";
      const res = await fetch(`/api/category-blitz/sessions/${sessionId}/current-round${userIdParam}`);
      const json = (await res.json()) as {
        ok: boolean;
        round?: CategoryBlitzRound | null;
      };
      if (!mountedRef.current || !json.ok || !json.round) return;
      applyRoundRef.current(json.round, opts);
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

  const loadSession = useCallback(async (opts?: { forceReveal?: boolean }) => {
    if (!venueId) return;
    try {
      const userIdParam = userIdRef.current ? `&userId=${encodeURIComponent(userIdRef.current)}` : "";
      const testModeParam = isCategoryBlitzTestModeEnabled() ? "&testMode=1" : "";
      const res = await fetch(`/api/category-blitz/sessions?venueId=${encodeURIComponent(venueId)}${userIdParam}${testModeParam}`);
      const json = (await res.json()) as { ok: boolean; session?: CategoryBlitzSession | null; error?: string; realtimeChannel?: string };
      if (!mountedRef.current) return;

      if (!json.ok) {
        errorStreakRef.current += 1;
        setError(json.error ?? "Failed to load session.");
        setErrorEscalated(errorStreakRef.current >= ESCALATE_AFTER_FAILURES);
        return;
      }

      if (json.realtimeChannel) setRealtimeChannel(json.realtimeChannel);

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
        endsAtRef.current = null;
        lobbyStartsAtRef.current = null;
        setPhase("idle");
        return;
      }
      if (s.status === "complete") {
        if (dismissedSessionIdRef.current === s.id) {
          // Already fast-forwarded past this completed session (see
          // dismissComplete) — treat it as if the server had returned no
          // session, rather than re-entering "complete" for the rest of the
          // server's grace window.
          setSession(null);
          setRound(null);
          setResults(null);
          endsAtRef.current = null;
          lobbyStartsAtRef.current = null;
          setLobbyCountdown(null);
          setPhase("idle");
          return;
        }
        setRound(null);
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
        setTimeRemaining(0);
        setNextRoundStartsIn(null);
        endsAtRef.current = null;
        lobbyStartsAtRef.current = s.startsAt ? new Date(s.startsAt).getTime() : null;
        setPhase("lobby");
        return;
      }
      // Session is active/scoring — load the current round.
      lobbyStartsAtRef.current = null;
      await loadCurrentRound(s.id, opts);
    } catch {
      if (!mountedRef.current) return;
      errorStreakRef.current += 1;
      setError("Failed to connect to game.");
      setErrorEscalated(errorStreakRef.current >= ESCALATE_AFTER_FAILURES);
    }
  }, [venueId, loadCurrentRound, loadFinalResults]);

  // loadSessionRef must be declared (and kept in sync) before the realtime
  // subscription effect below, which reads it from the "schedule_updated"
  // handler — declaring it after would mean an earlier effect closes over a
  // ref assigned by a later one, which is unsound even though it happens to
  // work at runtime (effect callbacks only fire after the whole render pass
  // completes).
  const loadSessionRef = useRef(loadSession);

  useEffect(() => {
    loadSessionRef.current = loadSession;
  });

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
        const nextStartAtMs = nextRoundStartAtMs(round, isCategoryBlitzTestModeEnabled(), continuousTimingRef.current);
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
        debugLog(`[categoryBlitzRealtime] POST /score for round ${roundId} returned status=${res.status} ok=${json.ok} hasResults=${!!json.results}`);
        if (!mountedRef.current) return;
        if (json.ok && json.results) {
          setResults(json.results);
          // Enter the grading cascade ("reveal") rather than jumping to the
          // full results screen — this client just triggered scoring, so its
          // round-start reveal is already done and no settlePhase deferral is
          // needed here (see enterResultsOrReveal).
          enterResultsOrReveal(json.results.roundId);
          endsAtRef.current = null;
          if (round?.startedAt) {
            const nextStartAtMs = nextRoundStartAtMs(round, isCategoryBlitzTestModeEnabled(), continuousTimingRef.current);
            setNextRoundStartsIn(Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000)));
          }
        } else {
          // Score POST returned ok:false — reset the guard so the next timer
          // tick retries instead of waiting indefinitely for poll/cron rescue.
          scoringCalledRef.current = false;
          setPhase("scoring");
        }
      } catch (err) {
        debugLog(`[categoryBlitzRealtime] POST /score for round ${roundId} threw:`, err instanceof Error ? err.message : err);
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

        if (remaining === 0 && !scoringCalledRef.current && currentRoundIdRef.current) {
          const graceElapsed = Date.now() - endsAtRef.current >= SUBMISSION_GRACE_MS;
          const revealReady = revealDoneRef.current === currentRoundIdRef.current;
          if (
            graceElapsed &&
            // Don't trigger scoring until the round-start reveal animation has
            // finished — otherwise the phase flips to "results" mid-reveal and
            // RoundStartReveal unmounts before its onDone fires (Bug 3).
            revealReady
          ) {
            debugLog(`[categoryBlitzRealtime] scoring gate satisfied for round ${currentRoundIdRef.current}, firing POST /score`);
            scoringCalledRef.current = true;
            void triggerScoringRef.current(currentRoundIdRef.current);
          } else {
            debugLog(`[categoryBlitzRealtime] scoring gate blocked for round ${currentRoundIdRef.current}: graceElapsed=${graceElapsed} revealReady=${revealReady}`);
          }
        }
      }

      if (phase === "lobby" && lobbyStartsAtRef.current !== null) {
        setLobbyCountdown(Math.max(0, Math.round((lobbyStartsAtRef.current - Date.now()) / 1000)));
      } else {
        setLobbyCountdown(null);
      }

      if ((phase === "results" || phase === "scoring" || phase === "reveal") && round?.startedAt) {
        const nextStartAtMs = nextRoundStartAtMs(round, isCategoryBlitzTestModeEnabled(), continuousTimingRef.current);
        setNextRoundStartsIn(Math.max(0, Math.round((nextStartAtMs - Date.now()) / 1000)));
      } else {
        setNextRoundStartsIn(null);
      }
    }, TIMER_TICK_MS);

    return () => clearInterval(interval);
  }, [phase, round?.startedAt]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!realtimeChannel || !supabase) return;

    const client = supabase;
    let active = true;

    const channel = client
      .channel(realtimeChannel)
      .on("broadcast", { event: "round_started" }, (msg) => {
        if (!active || !mountedRef.current) return;
        const payload = msg.payload as RoundStartedPayload | null;
        if (!payload?.round) return;
        // Refetch via the API rather than applying the broadcast payload
        // directly, so this client's view stays consistent with server state.
        if (sessionIdRef.current) {
          void loadCurrentRound(sessionIdRef.current);
        }
      })
      .on("broadcast", { event: "round_scored" }, (msg) => {
        if (!active || !mountedRef.current) return;
        const payload = msg.payload as RoundScoredPayload | null;
        if (!payload?.roundId) return;
        void loadResultsRef.current(payload.roundId);
      })
      .on("broadcast", { event: "schedule_updated" }, () => {
        // Admin created/edited/deleted a schedule — refresh immediately
        // instead of waiting out the 15s fallback poll, so the idle/lobby
        // countdown reflects the change right away.
        if (!active || !mountedRef.current) return;
        void loadSessionRef.current();
      })
      .on("broadcast", { event: "session_ended" }, () => {
        if (!active || !mountedRef.current) return;
        setPhase("complete");
        endsAtRef.current = null;
        setNextRoundStartsIn(null);
        // Drop any deferred next round — the session is over, so a late
        // markResultsRevealDone must not flip "complete" back into "answering".
        pendingActiveRoundRef.current = null;
        // Usually a no-op (this tab typically already has the last round's
        // results from a prior round_scored broadcast) — but covers a tab
        // that reconnected right at the end and never saw that broadcast.
        if (sessionIdRef.current) void loadFinalResults(sessionIdRef.current);
      })
      .on("broadcast", { event: "continuous_session_ended" }, () => {
        // Admin manually stopped continuous mode (endContinuousSession). Same
        // client outcome as a scheduled session ending: settle onto the Game
        // Over screen with the final round's standings instead of waiting out
        // the 15s fallback poll.
        if (!active || !mountedRef.current) return;
        setPhase("complete");
        endsAtRef.current = null;
        setNextRoundStartsIn(null);
        pendingActiveRoundRef.current = null;
        if (sessionIdRef.current) void loadFinalResults(sessionIdRef.current);
      })
      .on("broadcast", { event: "session_abandoned" }, () => {
        // Admin deleted the schedule mid-game — the session is discarded, not
        // finished. Snap straight back to the lobby (phase "idle") instead of
        // the Game Over screen, clearing any round/results/deferred transition
        // so a late markResultsRevealDone can't revive the dead session. Then
        // reconcile with the server (which no longer returns this session) to
        // pick up the venue's next scheduled window for the idle countdown.
        if (!active || !mountedRef.current) return;
        setSession(null);
        sessionIdRef.current = null;
        setRound(null);
        setResults(null);
        setTimeRemaining(0);
        setNextRoundStartsIn(null);
        setLobbyCountdown(null);
        endsAtRef.current = null;
        lobbyStartsAtRef.current = null;
        pendingActiveRoundRef.current = null;
        pendingPhaseRef.current = null;
        setPhase("idle");
        void loadSessionRef.current();
      })
      .subscribe((status) => {
        if (!mountedRef.current) return;
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  // loadResultsRef.current (not loadResults directly) so this effect doesn't
  // re-subscribe on every round change — loadResults's identity is unstable
  // (depends on `round`, which setRound() replaces on every poll response),
  // which was tearing down and rebuilding the realtime channel roughly every
  // 15s and dropping it mid-handshake ("WebSocket is closed before the
  // connection is established"). loadCurrentRound/loadFinalResults are stable
  // (empty useCallback deps) so they're safe to depend on directly.
  // Keyed on realtimeChannel (server-provided, stable per venue/room) rather
  // than venueId: identical churn with pooling off, and the only correct
  // subscription target with pooling on.
  }, [realtimeChannel, loadCurrentRound, loadFinalResults]);

  // ── Initial load + fallback poll ──────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    const initialLoad = async () => { await loadSessionRef.current(); };
    void initialLoad();

    const poll = setInterval(async () => {
      // Always poll, even during "answering" — this is the server-truth
      // fallback (driveVenueCategoryBlitz -> scoreExpiredRoundForVenue) for
      // when this tab's own client-side timer/reveal chain stalls (e.g. a
      // backgrounded tab throttled by the browser). Solo play has no other
      // client to broadcast round_scored, so this is the only recovery path.
      await loadSessionRef.current();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearInterval(poll);
    };
  }, [venueId]);

  // ── Visibility catch-up ────────────────────────────────────────────────────
  // The 15s poll above is a worst-case fallback; a tab that was backgrounded
  // and just regained focus shouldn't have to wait out the rest of that
  // interval to resync. Force an immediate resync the moment the tab becomes
  // visible again, with `forceReveal: true` so a round that finished
  // server-side while this tab was hidden isn't stuck waiting on a
  // RoundStartReveal onAnimationComplete callback that may have permanently
  // stalled while backgrounded (see the forceReveal handling in
  // applyRoundRef above). document.visibilityState only flips to "visible"
  // on a hidden -> visible transition, so every firing of this listener is
  // already, by construction, a regain-of-focus event.
  useEffect(() => {
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") {
        void loadSessionRef.current({ forceReveal: true });
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const retry = useCallback(() => {
    void loadSessionRef.current();
  }, []);

  const dismissComplete = useCallback(() => {
    if (sessionIdRef.current) dismissedSessionIdRef.current = sessionIdRef.current;
    setSession(null);
    setRound(null);
    setResults(null);
    endsAtRef.current = null;
    lobbyStartsAtRef.current = null;
    setLobbyCountdown(null);
    setPhase("idle");
  }, []);

  return { phase, session, round, results, timeRemaining, nextRoundStartsIn, lobbyCountdown, isConnected, error, errorEscalated, retry, markRevealDone, markResultsRevealDone, dismissComplete };
}
