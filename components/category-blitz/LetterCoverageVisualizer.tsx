"use client";

import { useMemo } from "react";

interface CoverageItem {
  letter: string;
  count: number;
  categories: string[];
}

interface LetterCoverageVisualizerProps {
  coverage: CoverageItem[];
  minRequired?: number;
}

export function LetterCoverageVisualizer({
  coverage,
  minRequired = 12,
}: LetterCoverageVisualizerProps) {
  const sortedCoverage = useMemo(() => {
    return [...coverage].sort((a, b) => a.letter.localeCompare(b.letter));
  }, [coverage]);

  const stats = useMemo(() => {
    const total = sortedCoverage.length;
    const valid = sortedCoverage.filter((c) => c.count >= minRequired).length;
    const insufficient = sortedCoverage.filter((c) => c.count > 0 && c.count < minRequired).length;
    const missing = sortedCoverage.filter((c) => c.count === 0).length;
    return { total, valid, insufficient, missing };
  }, [sortedCoverage, minRequired]);

  const getColorClass = (count: number) => {
    if (count >= minRequired) return "bg-green-500";
    if (count > 0) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getBgClass = (count: number) => {
    if (count >= minRequired) return "bg-green-500/10 border-green-500/30";
    if (count > 0) return "bg-yellow-500/10 border-yellow-500/30";
    return "bg-red-500/10 border-red-500/30";
  };

  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Letter Coverage</h3>
          <p className="text-sm text-slate-400 mt-1">
            Categories available per starting letter
          </p>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500"></div>
            <span className="text-slate-400">≥{minRequired}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-yellow-500"></div>
            <span className="text-slate-400">{`<${minRequired}`}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500"></div>
            <span className="text-slate-400">None</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <div className="text-2xl font-bold text-green-400">{stats.valid}</div>
          <div className="text-xs text-green-300/70">Sufficient</div>
        </div>
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
          <div className="text-2xl font-bold text-yellow-400">{stats.insufficient}</div>
          <div className="text-xs text-yellow-300/70">Low</div>
        </div>
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <div className="text-2xl font-bold text-red-400">{stats.missing}</div>
          <div className="text-xs text-red-300/70">Missing</div>
        </div>
      </div>

      {/* Letter Grid */}
      <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-12 gap-2">
        {sortedCoverage.map((item) => (
          <div
            key={item.letter}
            className={`relative p-3 rounded-lg border text-center transition-all hover:scale-105 ${getBgClass(
              item.count
            )}`}
            title={`${item.letter}: ${item.count} categories${
              item.count < minRequired ? ` (need ${minRequired})` : ""
            }`}
          >
            <div className="text-lg font-bold text-slate-100">{item.letter}</div>
            <div
              className={`text-xs font-medium ${
                item.count >= minRequired
                  ? "text-green-400"
                  : item.count > 0
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {item.count}
            </div>
            {/* Mini bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-700/50 rounded-b-lg overflow-hidden">
              <div
                className={`h-full ${getColorClass(item.count)}`}
                style={{
                  width: `${Math.min(100, (item.count / minRequired) * 100)}%`,
                }}
              ></div>
            </div>
          </div>
        ))}
      </div>

      {/* Coverage Details */}
      {stats.insufficient > 0 && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-sm text-yellow-300 font-medium">
            Insufficient Coverage Warning
          </p>
          <p className="text-xs text-yellow-400 mt-1">
            Letters with fewer than {minRequired} categories:
            {sortedCoverage
              .filter((c) => c.count > 0 && c.count < minRequired)
              .map((c) => ` ${c.letter} (${c.count})`)
              .join(",")}
          </p>
        </div>
      )}

      {stats.missing > 0 && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-300 font-medium">
            Missing Letters
          </p>
          <p className="text-xs text-red-400 mt-1">
            No categories available for:
            {sortedCoverage
              .filter((c) => c.count === 0)
              .map((c) => ` ${c.letter}`)
              .join(",")}
          </p>
        </div>
      )}
    </div>
  );
}
