"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import type { StoryShareGameType, StorySharePrize } from "@/lib/socialShare/contracts";
import { buildPrizeStorySharePayload, buildStorySharePayload } from "@/lib/socialShare/storyPayloads";
import { getUserId, getUsername, getVenueId } from "@/lib/storage";
import { StoryShareLauncher } from "./StoryShareLauncher";

/** What a game win tells the picture. Only values the screen already loaded. */
export interface ShareWinResult {
  finalRank?: number | null;
  finalPoints?: number | null;
  correctRate?: number | null;
  /** Defaults to rank 1. A game with no ranking (Bingo, a Squares quarter) passes true. */
  isChampion?: boolean;
}

type ShareWinButtonProps = {
  /** From the screen's own data. Null → the picture drops " at …" and the modal looks the venue up. */
  venueName?: string | null;
  className?: string;
} & (
  | { gameType: Exclude<StoryShareGameType, "prize">; result: ShareWinResult; prize?: never }
  // The prize NAME only (`prizeCardFace`): never a coupon code, QR or gift card number.
  | { prize: StorySharePrize; gameType?: never; result?: never }
);

export const SHARE_WIN_LABEL = "Share my win";

const IDENTITY_SEPARATOR = "\u0000";
const noSubscribe = (): (() => void) => () => undefined;
// A primitive snapshot (the storage values joined), so React sees "unchanged" between renders.
const readIdentityKey = (): string =>
  [getUserId() ?? "", getUsername() ?? "", getVenueId() ?? ""].join(IDENTITY_SEPARATOR);
const readServerIdentityKey = (): string => "";

/**
 * A snapshot reader that asks storage once per button, not once per render (Phase 9f.3, R7). The server
 * snapshot stays "", so hydration is unchanged. A win screen's button mounts after the player is signed in.
 */
const createIdentityReader = (): (() => string) => {
  let cached: string | null = null;
  return () => (cached ??= readIdentityKey());
};

/**
 * Phase 9c: the one "Share my win" button, on every win screen (tripwire:
 * `tests/share-win-button.test.ts`). It builds the payload from data the screen already holds and reads
 * the player's identity from storage, so it adds no request and no polling. No signed-in player → nothing.
 */
export function ShareWinButton(props: ShareWinButtonProps) {
  const [readIdentity] = useState(createIdentityReader);
  const identityKey = useSyncExternalStore(noSubscribe, readIdentity, readServerIdentityKey);
  const identity = useMemo(() => {
    const [userId = "", username = "", venueId = ""] = identityKey.split(IDENTITY_SEPARATOR);
    return userId && username && venueId ? { userId, username, venueId } : null;
  }, [identityKey]);

  const { gameType, result, prize, venueName = null, className } = props;
  // Primitive dependencies: callers pass fresh objects every render and the payload must not rebuild for that.
  const finalRank = result?.finalRank ?? null;
  const finalPoints = result?.finalPoints ?? null;
  const correctRate = result?.correctRate ?? null;
  const isChampion = result?.isChampion;
  const prizeHeadline = prize?.headline ?? null;
  const prizeKind = prize?.headlineKind ?? null;
  const prizeLabel = prize?.label ?? null;
  const payload = useMemo(() => {
    if (!identity) return null;
    const base = { ...identity, venueName };
    if (prizeHeadline !== null && prizeKind !== null && prizeLabel !== null) {
      return buildPrizeStorySharePayload({
        ...base,
        prize: { headline: prizeHeadline, headlineKind: prizeKind, label: prizeLabel },
      });
    }
    if (!gameType) return null;
    return buildStorySharePayload(gameType, { ...base, finalRank, finalPoints, correctRate, isChampion });
  }, [identity, venueName, prizeHeadline, prizeKind, prizeLabel, gameType, finalRank, finalPoints, correctRate, isChampion]);

  if (!payload) return null;
  return <StoryShareLauncher variant="button" payload={payload} buttonLabel={SHARE_WIN_LABEL} className={className} />;
}
