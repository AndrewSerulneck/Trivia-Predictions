"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Venue } from "@/types";
import { TH, TD, TR } from "@/components/admin/AdminShell";
import { GeofenceEditor } from "@/components/admin/GeofenceEditor";
import { DeleteVenueModal, useVenueDeletion } from "@/components/admin/DeleteVenueModal";
import { useAddressLookup, type AddressPrediction } from "@/components/admin/useAddressLookup";
import { adminField, adminLabel, adminFieldReadOnly } from "@/lib/adminStyles";
import type { GeofenceEditorValue, PinSource } from "@/lib/geofenceEditor";
import {
  BLANK_VENUE_FORM,
  buildVenuePayload,
  isVenueAddressIncomplete,
  isValidHttpUrl,
  validateVenueForm,
  venueToForm,
  type VenueFormState,
} from "@/lib/adminVenueForm";

type SortKey = "name" | "street" | "city" | "state" | "zipCode";

type VenueScreenSponsor = {
  id: string;
  venueId: string;
  title: string;
  imageUrl: string;
  linkUrl?: string;
  displayOrder: number;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
};

type SponsorFormState = {
  id: string | null;
  title: string;
  imageUrl: string;
  linkUrl: string;
  displayOrder: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
};

const BLANK_SPONSOR_FORM: SponsorFormState = {
  id: null,
  title: "",
  imageUrl: "",
  linkUrl: "",
  displayOrder: "0",
  isActive: true,
  startsAt: "",
  endsAt: "",
};

function toLocalDateTimeInput(iso: string | undefined): string {
  if (!iso) return "";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  const offsetMs = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offsetMs).toISOString().slice(0, 16);
}

function sponsorToForm(sponsor: VenueScreenSponsor): SponsorFormState {
  return {
    id: sponsor.id,
    title: sponsor.title,
    imageUrl: sponsor.imageUrl,
    linkUrl: sponsor.linkUrl ?? "",
    displayOrder: String(sponsor.displayOrder),
    isActive: sponsor.isActive,
    startsAt: toLocalDateTimeInput(sponsor.startsAt),
    endsAt: toLocalDateTimeInput(sponsor.endsAt),
  };
}

function normalizeDateTimeInput(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? new Date(trimmed).toISOString() : undefined;
}

type VenueScreenSponsorManagerProps = {
  venueId: string;
  sponsorsEnabled: boolean;
};

