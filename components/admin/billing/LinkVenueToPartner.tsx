"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminModalSheet } from "@/components/admin/AdminModalSheet";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { attachPreviewText } from "@/lib/adminBillView";
import { isStripeHostedUrl } from "@/lib/addVenueFlow";
import { adminField, adminLabel } from "@/lib/adminStyles";
import { formatCentsShort } from "@/lib/merchPricing";
import type { AdminAttachMode, AdminAttachPreview } from "@/lib/multiVenueBilling";

/**
 * Admin → Partner Billing → "Link a venue to a partner" (docs/multi-venue-volume-billing-plan.md
 * Phase 6, plan §2 row 7). Gives an existing, already-activated venue to a partner who already has
 * an account, either ON their bill (a card bill is charged now, prorated, exactly like the partner's
 * own "Add a venue"; a check-billed bill just gains the venue) or FREE (comped: linked, on no bill).
 *
 * Always Preview → Confirm: the preview is Stripe's own quote (or the offline suggestion) and writes
 * nothing. One idempotency key per Confirm, re-sent by "Check again", so a retry can never charge
 * twice. Every rule is enforced on the server (lib/adminVenueAttach.ts); this only asks.
 */

type Owner = { id: string; email: string; name: string };

type AttachReply = {
  ok?: boolean;
  kind?: "preview" | "comped" | "offline_attached" | "already_on_bill" | "card_add";
  preview?: AdminAttachPreview;
  status?: "paid" | "requires_action" | "processing";
  chargedTodayCents?: number | null;
  hostedInvoiceUrl?: string | null;
  billedVenueCount?: number;
  suggestedMonthlyCents?: number;
  currentMonthlyCents?: number;
  error?: string;
};

