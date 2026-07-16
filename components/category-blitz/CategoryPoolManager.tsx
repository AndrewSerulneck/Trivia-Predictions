"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface PoolState {
  config: {
    categoryPool: string[];
  } | null;
  coverage: { letter: string; count: number; categories: string[] }[];
  isValid: boolean;
}

interface CategoryPoolManagerProps {
  venueId: string;
}

export function CategoryPoolManager({ venueId }: CategoryPoolManagerProps) {
  const [poolState, setPoolState] = useState<PoolState | null>(null);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLetter, setSelectedLetter] = useState<string | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadPool = useCallback(async () => {
    try {
      const res = await fetch(`/api/category-blitz/pool?venueId=${venueId}`);
      const json = await res.json();
      if (json.ok) {
        setPoolState(json.poolState);
        setAllCategories(json.allCategories);
      }
    } catch (err) {
      setError("Failed to load pool");
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    loadPool();
  }, [loadPool]);

  const currentPool = useMemo(() => {
    return new Set(poolState?.config?.categoryPool ?? []);
  }, [poolState]);

  const filteredCategories = useMemo(() => {
    let filtered = allCategories;

    if (selectedLetter !== "all") {
      const letterCoverage = poolState?.coverage.find((c) => c.letter === selectedLetter);
      if (letterCoverage) {
        filtered = letterCoverage.categories;
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((cat) => cat.toLowerCase().includes(query));
    }

    return filtered;
  }, [allCategories, selectedLetter, poolState, searchQuery]);

  const availableCategories = useMemo(() => {
    return filteredCategories.filter((cat) => !currentPool.has(cat));
  }, [filteredCategories, currentPool]);

  const handleAddCategory = async (category: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/category-blitz/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, categories: [category] }),
      });

      const json = await res.json();
      if (json.ok) {
        setPoolState(json.poolState);
        setSuccess(`Added "${category}"`);
        setTimeout(() => setSuccess(null), 2000);
      } else {
        setError(json.error || "Failed to add category");
      }
    } catch (err) {
      setError("Failed to add category");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCategory = async (category: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/category-blitz/pool", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, categories: [category] }),
      });

      const json = await res.json();
      if (json.ok) {
        setPoolState(json.poolState);
        setSuccess(`Removed "${category}"`);
        setTimeout(() => setSuccess(null), 2000);
      } else {
        setError(json.error || "Failed to remove category");
      }
    } catch (err) {
      setError("Failed to remove category");
    } finally {
      setSaving(false);
    }
  };

  const handleAddAll = async () => {
    if (availableCategories.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/category-blitz/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, categories: availableCategories.slice(0, 50) }),
      });

      const json = await res.json();
      if (json.ok) {
        setPoolState(json.poolState);
        setSuccess(`Added ${Math.min(availableCategories.length, 50)} categories`);
      } else {
        setError(json.error || "Failed to add categories");
      }
    } catch (err) {
      setError("Failed to add categories");
    } finally {
      setSaving(false);
    }
  };

  const handleClearAll = async () => {
    if (!poolState?.config?.categoryPool.length) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/category-blitz/pool", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, categories: poolState.config.categoryPool }),
      });

      const json = await res.json();
      if (json.ok) {
        setPoolState(json.poolState);
        setSuccess("Cleared all categories");
      } else {
        setError(json.error || "Failed to clear categories");
      }
    } catch (err) {
      setError("Failed to clear categories");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-700 rounded w-1/3"></div>
          <div className="h-32 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  const poolCount = poolState?.config?.categoryPool.length ?? 0;
  const isUsingDefaultPool = poolCount === 0;

  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Category Pool</h3>
          <p className="text-sm text-slate-400 mt-1">
            {isUsingDefaultPool
              ? "Using all available categories"
              : `${poolCount} categories in custom pool`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAddAll}
            disabled={saving || availableCategories.length === 0}
            className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg transition-colors"
          >
            Add All Visible
          </button>
          <button
            onClick={handleClearAll}
            disabled={saving || poolCount === 0}
            className="px-3 py-1.5 text-sm bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-300 rounded-lg transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-ht-cyan-500/50"
          />
        </div>
        <select
          value={selectedLetter}
          onChange={(e) => setSelectedLetter(e.target.value)}
          className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-ht-cyan-500/50"
        >
          <option value="all">All Letters</option>
          {poolState?.coverage.map((c) => (
            <option key={c.letter} value={c.letter}>
              {c.letter} ({c.count})
            </option>
          ))}
        </select>
      </div>

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

      {/* Available Categories */}
      <div>
        <h4 className="text-sm font-medium text-slate-300 mb-2">
          Available ({availableCategories.length})
        </h4>
        <div className="max-h-48 overflow-y-auto border border-slate-700/50 rounded-lg p-2 space-y-1">
          {availableCategories.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">
              {searchQuery ? "No categories match your search" : "All categories are in the pool"}
            </p>
          ) : (
            availableCategories.slice(0, 100).map((category) => (
              <button
                key={category}
                onClick={() => handleAddCategory(category)}
                disabled={saving}
                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 rounded transition-colors flex items-center justify-between group"
              >
                <span className="truncate">{category}</span>
                <span className="text-xs text-ht-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  + Add
                </span>
              </button>
            ))
          )}
          {availableCategories.length > 100 && (
            <p className="text-xs text-slate-500 text-center py-2">
              +{availableCategories.length - 100} more (use search to filter)
            </p>
          )}
        </div>
      </div>

      {/* Current Pool */}
      {poolCount > 0 && (
        <div>
          <h4 className="text-sm font-medium text-slate-300 mb-2">
            In Pool ({poolCount})
          </h4>
          <div className="max-h-48 overflow-y-auto border border-slate-700/50 rounded-lg p-2 space-y-1">
            {poolState?.config?.categoryPool.map((category) => (
              <button
                key={category}
                onClick={() => handleRemoveCategory(category)}
                disabled={saving}
                className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-red-500/10 hover:text-red-300 rounded transition-colors flex items-center justify-between group"
              >
                <span className="truncate">{category}</span>
                <span className="text-xs text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  × Remove
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
