"use client";

import { useEffect, useState } from "react";
import { RedeemedRewardsList } from "@/components/owner/pos/RedeemedRewardsList";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { HightopLoader } from "@/components/ui/HightopLoader";
import {
  SQUARE_SETUP_STEPS,
  STAFF_DISCOUNT_STEPS,
  STAFF_FALLBACK_TEXT,
  STAFF_GIFT_CARD_STEPS,
  STAFF_SHEET_LINK_LABEL,
  STAFF_SHEET_PATH,
} from "@/lib/posStaffInstructions";
import type { PosConnectionStatus } from "@/lib/pos/types";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// The Partner Dashboard's "Point of Sale" sheet (docs/pos-rewards-integration-plan.md Phase 1).
//
// URL-mirrored like the store (`?sheet=pos`), hosted by the page (PosSheetHost in
// app/owner/dashboard/page.tsx) and mounted only while NEXT_PUBLIC_POS_INTEGRATIONS_ENABLED
// is on. One screen: Square, Clover, Toast with this venue's status.
//
// Phase 2 made Square connectable: "Connect" is a plain link to `posConnectHref` (Square's
// consent screen, then back here with `?posResult=`, which the page passes in as `posResult`).
// A connected Square account with several locations asks which one issues gift cards; a
// connected one offers Disconnect (two taps). Clover/Toast still read "Coming soon".
// Phase 2d: a Square account connected before menu-item discounts existed shows "Reconnect
// Square" once (same link; a reconnect keeps the chosen location) to grant the catalog scopes.
//
// One GET per open (`/api/owner/pos?venueId=`), nothing while closed, no polling. The location
// list is fetched only while a location still has to be chosen.

type Load =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; statuses: PosConnectionStatus[] }
  | { status: "error"; message: string };

export type PosConnectionsSheetProps = {
  nav: UseOwnerSheetResult;
  venue: { id: string; name: string } | null;
  /** `?posResult=` from the Square connect redirect (lib/pos/squareRoutes.ts), or null. */
  posResult?: string | null;
};

/** One sentence per connect outcome (PosConnectResult in lib/pos/squareRoutes.ts). */
export const POS_RESULT_MESSAGES: Record<string, { tone: "good" | "bad"; text: string }> = {
  connected: { tone: "good", text: "Square is connected. Guests' prizes can now be taken at your Square register." },
  choose_location: { tone: "good", text: "Square is connected. Choose which location issues gift cards." },
  denied: { tone: "bad", text: "Square wasn't connected — access was declined." },
  expired: { tone: "bad", text: "That connection attempt expired. Please tap Connect again." },
  no_location: { tone: "bad", text: "Your Square account has no active location, so it can't issue gift cards." },
  not_eligible: {
    tone: "bad",
    text: "Square gift cards need a US Square location that uses US dollars, so this account wasn't connected. Guests keep the normal coupon.",
  },
  not_configured: { tone: "bad", text: "Square connections aren't set up yet. Please contact Hightop support." },
  error: { tone: "bad", text: "Square couldn't be connected. Please try again." },
};

/** `eligible` = a US location in US dollars (Phase 2c); the others are shown but can't be picked. */
type SquareLocationOption = { id: string; name: string; address: string | null; eligible: boolean };

/** Pick the Square location that issues gift cards (multi-location accounts only). */
const SquareLocationPicker = ({ venueId, onSaved }: { venueId: string; onSaved: () => void }) => {
  const [locations, setLocations] = useState<SquareLocationOption[] | null>(null);
  const [choice, setChoice] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/owner/pos/square/locations?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; locations?: SquareLocationOption[]; error?: string };
        if (cancelled) return;
        if (res.ok && json.ok && Array.isArray(json.locations)) setLocations(json.locations);
        else setMessage(json.error ?? "Couldn't load your Square locations.");
      } catch {
        if (!cancelled) setMessage("Couldn't load your Square locations.");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  const save = async () => {
    if (!choice || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/owner/pos/square/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, locationId: choice }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) onSaved();
      else setMessage(json.error ?? "Couldn't save the location.");
    } catch {
      setMessage("Couldn't save the location.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-xs font-bold text-ht-primary" htmlFor="pos-square-location">
        Which location issues gift cards?
      </label>
      {locations ? (
        <select
          id="pos-square-location"
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          className="w-full rounded-lg border border-ht-hairline bg-ht-elevated px-3 py-2 text-sm font-semibold text-ht-primary"
        >
          <option value="">Choose a location</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id} disabled={!location.eligible}>
              {location.address ? `${location.name} — ${location.address}` : location.name}
              {location.eligible ? "" : " (must be a US location using US dollars)"}
            </option>
          ))}
        </select>
      ) : !message ? (
        <p className="text-xs font-semibold text-ht-muted">Loading locations…</p>
      ) : null}
      {message ? <p className="text-xs font-bold text-ht-rose-300">{message}</p> : null}
      {locations ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={!choice || saving}
          className="rounded-full bg-ht-cyan-300 px-3 py-1.5 text-xs font-black text-slate-950 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Use this location"}
        </button>
      ) : null}
    </div>
  );
};

