"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import type { Advertisement, AdPageKey, AdType, Venue } from "@/types";
import { AD_PLACEMENTS } from "@/lib/adPlacements";

// ─── Canonical slot registry ──────────────────────────────────────────────────

type SlotDef = {
  key: string;
  label: string;
  description: string;
};

type PageDef = {
  id: string;
  label: string;
  slots: SlotDef[];
};

const PAGES: PageDef[] = [
  {
    id: "join",
    label: "Join Page",
    slots: [
      { key: "join-popup-on-entry", label: "Entry Popup", description: "Appears on page load" },
      { key: "join-inline", label: "Inline Content", description: "Between content blocks" },
      { key: "join-banner", label: "Banner", description: "Mobile adhesion / bottom banner" },
    ],
  },
  {
    id: "venue",
    label: "Venue Page",
    slots: [
      { key: "venue-popup-on-entry", label: "Entry Popup", description: "Appears on venue load" },
      { key: "venue-popup-on-scroll", label: "Scroll Popup", description: "Triggered on scroll" },
      { key: "venue-inline-content", label: "Inline Content", description: "Mid-page inline slot" },
      { key: "venue-leaderboard-sidebar", label: "Leaderboard Sidebar", description: "Next to leaderboard" },
      { key: "venue-banner", label: "Banner", description: "Mobile adhesion / bottom banner" },
    ],
  },
  {
    id: "trivia-blitz",
    label: "Speed Trivia (Blitz)",
    slots: [
      { key: "trivia-popup-on-entry", label: "Entry Popup", description: "Appears on game load" },
      { key: "trivia-round-end-r1", label: "Round 1 End", description: "After round 1 completes" },
      { key: "trivia-round-end-r2", label: "Round 2 End", description: "After round 2 completes" },
      { key: "trivia-round-end-r3", label: "Round 3 End", description: "After round 3 completes" },
      { key: "trivia-banner", label: "Banner", description: "Mobile adhesion during play" },
    ],
  },
  {
    id: "pickem",
    label: "Pick'Em",
    slots: [
      { key: "pickem-popup-on-entry", label: "Entry Popup", description: "Appears on game load" },
      { key: "pickem-inline", label: "Inline Content", description: "Between prediction cards" },
      { key: "pickem-banner", label: "Banner", description: "Mobile adhesion" },
    ],
  },
  {
    id: "fantasy",
    label: "Fantasy Page",
    slots: [
      { key: "fantasy-popup-on-entry", label: "Pop-Up Ad", description: "Appears when users enter Fantasy" },
      { key: "fantasy-banner", label: "Banner Ad", description: "Persistent bottom banner in Fantasy" },
      { key: "fantasy-inline", label: "Inline Ad", description: "In-feed fantasy placement" },
    ],
  },
  {
    id: "sports-bingo",
    label: "Bingo Page",
    slots: [
      { key: "sports-bingo-popup-on-entry", label: "Pop-Up Ad", description: "Appears when users enter Bingo" },
      { key: "sports-bingo-banner", label: "Banner Ad", description: "Persistent bottom banner in Bingo" },
      { key: "sports-bingo-inline", label: "Inline Ad", description: "Inline slot on Bingo screens" },
    ],
  },
  {
    id: "live-showdown",
    label: "Live Trivia",
    slots: [
      { key: "live-popup-lobby", label: "Lobby Popup", description: "Primary popup shown in the live lobby" },
      { key: "live-inline-lobby", label: "Lobby Inline", description: "Inline lobby sponsor slot" },
      { key: "live-banner-mobile", label: "Live Mobile Banner", description: "Mobile adhesion in live flow" },
      { key: "live-popup-intermission", label: "Intermission Popup", description: "Delay-triggered popup during round breaks" },
      { key: "live-showdown-lobby-on-entry", label: "Legacy Lobby Entry", description: "Legacy key for backward compatibility" },
      { key: "live-showdown-intermission-r1", label: "Legacy Intermission R1", description: "Legacy key for round 1 intermission" },
      { key: "live-showdown-intermission-r2", label: "Legacy Intermission R2", description: "Legacy key for round 2 intermission" },
      { key: "live-showdown-intermission-r3", label: "Legacy Intermission R3", description: "Legacy key for round 3 intermission" },
      { key: "live-showdown-intermission-r4", label: "Legacy Intermission R4", description: "Legacy key for round 4 intermission" },
      { key: "live-showdown-intermission-r5", label: "Legacy Intermission R5", description: "Legacy key for round 5 intermission" },
    ],
  },
];

