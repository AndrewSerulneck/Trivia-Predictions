"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TV_SCORE_FLASH_KEEP_MS,
  detectScoreFlashes,
  enqueueScoreFlashes,
  scoreSnapshotOf,
  type TvQueuedFlash,
  type TvScoreFlash,
  type TvScoreSnapshot,
} from "@/lib/tvPickEmBoard";
import type { TvPickEmGame } from "@/lib/tvSportsRelevance";

/**
 * Watches the ranked games across polls and hands the Pick 'Em board their score changes, one at a time (docs/fire-tv-app-plan.md
 * Phase 10 step 3, CR2.1 F46). Call it from a component that stays mounted while the TV is idle (the carousel), not from the
 * slide itself: the slide may be off screen when the poll lands, and it unmounts between rotations.
 *
 * Every change waits in a short queue, each with its own `useFxMoment` token, so two games scoring in one poll both play
 * once. `flash` is the head; the board calls `done(token)` when its turn on the board is over, and the next one comes up.
 * A flash nobody watched expires TV_SCORE_FLASH_KEEP_MS after its poll. The first games a TV sees (page load) flash
 * nothing, and neither does the first poll after a gap with no Pick 'Em data (F47): that is a first look again.
 */
export const usePickEmScoreFlash = (
  games: readonly TvPickEmGame[] | null | undefined,
): { flash: TvScoreFlash | null; done: (token: string) => void } => {
  const previous = useRef<TvScoreSnapshot | null>(null);
  const [queue, setQueue] = useState<TvQueuedFlash[]>([]);

  useEffect(() => {
    if (!games) {
      previous.current = null;
      return;
    }
    const found = detectScoreFlashes(previous.current, games);
    previous.current = scoreSnapshotOf(games);
    // An unchanged poll finds nothing; a repeat of a waiting token is not added twice.
    if (found.length > 0) setQueue((current) => enqueueScoreFlashes(current, found, Date.now()));
  }, [games]);

  const done = useCallback((token: string) => {
    setQueue((current) => (current.some((entry) => entry.flash.token === token) ? current.filter((entry) => entry.flash.token !== token) : current));
  }, []);

  const head = queue[0] ?? null;
  const headToken = head?.flash.token ?? null;
  const headAt = head?.at ?? 0;
  useEffect(() => {
    if (!headToken) return undefined;
    const id = window.setTimeout(() => done(headToken), Math.max(0, headAt + TV_SCORE_FLASH_KEEP_MS - Date.now()));
    return () => window.clearTimeout(id);
  }, [headToken, headAt, done]);

  return { flash: head?.flash ?? null, done };
};