const newAttemptKey = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `admin-${crypto.randomUUID()}`
    : `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type LinkVenueToPartnerProps = {
  open: boolean;
  owners: Owner[];
  onClose: () => void;
  /** Called after a change landed, so the list refreshes. */
  onChanged: () => void;
};

export function LinkVenueToPartner({ open, owners, onClose, onChanged }: LinkVenueToPartnerProps) {
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [loadError, setLoadError] = useState("");
  const [venueId, setVenueId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [mode, setMode] = useState<AdminAttachMode>("bill");
  const [preview, setPreview] = useState<AdminAttachPreview | null>(null);
  const [attemptKey, setAttemptKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const [canCheckAgain, setCanCheckAgain] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVenueId("");
    setOwnerId("");
    setMode("bill");
    setPreview(null);
    setAttemptKey(null);
    setError("");
    setDone("");
    setInvoiceUrl(null);
    setCanCheckAgain(false);
    setLoadError("");
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/billing?resource=attach-options", { cache: "no-store" });
        const payload = (await res.json()) as { ok?: boolean; venues?: Array<{ id: string; name: string }>; error?: string };
        if (cancelled) return;
        if (!res.ok || !payload.ok) {
          setLoadError(payload.error ?? "Couldn't load venues.");
          return;
        }
        setVenues(payload.venues ?? []);
      } catch {
        if (!cancelled) setLoadError("Couldn't load venues.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const ownerOptions = useMemo(
    () =>
      owners
        .slice()
        .sort((a, b) => (a.email || a.name).localeCompare(b.email || b.name))
        .map((owner) => ({ value: owner.id, label: owner.email || owner.name || owner.id })),
    [owners]
  );

  const resetAnswer = () => {
    setPreview(null);
    setAttemptKey(null);
    setError("");
    setDone("");
    setInvoiceUrl(null);
    setCanCheckAgain(false);
  };

  const post = async (body: Record<string, unknown>): Promise<{ ok: boolean; reply: AttachReply }> => {
    const res = await fetch("/api/admin/billing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "attach-venue", venueId, ownerId, mode, ...body }),
    });
    const reply = (await res.json().catch(() => ({}))) as AttachReply;
    return { ok: res.ok && reply.ok === true, reply };
  };

  const runPreview = async () => {
    setBusy(true);
    resetAnswer();
    try {
      const { ok, reply } = await post({ preview: true });
      if (!ok || !reply.preview) {
        setError(reply.error ?? "Couldn't preview that.");
        return;
      }
      setPreview(reply.preview);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (key: string) => {
    setBusy(true);
    setError("");
    setCanCheckAgain(false);
    try {
      const { ok, reply } = await post({
        preview: false,
        idempotencyKey: key,
        ...(preview?.quote ? { prorationDate: preview.quote.prorationDate } : {}),
      });
      if (!ok) {
        setError(reply.error ?? "That didn't work.");
        // A definitive refusal ends this attempt; the next Confirm gets a fresh key.
        setAttemptKey(null);
        return;
      }
      if (reply.kind === "comped") {
        setDone("Linked — free. It's on their account and on no bill.");
      } else if (reply.kind === "already_on_bill") {
        setDone("It's already on their bill.");
      } else if (reply.kind === "offline_attached") {
        setDone(
          `Added to their check-billed account (${reply.billedVenueCount ?? "?"} venues). Their amount is still ` +
            `${formatCentsShort(reply.currentMonthlyCents ?? 0)}/mo — the bands come to ` +
            `${formatCentsShort(reply.suggestedMonthlyCents ?? 0)}/mo. Change it with Extend / edit.`
        );
      } else if (reply.status === "paid") {
        setDone(
          `Done — charged ${formatCentsShort(reply.chargedTodayCents ?? 0)} to their card. The venue is on their bill and they got the "Venue added" email.`
        );
      } else if (reply.status === "requires_action") {
        setDone("Their bank wants to confirm this charge. Send the partner the payment link below; the venue joins their bill once they pay.");
        setInvoiceUrl(isStripeHostedUrl(reply.hostedInvoiceUrl ?? null) ? (reply.hostedInvoiceUrl as string) : null);
        setCanCheckAgain(true);
        return;
      } else {
        setDone("The payment is still processing.");
        setCanCheckAgain(true);
        return;
      }
      setPreview(null);
      setAttemptKey(null);
      onChanged();
    } catch {
      setError("Network error — we couldn't confirm what happened. Press Check again.");
      setCanCheckAgain(true);
    } finally {
      setBusy(false);
    }
  };

  const startConfirm = () => {
    const key = attemptKey ?? newAttemptKey();
    setAttemptKey(key);
    void confirm(key);
  };

  return (
    <AdminModalSheet open={open} onClose={onClose} titleId="link-venue-title">
      <h3 id="link-venue-title" className="text-base font-semibold text-slate-900">
        Link a venue to a partner
      </h3>
      <p className="mt-1 text-sm text-slate-600">
        For a partner who already has an account. The venue must already be activated (Venues).
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className={adminLabel}>Venue</label>
          {loadError ? (
            <p className="text-sm text-rose-700">{loadError}</p>
          ) : venues.length === 0 ? (
            <p className="text-sm text-slate-500">No unlinked, visible venues.</p>
          ) : (
            <AdminSelect
              ariaLabel="Venue"
              className={`${adminField} admin-select-bordered`}
              value={venueId}
              onChange={(value) => {
                setVenueId(value);
                resetAnswer();
              }}
              options={[{ value: "", label: "Choose a venue…" }, ...venues.map((venue) => ({ value: venue.id, label: venue.name }))]}
            />
          )}
        </div>
        <div>
          <label className={adminLabel}>Partner</label>
          <AdminSelect
            ariaLabel="Partner"
            className={`${adminField} admin-select-bordered`}
            value={ownerId}
            onChange={(value) => {
              setOwnerId(value);
              resetAnswer();
            }}
            options={[{ value: "", label: "Choose a partner…" }, ...ownerOptions]}
          />
        </div>
        <fieldset>
          <legend className={adminLabel}>Billing</legend>
          <div className="grid grid-cols-1 gap-2">
            {(
              [
                ["bill", "Add to their bill", "Charged to their card now (prorated), like adding it themselves. Check-billed: added, nothing charged."],
                ["comped", "Free (comped)", "On their account, on no bill. Never charged."],
              ] as const
            ).map(([value, label, help]) => (
              <label
                key={value}
                className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2 ${mode === value ? "border-indigo-500 bg-indigo-50" : "border-slate-300"}`}
              >
                <input
                  type="radio"
                  name="attach-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    resetAnswer();
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-600">{help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {preview ? <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">{attachPreviewText(preview)}</div> : null}
      {error ? <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</div> : null}
      {done ? <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{done}</div> : null}
      {invoiceUrl ? (
        <a href={invoiceUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-sm font-semibold text-indigo-600 underline">
          {invoiceUrl}
        </a>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Close
        </button>
        {canCheckAgain && attemptKey ? (
          <button
            type="button"
            onClick={() => void confirm(attemptKey)}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Check again"}
          </button>
        ) : preview && !done ? (
          <button
            type="button"
            onClick={startConfirm}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "bill" && preview.quote ? "Charge and add" : "Confirm"}
          </button>
        ) : !done ? (
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={busy || !venueId || !ownerId}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? "Checking…" : "Preview"}
          </button>
        ) : null}
      </div>
    </AdminModalSheet>
  );
}
