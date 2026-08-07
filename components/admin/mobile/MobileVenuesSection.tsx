"use client";

import { useEffect, useMemo, useState } from "react";
import type { Venue } from "@/types";
import type { AdminSection } from "@/components/admin/adminSectionMeta";
import { ActivateVenueFlow } from "@/components/admin/mobile/ActivateVenueFlow";
import { DeleteVenueModal, useVenueDeletion } from "@/components/admin/DeleteVenueModal";
import { adminField } from "@/lib/adminStyles";
import {
  formatAddressDisplay,
  isVenueAddressIncomplete,
  venueScreenPath,
  type VenuePayload,
} from "@/lib/adminVenueForm";

/**
 * Venues, mobile shell (admin-mobile Phase 4).
 *
 * The desktop VenuesSection stays exactly as it is; this is the task-shaped
 * version for a salesperson on a phone: one big "Activate a venue" button, a
 * searchable card list underneath (no horizontal-scroll table), the guided
 * ActivateVenueFlow for create and edit, and an activation summary that hands
 * off to the two things that come next.
 */

type MobileVenuesSectionProps = {
  venues: Venue[];
  onVenueCreated: (venue: Venue) => void;
  onVenueUpdated: (venue: Venue) => void;
  onVenueDeleted: (venueId: string) => void;
  onNavigate: (section: AdminSection) => void;
};

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; venue: Venue }
  | { kind: "activated"; venue: Venue };

