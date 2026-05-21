"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import type { Advertisement, AdPageKey, AdType, Venue } from "@/types";
import { BulkActionBar, PaginationBar, TD, TH, TR } from "@/components/admin/AdminShell";
import { getErrorMessage } from "@/lib/errors";
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

function computeCtr(impressions: number | undefined, clicks: number | undefined): number {
  const safeImpressions = Math.max(0, Number(impressions ?? 0));
  const safeClicks = Math.max(0, Number(clicks ?? 0));
  if (safeImpressions === 0) return 0;
  return (safeClicks / safeImpressions) * 100;
}

export function AdsListSection({ venues }: AdsListSectionProps) {
  const [items, setItems] = useState<Advertisement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [pageFilter, setPageFilter] = useState<AdPageKey | "all">("all");
  const [typeFilter, setTypeFilter] = useState<AdType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [venueIdsFilter, setVenueIdsFilter] = useState<string[]>([]);
  const [citiesFilter, setCitiesFilter] = useState<string[]>([]);
  const [statesFilter, setStatesFilter] = useState<string[]>([]);
  const [zipCodesFilter, setZipCodesFilter] = useState<string[]>([]);
  const [regionsFilter, setRegionsFilter] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<AdDraft | null>(null);

  const [uploadingForAdId, setUploadingForAdId] = useState<string | null>(null);

  const allOnPageSelected = useMemo(
    () => items.length > 0 && items.every((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          venues
            .map((venue) => venue.city ?? "")
            .map((value) => value.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [venues]
  );
  const stateOptions = useMemo(
    () =>
      Array.from(
        new Set(
          venues
            .map((venue) => venue.state ?? "")
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [venues]
  );
  const zipCodeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          venues
            .map((venue) => venue.zipCode ?? "")
            .map((value) => value.trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [venues]
  );
  const regionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          venues
            .map((venue) => venue.region ?? "")
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [venues]
  );

  const fetchAds = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          resource: "ads",
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });

        if (search.trim()) params.set("search", search.trim());
        if (pageFilter !== "all") params.set("pageKey", pageFilter);
        if (typeFilter !== "all") params.set("adType", typeFilter);
        if (statusFilter !== "all") params.set("active", statusFilter);
        if (venueIdsFilter.length > 0) params.set("venueIds", venueIdsFilter.join(","));
        if (citiesFilter.length > 0) params.set("cities", citiesFilter.join(","));
        if (statesFilter.length > 0) params.set("states", statesFilter.join(","));
        if (zipCodesFilter.length > 0) params.set("zipCodes", zipCodesFilter.join(","));
        if (regionsFilter.length > 0) params.set("regions", regionsFilter.join(","));

        const response = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          ok: boolean;
          items?: Advertisement[];
          total?: number;
          totalPages?: number;
          error?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to load advertisements.");
        }

        setItems(payload.items ?? []);
        setTotal(payload.total ?? 0);
        setTotalPages(payload.totalPages ?? 1);
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load advertisements."));
      } finally {
        setLoading(false);
      }
    },
    [citiesFilter, pageFilter, regionsFilter, search, statesFilter, statusFilter, typeFilter, venueIdsFilter, zipCodesFilter]
  );

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    setEditingAdId(null);
    setEditingDraft(null);
    void fetchAds(1);
  }, [fetchAds]);

  useEffect(() => {
    void fetchAds(page);
  }, [page, fetchAds]);

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(items.map((item) => item.id)));
  }

  function toggleRowSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleMultiSelectChange(
    event: ChangeEvent<HTMLSelectElement>,
    setter: Dispatch<SetStateAction<string[]>>
  ) {
    setter(Array.from(event.target.selectedOptions).map((option) => option.value));
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
      await fetchAds(page);
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} selected ads.`));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(ad: Advertisement) {
    setEditingAdId(ad.id);
    setEditingDraft(draftFromAdvertisement(ad));
    setError("");
    setSuccess("");
  }

  function cancelEdit() {
    setEditingAdId(null);
    setEditingDraft(null);
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
      await fetchAds(page);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update advertisement."));
    } finally {
      setBusy(false);
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
      await fetchAds(page);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to delete advertisement."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Search</label>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Advertiser or slot key"
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
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Type</label>
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
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Venues</label>
            <select
              multiple
              value={venueIdsFilter}
              onChange={(event) => handleMultiSelectChange(event, setVenueIdsFilter)}
              className="h-28 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
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
              value={citiesFilter}
              onChange={(event) => handleMultiSelectChange(event, setCitiesFilter)}
              className="h-28 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">States</label>
            <select
              multiple
              value={statesFilter}
              onChange={(event) => handleMultiSelectChange(event, setStatesFilter)}
              className="h-28 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Zip Codes</label>
            <select
              multiple
              value={zipCodesFilter}
              onChange={(event) => handleMultiSelectChange(event, setZipCodesFilter)}
              className="h-28 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {zipCodeOptions.map((zip) => (
                <option key={zip} value={zip}>
                  {zip}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">Regions</label>
            <select
              multiple
              value={regionsFilter}
              onChange={(event) => handleMultiSelectChange(event, setRegionsFilter)}
              className="h-28 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
            >
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => setSearch(searchInput)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
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
              setVenueIdsFilter([]);
              setCitiesFilter([]);
              setStatesFilter([]);
              setZipCodesFilter([]);
              setRegionsFilter([]);
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="px-6 pt-4">
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
                <th className={TH}>Slot</th>
                <th className={TH}>Page</th>
                <th className={TH}>Type</th>
                <th className={TH}>Advertiser</th>
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
                  <td colSpan={10} className="py-12 text-center text-sm text-slate-400">Loading ads...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-sm text-slate-400">No ads found.</td>
                </tr>
              ) : (
                items.map((ad) => {
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
                          <div className="font-medium text-slate-900">{ad.slotKey}</div>
                          <div className="text-xs text-slate-500">Priority {ad.priority}</div>
                        </td>
                        <td className={TD}>{ad.pageKey}</td>
                        <td className={TD}>{ad.adType}</td>
                        <td className={TD}>{ad.advertiserName}</td>
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
                          <div className="inline-flex gap-2">
                            <button
                              onClick={() => (isEditing ? cancelEdit() : startEdit(ad))}
                              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              {isEditing ? "Close" : "Edit"}
                            </button>
                            <button
                              onClick={() => {
                                void deleteSingle(ad.id);
                              }}
                              disabled={busy}
                              className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isEditing && editingDraft ? (
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={10} className="px-4 py-4">
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
                              disabled={busy || uploadingForAdId === ad.id}
                            />

                            <div className="mt-4 flex items-center gap-2">
                              <button
                                onClick={() => {
                                  void saveEdit();
                                }}
                                disabled={busy || uploadingForAdId === ad.id}
                                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {busy ? "Saving..." : "Save Changes"}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
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
  );
}
