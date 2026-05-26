"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { Advertisement, AdPageKey, AdType, Venue } from "@/types";
import { BulkActionBar, PaginationBar, TD, TH, TR } from "@/components/admin/AdminShell";
import { getErrorMessage } from "@/lib/errors";
import type { GeographicHierarchy } from "@/lib/geographicHierarchy";
import { AdGeographicFilter } from "@/components/admin/ads/AdGeographicFilter";
import {
  AD_PAGE_OPTIONS,
  AD_TYPE_OPTIONS,
  AdFormFields,
  draftFromAdvertisement,
  draftToPayload,
  type AdDraft,
} from "./adFormShared";

const PAGE_SIZE = 25;
const MAX_UPLOAD_BYTES = 300 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type StatusFilter = "all" | "active" | "inactive";

type AdsListSectionProps = {
  venues: Venue[];
};

type GeographicSelection = {
  regionKey?: string;
  stateCode?: string;
  cityName?: string;
  zipCode?: string;
  venueId?: string;
};

type GeoCountMap = Record<string, number>;

function computeCtr(impressions: number | undefined, clicks: number | undefined): number {
  const safeImpressions = Math.max(0, Number(impressions ?? 0));
  const safeClicks = Math.max(0, Number(clicks ?? 0));
  if (safeImpressions === 0) return 0;
  return (safeClicks / safeImpressions) * 100;
}

function formatAdTypeLabel(adType: AdType): string {
  if (adType === "popup") return "Pop-Up";
  if (adType === "banner") return "Banner";
  return "Inline";
}

function normalizeAdGeoList(values?: string[] | null, uppercase = false): string[] {
  const base = Array.isArray(values) ? values : [];
  return Array.from(
    new Set(
      base
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .map((value) => (uppercase ? value.toUpperCase() : value))
    )
  );
}

function adHasNoGeoTargeting(ad: Advertisement): boolean {
  const venueIds = normalizeAdGeoList(ad.venueIds);
  const cities = normalizeAdGeoList(ad.cities);
  const zipCodes = normalizeAdGeoList(ad.zipCodes);
  const states = normalizeAdGeoList(ad.states, true);
  const regions = normalizeAdGeoList(ad.regions, true);
  return venueIds.length === 0 && cities.length === 0 && zipCodes.length === 0 && states.length === 0 && regions.length === 0;
}

function adMatchesRegion(ad: Advertisement, regionKey: string): boolean {
  if (adHasNoGeoTargeting(ad)) return true;
  return normalizeAdGeoList(ad.regions, true).includes(regionKey.toUpperCase());
}

function adMatchesState(ad: Advertisement, stateCode: string): boolean {
  if (adHasNoGeoTargeting(ad)) return true;
  return normalizeAdGeoList(ad.states, true).includes(stateCode.toUpperCase());
}

function adMatchesCity(ad: Advertisement, cityName: string): boolean {
  if (adHasNoGeoTargeting(ad)) return true;
  return normalizeAdGeoList(ad.cities)
    .map((city) => city.toLowerCase())
    .includes(cityName.trim().toLowerCase());
}

function adMatchesZip(ad: Advertisement, zipCode: string): boolean {
  if (adHasNoGeoTargeting(ad)) return true;
  return normalizeAdGeoList(ad.zipCodes).includes(zipCode.trim());
}

function adMatchesVenue(ad: Advertisement, venueId: string): boolean {
  if (adHasNoGeoTargeting(ad)) return true;
  return normalizeAdGeoList(ad.venueIds).includes(venueId.trim());
}

function adMatchesGeography(ad: Advertisement, selection: GeographicSelection): boolean {
  if (selection.venueId) return adMatchesVenue(ad, selection.venueId);
  if (selection.zipCode) return adMatchesZip(ad, selection.zipCode);
  if (selection.cityName) return adMatchesCity(ad, selection.cityName);
  if (selection.stateCode) return adMatchesState(ad, selection.stateCode);
  if (selection.regionKey) return adMatchesRegion(ad, selection.regionKey);
  return true;
}

