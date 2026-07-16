"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { CategoryBlitzContinuousSettings } from "@/components/category-blitz/CategoryBlitzContinuousSettings";
import { CategoryPoolManager } from "@/components/category-blitz/CategoryPoolManager";
import { LetterCoverageVisualizer } from "@/components/category-blitz/LetterCoverageVisualizer";

type Venue = { id: string; name: string };

interface PoolState {
  config: {
    categoryPool: string[];
  } | null;
  coverage: { letter: string; count: number; categories: string[] }[];
  isValid: boolean;
}

export default function OwnerCategoryBlitzPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [poolState, setPoolState] = useState<PoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const loadVenues = async () => {
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          router.push("/owner/login");
          return;
        }
        const json = await res.json();
        const loaded = json.venues ?? [];
        setVenues(loaded);
        setSelectedVenueId(loaded[0]?.id || "");
      } catch {
        setLoadError("Failed to load venues");
      } finally {
        setLoading(false);
      }
    };
    loadVenues();
  }, [router]);

  useEffect(() => {
    if (!selectedVenueId) return;

    const loadPoolState = async () => {
      try {
        const res = await fetch(`/api/category-blitz/pool?venueId=${selectedVenueId}`);
        const json = await res.json();
        if (json.ok) {
          setPoolState(json.poolState);
        }
      } catch {
        // Silent fail - components will handle their own loading
      }
    };

    loadPoolState();
  }, [selectedVenueId]);

  if (loading) {
    return (
      <OwnerShell title="Category Blitz">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ht-cyan-500"></div>
        </div>
      </OwnerShell>
    );
  }

  if (loadError) {
    return (
      <OwnerShell title="Category Blitz">
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300">
          {loadError}
        </div>
      </OwnerShell>
    );
  }

  if (venues.length === 0) {
    return (
      <OwnerShell title="Category Blitz">
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300">
          No venues found. Create a venue first.
        </div>
      </OwnerShell>
    );
  }

  return (
    <OwnerShell title="Category Blitz" subtitle="Configure continuous loop mode and category pool">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Venue Selector */}
        <div className="flex items-center justify-end">
          <select
            value={selectedVenueId}
            onChange={(e) => setSelectedVenueId(e.target.value)}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-ht-cyan-500/50"
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        {/* Settings */}
        <CategoryBlitzContinuousSettings venueId={selectedVenueId} />

        {/* Coverage Visualizer */}
        {poolState && (
          <LetterCoverageVisualizer
            coverage={poolState.coverage}
            minRequired={poolState.config?.categoryPool.length ? 12 : 0}
          />
        )}

        {/* Pool Manager */}
        <CategoryPoolManager venueId={selectedVenueId} />

        {/* Back to Schedule */}
        <div className="flex justify-start pt-4 border-t border-slate-700/50">
          <a
            href="/owner/schedule"
            className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            ← Back to Schedule
          </a>
        </div>
      </div>
    </OwnerShell>
  );
}