/** Two-tap Disconnect, so a stray tap can't cut off a venue's gift cards. */
const SquareDisconnect = ({ venueId, onDone }: { venueId: string; onDone: () => void }) => {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const disconnect = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/owner/pos/square/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && json.ok) onDone();
      else setMessage(json.error ?? "Couldn't disconnect Square. Please try again.");
    } catch {
      setMessage("Couldn't disconnect Square. Please try again.");
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <div className="mt-3 space-y-1">
      <button
        type="button"
        onClick={() => void disconnect()}
        disabled={busy}
        className="rounded-full border border-ht-hairline px-3 py-1.5 text-xs font-black text-ht-muted disabled:opacity-50"
      >
        {busy ? "Disconnecting…" : armed ? "Tap again to disconnect" : "Disconnect"}
      </button>
      {armed ? (
        <p className="text-xs font-semibold text-ht-muted">
          Gift cards already given out keep working at your register, but guests won&apos;t see them in the app.
        </p>
      ) : null}
      {message ? <p className="text-xs font-bold text-ht-rose-300">{message}</p> : null}
    </div>
  );
};

/** Where "Connect" goes. The route lands with each provider's phase; until then nothing links here. */
export const posConnectHref = (provider: string, venueId: string): string =>
  `/api/owner/pos/${encodeURIComponent(provider)}/connect?venueId=${encodeURIComponent(venueId)}`;

const LOAD_ERROR = "Couldn't load your point-of-sale connections.";

/** Under a connected Square account that granted everything (Phase 2d). */
export const SQUARE_CONNECTED_TEXT =
  "Gift card prizes become Square gift cards. Free-item and $ or % off prizes add a ready-made \"Hightop prize\" discount to your Square for staff to tap.";

/** Under a Square account connected before Phase 2d (no catalog permission yet). */
export const SQUARE_MENU_PRIZE_RECONNECT_TEXT =
  "Gift card prizes become Square gift cards. Reconnect once to also give free-item and $ or % off prizes a ready-made discount staff can tap in Square. Until then they use the normal coupon.";

/** Shown under a Square connection that needs attention (Square removed our access, etc.). */
export const SQUARE_ATTENTION_TEXT =
  "Square isn't accepting this connection right now, so gift card prizes use the normal coupon. Reconnect to turn Square gift cards back on.";

