"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Subscribes to a venue's live-game channel and calls `onUpdate` the instant
 * an admin creates/edits/deletes a schedule for it (see categoryBlitzBroadcast.ts,
 * liveTriviaBroadcast.ts — both fire a "schedule_updated" broadcast on save),
 * instead of waiting out that screen's own fallback poll interval. `channelName`
 * null/undefined disables the subscription (e.g. no venue resolved yet).
 */
export function useScheduleUpdatedBroadcast(channelName: string | null | undefined, onUpdate: () => void): void {
  useEffect(() => {
    if (!channelName || !supabase) return;
    const client = supabase;
    const channel = client
      .channel(channelName)
      .on("broadcast", { event: "schedule_updated" }, () => {
        onUpdate();
      })
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [channelName, onUpdate]);
}

/**
 * Same as useScheduleUpdatedBroadcast, but also returns a boolean that flips
 * true for `flashMs` after an update lands — for a lobby to show a brief
 * "schedule updated" toast so the refresh is visibly obvious, not just fast.
 */
export function useScheduleUpdatedFlash(
  channelName: string | null | undefined,
  onUpdate: () => void,
  flashMs = 4000,
): boolean {
  const [flashing, setFlashing] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleUpdate = useCallback(() => {
    onUpdate();
    setFlashing(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setFlashing(false), flashMs);
  }, [onUpdate, flashMs]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useScheduleUpdatedBroadcast(channelName, handleUpdate);

  return flashing;
}
