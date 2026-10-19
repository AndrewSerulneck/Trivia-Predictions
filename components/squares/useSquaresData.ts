"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SquaresBoardView } from "@/lib/squaresBoard";
import {
  SQUARES_BOARD_POLL_MS,
  SQUARES_COMPLETE_POLL_MS,
  SQUARES_SCORE_POLL_MS,
  boardRevision,
  scoreRevision,
  type SquaresScoreView,
} from "@/lib/squaresView";

// The Squares screen's reads (docs/squares-and-brackets-plan.md Phase 3, cost rules in §6).
//
//   before the lock   the BOARD (per venue, uncached) every 30 s — claims change under you;
//   after the lock    the shared SCORE (CDN-cached 15 s) every 15 s — the claims can no longer change,
//                     so the board is re-read ONLY when the score says the draw happened or a moment was
//                     graded (that is when winners' names appear), a handful of times a game;
//   when it's over    the shared score only, every 5 min and once on returning to the tab (a later void can change
//                     the winners); the board is re-read only if its revision differs (plan 6.4).
//                     A hidden tab polls nothing and catches up the moment it is shown again.
//
// One page open = at most ~2 requests a minute, and only while it is on screen.

export type SquaresLoadStatus = "loading" | "ready" | "error" | "off" | "no-venue";

export type SquaresClaimResult = { ok: boolean; outcome: string | null; network?: boolean };

const TICK_MS = 5_000;

type BoardResponse = ({ ok: true } & SquaresBoardView) | { ok: false; error?: string };
type ScoreResponse = ({ ok: true } & SquaresScoreView) | { ok: false; error?: string };

