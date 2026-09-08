"use client";

import { useCallback, useEffect, useState } from "react";
import { TH, TD, TR } from "@/components/admin/AdminShell";

// docs/lapsed-venue-rehide-plan.md Phase 4 — admin visibility + manual override.
//
// `listVenues()` filters `hidden` rows out of the admin console, so this panel
// is the ONLY place an ops person can see a venue the lapsed-venue reconciler
// took out of the join list, and the only place to reverse it by hand.

type HiddenVenueClassification = "lapsed" | "admin-hidden" | "system-room";

type HiddenVenueRow = {
  venueId: string;
  name: string;
  rehiddenAt: string | null;
  selfServeCreatedAt: string | null;
  billingStatus: string | null;
  billingMethod: string | null;
  classification: HiddenVenueClassification;
};

const BADGE: Record<HiddenVenueClassification, { label: string; className: string }> = {
  lapsed: { label: "Hidden — lapsed", className: "bg-amber-100 text-amber-800" },
  "admin-hidden": { label: "Hidden — admin", className: "bg-slate-200 text-slate-700" },
  "system-room": { label: "System room", className: "bg-slate-100 text-slate-500" },
};

const formatWhen = (iso: string | null): string => {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return new Date(parsed).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export function HiddenVenuesPanel() {
  const [rows, setRows] = useState<HiddenVenueRow[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/admin?resource=hidden-venues", { cache: "no-store" });
      const payload = (await res.json()) as { ok: boolean; venues?: HiddenVenueRow[]; error?: string };
      if (!res.ok || !payload.ok || !payload.venues) {
        throw new Error(payload.error ?? "Failed to load hidden venues.");
      }
      setRows(payload.venues);
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load hidden venues.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (row: HiddenVenueRow) => {
    setRestoringId(row.venueId);
    setNotice("");
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "venue-visibility", action: "restore", id: row.venueId }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to restore venue.");
      }
      setNotice(
        `"${row.name}" is visible again. If its subscription is still not live, the nightly reconciler will ` +
          `re-hide it — re-grant access or have the partner resubscribe for a permanent fix.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore venue.");
    } finally {
      setRestoringId(null);
    }
  };

  const lapsedCount = rows.filter((row) => row.classification === "lapsed").length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Hidden venues</h2>
          <p className="text-xs text-slate-500">
            {state === "loading"
              ? "Loading…"
              : `${rows.length} hidden · ${lapsedCount} lapsed (re-hidden by the billing reconciler)`}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={state === "loading"}
          className="min-h-[44px] rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {notice ? <div className="mx-4 mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:mx-6">{notice}</div> : null}
      {error ? <div className="mx-4 mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6">{error}</div> : null}

      <div className="px-4 py-3 text-xs text-slate-500 sm:px-6">
        A <strong>lapsed</strong> venue was hidden automatically because its subscription stopped billing. Restoring
        here only un-hides it; the real fix is a live subscription (re-grant access, or the partner resubscribes),
        or the nightly reconciler will re-hide it. Admin-hidden venues and system rooms are shown for context and
        cannot be restored here.
      </div>

      {state === "ready" && rows.length === 0 ? (
        <p className="px-4 pb-6 text-sm text-slate-400 sm:px-6">No hidden venues.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={TH}>Venue</th>
                <th className={TH}>Status</th>
                <th className={TH}>Billing</th>
                <th className={TH}>Hidden since</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = BADGE[row.classification];
                return (
                  <tr key={row.venueId} className={TR}>
                    <td className={TD}>
                      <span className="font-medium text-slate-900">{row.name}</span>
                      <span className="block text-[11px] text-slate-400">{row.venueId}</span>
                    </td>
                    <td className={TD}>
                      <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className={`${TD} text-slate-600`}>
                      {row.billingStatus ? (
                        <>
                          {row.billingStatus}
                          {row.billingMethod ? <span className="text-slate-400"> · {row.billingMethod}</span> : null}
                        </>
                      ) : (
                        <span className="text-slate-400">no subscription</span>
                      )}
                    </td>
                    <td className={`${TD} text-slate-600`}>{formatWhen(row.rehiddenAt)}</td>
                    <td className={`${TD} text-right`}>
                      {row.classification === "lapsed" ? (
                        <button
                          onClick={() => void restore(row)}
                          disabled={restoringId !== null}
                          className="min-h-[44px] rounded border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {restoringId === row.venueId ? "Restoring…" : "Restore (unhide)"}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
