"use client";

import { useCallback, useEffect, useState } from "react";
import { PaginationBar } from "@/components/admin/AdminShell";

type ModerationLog = {
  id: string;
  requestedUsername: string;
  failureReason: string | null;
  success: boolean;
  requesterIp: string | null;
  createdAt: string;
};

const PAGE_SIZE = 50;

const REASON_LABELS: Record<string, string> = {
  "moderation-blocked": "Moderation",
  "username-conflict": "Taken",
  "cooldown-active": "Cooldown",
  "reauth-failed": "Auth",
  "too-many-failed-attempts": "Rate limit",
  "missing-session-context": "No session",
  "cookie-session-mismatch": "Session mismatch",
  "user-not-found": "User not found",
};

function ReasonBadge({ reason, success }: { reason: string | null; success: boolean }) {
  if (success) {
    return (
      <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        Allowed
      </span>
    );
  }
  const label = reason ? (REASON_LABELS[reason] ?? reason) : "Unknown";
  const isModeration = reason === "moderation-blocked";
  return (
    <span
      className={[
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
        isModeration
          ? "bg-red-100 text-red-700"
          : "bg-amber-100 text-amber-700",
      ].join(" ")}
    >
      {label}
    </span>
  );
}

export function UsernameModerationSection() {
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [filterBlocked, setFilterBlocked] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async (targetPage: number, blockedOnly: boolean) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        resource: "username-moderation-log",
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      });
      if (blockedOnly) params.set("blockedOnly", "1");
      const res = await fetch(`/api/admin?${params.toString()}`, { cache: "no-store" });
      const payload = (await res.json()) as {
        ok?: boolean;
        items?: ModerationLog[];
        total?: number;
        totalPages?: number;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Failed to load moderation log.");
        return;
      }
      setLogs(payload.items ?? []);
      setTotal(payload.total ?? 0);
      setTotalPages(payload.totalPages ?? 1);
    } catch {
      setError("Failed to load moderation log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchLogs(page, filterBlocked);
  }, [fetchLogs, page, filterBlocked]);

  const handleFilterToggle = useCallback(() => {
    setPage(1);
    setFilterBlocked((prev) => !prev);
  }, []);

  return (
    <div className="space-y-4 rounded-lg bg-white shadow-sm">
      <div className="flex items-center gap-3 px-6 pt-4">
        <span className="text-sm font-medium text-slate-700">Username Moderation Log</span>
        <button
          onClick={handleFilterToggle}
          className={[
            "h-8 rounded-full px-3 text-xs font-semibold transition-colors",
            filterBlocked
              ? "bg-red-100 text-red-700 hover:bg-red-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          ].join(" ")}
        >
          {filterBlocked ? "Blocked only" : "All attempts"}
        </button>
        <span className="ml-auto text-sm text-slate-500">{total} record{total !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div className="mx-6 rounded bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3">Username attempted</th>
              <th className="px-6 py-3">Result</th>
              <th className="px-6 py-3">IP</th>
              <th className="px-6 py-3">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-400">Loading…</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-slate-400">No records found.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-3 font-mono text-slate-800">{log.requestedUsername}</td>
                  <td className="px-6 py-3">
                    <ReasonBadge reason={log.failureReason} success={log.success} />
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-slate-400">{log.requesterIp ?? "—"}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
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
