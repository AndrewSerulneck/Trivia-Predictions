"use client";

import { useEffect, useRef, useState } from "react";
import {
  TV_SCORE_FLASH_KEEP_MS,
  detectScoreFlash,
  scoreSnapshotOf,
  type TvScoreFlash,
  type TvScoreSnapshot,
} from "@/lib/tvPickEmBoard";
import type { TvPickEmGame } from "@/lib/tvSportsRelevance";

/**
 * Watches the ranked games across polls and hands the Pick 'Em board the latest score change (docs/fire-tv-app-plan.md
 * Phase 10 step 3). Call it from a component that stays mounted while the TV is idle (IdleVenueScreen, and Phase 11's
 * carousel), not from the slide itself: the slide may be off screen when the poll lands, and it unmounts between
 * rotations. The flash stays available for TV_SCORE_FLASH_KEEP_MS; the board plays it through `useFxMoment`, so one
 * score change plays at most once per page load however often the slide mounts or the poll repeats.
 * The first games a TV sees (page load) flash nothing.
 */
export const usePickEmScoreFlash = (games: readonly TvPickEmGame[] | null | undefined): TvScoreFlash | null => {
  const previous = useRef<TvScoreSnapshot | null>(null);
  const [flash, setFlash] = useState<TvScoreFlash | null>(null);

  useEffect(() => {
    if (!games) return;
    const found = detectScoreFlash(previous.current, games);
    previous.current = scoreSnapshotOf(games);
    // A new score change replaces the last one; an unchanged poll leaves it alone.
    if (found) setFlash((current) => (current?.token === found.token ? current : found));
  }, [games]);

  const token = flash?.token ?? null;
  useEffect(() => {
    if (!token) return undefined;
    const id = window.setTimeout(() => setFlash(null), TV_SCORE_FLASH_KEEP_MS);
    return () => window.clearTimeout(id);
  }, [token]);

  return flash;
};