function buildAdGeographicTargetingLabel(ad: Advertisement): string {
  if (adHasNoGeoTargeting(ad)) {
    return "All Locations";
  }

  const regions = normalizeAdGeoList(ad.regions, true);
  if (regions.length > 0) {
    return `${regions.join(", ")} Region${regions.length > 1 ? "s" : ""}`;
  }

  const states = normalizeAdGeoList(ad.states, true);
  if (states.length > 0) {
    return states.join(", ");
  }

  const cities = normalizeAdGeoList(ad.cities);
  if (cities.length > 0) {
    return cities.join(", ");
  }

  const zipCodes = normalizeAdGeoList(ad.zipCodes);
  if (zipCodes.length > 0) {
    return `ZIP ${zipCodes.join(", ")}`;
  }

  const venueIds = normalizeAdGeoList(ad.venueIds);
  if (venueIds.length > 0) {
    return `Specific Venues (${venueIds.length})`;
  }

  return "Targeted";
}

function countKey(level: "all" | "region" | "state" | "city" | "zip" | "venue", parts: string[]): string {
  return `${level}:${parts.join("::")}`;
}

export function AdsListSection({ venues }: AdsListSectionProps) {
  const [items, setItems] = useState<Advertisement[]>([]);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pageFilter, setPageFilter] = useState<AdPageKey | "all">("all");
  const [typeFilter, setTypeFilter] = useState<AdType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [selectedRegion, setSelectedRegion] = useState<string | undefined>(undefined);
  const [selectedState, setSelectedState] = useState<string | undefined>(undefined);
  const [selectedCity, setSelectedCity] = useState<string | undefined>(undefined);
  const [selectedZipCode, setSelectedZipCode] = useState<string | undefined>(undefined);
  const [selectedVenue, setSelectedVenue] = useState<string | undefined>(undefined);

  const [hierarchy, setHierarchy] = useState<GeographicHierarchy | null>(null);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applyingPlaceholder, setApplyingPlaceholder] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [placeholderApplySummary, setPlaceholderApplySummary] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<AdDraft | null>(null);

  const [uploadingForAdId, setUploadingForAdId] = useState<string | null>(null);
  const [showGeoOnMobile, setShowGeoOnMobile] = useState(false);

  const geoSelection = useMemo<GeographicSelection>(
    () => ({
      regionKey: selectedRegion,
      stateCode: selectedState,
      cityName: selectedCity,
      zipCode: selectedZipCode,
      venueId: selectedVenue,
    }),
    [selectedCity, selectedRegion, selectedState, selectedVenue, selectedZipCode]
  );

  const fetchAds = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        resource: "ads",
        page: "1",
        pageSize: "10000",
      });

      if (search.trim()) params.set("search", search.trim());
      if (pageFilter !== "all") params.set("pageKey", pageFilter);
      if (typeFilter !== "all") params.set("adType", typeFilter);
      if (statusFilter !== "all") params.set("active", statusFilter);

      const response = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        items?: Advertisement[];
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load advertisements.");
      }

      setItems(payload.items ?? []);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load advertisements."));
    } finally {
      setLoading(false);
    }
  }, [pageFilter, search, statusFilter, typeFilter]);

  const fetchHierarchy = useCallback(async () => {
    setHierarchyLoading(true);
    try {
      const response = await fetch("/api/admin?resource=ads-geography", { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        hierarchy?: GeographicHierarchy;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.hierarchy) {
        throw new Error(payload.error ?? "Failed to load geographic hierarchy.");
      }
      setHierarchy(payload.hierarchy);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load geographic hierarchy."));
    } finally {
      setHierarchyLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHierarchy();
  }, [fetchHierarchy]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setEditingAdId(null);
    setEditingDraft(null);
    void fetchAds();
  }, [fetchAds]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [geoSelection]);

  const filteredItems = useMemo(() => {
    return items.filter((ad) => adMatchesGeography(ad, geoSelection));
  }, [geoSelection, items]);

  const total = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pageStart = (page - 1) * PAGE_SIZE;
  const pageItems = filteredItems.slice(pageStart, pageStart + PAGE_SIZE);

  const allOnPageSelected = useMemo(
    () => pageItems.length > 0 && pageItems.every((item) => selectedIds.has(item.id)),
    [pageItems, selectedIds]
  );

  const geoCountMap = useMemo<GeoCountMap>(() => {
    const counts: GeoCountMap = {
      [countKey("all", ["all"])]: items.length,
    };

    if (!hierarchy) return counts;

    for (const region of hierarchy.regions) {
      counts[countKey("region", [region.regionKey])] = items.filter((ad) => adMatchesRegion(ad, region.regionKey)).length;

      for (const state of region.states) {
        counts[countKey("state", [state.stateCode])] = items.filter((ad) => adMatchesState(ad, state.stateCode)).length;

        for (const city of state.cities) {
          counts[countKey("city", [state.stateCode, city.city])] = items.filter((ad) => adMatchesCity(ad, city.city)).length;

          for (const zip of city.zipCodes) {
            counts[countKey("zip", [state.stateCode, city.city, zip.zipCode])] = items.filter((ad) => adMatchesZip(ad, zip.zipCode)).length;

            for (const venue of zip.venues) {
              counts[countKey("venue", [venue.id])] = items.filter((ad) => adMatchesVenue(ad, venue.id)).length;
            }
          }
        }
      }
    }

    return counts;
  }, [hierarchy, items]);

  function clearGeoSelection() {
    setSelectedRegion(undefined);
    setSelectedState(undefined);
    setSelectedCity(undefined);
    setSelectedZipCode(undefined);
    setSelectedVenue(undefined);
  }

  function findRegionForState(stateCode: string): string | undefined {
    const normalized = stateCode.trim().toUpperCase();
    const region = hierarchy?.regions.find((item) => item.states.some((state) => state.stateCode === normalized));
    return region?.regionKey;
  }

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(pageItems.map((item) => item.id)));
  }

  function toggleRowSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulkAction(action: "delete" | "enable" | "disable") {
    if (selectedIds.size === 0) return;
    if (action === "delete" && !confirm(`Delete ${selectedIds.size} selected ad(s)?`)) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads-bulk",
          action,
          ids: Array.from(selectedIds),
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string; updated?: number; deleted?: number };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? `Failed to ${action} selected ads.`);
      }

      const affected = payload.updated ?? payload.deleted ?? selectedIds.size;
      setSuccess(`${affected} ad(s) ${action === "delete" ? "deleted" : action === "enable" ? "enabled" : "disabled"}.`);
      setSelectedIds(new Set());
      await fetchAds();
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} selected ads.`));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(ad: Advertisement) {
    setEditingAdId(ad.id);
    setEditingDraft(draftFromAdvertisement(ad));
    setPlaceholderApplySummary("");
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    setEditingAdId(null);
    setEditingDraft(null);
    setPlaceholderApplySummary("");
  }

  async function uploadImageForEditor(file: File) {
    if (!editingAdId || !editingDraft) return;

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      setError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Image must be 300KB or smaller.");
      return;
    }

    setUploadingForAdId(editingAdId);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/admin/ads/upload", { method: "POST", body: formData });
      const payload = (await response.json()) as { ok: boolean; imageUrl?: string; error?: string };
      if (!response.ok || !payload.ok || !payload.imageUrl) {
        throw new Error(payload.error ?? "Failed to upload advertisement image.");
      }
      setEditingDraft({ ...editingDraft, imageUrl: payload.imageUrl });
      setSuccess("Image uploaded.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to upload image."));
    } finally {
      setUploadingForAdId(null);
    }
  }

  async function saveEdit() {
    if (!editingAdId || !editingDraft) return;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const payload = draftToPayload(editingDraft);
      const response = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "ads", id: editingAdId, ...payload }),
      });
      const body = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to update ad.");
      }

      setSuccess("Advertisement updated.");
      setEditingAdId(null);
      setEditingDraft(null);
      setPlaceholderApplySummary("");
      await fetchAds();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update advertisement."));
    } finally {
      setBusy(false);
    }
  }

  async function applyPlaceholderFromEditor() {
    if (!editingAdId || !editingDraft) return;
    if (!editingDraft.isPlaceholder) {
      setError("Mark this ad as Placeholder before applying to all inline slots.");
      return;
    }

    const confirmed = window.confirm(
      "This will create placeholder ads in any inline slots that currently have no placeholder. This will NOT overwrite or delete existing ads. Proceed?"
    );
    if (!confirmed) return;

    setApplyingPlaceholder(true);
    setError("");
    setSuccess("");
    setPlaceholderApplySummary("");

    try {
      const response = await fetch("/api/admin?resource=apply-placeholder-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateAdId: editingAdId }),
      });
      const body = (await response.json()) as {
        ok: boolean;
        created?: number;
        skipped?: number;
        errors?: Array<{ slotId: string; pageKey: string; error: string }>;
        error?: string;
      };
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? "Failed to apply placeholders.");
      }

      const created = Number(body.created ?? 0);
      const skipped = Number(body.skipped ?? 0);
      const errors = Array.isArray(body.errors) ? body.errors : [];
      const errorPreview = errors
        .slice(0, 5)
        .map((entry) => `${entry.slotId}/${entry.pageKey}: ${entry.error}`)
        .join(" | ");

      setPlaceholderApplySummary(
        `Created ${created} placeholders. Skipped ${skipped} slots. Errors ${errors.length}${
          errorPreview ? ` (${errorPreview})` : ""
        }.`
      );
      setSuccess(`Created ${created} placeholders. Skipped ${skipped}.`);
      if (errors.length > 0) {
        setError(`Some slots failed: ${errorPreview}`);
      }
      await fetchAds();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to apply placeholders."));
    } finally {
      setApplyingPlaceholder(false);
    }
  }

  async function deleteSingle(id: string) {
    if (!confirm("Delete this ad?")) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin?resource=ads&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to delete ad.");
      }

      setSuccess("Advertisement deleted.");
      if (editingAdId === id) {
        setEditingAdId(null);
        setEditingDraft(null);
      }
      await fetchAds();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete advertisement."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Search</label>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Advertiser, campaign, or slot key"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Page</label>
            <select
              value={pageFilter}
              onChange={(event) => setPageFilter(event.target.value as AdPageKey | "all")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All Pages</option>
              {AD_PAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Ad Type</label>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as AdType | "all")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All Types</option>
              {AD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <button
            onClick={() => setSearch(searchInput)}
            className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Apply Filters
          </button>
          <button
            onClick={() => {
              setSearchInput("");
              setSearch("");
              setPageFilter("all");
              setTypeFilter("all");
              setStatusFilter("all");
              clearGeoSelection();
            }}
            className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
          <button
            onClick={() => setShowGeoOnMobile((prev) => !prev)}
            className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 lg:hidden"
          >
            {showGeoOnMobile ? "Hide Geography" : "Show Geography"}
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px,1fr]">
        <div className={showGeoOnMobile ? "block" : "hidden lg:block"}>
          <AdGeographicFilter
            hierarchy={hierarchy}
            loading={hierarchyLoading}
            counts={geoCountMap}
            selectedRegion={selectedRegion}
            selectedState={selectedState}
            selectedCity={selectedCity}
            selectedZipCode={selectedZipCode}
            selectedVenue={selectedVenue}
            onSelectRegion={(regionKey) => {
              setSelectedRegion(regionKey);
              setSelectedState(undefined);
              setSelectedCity(undefined);
              setSelectedZipCode(undefined);
              setSelectedVenue(undefined);
            }}
            onSelectState={(stateCode) => {
              setSelectedRegion(findRegionForState(stateCode));
              setSelectedState(stateCode);
              setSelectedCity(undefined);
              setSelectedZipCode(undefined);
              setSelectedVenue(undefined);
            }}
            onSelectCity={(cityName, stateCode) => {
              setSelectedRegion(findRegionForState(stateCode));
              setSelectedState(stateCode);
              setSelectedCity(cityName);
              setSelectedZipCode(undefined);
              setSelectedVenue(undefined);
            }}
            onSelectZipCode={(zipCode, cityName, stateCode) => {
              setSelectedRegion(findRegionForState(stateCode));
              setSelectedState(stateCode);
              setSelectedCity(cityName);
              setSelectedZipCode(zipCode);
              setSelectedVenue(undefined);
            }}
            onSelectVenue={(venueId, zipCode, cityName, stateCode) => {
              setSelectedRegion(findRegionForState(stateCode));
              setSelectedState(stateCode);
              setSelectedCity(cityName);
              setSelectedZipCode(zipCode);
              setSelectedVenue(venueId);
            }}
            onClear={clearGeoSelection}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="px-6 pt-4">
            <div className="mb-2 text-xs text-slate-500">
              Showing {total} ad{total === 1 ? "" : "s"}
              {selectedVenue
                ? " for selected venue"
                : selectedZipCode
                  ? " for selected ZIP code"
                  : selectedCity
                    ? " for selected city"
                    : selectedState
                      ? " for selected state"
                      : selectedRegion
                        ? " for selected region"
                        : " across all locations"}
            </div>
            <BulkActionBar
              count={selectedIds.size}
              onEnableSelected={() => {
                void runBulkAction("enable");
              }}
              onDisableSelected={() => {
                void runBulkAction("disable");
              }}
              onDeleteSelected={() => {
                void runBulkAction("delete");
              }}
              onClear={() => setSelectedIds(new Set())}
              busy={busy}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className={`${TH} w-10`}>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    />
                  </th>
                  <th className={TH}>Ad ID</th>
                  <th className={TH}>Advertiser / Campaign</th>
                  <th className={TH}>Ad Type</th>
                  <th className={TH}>Page</th>
                  <th className={TH}>Geographic Targeting</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Impressions</th>
                  <th className={TH}>Clicks</th>
                  <th className={TH}>CTR</th>
                  <th className={`${TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-sm text-slate-400">Loading ads...</td>
                  </tr>
                ) : pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-sm text-slate-400">No ads found.</td>
                  </tr>
                ) : (
                  pageItems.map((ad) => {
                    const isEditing = editingAdId === ad.id;
                    const ctr = computeCtr(ad.impressions, ad.clicks);

                    return (
                      <Fragment key={ad.id}>
                        <tr key={ad.id} className={TR}>
                          <td className={`${TD} w-10`}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(ad.id)}
                              onChange={() => toggleRowSelection(ad.id)}
                              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                            />
                          </td>
                          <td className={`${TD} text-slate-700`}>
                            <div className="font-medium text-slate-900">{ad.id}</div>
                            <div className="text-xs text-slate-500">{ad.slotKey}</div>
                          </td>
                          <td className={TD}>{ad.advertiserName}</td>
                          <td className={TD}>{formatAdTypeLabel(ad.adType)}</td>
                          <td className={TD}>{ad.pageKey}</td>
                          <td className={TD}>{buildAdGeographicTargetingLabel(ad)}</td>
                          <td className={TD}>
                            <span
                              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                ad.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {ad.active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className={`${TD} tabular-nums`}>{ad.impressions ?? 0}</td>
                          <td className={`${TD} tabular-nums`}>{ad.clicks ?? 0}</td>
                          <td className={`${TD} tabular-nums`}>{ctr.toFixed(2)}%</td>
                          <td className={`${TD} text-right`}>
                            <div className="inline-flex flex-col gap-2 sm:flex-row">
                              <button
                                onClick={() => (isEditing ? cancelEdit() : startEdit(ad))}
                                className="min-h-[44px] rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                              >
                                {isEditing ? "Close" : "Edit"}
                              </button>
                              <button
                                onClick={() => {
                                  void deleteSingle(ad.id);
                                }}
                                disabled={busy}
                                className="min-h-[44px] rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isEditing && editingDraft ? (
                          <tr className="border-b border-slate-100 bg-slate-50/60">
                            <td colSpan={11} className="px-4 py-4">
                              <div className="mb-4">
                                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
                                  Replace Image (JPEG/PNG/WebP, max 300KB)
                                </label>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (!file) return;
                                    void uploadImageForEditor(file);
                                  }}
                                  className="block w-full text-sm text-slate-600"
                                />
                                {uploadingForAdId === ad.id ? (
                                  <p className="mt-1 text-xs text-slate-500">Uploading image...</p>
                                ) : null}
                                {editingDraft.imageUrl ? (
                                  <img src={editingDraft.imageUrl} alt="Ad preview" className="mt-2 max-h-40 rounded border border-slate-200" />
                                ) : null}
                              </div>

                              <AdFormFields
                                draft={editingDraft}
                                onChange={(next) => {
                                  setEditingDraft(next);
                                  setError("");
                                }}
                                venues={venues}
                                disabled={busy || applyingPlaceholder || uploadingForAdId === ad.id}
                                onApplyPlaceholderToAllInlineSlots={
                                  editingDraft.isPlaceholder ? applyPlaceholderFromEditor : undefined
                                }
                                applyingPlaceholderToAllInlineSlots={applyingPlaceholder}
                                placeholderApplySummary={placeholderApplySummary}
                              />

                              <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                                <button
                                  onClick={() => {
                                    void saveEdit();
                                  }}
                                  disabled={busy || applyingPlaceholder || uploadingForAdId === ad.id}
                                  className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                >
                                  {busy ? "Saving..." : applyingPlaceholder ? "Applying..." : "Save Changes"}
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