export function useSquaresData(identity: { userId: string; venueId: string } | null) {
  const [status, setStatus] = useState<SquaresLoadStatus>(identity ? "loading" : "no-venue");
  const [board, setBoard] = useState<SquaresBoardView | null>(null);
  const [score, setScore] = useState<SquaresScoreView | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const boardRef = useRef<SquaresBoardView | null>(null);
  const scoreRef = useRef<SquaresScoreView | null>(null);
  const lastBoardAtRef = useRef(0);
  const lastScoreAtRef = useRef(0);
  const inFlightRef = useRef({ board: false, score: false });
  // A read asked for while another is mid-flight (a claim just landed): run once more when it ends.
  const rerunBoardRef = useRef(false);
  const aliveRef = useRef(true);

  const userId = identity?.userId ?? "";
  const venueId = identity?.venueId ?? "";

  const fetchBoardAgain = useRef<() => Promise<void>>(async () => {});

  const fetchBoard = useCallback(async (afterWrite = false): Promise<void> => {
    if (!userId || !venueId) return;
    if (inFlightRef.current.board) {
      if (afterWrite) rerunBoardRef.current = true;
      return;
    }
    inFlightRef.current.board = true;
    lastBoardAtRef.current = Date.now();
    try {
      const params = new URLSearchParams({ venueId, userId });
      const response = await fetch(`/api/squares/board?${params}`, { cache: "no-store" });
      if (response.status === 404) {
        if (aliveRef.current) setStatus("off");
        return;
      }
      const data = (await response.json().catch(() => null)) as BoardResponse | null;
      if (!aliveRef.current) return;
      if (!response.ok || !data || !data.ok) {
        // Keep showing what we have; only a first load that fails is an error.
        if (!boardRef.current) setStatus("error");
        return;
      }
      const view: SquaresBoardView = data;
      boardRef.current = view;
      // The board already carries the draw, the live score and the graded moments, as fresh as the
      // shared score would be: count it as a score read so opening the page costs one request, not two.
      lastScoreAtRef.current = Date.now();
      setBoard(view);
      setStatus("ready");
      setNowMs(Date.now());
    } catch {
      if (aliveRef.current && !boardRef.current) setStatus("error");
    } finally {
      inFlightRef.current.board = false;
      if (rerunBoardRef.current && aliveRef.current) {
        rerunBoardRef.current = false;
        void fetchBoardAgain.current();
      }
    }
  }, [userId, venueId]);

  useEffect(() => {
    fetchBoardAgain.current = () => fetchBoard(true);
  }, [fetchBoard]);

  const fetchScore = useCallback(async (): Promise<void> => {
    if (inFlightRef.current.score) return;
    inFlightRef.current.score = true;
    lastScoreAtRef.current = Date.now();
    try {
      const response = await fetch("/api/squares/score");
      if (!response.ok) return;
      const data = (await response.json().catch(() => null)) as ScoreResponse | null;
      if (!aliveRef.current || !data || !data.ok) return;
      const view: SquaresScoreView = data;
      scoreRef.current = view;
      setScore(view);
      setNowMs(Date.now());
      // The draw happened or a moment was graded since the board was read: its winners' names are stale.
      const current = boardRef.current;
      if (current && view.event && current.event?.id === view.event.id && boardRevision(current) !== scoreRevision(view)) {
        void fetchBoard();
      }
    } catch {
      // A failed score poll just waits for the next tick.
    } finally {
      inFlightRef.current.score = false;
    }
  }, [fetchBoard]);

  // One timer decides what to read. It only runs network requests when the page is visible.
  useEffect(() => {
    aliveRef.current = true;
    if (!userId || !venueId) return;

    const tick = (force: boolean) => {
      if (!aliveRef.current || document.hidden) return;
      const now = Date.now();
      const current = boardRef.current;

      // Move the screen's clock only across the moments that change what it shows.
      const lockMs = current?.event ? Date.parse(current.event.lockAt) : null;
      const kickoffMs = current?.event ? Date.parse(current.event.kickoffAt) : null;
      setNowMs((previous) => {
        const crossed = [lockMs, kickoffMs].some((edge) => edge !== null && previous < edge && now >= edge);
        return crossed ? now : previous;
      });

      if (!current) {
        if (force || now - lastBoardAtRef.current >= SQUARES_BOARD_POLL_MS) void fetchBoard();
        return;
      }
      const event = current.event;
      const phase = scoreRef.current?.event?.id === event?.id ? (scoreRef.current?.event?.phase ?? event?.phase) : event?.phase;

      // No board yet for this season: look again at the slow cadence (the matchup may be set any day).
      if (!event) {
        if (force || now - lastBoardAtRef.current >= SQUARES_BOARD_POLL_MS * 4) void fetchBoard();
        return;
      }
      if (phase === "complete") {
        // Done, but an admin void can still change the winners: catch up if the board is behind the score
        // we hold, and look at the shared (CDN-cached) score rarely and on returning to the tab.
        const latest = scoreRef.current;
        if (latest?.event && boardRevision(current) !== scoreRevision(latest) && !inFlightRef.current.board) void fetchBoard();
        else if (force || now - lastScoreAtRef.current >= SQUARES_COMPLETE_POLL_MS) void fetchScore();
        return;
      }
      const beforeLock = phase === "open" && lockMs !== null && now < lockMs;
      if (beforeLock) {
        if (force || now - lastBoardAtRef.current >= SQUARES_BOARD_POLL_MS) void fetchBoard();
        return;
      }
      if (force || now - lastScoreAtRef.current >= SQUARES_SCORE_POLL_MS) void fetchScore();
    };

    // Deferred so the first read is not a state update inside the effect body.
    void Promise.resolve().then(() => tick(true));
    const timer = window.setInterval(() => tick(false), TICK_MS);
    const onVisible = () => {
      if (!document.hidden) tick(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      aliveRef.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, venueId, fetchBoard, fetchScore]);

  /** Claim or release a square, then re-read the board so the screen shows what the server holds. */
  const act = useCallback(
    async (cell: number, action: "claim" | "release"): Promise<SquaresClaimResult> => {
      try {
        const response = await fetch("/api/squares/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueId, userId, cell, action }),
        });
        const data = (await response.json().catch(() => null)) as { ok?: boolean; outcome?: string } | null;
        // Any answer — success or refusal — means the board may have moved: take the server's word for it.
        await fetchBoard(true);
        return { ok: Boolean(data?.ok), outcome: data?.outcome ?? null };
      } catch {
        return { ok: false, outcome: null, network: true };
      }
    },
    [fetchBoard, userId, venueId],
  );

  const reload = useCallback(() => {
    setStatus("loading");
    void fetchBoard();
  }, [fetchBoard]);

  return { status: identity ? status : ("no-venue" as const), board, score, nowMs, act, reload };
}
