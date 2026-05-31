"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type VenueInventory = {
  venueId: string;
  venueName: string;
  totalActive: number;
  seen: number;
  unseen: number;
  isLow: boolean;
};

export function QuestionInventoryAlert() {
  const [lowVenues, setLowVenues] = useState<VenueInventory[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadInventory = async () => {
      try {
        const response = await fetch("/api/admin/venues/question-inventory", { cache: "no-store" });
        const payload = (await response.json()) as { ok: boolean; venues?: VenueInventory[] };
        if (cancelled || !response.ok || !payload.ok) return;
        setLowVenues((payload.venues ?? []).filter((venue) => venue.isLow));
      } catch {
        // Inventory alerting is best-effort — never block the admin shell.
      }
    };
    void loadInventory();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed || lowVenues.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          {lowVenues.map((venue) => (
            <p key={venue.venueId} className="text-sm font-semibold text-amber-900">
              ⚠️ Question inventory low at {venue.venueName}: {venue.unseen} unseen questions remaining ·{" "}
              <Link href="/admin/trivia-review" className="font-bold underline hover:text-amber-700">
                Manage questions
              </Link>
            </p>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss inventory alert"
          className="shrink-0 rounded-md px-2 py-1 text-sm font-bold text-amber-700 hover:bg-amber-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