function VenueScreenSponsorManager({ venueId, sponsorsEnabled }: VenueScreenSponsorManagerProps) {
  const [sponsors, setSponsors] = useState<VenueScreenSponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<SponsorFormState>(BLANK_SPONSOR_FORM);
  const [isFormOpen, setIsFormOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSponsors() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin?resource=venue-screen-sponsors&venueId=${encodeURIComponent(venueId)}`);
        const payload = (await res.json()) as { ok: boolean; items?: VenueScreenSponsor[]; error?: string };
        if (!res.ok || !payload.ok) {
          throw new Error(payload.error ?? "Failed to load sponsors.");
        }
        if (!cancelled) {
          setSponsors(payload.items ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load sponsors.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSponsors();

    return () => {
      cancelled = true;
    };
  }, [venueId]);

  function resetForm() {
    setForm(BLANK_SPONSOR_FORM);
    setIsFormOpen(false);
  }

  function validateForm(): string | null {
    if (!form.title.trim()) return "Sponsor title is required.";
    if (!form.imageUrl.trim()) return "Sponsor image URL is required.";
    if (!isValidHttpUrl(form.imageUrl.trim())) return "Sponsor image URL must be a valid http(s) URL.";
    if (form.linkUrl.trim() && !isValidHttpUrl(form.linkUrl.trim())) return "Sponsor link URL must be a valid http(s) URL.";
    const displayOrder = Number.parseInt(form.displayOrder, 10);
    if (!Number.isFinite(displayOrder) || displayOrder < 0 || displayOrder > 999) {
      return "Display order must be between 0 and 999.";
    }
    if (form.startsAt && Number.isNaN(Date.parse(form.startsAt))) return "Start time must be a valid date.";
    if (form.endsAt && Number.isNaN(Date.parse(form.endsAt))) return "End time must be a valid date.";
    if (form.startsAt && form.endsAt && Date.parse(form.endsAt) < Date.parse(form.startsAt)) {
      return "End time must be after the start time.";
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const method = form.id ? "PATCH" : "POST";
      const res = await fetch("/api/admin", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "venue-screen-sponsors",
          id: form.id ?? undefined,
          venueId,
          title: form.title.trim(),
          imageUrl: form.imageUrl.trim(),
          linkUrl: form.linkUrl.trim() || undefined,
          displayOrder: Number.parseInt(form.displayOrder, 10) || 0,
          isActive: form.isActive,
          startsAt: normalizeDateTimeInput(form.startsAt),
          endsAt: normalizeDateTimeInput(form.endsAt),
        }),
      });
      const payload = (await res.json()) as { ok: boolean; item?: VenueScreenSponsor; error?: string };
      if (!res.ok || !payload.ok || !payload.item) {
        throw new Error(payload.error ?? "Failed to save sponsor.");
      }

      setSponsors((prev) => {
        const next = form.id
          ? prev.map((item) => (item.id === payload.item!.id ? payload.item! : item))
          : [...prev, payload.item!];
        return next
          .slice()
          .sort((a, b) => a.displayOrder - b.displayOrder || a.createdAt.localeCompare(b.createdAt));
      });
      setSuccess(form.id ? "Sponsor updated." : "Sponsor added.");
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sponsor.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this sponsor slot?")) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin?resource=venue-screen-sponsors&id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const payload = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to delete sponsor.");
      }
      setSponsors((prev) => prev.filter((item) => item.id !== id));
      setSuccess("Sponsor deleted.");
      if (form.id === id) {
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete sponsor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Sponsor Rotation</h3>
          <p className="text-xs text-slate-500">
            Manage the idle-screen sponsor slots shown at <code>/venue/{venueId}/screen</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setForm(BLANK_SPONSOR_FORM);
            setIsFormOpen(true);
            setError("");
            setSuccess("");
          }}
          className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          + Add Sponsor Slot
        </button>
      </div>

      {!sponsorsEnabled ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Sponsor rotation is currently disabled for this venue. You can still stage sponsor slots here and enable rotation above when ready.
        </div>
      ) : null}

      {success ? <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</div> : null}
      {error ? <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {isFormOpen ? (
        <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
          <div>
            <label className={adminLabel}>Sponsor Title *</label>
            <input className={adminField} value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
          </div>
          <div>
            <label className={adminLabel}>Display Order</label>
            <input
              type="number"
              min={0}
              max={999}
              className={adminField}
              value={form.displayOrder}
              onChange={(event) => setForm((prev) => ({ ...prev, displayOrder: event.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className={adminLabel}>Image URL *</label>
            <input className={adminField} value={form.imageUrl} onChange={(event) => setForm((prev) => ({ ...prev, imageUrl: event.target.value }))} />
          </div>
          <div className="md:col-span-2">
            <label className={adminLabel}>Link URL</label>
            <input className={adminField} value={form.linkUrl} onChange={(event) => setForm((prev) => ({ ...prev, linkUrl: event.target.value }))} />
          </div>
          <div>
            <label className={adminLabel}>Starts At</label>
            <input
              type="datetime-local"
              className={adminField}
              value={form.startsAt}
              onChange={(event) => setForm((prev) => ({ ...prev, startsAt: event.target.value }))}
            />
          </div>
          <div>
            <label className={adminLabel}>Ends At</label>
            <input
              type="datetime-local"
              className={adminField}
              value={form.endsAt}
              onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
            />
          </div>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700 md:col-span-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Sponsor slot is active
          </label>
          <div className="flex flex-col gap-3 md:col-span-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={busy}
              className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Saving..." : form.id ? "Update Sponsor" : "Create Sponsor"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={busy}
              className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className={TH}>Title</th>
              <th className={TH}>Order</th>
              <th className={TH}>Window</th>
              <th className={TH}>Status</th>
              <th className={`${TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-400">Loading sponsor slots...</td>
              </tr>
            ) : sponsors.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-slate-400">No sponsor slots yet.</td>
              </tr>
            ) : (
              sponsors.map((sponsor) => (
                <tr key={sponsor.id} className={TR}>
                  <td className={TD}>
                    <div className="font-medium text-slate-900">{sponsor.title}</div>
                    <div className="max-w-[320px] truncate text-xs text-slate-500">{sponsor.imageUrl}</div>
                  </td>
                  <td className={TD}>{sponsor.displayOrder}</td>
                  <td className={TD}>
                    <div className="text-slate-700">{sponsor.startsAt ? new Date(sponsor.startsAt).toLocaleString() : "Starts immediately"}</div>
                    <div className="text-xs text-slate-500">{sponsor.endsAt ? `Ends ${new Date(sponsor.endsAt).toLocaleString()}` : "No end date"}</div>
                  </td>
                  <td className={TD}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sponsor.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>
                      {sponsor.isActive ? "Active" : "Paused"}
                    </span>
                  </td>
                  <td className={`${TD} text-right`}>
                    <div className="inline-flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => {
                          setForm(sponsorToForm(sponsor));
                          setIsFormOpen(true);
                          setError("");
                          setSuccess("");
                        }}
                        className="min-h-[44px] rounded border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDelete(sponsor.id);
                        }}
                        className="min-h-[44px] rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type VenueFormProps = {
  title: string;
  venueId?: string;
  form: VenueFormState;
  onChange: (patch: Partial<VenueFormState>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  busy: boolean;
  error: string;
  submitLabel: string;
  mode: "create" | "edit";
};

