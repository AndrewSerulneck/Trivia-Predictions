"use client";

import { useCallback, useEffect, useState } from "react";
import { TH, TD, TR } from "@/components/admin/AdminShell";

// docs/pos-rewards-integration-plan.md Phase 2c — Square gift card attempts that never finished.
//
// Loaded once when the Venues section opens (and on Refresh); no polling. The server
// (lib/pos/squareStuckClaims.ts) never sends a card number, token or gift card id. Only a
// "claimed, not funded" row — the guest has neither a coupon nor a card — gets Retry funding.
// The "need action" count comes from the server's own need-action read, so harmless rows can
// never hide it (docs/square-review-fixes-plan.md R1).

type StuckKind = "claimed_unfunded" | "unclaimed" | "lost";

type StuckClaim = {
  ledgerId: string;
  redemptionId: string | null;
  venueId: string;
  venueName: string | null;
  status: string;
  kind: StuckKind;
  amountCents: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

type NeedsAction = { count: number; capped: boolean };

const BADGE: Record<StuckKind, { label: string; className: string }> = {
  claimed_unfunded: { label: "Claimed, not funded", className: "bg-red-100 text-red-800" },
  unclaimed: { label: "Not claimed — guest keeps coupon", className: "bg-slate-200 text-slate-700" },
  lost: { label: "Redeemed another way", className: "bg-slate-100 text-slate-500" },
};

const formatWhen = (iso: string): string => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return new Date(parsed).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const formatDollars = (cents: number | null): string => (cents === null ? "—" : `$${(cents / 100).toFixed(2)}`);

export function PosStuckClaimsPanel() {
  const [rows, setRows] = useState<StuckClaim[]>([]);
  const [needsAction, setNeedsAction] = useState<NeedsAction>({ count: 0, capped: false });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/admin?resource=pos-stuck-claims", { cache: "no-store" });
      const payload = (await res.json()) as { ok: boolean; claims?: StuckClaim[]; needsAction?: NeedsAction; error?: string };
      if (!res.ok || !payload.ok || !payload.claims) throw new Error(payload.error ?? "Failed to load Square claims.");
      setRows(payload.claims);
      setNeedsAction(
        payload.needsAction ?? { count: payload.claims.filter((row) => row.kind === "claimed_unfunded").length, capped: false },
      );
      setState("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Square claims.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (row: StuckClaim) => {
    if (!row.redemptionId) return;
    setRetryingId(row.ledgerId);
    setNotice("");
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "pos-stuck-claims", action: "retry", redemptionId: row.redemptionId }),
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !payload.ok) throw new Error(payload.error ?? "Retry failed.");
      setNotice("Funded. The guest can now show the Square gift card from their prize wallet.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed.");
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Stuck Square gift cards</h2>
          <p className="text-xs text-slate-500">
            {state === "loading" ? "Loading…" : `${rows.length} unfinished shown (older than 15 min) · ${needsAction.count}${needsAction.capped ? "+" : ""} need action`}
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
        A guest&apos;s gift card prize becomes a Square gift card in steps. <strong>Claimed, not funded</strong> means the
        coupon is used up but the Square card has no money on it yet — Retry funding finishes it (no second card, no
        double payout). The other rows need nothing: the guest still has the normal coupon, or redeemed it another way.
        Those are listed for the last 14 days only (newest 50); every claimed-not-funded row is always listed.
      </div>

      {state === "ready" && rows.length === 0 ? (
        <p className="px-4 pb-6 text-sm text-slate-400 sm:px-6">Nothing stuck.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={TH}>Venue</th>
                <th className={TH}>State</th>
                <th className={TH}>Amount</th>
                <th className={TH}>Last error</th>
                <th className={TH}>Started</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const badge = BADGE[row.kind];
                return (
                  <tr key={row.ledgerId} className={TR}>
                    <td className={TD}>
                      <span className="font-medium text-slate-900">{row.venueName ?? row.venueId}</span>
                      <span className="block text-[11px] text-slate-400">coupon {row.redemptionId ?? "deleted"}</span>
                    </td>
                    <td className={TD}>
                      <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                      <span className="block text-[11px] text-slate-400">ledger {row.status}</span>
                    </td>
                    <td className={`${TD} text-slate-600`}>{formatDollars(row.amountCents)}</td>
                    <td className={`${TD} max-w-xs text-xs text-slate-600`}>
                      {row.errorCode ? <span className="font-semibold">{row.errorCode}</span> : "—"}
                      {row.errorMessage ? <span className="block break-words text-slate-400">{row.errorMessage}</span> : null}
                    </td>
                    <td className={`${TD} text-slate-600`}>{formatWhen(row.createdAt)}</td>
                    <td className={`${TD} text-right`}>
                      {row.kind === "claimed_unfunded" && row.redemptionId ? (
                        <button
                          onClick={() => void retry(row)}
                          disabled={retryingId !== null}
                          className="min-h-[44px] rounded border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                        >
                          {retryingId === row.ledgerId ? "Retrying…" : "Retry funding"}
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