/** Square setup checklist, and once connected the "How staff take a prize" card (Phase 2e). */
const SquareHelp = ({ connected }: { connected: boolean }) => (
  <div className="space-y-3">
    {!connected ? (
      <section data-pos-setup className="rounded-xl border border-ht-hairline bg-ht-elevated/50 p-4">
        <p className="font-black text-ht-primary">Set up Square</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs font-semibold text-ht-muted">
          {SQUARE_SETUP_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    ) : (
      <section data-pos-staff-help className="rounded-xl border border-ht-hairline bg-ht-elevated/50 p-4">
        <p className="font-black text-ht-primary">How staff take a prize</p>
        <p className="mt-2 text-xs font-black text-ht-primary">Square gift card</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs font-semibold text-ht-muted">
          {STAFF_GIFT_CARD_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs font-black text-ht-primary">Green box: Square discount</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs font-semibold text-ht-muted">
          {STAFF_DISCOUNT_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-xs font-semibold text-ht-muted">{STAFF_FALLBACK_TEXT}</p>
        <a
          href={STAFF_SHEET_PATH}
          className="mt-3 inline-block rounded-full bg-ht-cyan-300 px-3 py-1.5 text-xs font-black text-slate-950"
        >
          {STAFF_SHEET_LINK_LABEL}
        </a>
      </section>
    )}
  </div>
);

const StatusBadge = ({ status, venueId }: { status: PosConnectionStatus; venueId: string }) => {
  if (status.state === "connected") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-black text-emerald-300">Connected</span>
    );
  }
  if (status.state === "needs_attention") {
    return (
      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-black text-amber-300">Reconnect needed</span>
    );
  }
  if (status.state === "not_connected") {
    return (
      <a
        href={posConnectHref(status.provider, venueId)}
        className="rounded-full bg-ht-cyan-300 px-3 py-1.5 text-xs font-black text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ht-cyan-300"
      >
        Connect
      </a>
    );
  }
  return (
    <span className="rounded-full border border-ht-hairline px-2.5 py-1 text-xs font-black text-ht-muted">Coming soon</span>
  );
};

export const PosConnectionsSheet = ({ nav, venue, posResult = null }: PosConnectionsSheetProps) => {
  const open = nav.sheet === "pos";
  const venueId = venue?.id ?? null;
  const [load, setLoad] = useState<Load>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  // Adjust-during-render (react-hooks/set-state-in-effect): show the loader the moment the
  // sheet opens for a venue, rather than one frame of stale content.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loadKey = open && venueId ? `${venueId}:${attempt}` : null;
  if (loadKey !== loadedFor) {
    setLoadedFor(loadKey);
    if (loadKey) setLoad({ status: "loading" });
  }

  useEffect(() => {
    if (!open || !venueId) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`/api/owner/pos?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          statuses?: PosConnectionStatus[];
          error?: string;
        };
        if (cancelled) return;
        if (res.ok && json.ok && Array.isArray(json.statuses)) {
          setLoad({ status: "ready", statuses: json.statuses });
        } else {
          setLoad({ status: "error", message: json.error ?? LOAD_ERROR });
        }
      } catch {
        if (!cancelled) setLoad({ status: "error", message: LOAD_ERROR });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, venueId, attempt]);

  return (
    <OwnerSheet open={open} onRequestClose={nav.closeSheet} eyebrow="Rewards at the register" title="Point of Sale">
      <div className="space-y-4">
        <p className="text-sm font-semibold text-ht-muted">
          Connect your register so guests&apos; prizes come off the bill right in your point-of-sale system.
        </p>

        {posResult && POS_RESULT_MESSAGES[posResult] ? (
          <p
            role="status"
            className={
              POS_RESULT_MESSAGES[posResult].tone === "good"
                ? "rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-300"
                : "rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 p-3 text-sm font-bold text-ht-rose-300"
            }
          >
            {POS_RESULT_MESSAGES[posResult].text}
          </p>
        ) : null}

        {!venue ? (
          <p className="rounded-xl border border-ht-hairline bg-ht-elevated/50 p-4 text-sm font-semibold text-ht-muted">
            Your venue is still loading.
          </p>
        ) : null}

        {venue && load.status === "loading" ? <HightopLoader size="sm" delayMs={0} className="py-8" /> : null}

        {venue && load.status === "error" ? (
          <div className="space-y-3 rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 p-4">
            <p className="text-sm font-bold text-ht-rose-300">{load.message}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-full bg-ht-elevated px-3 py-1.5 text-xs font-black text-ht-primary"
            >
              Retry
            </button>
          </div>
        ) : null}

        {venue && load.status === "ready" ? (
          <ul className="space-y-2" aria-label={`Point-of-sale systems for ${venue.name}`}>
            {load.statuses.map((status) => (
              <li
                key={status.provider}
                data-pos-provider={status.provider}
                className="flex items-start justify-between gap-3 rounded-xl border border-ht-hairline bg-ht-elevated/50 p-4"
              >
                <div className="min-w-0">
                  <p className="font-black text-ht-primary">{status.label}</p>
                  <p className="mt-0.5 text-xs font-semibold text-ht-muted">
                    {status.state === "connected" && status.merchantName
                      ? `Connected to ${status.merchantName}`
                      : status.pitch}
                  </p>
                  {status.provider === "square" && status.state === "connected" ? (
                    <>
                      <p className="mt-1 text-xs font-semibold text-ht-muted">
                        {status.needsMenuPrizeReconnect ? SQUARE_MENU_PRIZE_RECONNECT_TEXT : SQUARE_CONNECTED_TEXT}
                      </p>
                      {status.needsMenuPrizeReconnect ? (
                        <a
                          href={posConnectHref("square", venue.id)}
                          className="mt-2 inline-block rounded-full bg-ht-cyan-300 px-3 py-1.5 text-xs font-black text-slate-950"
                        >
                          Reconnect Square
                        </a>
                      ) : null}
                      {status.needsLocation ? (
                        <SquareLocationPicker venueId={venue.id} onSaved={() => setAttempt((n) => n + 1)} />
                      ) : null}
                      <SquareDisconnect venueId={venue.id} onDone={() => setAttempt((n) => n + 1)} />
                    </>
                  ) : null}
                  {status.provider === "square" && status.state === "needs_attention" ? (
                    <>
                      <p className="mt-1 text-xs font-semibold text-ht-muted">
                        {SQUARE_ATTENTION_TEXT}
                      </p>
                      <a
                        href={posConnectHref("square", venue.id)}
                        className="mt-2 inline-block rounded-full bg-ht-cyan-300 px-3 py-1.5 text-xs font-black text-slate-950"
                      >
                        Reconnect
                      </a>
                      <SquareDisconnect venueId={venue.id} onDone={() => setAttempt((n) => n + 1)} />
                    </>
                  ) : null}
                </div>
                <div className="shrink-0 pt-0.5">
                  <StatusBadge status={status} venueId={venue.id} />
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {venue && load.status === "ready" ? (
          <SquareHelp
            connected={load.statuses.some((status) => status.provider === "square" && status.state === "connected")}
          />
        ) : null}

        {venue && load.status === "ready" ? <RedeemedRewardsList venueId={venue.id} /> : null}

        <p className="text-xs font-semibold text-ht-muted">
          Prizes keep working with the normal coupon whether or not a register is connected.
        </p>
      </div>
    </OwnerSheet>
  );
};
