"use client";

import { useCallback, useEffect, useState } from "react";
import { PaginationBar } from "@/components/admin/AdminShell";

type AdminAccount = {
  id: string;
  username: string;
  godMode: boolean;
  createdAt: string;
};

const PAGE_SIZE = 25;

export function AccountsSection() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchAccounts = useCallback(async (targetPage: number, searchValue: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        resource: "accounts",
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      });
      if (searchValue) params.set("search", searchValue);
      const res = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        ok?: boolean;
        items?: AdminAccount[];
        total?: number;
        totalPages?: number;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Failed to load accounts.");
        return;
      }
      setAccounts(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setTotalPages(payload.totalPages ?? 1);
    } catch {
      setError("Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts(page, search);
  }, [fetchAccounts, page, search]);

  const handleSearch = useCallback(() => {
    setPage(1);
    setSearch(searchInput);
  }, [searchInput]);

  const handleToggleGodMode = useCallback(async (account: AdminAccount) => {
    if (togglingId) return;
    setTogglingId(account.id);
    const newValue = !account.godMode;
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "accounts",
          action: "set-god-mode",
          accountId: account.id,
          godMode: newValue,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Failed to update account.");
        return;
      }
      setAccounts((prev) =>
        prev.map((a) => (a.id === account.id ? { ...a, godMode: newValue } : a))
      );
    } catch {
      setError("Failed to update account.");
    } finally {
      setTogglingId(null);
    }
  }, [togglingId]);

  const handleDeleteConfirm = useCallback(async (accountId: string) => {
    setDeletingId(accountId);
    setConfirmDeleteId(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "accounts",
          action: "delete",
          accountId,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Failed to delete account.");
        return;
      }
      setAccounts((prev) => prev.filter((a) => a.id !== accountId));
      setTotal((prev) => prev - 1);
    } catch {
      setError("Failed to delete account.");
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <div className="space-y-4 rounded-lg bg-white shadow-sm">
      <div className="flex items-center gap-3 px-6 pt-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="Search by username…"
          className="h-9 w-64 rounded border border-slate-300 bg-white px-3 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none"
        />
        <button
          onClick={handleSearch}
          className="h-9 rounded bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Search
        </button>
        <span className="ml-auto text-sm text-slate-500">{total} account{total !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div className="mx-6 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3">Username</th>
              <th className="px-6 py-3">Created</th>
              <th className="px-6 py-3 text-center">God Mode</th>
              <th className="px-6 py-3 text-center">Delete</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                  No accounts found.
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr key={account.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-800">{account.username}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <button
                      onClick={() => void handleToggleGodMode(account)}
                      disabled={Boolean(togglingId)}
                      className={[
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                        account.godMode
                          ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                        togglingId === account.id ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                      ].join(" ")}
                    >
                      {account.godMode ? "God Mode ON" : "Off"}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {confirmDeleteId === account.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={() => void handleDeleteConfirm(account.id)}
                          disabled={deletingId === account.id}
                          className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {deletingId === account.id ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(account.id)}
                        disabled={deletingId === account.id}
                        className="rounded px-2.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
