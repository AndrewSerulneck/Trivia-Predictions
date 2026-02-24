"use client";

import { useEffect, useState } from "react";
import { getUserId } from "@/lib/storage";

type Quota = {
  limit: number;
  picksUsed: number;
  picksRemaining: number;
  windowSecondsRemaining: number;
  isAdminBypass: boolean;
};

function formatReset(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function PredictionQuotaBadge() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const userId = getUserId() ?? "";
    if (!userId) {
      setQuota(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/predictions/quota?userId=${encodeURIComponent(userId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { ok: boolean; quota?: Quota | null };
        if (!payload.ok) {
          return;
        }
        setQuota(payload.quota ?? null);
      } finally {
        setLoading(false);
      }
    };

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, 15000);

    const onPoints = () => {
      void load();
    };
    window.addEventListener("tp:points-updated", onPoints);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("tp:points-updated", onPoints);
    };
  }, []);

  if (!quota && !loading) {
    return null;
  }

  if (quota?.isAdminBypass) {
    return (
      <div className="rounded-md bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
        Picks: Unlimited (Admin)
      </div>
    );
  }

  if (!quota) {
    return (
      <div className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">Loading picks...</div>
    );
  }

  return (
    <div className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
      Picks left: {quota.picksRemaining}/{quota.limit}
      {quota.picksRemaining === 0 ? ` · Reset in ${formatReset(quota.windowSecondsRemaining)}` : ""}
    </div>
  );
}
