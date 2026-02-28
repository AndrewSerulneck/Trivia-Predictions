"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationBell } from "@/components/ui/NotificationBell";
import { getUserId, getUsername, getVenueId } from "@/lib/storage";

type SummaryPayload = {
  ok: boolean;
  profile?: {
    username: string;
    points: number;
    venueId: string;
  } | null;
};

export function UserStatusHeader() {
  const [username, setUsername] = useState("");
  const [points, setPoints] = useState<number | null>(null);
  const [pointsPop, setPointsPop] = useState(false);
  const [pointsGain, setPointsGain] = useState<number | null>(null);
  const priorPointsRef = useRef<number | null>(null);
  const gainHideTimerRef = useRef<number | null>(null);
  const popHideTimerRef = useRef<number | null>(null);

  const animateGain = useCallback((delta: number) => {
    if (delta <= 0) {
      return;
    }

    setPointsGain((current) => (current ?? 0) + delta);
    setPointsPop(true);

    if (gainHideTimerRef.current) {
      window.clearTimeout(gainHideTimerRef.current);
    }
    gainHideTimerRef.current = window.setTimeout(() => {
      setPointsGain(null);
    }, 1400);

    if (popHideTimerRef.current) {
      window.clearTimeout(popHideTimerRef.current);
    }
    popHideTimerRef.current = window.setTimeout(() => {
      setPointsPop(false);
    }, 280);
  }, []);

  const loadSummary = useCallback(async () => {
    const userId = getUserId() ?? "";
    const venueId = getVenueId() ?? "";

    if (!userId) {
      setUsername("");
      setPoints(null);
      priorPointsRef.current = null;
      return;
    }

    const fallbackUsername = getUsername() ?? "";
    if (fallbackUsername) {
      setUsername(fallbackUsername);
    }

    const response = await fetch(
      `/api/users/summary?userId=${encodeURIComponent(userId)}&venueId=${encodeURIComponent(venueId)}`,
      { cache: "no-store" }
    );
    const payload = (await response.json()) as SummaryPayload;
    if (!payload.ok || !payload.profile) {
      return;
    }

    setUsername(payload.profile.username);
    setPoints(payload.profile.points);

    if (priorPointsRef.current !== null && payload.profile.points > priorPointsRef.current) {
      animateGain(payload.profile.points - priorPointsRef.current);
    }
    priorPointsRef.current = payload.profile.points;
  }, [animateGain]);

  useEffect(() => {
    void loadSummary();

    const interval = window.setInterval(() => {
      void loadSummary();
    }, 20000);

    const onPointsUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ delta?: number }>;
      const delta = Number(custom.detail?.delta ?? 0);
      if (Number.isFinite(delta) && delta > 0) {
        animateGain(delta);
      }
      void loadSummary();
    };

    window.addEventListener("tp:points-updated", onPointsUpdated);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", onPointsUpdated);
      if (gainHideTimerRef.current) {
        window.clearTimeout(gainHideTimerRef.current);
      }
      if (popHideTimerRef.current) {
        window.clearTimeout(popHideTimerRef.current);
      }
    };
  }, [animateGain, loadSummary]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
        User: {username || "Guest"}
      </div>
      <div
        className={`rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-transform duration-200 ${
          pointsPop ? "scale-110" : "scale-100"
        }`}
      >
        Points: {points ?? 0}
      </div>
      {pointsGain ? (
        <div className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700 animate-bounce">
          +{pointsGain}
        </div>
      ) : null}
      <NotificationBell />
      <Link
        href="/admin"
        className="px-1 text-[10px] font-medium text-slate-400 hover:text-slate-600"
        aria-label="Admin access"
      >
        Admin
      </Link>
    </div>
  );
}
