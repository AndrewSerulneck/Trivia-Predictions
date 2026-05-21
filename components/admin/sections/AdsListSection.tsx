"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BulkActionBar } from "@/components/admin/BulkActionBar";
import { PaginationBar } from "@/components/admin/PaginationBar";
import type { AdCampaign } from "@/types";

import { getErrorMessage } from "@/lib/errors";

const PAGE_SIZE = 25;

type FetchStatus = "idle" | "loading" | "success" | "error";

export function AdsListSection() {
  const [status, setStatus] = useState<FetchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const fetchAds = useCallback(async (currentPage: number) => {
    if (!supabase) return;
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch(`/api/admin?resource=ads&page=${currentPage}&pageSize=${PAGE_SIZE}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Failed to fetch ads");
      }
      const data = await response.json();
      setAds(data.items || []);
      setTotalPages(data.totalPages || 1);
      setStatus("success");
    } catch (err) {
      setError(getErrorMessage(err, "An unexpected error occurred."));
      setStatus("error");
    }
  }, [supabase]);

  useEffect(() => {
    void fetchAds(page);
  }, [fetchAds, page]);

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= totalPages) {
      setPage(newPage);
      setSelectedIds([]);
    }
  };

  const handleSelectAll = (isChecked: boolean) => {
    if (isChecked) {
      setSelectedIds(ads.map((ad) => ad.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, isChecked: boolean) => {
    if (isChecked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    }
  };

  const handleBulkAction = async (action: "delete" | "toggle-enable") => {
    if (!supabase || selectedIds.length === 0) return;
    try {
      const response = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "ads-bulk",
          action,
          ids: selectedIds,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Failed to perform bulk ${action}`);
      }
      setSelectedIds([]);
      void fetchAds(page);
    } catch (err) {
      setError(getErrorMessage(err, "Bulk action failed."));
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-900 text-white">
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Advertisement Campaigns</h1>
        <BulkActionBar
          selectedCount={selectedIds.length}
          onDelete={() => handleBulkAction("delete")}
          onToggleEnable={() => handleBulkAction("toggle-enable")}
        />
        {status === "loading" && <p>Loading ads...</p>}
        {status === "error" && <p className="text-red-500">{error}</p>}
        {status === "success" && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
              <thead className="bg-slate-800">
                <tr>
                  <th scope="col" className="p-4 text-left">
                    <input
                      type="checkbox"
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      checked={selectedIds.length > 0 && selectedIds.length === ads.length}
                    />
                  </th>
                  <th scope="col" className="p-4 text-left text-xs font-medium uppercase tracking-wider">Slot Key</th>
                  <th scope="col" className="p-4 text-left text-xs font-medium uppercase tracking-wider">Priority</th>
                  <th scope="col" className="p-4 text-left text-xs font-medium uppercase tracking-wider">Size</th>
                  <th scope="col" className="p-4 text-left text-xs font-medium uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-slate-900 divide-y divide-slate-800">
                {ads.map((ad) => (
                  <tr key={ad.id}>
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(ad.id)}
                        onChange={(e) => handleSelectRow(ad.id, e.target.checked)}
                      />
                    </td>
                    <td className="p-4 whitespace-nowrap">{ad.slot_key}</td>
                    <td className="p-4 whitespace-nowrap">{ad.priority}</td>
                    <td className="p-4 whitespace-nowrap">{ad.size}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        ad.enabled ? "bg-green-900 text-green-100" : "bg-red-900 text-red-100"
                      }`}>
                        {ad.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          currentPage={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}
