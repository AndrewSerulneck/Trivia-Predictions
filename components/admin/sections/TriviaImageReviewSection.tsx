"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ImageCategory, ImageCategorySummary, ImageQuestion } from "@/app/api/admin/trivia-images/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterMode = "all" | "with-image" | "missing";

// Per-slug swap index tracking: { unsplash: number, wiki: number }
type SwapCounters = Record<string, { unsplash: number; wiki: number }>;

// ─── Image card ───────────────────────────────────────────────────────────────

function ImageCard({
  q: initialQ,
  swapCounters,
  onSwapCounterChange,
}: {
  q: ImageQuestion;
  swapCounters: SwapCounters;
  onSwapCounterChange: (slug: string, type: "unsplash" | "wiki") => void;
}) {
  const [q, setQ] = useState(initialQ);
  const [swapping, setSwapping] = useState<"unsplash" | "wiki" | "remove-image" | "remove-question" | null>(null);
  const [removed, setRemoved] = useState(false);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editQuestion, setEditQuestion] = useState(q.question);
  const [editAnswer, setEditAnswer] = useState(q.answer);
  const [editDifficulty, setEditDifficulty] = useState(q.difficulty);
  const [editAcceptable, setEditAcceptable] = useState((q.acceptableAnswers ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [imgBroken, setImgBroken] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  if (removed) return null;

  const isMap =
    (q.imageCredit ?? "").toLowerCase().includes("wikimedia") ||
    (q.imageUrl ?? "").includes("wikimedia") ||
    (q.imageUrl ?? "").includes("/maps/") ||
    (q.imageUrl ?? "").includes(".svg");

  const counters = swapCounters[q.slug] ?? { unsplash: 1, wiki: 1 };

  async function handleSwap(type: "unsplash" | "wiki" | "remove-image" | "remove-question") {
    if (swapping) return;
    if (type === "remove-question" && !window.confirm(`Delete "${q.answer}" entirely? This cannot be undone from the UI.`)) return;
    setSwapping(type);
    setSwapError(null);
    const index = type === "unsplash" ? counters.unsplash : counters.wiki;
    try {
      const res = await fetch("/api/admin/trivia-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: q.slug, index, source: type }),
      });
      const data = await res.json() as { ok: boolean; imageUrl?: string; imageCredit?: string; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Request failed");
      if (type === "remove-question") {
        setRemoved(true);
      } else if (type === "remove-image") {
        setQ((prev) => ({ ...prev, imageUrl: null, imageCredit: null }));
      } else {
        setQ((prev) => ({ ...prev, imageUrl: data.imageUrl ?? null, imageCredit: data.imageCredit ?? null }));
        setImgBroken(false);
        setImgLoaded(false);
        onSwapCounterChange(q.slug, type);
      }
    } catch (e) {
      setSwapError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSwapping(null);
    }
  }

  async function handleSaveEdit() {
    setSaving(true);
    setSaveError(null);
    const acceptableAnswers = editAcceptable
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/admin/trivia-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: q.slug,
          source: "edit",
          question: editQuestion,
          answer: editAnswer,
          difficulty: editDifficulty,
          acceptableAnswers,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Save failed");
      setQ((prev) => ({
        ...prev,
        question: editQuestion,
        answer: editAnswer,
        difficulty: editDifficulty,
        acceptableAnswers: acceptableAnswers.length > 0 ? acceptableAnswers : undefined,
      }));
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setEditQuestion(q.question);
    setEditAnswer(q.answer);
    setEditDifficulty(q.difficulty);
    setEditAcceptable((q.acceptableAnswers ?? []).join("\n"));
    setSaveError(null);
    setEditing(false);
  }

  const diffColor =
    q.difficulty === "hard"
      ? "bg-red-100 text-red-700 border-red-200"
      : q.difficulty === "medium"
      ? "bg-yellow-100 text-yellow-700 border-yellow-200"
      : "bg-green-100 text-green-700 border-green-200";

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-colors ${imgBroken ? "border-red-300" : "border-slate-200 hover:border-indigo-300"}`}>
      {/* Image area */}
      <div className="relative bg-slate-100" style={{ height: 160 }}>
        {q.imageUrl ? (
          <>
            {!imgLoaded && !imgBroken && (
              <div className="absolute inset-0 animate-pulse bg-slate-200" />
            )}
            <img
              src={q.imageUrl}
              alt={q.answer}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgBroken(true); setImgLoaded(true); }}
              className={`w-full h-full transition-opacity duration-300 ${isMap ? "object-contain p-2" : "object-cover"} ${imgLoaded && !imgBroken ? "opacity-100" : "opacity-0 absolute inset-0"}`}
            />
            {imgBroken && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-red-500">
                <span className="text-2xl">⚠</span>
                <span className="text-xs font-medium">Image failed to load</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-3xl mb-1">🖼</div>
              <div className="text-xs font-medium">No image</div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {editing ? (
          /* ── Edit mode ── */
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Question</label>
              <textarea
                value={editQuestion}
                onChange={(e) => setEditQuestion(e.target.value)}
                rows={3}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 resize-y"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Answer</label>
              <input
                value={editAnswer}
                onChange={(e) => setEditAnswer(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Difficulty</label>
              <select
                value={editDifficulty}
                onChange={(e) => setEditDifficulty(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                Acceptable Answers <span className="normal-case font-normal text-slate-400">(one per line)</span>
              </label>
              <textarea
                value={editAcceptable}
                onChange={(e) => setEditAcceptable(e.target.value)}
                rows={2}
                placeholder="Leave blank if none"
                className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 resize-y"
              />
            </div>
            {saveError && <p className="text-[10px] text-red-500">{saveError}</p>}
            <div className="flex gap-1.5 pt-1">
              <button
                onClick={() => void handleSaveEdit()}
                disabled={saving}
                className="text-[11px] font-semibold rounded px-2 py-1 border bg-indigo-600 border-indigo-700 text-white hover:bg-indigo-700 disabled:opacity-60 cursor-pointer transition-colors"
              >
                {saving ? "Saving…" : "✓ Save"}
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="text-[11px] font-semibold rounded px-2 py-1 border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-60 cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <>
            {/* Answer + difficulty + edit button */}
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-900 text-sm truncate">{q.answer}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${diffColor}`}>
                  {q.difficulty}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer"
                  title="Edit question"
                >
                  ✎ Edit
                </button>
              </div>
            </div>

            {/* Question text */}
            <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{q.question}</p>

            {/* Acceptable answers */}
            {q.acceptableAnswers && q.acceptableAnswers.length > 0 && (
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Also: {q.acceptableAnswers.join(", ")}
              </p>
            )}

            {/* Image URL */}
            {q.imageUrl && (
              <a
                href={q.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[10px] text-blue-500 hover:underline"
              >
                {q.imageUrl}
              </a>
            )}

            {/* Credit */}
            {q.imageCredit && (
              <p className="text-[10px] text-slate-400 truncate">{q.imageCredit}</p>
            )}

            {/* Slug */}
            <p className="text-[10px] text-slate-300 font-mono truncate">{q.slug}</p>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              <SwapButton
                label={swapping === "unsplash" ? "Loading…" : `↺ Unsplash${counters.unsplash > 1 ? ` #${counters.unsplash + 1}` : ""}`}
                loading={swapping === "unsplash"}
                color="indigo"
                onClick={() => void handleSwap("unsplash")}
                disabled={!!swapping}
              />
              <SwapButton
                label={swapping === "wiki" ? "Loading…" : `🗺 Wikimedia${counters.wiki > 1 ? ` #${counters.wiki + 1}` : ""}`}
                loading={swapping === "wiki"}
                color="teal"
                onClick={() => void handleSwap("wiki")}
                disabled={!!swapping}
              />
              {q.imageUrl && (
                <SwapButton
                  label={swapping === "remove-image" ? "Removing…" : "✕ Remove Image"}
                  loading={swapping === "remove-image"}
                  color="red"
                  onClick={() => void handleSwap("remove-image")}
                  disabled={!!swapping}
                />
              )}
              <SwapButton
                label={swapping === "remove-question" ? "Deleting…" : "🗑 Delete Question"}
                loading={swapping === "remove-question"}
                color="red"
                onClick={() => void handleSwap("remove-question")}
                disabled={!!swapping}
              />
            </div>
            {swapError && (
              <p className="text-[10px] text-red-500 leading-tight">{swapError}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SwapButton({
  label,
  loading,
  color,
  onClick,
  disabled,
}: {
  label: string;
  loading: boolean;
  color: "indigo" | "teal" | "red";
  onClick: () => void;
  disabled: boolean;
}) {
  const base = "text-[11px] font-semibold rounded px-2 py-1 border transition-colors";
  const colorMap = {
    indigo: loading
      ? "bg-indigo-100 border-indigo-200 text-indigo-400 cursor-wait"
      : "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 cursor-pointer",
    teal: loading
      ? "bg-teal-100 border-teal-200 text-teal-400 cursor-wait"
      : "bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 cursor-pointer",
    red: loading
      ? "bg-red-100 border-red-200 text-red-400 cursor-wait"
      : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100 cursor-pointer",
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${colorMap[color]} disabled:opacity-60`}>
      {label}
    </button>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({
  total,
  withImage,
  missing,
  shown,
}: {
  total: number;
  withImage: number;
  missing: number;
  shown: number;
}) {
  const pct = total > 0 ? Math.round((withImage / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
      <StatChip label="Total questions" value={total} color="slate" />
      <StatChip label="Have image" value={withImage} color="green" />
      <StatChip label="Missing image" value={missing} color="red" />
      <StatChip label="Coverage" value={`${pct}%`} color={pct === 100 ? "green" : pct > 75 ? "yellow" : "red"} />
      <span className="ml-auto text-xs text-slate-400">Showing {shown}</span>
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: "slate" | "green" | "red" | "yellow";
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-yellow-100 text-yellow-700",
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${colors[color]}`}>{value}</span>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function TriviaImageReviewSection() {
  const [categorySummaries, setCategorySummaries] = useState<ImageCategorySummary[]>([]);
  const [activeCategory, setActiveCategory] = useState<ImageCategory | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [search, setSearch] = useState("");
  const [swapCounters, setSwapCounters] = useState<SwapCounters>({});

  const loadCategorySummaries = useCallback(async () => {
    setLoadingSummary(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/trivia-images");
      const data = (await res.json()) as {
        ok: boolean;
        categories?: ImageCategorySummary[];
        error?: string;
      };
      if (!data.ok) throw new Error(data.error ?? "Unknown error");
      setCategorySummaries(data.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadSelectedCategory = useCallback(async (categoryName: string) => {
    setLoadingCategory(true);
    setError(null);
    try {
      const params = new URLSearchParams({ category: categoryName });
      const res = await fetch(`/api/admin/trivia-images?${params.toString()}`);
      const data = (await res.json()) as {
        ok: boolean;
        category?: ImageCategory;
        error?: string;
      };
      if (!data.ok || !data.category) throw new Error(data.error ?? "Unknown error");
      setActiveCategory(data.category);
    } catch (e) {
      setActiveCategory(null);
      setError(e instanceof Error ? e.message : "Failed to load category");
    } finally {
      setLoadingCategory(false);
    }
  }, []);

  useEffect(() => { void loadCategorySummaries(); }, [loadCategorySummaries]);

  useEffect(() => {
    if (!selectedCategory) {
      setActiveCategory(null);
      return;
    }
    void loadSelectedCategory(selectedCategory);
  }, [loadSelectedCategory, selectedCategory]);

  const handleSwapCounterChange = useCallback(
    (slug: string, type: "unsplash" | "wiki") => {
      setSwapCounters((prev) => {
        const cur = prev[slug] ?? { unsplash: 1, wiki: 1 };
        return {
          ...prev,
          [slug]: {
            ...cur,
            [type]: cur[type] + 1,
          },
        };
      });
    },
    []
  );

  const selectedCategorySummary = useMemo(
    () => categorySummaries.find((category) => category.categoryName === selectedCategory) ?? null,
    [categorySummaries, selectedCategory]
  );
  const globalTotals = useMemo(
    () =>
      categorySummaries.reduce(
        (totals, category) => ({
          totalQuestions: totals.totalQuestions + category.totalQuestions,
          totalWithImage: totals.totalWithImage + category.totalWithImage,
          totalMissing: totals.totalMissing + category.totalMissing,
        }),
        { totalQuestions: 0, totalWithImage: 0, totalMissing: 0 }
      ),
    [categorySummaries]
  );

  // Flatten selected category questions for stats
  const allQuestions = useMemo(
    () => activeCategory?.questions ?? [],
    [activeCategory]
  );
  const totalWithImage = useMemo(
    () => allQuestions.filter((q) => q.imageUrl).length,
    [allQuestions]
  );

  const categoryNames = useMemo(
    () => categorySummaries.map((c) => c.categoryName).sort(),
    [categorySummaries]
  );

  const filteredQuestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allQuestions.filter((item) => {
      if (filterMode === "with-image" && !item.imageUrl) return false;
      if (filterMode === "missing" && item.imageUrl) return false;
      if (q && !item.answer.toLowerCase().includes(q) && !item.slug.includes(q) && !item.question.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allQuestions, filterMode, search]);

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <div className="text-sm">Loading category summaries…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
        <button
          onClick={() => {
            if (selectedCategory) {
              void loadSelectedCategory(selectedCategory);
              return;
            }
            void loadCategorySummaries();
          }}
          className="ml-3 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StatsBar
        total={selectedCategorySummary?.totalQuestions ?? globalTotals.totalQuestions}
        withImage={selectedCategorySummary?.totalWithImage ?? globalTotals.totalWithImage}
        missing={selectedCategorySummary?.totalMissing ?? globalTotals.totalMissing}
        shown={filteredQuestions.length}
      />

      <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs text-indigo-700 leading-relaxed">
        <span className="font-semibold">How to use this page:</span> Choose a category first to load only that category&apos;s image review queue. After that, click <span className="font-semibold">↺ Unsplash</span> or <span className="font-semibold">🗺 Wikimedia</span> to instantly fetch and save a new image. Each click advances to the next result.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-semibold shadow-sm">
          {(["all", "with-image", "missing"] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-2 transition-colors capitalize ${filterMode === mode ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {mode === "with-image" ? "Has image" : mode === "missing" ? "Missing" : "All"}
            </button>
          ))}
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
        >
          <option value="">Select a category…</option>
          {categoryNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!selectedCategory}
          placeholder="Search answer, slug, question…"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 w-56 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        />

        <button
          onClick={() => {
            if (selectedCategory) {
              void loadSelectedCategory(selectedCategory);
              return;
            }
            void loadCategorySummaries();
          }}
          className="ml-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
        >
          ↺ Reload
        </button>
      </div>

      {!selectedCategory ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-700">Select a category to start reviewing images.</p>
          <p className="mt-2 text-xs text-slate-500">
            The page will stay lightweight until you choose one of the {categorySummaries.length} available categories.
          </p>
        </div>
      ) : loadingCategory ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <div className="text-sm">Loading {selectedCategory}…</div>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">No questions match your filters in this category.</div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {filteredQuestions.map((q) => (
            <ImageCard
              key={q.slug}
              q={q}
              swapCounters={swapCounters}
              onSwapCounterChange={handleSwapCounterChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}