export function MobileVenuesSection({
  venues,
  onVenueCreated,
  onVenueUpdated,
  onVenueDeleted,
  onNavigate,
}: MobileVenuesSectionProps) {
  const [venueList, setVenueList] = useState<Venue[]>(venues);
  const [view, setView] = useState<View>({ kind: "list" });
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setVenueList(venues);
  }, [venues]);

  const deletion = useVenueDeletion({
    onOpened: () => {
      setError("");
      setNotice("");
    },
    onDeleted: (venue, message) => {
      setVenueList((prev) => prev.filter((entry) => entry.id !== venue.id));
      onVenueDeleted(venue.id);
      setNotice(message);
      setView({ kind: "list" });
    },
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const seen = new Set<string>();
    return venueList
      .filter((venue) => {
        if (seen.has(venue.id)) return false;
        seen.add(venue.id);
        if (!needle) return true;
        return [venue.name, venue.city ?? "", venue.street ?? venue.address ?? "", venue.state ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [venueList, search]);

  async function saveVenue(payload: VenuePayload, editing: Venue | null) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "venues", ...(editing ? { id: editing.id } : {}), ...payload }),
      });
      const body = (await res.json()) as { ok: boolean; item?: Venue; error?: string };
      if (!res.ok || !body.ok || !body.item) {
        throw new Error(body.error ?? (editing ? "Failed to update venue." : "Failed to create venue."));
      }

      const item = body.item;
      if (editing) {
        setVenueList((prev) => prev.map((venue) => (venue.id === item.id ? item : venue)));
        onVenueUpdated(item);
        setNotice(`“${item.name}” updated.`);
        setView({ kind: "list" });
      } else {
        setVenueList((prev) => [item, ...prev]);
        onVenueCreated(item);
        setNotice("");
        setView({ kind: "activated", venue: item });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save venue.");
    } finally {
      setBusy(false);
    }
  }

  if (view.kind === "create" || view.kind === "edit") {
    const editing = view.kind === "edit" ? view.venue : null;
    return (
      <>
        <ActivateVenueFlow
          key={editing ? `edit-${editing.id}` : "create"}
          mode={editing ? "edit" : "create"}
          venue={editing ?? undefined}
          busy={busy}
          error={error}
          onSubmit={(payload) => void saveVenue(payload, editing)}
          onValidationError={setError}
          onCancel={() => {
            setError("");
            setView({ kind: "list" });
          }}
          onDelete={editing ? () => void deletion.open(editing) : undefined}
        />
        <DeleteVenueModal deletion={deletion} />
      </>
    );
  }

  if (view.kind === "activated") {
    return (
      <ActivatedSummary
        venue={view.venue}
        onNavigate={onNavigate}
        onActivateAnother={() => setView({ kind: "create" })}
        onDone={() => setView({ kind: "list" })}
      />
    );
  }

  return (
    <div className="space-y-4">
      {notice ? <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <button
        type="button"
        onClick={() => {
          setError("");
          setNotice("");
          setView({ kind: "create" });
        }}
        className="h-[112px] min-h-[112px] w-full rounded-2xl bg-indigo-600 px-4 text-[2rem] font-semibold text-white shadow-sm"
      >
        ＋ Activate a venue
      </button>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Filter venues by name or address"
        className={`${adminField} min-h-[48px] text-base`}
      />

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
          {venueList.length === 0 ? "No venues yet." : "No venues match that search."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((venue) => (
            <li key={venue.id}>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setView({ kind: "edit", venue });
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm active:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{venue.name}</span>
                    {isVenueAddressIncomplete(venue) ? (
                      <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Needs address
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-slate-500">{formatAddressDisplay(venue) || "No address on file"}</p>
                  {venue.screenEnabled === false ? (
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500">TV display off</p>
                  ) : null}
                </div>
                <span aria-hidden className="text-slate-300">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <DeleteVenueModal deletion={deletion} />
    </div>
  );
}

type ActivatedSummaryProps = {
  venue: Venue;
  onNavigate: (section: AdminSection) => void;
  onActivateAnother: () => void;
  onDone: () => void;
};

/**
 * "Activated" means the three things a salesperson can finish on the spot: the
 * venue row exists, its geofence pin is set, and the TV display URL resolves.
 * Billing is deliberately *not* one of them — Partner Billing is keyed on
 * venue_owner_venues, and a venue created here has no owner link yet, so a
 * grant is impossible until the partner has an owner account. Showing it as an
 * open next step (with the reason) is honest; a dead inline grant form would
 * not be.
 */
function ActivatedSummary({ venue, onNavigate, onActivateAnother, onDone }: ActivatedSummaryProps) {
  const [copied, setCopied] = useState("");

  // Safe to read at render: this screen only ever appears after a create round
  // trip on the client, so it never participates in server rendering.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const path = venueScreenPath(venue.id);
  const screenUrl = origin ? `${origin}${path}` : path;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(screenUrl);
      setCopied("Copied — paste it into the venue's TV browser.");
    } catch {
      setCopied("Couldn't copy automatically — press and hold the link to copy it.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <p className="text-3xl">✅</p>
        <h2 className="mt-2 text-lg font-semibold text-emerald-900">{venue.name} is live</h2>
        <p className="mt-1 text-sm text-emerald-800">
          Players inside a {venue.radius} m circle around your pin can join it right now.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">TV display</h3>
        <p className="mt-1 text-xs text-slate-600">Open this on the venue&apos;s TV or projector.</p>
        <p className="mt-2 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{screenUrl}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void copyUrl()}
            className="min-h-[48px] rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white"
          >
            Copy URL
          </button>
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[48px] items-center justify-center rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-700"
          >
            Preview
          </a>
        </div>
        {copied ? <p className="mt-2 text-xs text-emerald-700">{copied}</p> : null}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">What&apos;s left</h3>
        <ul className="mt-3 space-y-3">
          <li>
            <p className="text-sm font-medium text-slate-800">▢ Billing access</p>
            <p className="mt-0.5 text-xs text-slate-600">
              Partner Billing only lists venues that already have an owner login. Grant access once the partner has
              signed up — this venue won&apos;t appear there until then.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("partner-billing")}
              className="mt-2 min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700"
            >
              Open Partner Billing
            </button>
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button
          type="button"
          onClick={onActivateAnother}
          className="min-h-[52px] w-full rounded-xl border border-indigo-300 bg-indigo-50 px-4 text-sm font-semibold text-indigo-800"
        >
          Activate another venue
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-[52px] w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}
