"use client";

import { useCallback, useRef, useState } from "react";
import type { Venue } from "@/types";

// Venue deletion — the confirmation modal plus the state machine behind it.
// Extracted from VenuesSection in admin-mobile Phase 4 so the desktop table and
// the mobile venue list share one implementation of the partner-venue guard
// (typed venue name) rather than two.

// Mirrors AdminVenueDeletionSummary in lib/admin.ts (server-only module — kept
// as a local shape so this client component never imports server code).
export type VenueDeletionSummary = {
  venueId: string;
  venueName: string | null;
  isPartnerVenue: boolean;
  owner: { name: string; email: string } | null;
  ownerAccountWillBeDeleted: boolean;
  subscription: {
    status: "active" | "past_due" | "cancelled";
    amountCents: number;
    planType: string;
    hasStripeSubscription: boolean;
  } | null;
  userCount: number;
};

export type VenueDeletion = {
  target: Venue | null;
  summary: VenueDeletionSummary | null;
  summaryLoading: boolean;
  summaryError: string;
  confirmText: string;
  setConfirmText: (value: string) => void;
  busy: boolean;
  error: string;
  open: (venue: Venue) => Promise<void>;
  close: () => void;
  confirm: () => Promise<void>;
};

type UseVenueDeletionOptions = {
  onDeleted: (venue: Venue, message: string) => void;
  onOpened?: () => void;
};

export function useVenueDeletion({ onDeleted, onOpened }: UseVenueDeletionOptions): VenueDeletion {
  const [target, setTarget] = useState<Venue | null>(null);
  const [summary, setSummary] = useState<VenueDeletionSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  const close = useCallback(() => {
    if (busy) return;
    requestIdRef.current += 1;
    setTarget(null);
    setSummary(null);
    setSummaryError("");
    setConfirmText("");
    setSummaryLoading(false);
    setError("");
  }, [busy]);

  const open = useCallback(
    async (venue: Venue) => {
      const requestId = ++requestIdRef.current;
      setTarget(venue);
      setSummary(null);
      setSummaryError("");
      setConfirmText("");
      setSummaryLoading(true);
      setError("");
      onOpened?.();

      try {
        const response = await fetch(`/api/admin?resource=venue-deletion-summary&id=${encodeURIComponent(venue.id)}`);
        const payload = (await response.json()) as { ok: boolean; error?: string; summary?: VenueDeletionSummary };
        if (requestIdRef.current !== requestId) return;
        if (!response.ok || !payload.ok || !payload.summary) {
          throw new Error(payload.error ?? "Failed to load venue deletion details.");
        }
        setSummary(payload.summary);
      } catch (err) {
        if (requestIdRef.current !== requestId) return;
        setSummaryError(err instanceof Error ? err.message : "Failed to load venue deletion details.");
      } finally {
        if (requestIdRef.current === requestId) {
          setSummaryLoading(false);
        }
      }
    },
    [onOpened]
  );

  const confirm = useCallback(async () => {
    const venue = target;
    if (!venue) return;
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/admin?resource=venues&id=${encodeURIComponent(venue.id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
        subscriptionCancelled?: boolean;
        ownerAccountDeleted?: boolean;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to delete venue.");
      }

      const parts = [`Venue "${venue.name}" deleted`];
      if (payload.subscriptionCancelled) parts.push("its Stripe subscription was cancelled");
      if (payload.ownerAccountDeleted) parts.push("the orphaned owner account was removed");

      requestIdRef.current += 1;
      setTarget(null);
      setSummary(null);
      setConfirmText("");
      onDeleted(venue, `${parts.join(", ")}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete venue.");
    } finally {
      setBusy(false);
    }
  }, [target, onDeleted]);

  return {
    target,
    summary,
    summaryLoading,
    summaryError,
    confirmText,
    setConfirmText,
    busy,
    error,
    open,
    close,
    confirm,
  };
}

export function DeleteVenueModal({ deletion }: { deletion: VenueDeletion }) {
  const { target, summary, summaryLoading, summaryError, confirmText, setConfirmText, busy, error } = deletion;
  if (!target) return null;

  const targetNameTrimmed = (target.name ?? "").trim();
  const expectedConfirmText = targetNameTrimmed || "DELETE";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Delete venue</h3>
          <p className="mt-1 text-xs text-slate-500">{target.name}</p>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm">
          {summaryLoading ? (
            <p className="text-slate-500">Loading deletion details…</p>
          ) : summaryError ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{summaryError}</div>
          ) : summary ? (
            <>
              <p className="text-slate-700">
                This permanently deletes the venue and cascades to all of its data. This cannot be undone.
              </p>

              <ul className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <li>
                  <span className="font-semibold text-slate-800">{summary.userCount}</span> venue-scoped user
                  {summary.userCount === 1 ? "" : "s"} will be removed (global accounts are kept).
                </li>
              </ul>

              {summary.isPartnerVenue ? (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                  <p className="text-xs font-semibold text-amber-900">⚠ This is a partner venue.</p>
                  {summary.owner ? (
                    <p className="text-xs text-amber-800">
                      Owner: {summary.owner.name} ({summary.owner.email})
                      {summary.ownerAccountWillBeDeleted
                        ? " — this is their only venue, so the owner account and login will also be deleted."
                        : " — the owner has other venues, so their account will be kept."}
                    </p>
                  ) : null}
                  {summary.subscription ? (
                    <p className="text-xs text-amber-800">
                      Billing: {summary.subscription.planType} · $
                      {(summary.subscription.amountCents / 100).toFixed(2)} · {summary.subscription.status}
                      {summary.subscription.hasStripeSubscription
                        ? " — the Stripe subscription will be cancelled immediately before deletion."
                        : " — no Stripe subscription on file."}
                    </p>
                  ) : null}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-amber-900">
                      {targetNameTrimmed ? (
                        <>
                          Type the venue name <span className="font-semibold">{target.name}</span> to confirm:
                        </>
                      ) : (
                        <>
                          This venue has no name on file. Type <span className="font-semibold">DELETE</span> to
                          confirm:
                        </>
                      )}
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(event) => setConfirmText(event.target.value)}
                      disabled={busy}
                      className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                      placeholder={targetNameTrimmed || "DELETE"}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</div> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            onClick={deletion.close}
            disabled={busy}
            className="min-h-[44px] rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              void deletion.confirm();
            }}
            disabled={
              busy ||
              summaryLoading ||
              !summary ||
              (summary.isPartnerVenue && confirmText.trim() !== expectedConfirmText)
            }
            className="min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete venue"}
          </button>
        </div>
      </div>
    </div>
  );
}