const ALL_SLOT_KEYS = new Set(PAGES.flatMap((p) => p.slots.map((s) => s.key)));
const TAXONOMY_PAGE_KEYS: Array<Exclude<AdPageKey, "global">> = ["trivia", "sports-bingo", "fantasy", "pickem"];
const AD_TYPE_ORDER: AdType[] = ["popup", "banner", "inline"];

function formatAdType(adType: AdType): string {
  if (adType === "popup") return "Pop-Up";
  if (adType === "banner") return "Banner";
  return "Inline";
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DragState = {
  adId: string;
  sourceSlotKey: string | null;
  overSlotKey: string | null;
  overIndex: number | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupBySlotKey(ads: Advertisement[]): Map<string, Advertisement[]> {
  const map = new Map<string, Advertisement[]>();
  for (const ad of ads) {
    const key = ad.slotKey ?? "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ad);
  }
  for (const [, list] of map) {
    list.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }
  return map;
}

function reorder<T>(list: T[], from: number, to: number): T[] {
  const result = [...list];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EmptyBadge() {
  return (
    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">
      EMPTY
    </span>
  );
}

function AdCard({
  ad,
  index,
  slotKey,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  ad: Advertisement;
  index: number;
  slotKey: string;
  onRemove: () => void;
  onDragStart: (adId: string, slotKey: string) => void;
  onDragOver: (e: React.DragEvent, slotKey: string, index: number) => void;
  onDrop: (e: React.DragEvent, slotKey: string, index: number) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(ad.id, slotKey)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, slotKey, index); }}
      onDrop={(e) => { e.preventDefault(); onDrop(e, slotKey, index); }}
      className="flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm active:cursor-grabbing hover:border-indigo-300 hover:shadow-md transition-all"
    >
      {/* Priority badge */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-bold tabular-nums text-slate-500">
        {index + 1}
      </span>

      {/* Thumbnail */}
      {ad.imageUrl ? (
        <img
          src={ad.imageUrl}
          alt={ad.altText}
          className="h-8 w-12 shrink-0 rounded object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className="h-8 w-12 shrink-0 rounded bg-slate-100" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">{ad.advertiserName}</p>
        <p className="truncate text-[10px] text-slate-400">{ad.id.slice(0, 8)}…</p>
      </div>

      <button
        onClick={onRemove}
        className="ml-auto shrink-0 rounded p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
        title="Remove from slot"
      >
        ✕
      </button>
    </div>
  );
}

function SlotPanel({
  slot,
  ads,
  onRemoveAd,
  onDropUnassigned,
  drag,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  slot: SlotDef;
  ads: Advertisement[];
  onRemoveAd: (adId: string) => void;
  onDropUnassigned: (adId: string, slotKey: string) => void;
  drag: DragState | null;
  onDragStart: (adId: string, slotKey: string) => void;
  onDragOver: (e: React.DragEvent, slotKey: string, index: number) => void;
  onDrop: (e: React.DragEvent, slotKey: string, index: number) => void;
}) {
  const isDragTarget = drag?.overSlotKey === slot.key;

  return (
    <div
      className={`rounded-lg border-2 transition-colors ${isDragTarget ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-slate-50"} p-3`}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e, slot.key, ads.length); }}
      onDrop={(e) => {
        e.preventDefault();
        if (drag?.sourceSlotKey === null) {
          onDropUnassigned(drag.adId, slot.key);
        } else {
          onDrop(e, slot.key, ads.length);
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700">{slot.label}</p>
          <p className="text-[10px] text-slate-400">{slot.description}</p>
        </div>
        <div className="flex items-center gap-1">
          {ads.length === 0 ? (
            <EmptyBadge />
          ) : (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
              {ads.length} ad{ads.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        {ads.map((ad, idx) => (
          <AdCard
            key={ad.id}
            ad={ad}
            index={idx}
            slotKey={slot.key}
            onRemove={() => onRemoveAd(ad.id)}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />
        ))}
        {ads.length === 0 && (
          <div className={`rounded-lg border-2 border-dashed py-4 text-center text-[11px] text-slate-400 transition-colors ${isDragTarget ? "border-indigo-400" : "border-slate-300"}`}>
            Drop an ad here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type AdPlacementBuilderProps = {
  venues: Venue[];
};

export function AdPlacementBuilder({ venues }: AdPlacementBuilderProps) {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [selectedPage, setSelectedPage] = useState<string>(PAGES[0].id);
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedZipCodes, setSelectedZipCodes] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);

  // Tracks per-slot ordered ad lists (local mutation before save)
  const [slotMap, setSlotMap] = useState<Map<string, Advertisement[]>>(new Map());
  const [unassigned, setUnassigned] = useState<Advertisement[]>([]);

  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const cityOptions = Array.from(
    new Set(
      venues
        .map((venue) => venue.city ?? "")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const stateOptions = Array.from(
    new Set(
      venues
        .map((venue) => venue.state ?? "")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const zipCodeOptions = Array.from(
    new Set(
      venues
        .map((venue) => venue.zipCode ?? "")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const regionOptions = Array.from(
    new Set(
      venues
        .map((venue) => venue.region ?? "")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const fetchAds = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ resource: "ads", pageSize: "5000" });
      if (selectedVenueIds.length > 0) params.set("venueIds", selectedVenueIds.join(","));
      if (selectedCities.length > 0) params.set("cities", selectedCities.join(","));
      if (selectedStates.length > 0) params.set("states", selectedStates.join(","));
      if (selectedZipCodes.length > 0) params.set("zipCodes", selectedZipCodes.join(","));
      if (selectedRegions.length > 0) params.set("regions", selectedRegions.join(","));

      const res = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json()) as { ok: boolean; items?: Advertisement[]; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Failed to load ads.");
      const allAds = payload.items ?? [];
      setAds(allAds);
      const grouped = groupBySlotKey(allAds);
      const newSlotMap = new Map<string, Advertisement[]>();
      for (const page of PAGES) {
        for (const slot of page.slots) {
          newSlotMap.set(slot.key, grouped.get(slot.key) ?? []);
        }
      }
      setSlotMap(newSlotMap);
      setUnassigned(allAds.filter((ad) => !ALL_SLOT_KEYS.has(ad.slotKey)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ads.");
    } finally {
      setLoading(false);
    }
  }, [selectedCities, selectedRegions, selectedStates, selectedVenueIds, selectedZipCodes]);

  useEffect(() => { void fetchAds(); }, [fetchAds]);

  function handleMultiSelect(
    event: ChangeEvent<HTMLSelectElement>,
    setter: Dispatch<SetStateAction<string[]>>
  ) {
    setter(Array.from(event.target.selectedOptions).map((option) => option.value));
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const updates: Array<{ id: string; slotKey: string; priority: number }> = [];
      for (const [slotKey, list] of slotMap.entries()) {
        list.forEach((ad, idx) => {
          updates.push({ id: ad.id, slotKey, priority: idx });
        });
      }
      unassigned.forEach((ad, idx) => {
        updates.push({ id: ad.id, slotKey: ad.slotKey ?? "", priority: idx });
      });

      const res = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "ads-placement", updates }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Save failed.");
      setSavedAt(new Date());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  // ── Drag handlers ──────────────────────────────────────────────────────────

  function handleDragStart(adId: string, sourceSlotKey: string) {
    const state: DragState = { adId, sourceSlotKey, overSlotKey: null, overIndex: null };
    dragRef.current = state;
    setDrag(state);
  }

  function handleDragOver(e: React.DragEvent, overSlotKey: string, overIndex: number) {
    e.preventDefault();
    const current = dragRef.current;
    if (!current) return;
    if (current.overSlotKey !== overSlotKey || current.overIndex !== overIndex) {
      const updated = { ...current, overSlotKey, overIndex };
      dragRef.current = updated;
      setDrag(updated);
    }
  }

  function handleDrop(e: React.DragEvent, targetSlotKey: string, targetIndex: number) {
    e.preventDefault();
    const current = dragRef.current;
    if (!current) return;
    dragRef.current = null;
    setDrag(null);

    const { adId, sourceSlotKey } = current;
    if (!sourceSlotKey) return;

    setSlotMap((prev) => {
      const next = new Map(prev);
      const sourceList = [...(next.get(sourceSlotKey) ?? [])];
      const fromIndex = sourceList.findIndex((a) => a.id === adId);
      if (fromIndex === -1) return prev;

      if (sourceSlotKey === targetSlotKey) {
        next.set(sourceSlotKey, reorder(sourceList, fromIndex, targetIndex));
      } else {
        const [moved] = sourceList.splice(fromIndex, 1);
        next.set(sourceSlotKey, sourceList);
        const targetList = [...(next.get(targetSlotKey) ?? [])];
        targetList.splice(Math.min(targetIndex, targetList.length), 0, moved);
        next.set(targetSlotKey, targetList);
      }
      return next;
    });
  }

  function handleDropFromUnassigned(adId: string, targetSlotKey: string) {
    dragRef.current = null;
    setDrag(null);
    const ad = unassigned.find((a) => a.id === adId);
    if (!ad) return;
    setUnassigned((prev) => prev.filter((a) => a.id !== adId));
    setSlotMap((prev) => {
      const next = new Map(prev);
      const targetList = [...(next.get(targetSlotKey) ?? [])];
      targetList.push(ad);
      next.set(targetSlotKey, targetList);
      return next;
    });
  }

  function handleUnassignedDragStart(adId: string) {
    const state: DragState = { adId, sourceSlotKey: null, overSlotKey: null, overIndex: null };
    dragRef.current = state;
    setDrag(state);
  }

  function handleRemoveFromSlot(adId: string, slotKey: string) {
    const list = slotMap.get(slotKey) ?? [];
    const ad = list.find((a) => a.id === adId);
    if (!ad) return;
    setSlotMap((prev) => {
      const next = new Map(prev);
      next.set(slotKey, (next.get(slotKey) ?? []).filter((a) => a.id !== adId));
      return next;
    });
    setUnassigned((prev) => [
      ...prev,
      { ...ad, slotKey: "__unassigned__" },
    ]);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const currentPage = PAGES.find((p) => p.id === selectedPage) ?? PAGES[0];

  const totalEmpty = PAGES.reduce((sum, page) => {
    return sum + page.slots.filter((s) => (slotMap.get(s.key) ?? []).length === 0).length;
  }, 0);

  const adsByPageType = new Map<string, number>();
  for (const ad of ads) {
    const key = `${ad.pageKey}:${ad.adType}`;
    adsByPageType.set(key, (adsByPageType.get(key) ?? 0) + 1);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading ad inventory…</div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Ad Placement Builder</h2>
            <p className="text-xs text-slate-500">
              {ads.length} total ads · {totalEmpty} empty slot{totalEmpty !== 1 ? "s" : ""} · drag to reorder priority
            </p>
          </div>
          <div className="flex items-center gap-3">
            {savedAt && (
              <span className="text-xs text-green-600">Saved {savedAt.toLocaleTimeString()}</span>
            )}
            {saveError && (
              <span className="text-xs text-red-600">{saveError}</span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Layout"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Venues</label>
            <select
              multiple
              value={selectedVenueIds}
              onChange={(event) => handleMultiSelect(event, setSelectedVenueIds)}
              className="h-24 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Cities</label>
            <select
              multiple
              value={selectedCities}
              onChange={(event) => handleMultiSelect(event, setSelectedCities)}
              className="h-24 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {cityOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">States</label>
            <select
              multiple
              value={selectedStates}
              onChange={(event) => handleMultiSelect(event, setSelectedStates)}
              className="h-24 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {stateOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Zip Codes</label>
            <select
              multiple
              value={selectedZipCodes}
              onChange={(event) => handleMultiSelect(event, setSelectedZipCodes)}
              className="h-24 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {zipCodeOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Regions</label>
            <select
              multiple
              value={selectedRegions}
              onChange={(event) => handleMultiSelect(event, setSelectedRegions)}
              className="h-24 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {regionOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => {
              setSelectedVenueIds([]);
              setSelectedCities([]);
              setSelectedStates([]);
              setSelectedZipCodes([]);
              setSelectedRegions([]);
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Clear Scope
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Ad Type Coverage By Page</h3>
        <p className="mt-1 text-xs text-slate-500">
          Popup, Banner, and Inline are configured independently per page. Use this matrix to audit coverage quickly.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {TAXONOMY_PAGE_KEYS.map((pageKey) => {
            const placement = AD_PLACEMENTS[pageKey];
            if (!placement) return null;
            return (
              <div key={pageKey} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">{placement.name}</p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {AD_TYPE_ORDER.map((adType) => {
                    const count = adsByPageType.get(`${pageKey}:${adType}`) ?? 0;
                    return (
                      <div key={`${pageKey}-${adType}`} className="rounded-md border border-slate-200 bg-white px-2 py-2">
                        <p className="text-[11px] font-semibold text-slate-700">{formatAdType(adType)}</p>
                        <p className={`text-xs ${count > 0 ? "text-emerald-700" : "text-red-600"}`}>
                          {count > 0 ? `${count} ad${count === 1 ? "" : "s"}` : "No ads"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left: page nav + slots canvas */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Page tabs */}
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {PAGES.map((page) => {
              const emptyCount = page.slots.filter((s) => (slotMap.get(s.key) ?? []).length === 0).length;
              return (
                <button
                  key={page.id}
                  onClick={() => setSelectedPage(page.id)}
                  className={`relative flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                    selectedPage === page.id
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {page.label}
                  {emptyCount > 0 && (
                    <span
                      className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                        selectedPage === page.id ? "bg-red-500 text-white" : "bg-red-100 text-red-600"
                      }`}
                    >
                      {emptyCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Slot grid for selected page */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 border-b border-slate-100 pb-3">
              <h3 className="text-sm font-semibold text-slate-900">{currentPage.label}</h3>
              <p className="text-xs text-slate-400">{currentPage.slots.length} slot{currentPage.slots.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {currentPage.slots.map((slot) => (
                <SlotPanel
                  key={slot.key}
                  slot={slot}
                  ads={slotMap.get(slot.key) ?? []}
                  onRemoveAd={(adId) => handleRemoveFromSlot(adId, slot.key)}
                  onDropUnassigned={handleDropFromUnassigned}
                  drag={drag}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right: unassigned ads sidebar */}
        <div className="flex w-64 shrink-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="border-b border-slate-100 pb-2">
            <p className="text-xs font-semibold text-slate-700">Unassigned Ads</p>
            <p className="text-[10px] text-slate-400">Drag onto a slot to assign</p>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto">
            {unassigned.length === 0 && (
              <p className="py-6 text-center text-[11px] text-slate-400">All ads are assigned.</p>
            )}
            {unassigned.map((ad) => (
              <div
                key={ad.id}
                draggable
                onDragStart={() => handleUnassignedDragStart(ad.id)}
                className="cursor-grab rounded-lg border border-slate-200 bg-slate-50 p-2 transition-colors hover:border-indigo-300 active:cursor-grabbing"
              >
                <div className="flex items-center gap-2">
                  {ad.imageUrl ? (
                    <img
                      src={ad.imageUrl}
                      alt={ad.altText}
                      className="h-8 w-12 shrink-0 rounded object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="h-8 w-12 shrink-0 rounded bg-slate-200" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800">{ad.advertiserName}</p>
                    <p className="truncate text-[10px] text-slate-400">{ad.id.slice(0, 8)}…</p>
                  </div>
                </div>
                <p className="mt-1 truncate text-[10px] text-slate-400 font-mono">{ad.slotKey}</p>
              </div>
            ))}
          </div>

          <button
            onClick={fetchAds}
            className="w-full rounded-lg border border-slate-200 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