function VenueForm({ title, venueId, form, onChange, onSubmit, onCancel, busy, error, submitLabel, mode }: VenueFormProps) {
  const field = adminField;
  const label = adminLabel;
  const readOnlyField = adminFieldReadOnly;

  const [manualMode, setManualMode] = useState(false);
  // Pin provenance drives the editor's label ("Pin set from your phone", etc.).
  // The desktop form never tracked this before Phase 4 — an existing venue's
  // stored coordinates are "on file", a blank create form has no pin yet.
  const [pinSource, setPinSource] = useState<PinSource>(mode === "edit" ? "existing" : "none");

  const lookup = useAddressLookup();
  const lookupInputRef = useRef<HTMLInputElement | null>(null);

  const latValue = Number.parseFloat(form.latitude);
  const lngValue = Number.parseFloat(form.longitude);
  const hasValidCoordinates = Number.isFinite(latValue) && Number.isFinite(lngValue);
  const radiusValue = Number.parseInt(form.radius, 10) || 150;

  /**
   * The single mutation path for pin + radius. GeofenceEditor owns no form
   * state, so a pin drag, GPS fix, dial move or typed coordinate all land here
   * as one value. `placeId` is cleared for the three sources that mean "the pin
   * no longer belongs to the looked-up Place" — the same rule the separate
   * lat/long inputs and map onChange each enforced inline before Phase 4.
   */
  function handleGeofenceChange(value: GeofenceEditorValue) {
    const detached = value.source === "gps" || value.source === "map" || value.source === "manual";
    onChange({
      latitude: String(value.lat),
      longitude: String(value.lng),
      radius: String(value.radius),
      ...(detached ? { placeId: "" } : {}),
    });
    setPinSource(value.source);
  }

  function clearAddressFields() {
    onChange({
      street: "",
      city: "",
      state: "",
      zipCode: "",
      country: "",
      latitude: "",
      longitude: "",
      placeId: "",
    });
    lookup.reset();
    setPinSource("none");
  }

  async function selectPrediction(prediction: AddressPrediction) {
    const details = await lookup.select(prediction);
    if (details) {
      onChange({
        street: details.street,
        city: details.city,
        state: details.state.toUpperCase(),
        zipCode: details.zipCode,
        country: details.country,
        latitude: String(details.latitude),
        longitude: String(details.longitude),
        placeId: details.placeId,
      });
      setPinSource("lookup");
      setManualMode(false);
    }
  }

  useEffect(() => {
    if (mode === "create") {
      lookupInputRef.current?.focus();
    }
  }, [mode]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {venueId ? <p className="mt-1 text-xs text-slate-500">Venue ID: <span className="font-mono">{venueId}</span></p> : null}
        </div>
        {venueId ? (
          <a
            href={`/venue/${encodeURIComponent(venueId)}/screen`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            Open Screen Preview
          </a>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={label}>Venue Name *</label>
          <input className={field} value={form.name} onChange={(event) => onChange({ name: event.target.value })} />
        </div>
        <div>
          <label className={label}>Display Name</label>
          <input className={field} value={form.displayName} onChange={(event) => onChange({ displayName: event.target.value })} />
        </div>
        <div className="md:col-span-2">
          <label className={label}>Address Lookup</label>
          <div className="relative">
            <input
              ref={lookupInputRef}
              value={lookup.query}
              onChange={(event) => lookup.handleInput(event.target.value)}
              onFocus={lookup.openIfPredictions}
              onBlur={() => {
                setTimeout(lookup.close, 120);
              }}
              placeholder={mode === "edit" ? "Change address?" : "Start typing an address (US-biased)"}
              className={field}
            />
            {lookup.loading ? <span className="absolute right-3 top-2.5 text-xs text-slate-400">…</span> : null}
            {lookup.open && lookup.predictions.length > 0 ? (
              <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {lookup.predictions.map((prediction) => (
                  <li key={prediction.placeId}>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        void selectPrediction(prediction);
                      }}
                      className="flex min-h-[44px] w-full flex-col items-start px-3 py-2 text-left hover:bg-indigo-50"
                    >
                      <span className="text-sm font-medium text-slate-800">{prediction.mainText || prediction.fullText}</span>
                      {prediction.secondaryText ? <span className="text-xs text-slate-500">{prediction.secondaryText}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearAddressFields}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Clear Address
            </button>
            <button
              type="button"
              onClick={() => {
                setManualMode((prev) => !prev);
                lookup.clearError();
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {manualMode ? "Use Lookup Mode" : "Can't find your address? Enter manually"}
            </button>
          </div>
          {lookup.error ? <p className="mt-1 text-xs text-amber-700">{lookup.error}</p> : null}
        </div>

        <div>
          <label className={label}>Street Address *</label>
          <input
            className={manualMode ? field : readOnlyField}
            readOnly={!manualMode}
            value={form.street}
            onChange={(event) => onChange({ street: event.target.value })}
          />
        </div>
        <div>
          <label className={label}>City *</label>
          <input
            className={manualMode ? field : readOnlyField}
            readOnly={!manualMode}
            value={form.city}
            onChange={(event) => onChange({ city: event.target.value })}
          />
        </div>
        <div>
          <label className={label}>State *</label>
          <input
            className={manualMode ? field : readOnlyField}
            readOnly={!manualMode}
            value={form.state}
            maxLength={2}
            onChange={(event) => onChange({ state: event.target.value.toUpperCase() })}
          />
        </div>
        <div>
          <label className={label}>ZIP Code *</label>
          <input
            className={manualMode ? field : readOnlyField}
            readOnly={!manualMode}
            value={form.zipCode}
            onChange={(event) => onChange({ zipCode: event.target.value })}
          />
        </div>
        <div>
          <label className={label}>Country *</label>
          <input
            className={manualMode ? field : readOnlyField}
            readOnly={!manualMode}
            value={form.country}
            onChange={(event) => onChange({ country: event.target.value })}
          />
        </div>
        {/*
          Venue-activation Phase 4: the pin, the map and the radius dial are one
          block sitting immediately after the address, so the flow reads
          top-to-bottom — find the address, confirm the circle, activate. The
          old bare "Geofence Radius (m)" number box and the raw lat/long inputs
          are gone from the critical path; the dial owns the radius and the
          editor's own "Advanced" disclosure owns the coordinates.
        */}
        <div className="md:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <label className={label}>Venue Pin &amp; Geofence *</label>
            {hasValidCoordinates && (
              <a
                href={`https://maps.google.com/?q=${latValue},${lngValue}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Open in Google Maps ↗
              </a>
            )}
          </div>
          {form.placeId ? (
            <p className="mb-1.5 text-xs text-slate-500">
              Place ID: <span className="font-mono">{form.placeId}</span>
            </p>
          ) : hasValidCoordinates ? (
            <p className="mb-1.5 text-xs text-amber-700">Coordinates set manually — no Place ID on record.</p>
          ) : null}
          <GeofenceEditor
            latitude={hasValidCoordinates ? latValue : null}
            longitude={hasValidCoordinates ? lngValue : null}
            radius={radiusValue}
            source={pinSource}
            onChange={handleGeofenceChange}
          />
        </div>

        <div>
          <label className={label}>County</label>
          <input className={field} value={form.county} onChange={(event) => onChange({ county: event.target.value })} />
        </div>
        <div>
          <label className={label}>Region</label>
          <input className={field} value={form.region} onChange={(event) => onChange({ region: event.target.value })} />
        </div>

        <div className="md:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Venue Screen Settings</h3>
            <p className="mt-1 text-xs text-slate-500">Configure the public TV/projector display at the venue screen URL.</p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.screenEnabled} onChange={(event) => onChange({ screenEnabled: event.target.checked })} />
                Venue screen is enabled
              </label>
              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.screenSponsorRotationEnabled}
                  onChange={(event) => onChange({ screenSponsorRotationEnabled: event.target.checked })}
                />
                Sponsor rotation is enabled
              </label>
              <div className="md:col-span-2">
                <label className={label}>Brand Image URL</label>
                <input
                  className={field}
                  placeholder="https://cdn.example.com/venue-screen-brand.png"
                  value={form.screenBrandImageUrl}
                  onChange={(event) => onChange({ screenBrandImageUrl: event.target.value })}
                />
              </div>
              <div>
                <label className={label}>Primary Brand Color</label>
                <input
                  className={field}
                  placeholder="#0f172a"
                  value={form.screenBrandPrimary}
                  onChange={(event) => onChange({ screenBrandPrimary: event.target.value })}
                />
              </div>
              <div>
                <label className={label}>Secondary Brand Color</label>
                <input
                  className={field}
                  placeholder="#f59e0b"
                  value={form.screenBrandSecondary}
                  onChange={(event) => onChange({ screenBrandSecondary: event.target.value })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <button
          onClick={onSubmit}
          disabled={busy}
          className="min-h-[44px] rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Saving..." : submitLabel}
        </button>
        {onCancel ? (
          <button
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px] rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {venueId ? (
        <div className="mt-6">
          <VenueScreenSponsorManager venueId={venueId} sponsorsEnabled={form.screenSponsorRotationEnabled} />
        </div>
      ) : null}
    </div>
  );
}

type VenuesSectionProps = {
  venues: Venue[];
  onVenueCreated: (venue: Venue) => void;
  onVenueUpdated: (venue: Venue) => void;
  onVenueDeleted: (venueId: string) => void;
};

type ViewMode = "list" | "create" | "edit";

export function VenuesSection({ venues, onVenueCreated, onVenueUpdated, onVenueDeleted }: VenuesSectionProps) {
  const [mode, setMode] = useState<ViewMode>("list");
  const [venueList, setVenueList] = useState<Venue[]>(venues);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [form, setForm] = useState<VenueFormState>(BLANK_VENUE_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const deletion = useVenueDeletion({
    onOpened: () => {
      setError("");
      setSuccessMsg("");
    },
    onDeleted: (venue, message) => {
      setVenueList((prev) => prev.filter((entry) => entry.id !== venue.id));
      onVenueDeleted(venue.id);
      setSuccessMsg(message);
    },
  });

  useEffect(() => {
    setVenueList(venues);
  }, [venues]);

  const sortedVenues = useMemo(() => {
    // Dedupe by id defensively — a duplicate id would otherwise collide as a
    // React key and drop/duplicate table rows.
    const seen = new Set<string>();
    const list = venueList.filter((venue) => {
      if (seen.has(venue.id)) return false;
      seen.add(venue.id);
      return true;
    });
    list.sort((a, b) => {
      const getValue = (venue: Venue) => {
        if (sortBy === "name") return venue.name;
        if (sortBy === "street") return venue.street ?? venue.address ?? "";
        if (sortBy === "city") return venue.city ?? "";
        if (sortBy === "state") return venue.state ?? "";
        return venue.zipCode ?? "";
      };

      const valueA = getValue(a).toLowerCase();
      const valueB = getValue(b).toLowerCase();
      if (valueA === valueB) return 0;
      const cmp = valueA > valueB ? 1 : -1;
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return list;
  }, [venueList, sortBy, sortDirection]);

  function toggleSort(nextSort: SortKey) {
    if (sortBy === nextSort) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(nextSort);
    setSortDirection("asc");
  }

  function patchForm(patch: Partial<VenueFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setError("");
  }

  function startCreate() {
    setForm(BLANK_VENUE_FORM);
    setEditingVenue(null);
    setError("");
    setSuccessMsg("");
    setMode("create");
  }

  function startEdit(venue: Venue) {
    setEditingVenue(venue);
    setForm(venueToForm(venue));
    setError("");
    setSuccessMsg("");
    setMode("edit");
  }

  async function handleCreate() {
    const validationError = validateVenueForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "venues", ...buildVenuePayload(form) }),
      });
      const payload = (await res.json()) as { ok: boolean; item?: Venue; error?: string };
      if (!payload.ok || !payload.item) throw new Error(payload.error ?? "Failed to create venue.");

      onVenueCreated(payload.item);
      setVenueList((prev) => [payload.item!, ...prev]);
      setSuccessMsg(`Venue "${payload.item.name}" created successfully.`);
      setForm(BLANK_VENUE_FORM);
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create venue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit() {
    if (!editingVenue) return;
    const validationError = validateVenueForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource: "venues", id: editingVenue.id, ...buildVenuePayload(form) }),
      });
      const payload = (await res.json()) as { ok: boolean; item?: Venue; error?: string };
      if (!payload.ok || !payload.item) throw new Error(payload.error ?? "Failed to update venue.");

      setVenueList((prev) => prev.map((venue) => (venue.id === payload.item!.id ? payload.item! : venue)));
      onVenueUpdated(payload.item);
      setEditingVenue(payload.item);
      setSuccessMsg(`Venue "${payload.item.name}" updated.`);
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update venue.");
    } finally {
      setBusy(false);
    }
  }


  if (mode === "create") {
    return (
      <VenueForm
        key="venue-create"
        title="Create New Venue"
        form={form}
        onChange={patchForm}
        onSubmit={handleCreate}
        onCancel={() => setMode("list")}
        busy={busy}
        error={error}
        // Phase 4: both surfaces say the same thing on create. The mobile flow
        // has always read "Activate venue"; desktop's generic "Create Venue"
        // was the odd one out.
        submitLabel="Activate Venue"
        mode="create"
      />
    );
  }

  if (mode === "edit" && editingVenue) {
    return (
      <VenueForm
        key={`venue-edit-${editingVenue.id}`}
        title={`Editing: ${editingVenue.name}`}
        venueId={editingVenue.id}
        form={form}
        onChange={patchForm}
        onSubmit={handleEdit}
        onCancel={() => setMode("list")}
        busy={busy}
        error={error}
        submitLabel="Save Changes"
        mode="edit"
      />
    );
  }

  const sortLabel = (key: SortKey, text: string) => `${text}${sortBy === key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}`;

  return (
    <div className="space-y-4">
      {successMsg ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMsg}</div> : null}
      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Venues</h2>
            <p className="text-xs text-slate-500">{venueList.length} venues</p>
          </div>
          <button
            onClick={startCreate}
            className="min-h-[44px] w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 sm:w-auto"
          >
            + Add Venue
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("name")}>{sortLabel("name", "Name")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("street")}>{sortLabel("street", "Street")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("city")}>{sortLabel("city", "City")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("state")}>{sortLabel("state", "State")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("zipCode")}>{sortLabel("zipCode", "Zip")}</th>
                <th className={TH}>Screen</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedVenues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">No venues yet. Create one above.</td>
                </tr>
              ) : (
                sortedVenues.map((venue) => (
                  <tr key={venue.id} className={TR}>
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        {venue.iconEmoji ? <span>{venue.iconEmoji}</span> : null}
                        <span className="font-medium text-slate-900">{venue.name}</span>
                        {isVenueAddressIncomplete(venue) ? (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Address incomplete
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${TD} max-w-[280px] truncate text-slate-600`}>{venue.street ?? venue.address ?? "-"}</td>
                    <td className={`${TD} text-slate-600`}>{venue.city ?? "-"}</td>
                    <td className={`${TD} text-slate-600`}>{venue.state ?? "-"}</td>
                    <td className={`${TD} text-slate-600`}>{venue.zipCode ?? "-"}</td>
                    <td className={TD}>
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${venue.screenEnabled === false ? "bg-slate-200 text-slate-700" : "bg-emerald-100 text-emerald-800"}`}>
                          {venue.screenEnabled === false ? "Disabled" : "Enabled"}
                        </span>
                        <a href={`/venue/${encodeURIComponent(venue.id)}/screen`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline">
                          Preview screen
                        </a>
                      </div>
                    </td>
                    <td className={`${TD} text-right`}>
                      <div className="inline-flex flex-col gap-2 sm:flex-row">
                        <button
                          onClick={() => startEdit(venue)}
                          disabled={busy}
                          className="min-h-[44px] rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            void deletion.open(venue);
                          }}
                          disabled={busy || deletion.busy}
                          className="min-h-[44px] rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteVenueModal deletion={deletion} />
    </div>
  );
}
