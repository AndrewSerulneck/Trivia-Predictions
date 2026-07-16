"use client";

import { useCallback, useEffect, useState } from "react";
import { isContinuousDefaultEnabled } from "@/lib/categoryBlitzShared";
import type { CategoryBlitzModeSelection } from "@/types";

interface ContinuousConfig {
  isActive: boolean;
  roundDurationSeconds: number;
  intermissionSeconds: number;
  modeSelection: CategoryBlitzModeSelection;
  categoryPool: string[];
  minCategoriesPerLetter: number;
}

interface PoolState {
  config: {
    isActive: boolean;
    roundDurationSeconds: number;
    intermissionSeconds: number;
    modeSelection: CategoryBlitzModeSelection;
    minCategoriesPerLetter: number;
  } | null;
  coverage: { letter: string; count: number; categories: string[] }[];
  isValid: boolean;
}

interface CategoryBlitzContinuousSettingsProps {
  venueId: string;
}

const MODE_OPTIONS: { value: CategoryBlitzModeSelection; label: string }[] = [
  { value: "random", label: "Random (50/50)" },
  { value: "weighted_standard", label: "Weighted Standard (75/25)" },
  { value: "weighted_reverse", label: "Weighted Reverse (25/75)" },
];

export function CategoryBlitzContinuousSettings({ venueId }: CategoryBlitzContinuousSettingsProps) {
  const [config, setConfig] = useState<ContinuousConfig | null>(null);
  const [poolState, setPoolState] = useState<PoolState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [isActive, setIsActive] = useState(false);
  const [roundDuration, setRoundDuration] = useState(180);
  const [intermission, setIntermission] = useState(300);
  const [modeSelection, setModeSelection] = useState<CategoryBlitzModeSelection>("random");

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/category-blitz/continuous-config?venueId=${venueId}`);
      const json = await res.json();
      if (json.ok) {
        setConfig(json.config);
        setPoolState(json.poolState);
        if (json.config) {
          setIsActive(json.config.isActive);
          setRoundDuration(json.config.roundDurationSeconds);
          setIntermission(json.config.intermissionSeconds);
          setModeSelection(json.config.modeSelection);
        }
      }
    } catch (err) {
      setError("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/category-blitz/continuous-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          isActive,
          roundDurationSeconds: roundDuration,
          intermissionSeconds: intermission,
          modeSelection,
        }),
      });

      const json = await res.json();
      if (json.ok) {
        setSuccess("Configuration saved successfully");
        setConfig(json.config);
        setPoolState(json.poolState);
      } else {
        setError(json.error || "Failed to save configuration");
      }
    } catch (err) {
      setError("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-700 rounded w-1/3"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
          <div className="h-10 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">
            {isContinuousDefaultEnabled() ? "Pacing Override" : "Continuous Mode"}
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            {isContinuousDefaultEnabled()
              ? "Category Blitz already runs continuously at every venue by default. Turn this on only to customize this venue's round timing, mode mix, or category pool — or to opt this venue out entirely."
              : "Run Category Blitz on an infinite loop with randomized rounds"}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-14 h-7 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-ht-cyan-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-ht-cyan-500"></div>
        </label>
      </div>

      {isActive && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Round Duration (seconds)
              </label>
              <input
                type="number"
                min={30}
                max={600}
                value={roundDuration}
                onChange={(e) => setRoundDuration(parseInt(e.target.value) || 180)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-ht-cyan-500/50"
              />
              <p className="text-xs text-slate-500 mt-1">
                {Math.floor(roundDuration / 60)}:{String(roundDuration % 60).padStart(2, "0")} per round
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Intermission (seconds)
              </label>
              <input
                type="number"
                min={0}
                max={600}
                value={intermission}
                onChange={(e) => setIntermission(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-ht-cyan-500/50"
              />
              <p className="text-xs text-slate-500 mt-1">
                {Math.floor(intermission / 60)}:{String(intermission % 60).padStart(2, "0")} between rounds
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Mode Selection
            </label>
            <select
              value={modeSelection}
              onChange={(e) => setModeSelection(e.target.value as CategoryBlitzModeSelection)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-ht-cyan-500/50"
            >
              {MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              How often "Blend In!" (reverse) rounds appear
            </p>
          </div>

          {poolState && !poolState.isValid && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-300 font-medium">Insufficient Category Coverage</p>
              <p className="text-xs text-red-400 mt-1">
                Add more categories to enable continuous mode. Letters with insufficient coverage:
                {poolState.coverage
                  .filter((c) => c.count < (poolState.config?.minCategoriesPerLetter ?? 12))
                  .map((c) => ` ${c.letter} (${c.count})`)
                  .join(",")}
              </p>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-300">
          {success}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-ht-cyan-500 hover:bg-ht-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-medium rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </div>
  );
}
