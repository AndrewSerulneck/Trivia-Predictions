"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Venue } from "@/types";
import { TH, TD, TR } from "@/components/admin/AdminShell";

type AddressPrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
};

type AddressDetails = {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

type SortKey = "name" | "street" | "city" | "state" | "zipCode";

type VenueFormState = {
  name: string;
  displayName: string;
  logoText: string;
  iconEmoji: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  county: string;
  region: string;
  radius: string;
  latitude: string;
  longitude: string;
  placeId: string;
};

const LOOKUP_INACTIVITY_MS = 5 * 60 * 1000;
const PREDICT_DEBOUNCE_MS = 300;

const BLANK_FORM: VenueFormState = {
  name: "",
  displayName: "",
  logoText: "",
  iconEmoji: "",
  street: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
  county: "",
  region: "",
  radius: "100",
  latitude: "",
  longitude: "",
  placeId: "",
};

function venueToForm(v: Venue): VenueFormState {
  return {
    name: v.name,
    displayName: v.displayName ?? "",
    logoText: v.logoText ?? "",
    iconEmoji: v.iconEmoji ?? "",
    street: v.street ?? v.address ?? "",
    city: v.city ?? "",
    state: v.state ?? "",
    zipCode: v.zipCode ?? "",
    country: v.country ?? "",
    county: v.county ?? "",
    region: v.region ?? "",
    radius: String(v.radius),
    latitude: String(v.latitude),
    longitude: String(v.longitude),
    placeId: v.placeId ?? "",
  };
}

function formatAddressDisplay(venue: Venue): string {
  const street = venue.street ?? venue.address ?? "";
  const cityStateZip = [venue.city ?? "", [venue.state ?? "", venue.zipCode ?? ""].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

function buildAddressLabel(form: VenueFormState): string {
  const cityStateZip = [form.city.trim(), [form.state.trim(), form.zipCode.trim()].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [form.street.trim(), cityStateZip, form.country.trim()].filter(Boolean).join(", ");
}

function isVenueAddressIncomplete(venue: Venue): boolean {
  const street = String(venue.street ?? venue.address ?? "").trim();
  const city = String(venue.city ?? "").trim();
  const state = String(venue.state ?? "").trim();
  const zipCode = String(venue.zipCode ?? "").trim();
  const lat = Number(venue.latitude);
  const lng = Number(venue.longitude);
  const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  return !street || !city || !state || !zipCode || !hasValidCoords;
}

function createSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 36);
  }
  return Math.random().toString(36).slice(2).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
}

type VenueFormProps = {
  title: string;
  form: VenueFormState;
  onChange: (patch: Partial<VenueFormState>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  busy: boolean;
  error: string;
  submitLabel: string;
  mode: "create" | "edit";
};

function VenueForm({ title, form, onChange, onSubmit, onCancel, busy, error, submitLabel, mode }: VenueFormProps) {
  const field =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
  const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";
  const readOnlyField =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700";

  const [lookupQuery, setLookupQuery] = useState("");
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [manualMode, setManualMode] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<string>("");
  const lastSessionActivityRef = useRef<number>(0);
  const lookupInputRef = useRef<HTMLInputElement | null>(null);

  const latValue = Number.parseFloat(form.latitude);
  const lngValue = Number.parseFloat(form.longitude);
  const hasValidCoordinates = Number.isFinite(latValue) && Number.isFinite(lngValue);

  function ensureLookupSessionToken(): string {
    const now = Date.now();
    if (!sessionTokenRef.current || now - lastSessionActivityRef.current > LOOKUP_INACTIVITY_MS) {
      sessionTokenRef.current = createSessionToken();
    }
    lastSessionActivityRef.current = now;
    return sessionTokenRef.current;
  }

  function resetLookupSession() {
    sessionTokenRef.current = "";
    lastSessionActivityRef.current = 0;
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
    setLookupQuery("");
    setPredictions([]);
    setLookupOpen(false);
    setLookupError("");
    resetLookupSession();
  }

  async function loadPredictions(query: string) {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setPredictions([]);
      setLookupOpen(false);
      return;
    }

    setLookupLoading(true);
    setLookupError("");
    try {
      const sessionToken = ensureLookupSessionToken();
      const response = await fetch("/api/geolocation/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, sessionToken }),
      });
      const payload = (await response.json()) as { ok: boolean; predictions?: AddressPrediction[]; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load address predictions.");
      }

      setPredictions(payload.predictions ?? []);
      setLookupOpen((payload.predictions ?? []).length > 0);
    } catch (lookupErr) {
      setPredictions([]);
      setLookupOpen(false);
      setLookupError(lookupErr instanceof Error ? lookupErr.message : "Address lookup is unavailable right now.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function selectPrediction(prediction: AddressPrediction) {
    setLookupLoading(true);
    setLookupError("");
    try {
      const sessionToken = ensureLookupSessionToken();
      const response = await fetch("/api/geolocation/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: prediction.placeId, sessionToken }),
      });
      const payload = (await response.json()) as { ok: boolean; details?: AddressDetails; error?: string };
      if (!response.ok || !payload.ok || !payload.details) {
        throw new Error(payload.error ?? "Failed to resolve address details.");
      }

      const details = payload.details;
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
      setLookupQuery(prediction.fullText || [prediction.mainText, prediction.secondaryText].filter(Boolean).join(", "));
      setPredictions([]);
      setLookupOpen(false);
      setManualMode(false);
      lastSessionActivityRef.current = Date.now();
    } catch (lookupErr) {
      setLookupError(lookupErr instanceof Error ? lookupErr.message : "Failed to resolve address.");
    } finally {
      setLookupLoading(false);
    }
  }

  function handleLookupInput(raw: string) {
    setLookupQuery(raw);
    setLookupError("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (raw.trim().length < 3) {
      setPredictions([]);
      setLookupOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void loadPredictions(raw);
    }, PREDICT_DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (mode === "create") {
      lookupInputRef.current?.focus();
    }
  }, [mode]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      <h2 className="mb-5 text-base font-semibold text-slate-900">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={label}>Venue Name *</label>
          <input className={field} value={form.name} onChange={(event) => onChange({ name: event.target.value })} />
        </div>
        <div>
          <label className={label}>Display Name</label>
          <input className={field} value={form.displayName} onChange={(event) => onChange({ displayName: event.target.value })} />
        </div>
        <div>
          <label className={label}>Logo Text</label>
          <input className={field} value={form.logoText} onChange={(event) => onChange({ logoText: event.target.value })} />
        </div>
        <div>
          <label className={label}>Icon Emoji</label>
          <input className={field} value={form.iconEmoji} onChange={(event) => onChange({ iconEmoji: event.target.value })} />
        </div>

        <div className="md:col-span-2">
          <label className={label}>Address Lookup</label>
          <div className="relative">
            <input
              ref={lookupInputRef}
              value={lookupQuery}
              onChange={(event) => handleLookupInput(event.target.value)}
              onFocus={() => {
                ensureLookupSessionToken();
                if (predictions.length > 0) setLookupOpen(true);
              }}
              onBlur={() => {
                setTimeout(() => setLookupOpen(false), 120);
              }}
              placeholder={mode === "edit" ? "Change address?" : "Start typing an address (US-biased)"}
              className={field}
            />
            {lookupLoading ? <span className="absolute right-3 top-2.5 text-xs text-slate-400">…</span> : null}
            {lookupOpen && predictions.length > 0 ? (
              <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {predictions.map((prediction) => (
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
                setLookupError("");
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {manualMode ? "Use Lookup Mode" : "Can't find your address? Enter manually"}
            </button>
          </div>
          {lookupError ? <p className="mt-1 text-xs text-amber-700">{lookupError}</p> : null}
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
        <div>
          <label className={label}>Geofence Radius (m) *</label>
          <input
            type="number"
            min={25}
            max={2000}
            className={field}
            value={form.radius}
            onChange={(event) => onChange({ radius: event.target.value })}
          />
        </div>
        <div>
          <label className={label}>Latitude *</label>
          <input
            className={field}
            value={form.latitude}
            onChange={(event) => onChange({ latitude: event.target.value, placeId: "" })}
          />
        </div>
        <div>
          <label className={label}>Longitude *</label>
          <input
            className={field}
            value={form.longitude}
            onChange={(event) => onChange({ longitude: event.target.value, placeId: "" })}
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

        {hasValidCoordinates ? (
          <div className="md:col-span-2">
            <div className="mb-1 flex items-center justify-between">
              <label className={label}>Map Preview</label>
              <a
                href={`https://maps.google.com/?q=${latValue},${lngValue}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                Open in Google Maps ↗
              </a>
            </div>
            {form.placeId ? (
              <p className="mb-1.5 text-xs text-slate-500">
                Place ID: <span className="font-mono">{form.placeId}</span>
              </p>
            ) : (
              <p className="mb-1.5 text-xs text-amber-700">Coordinates set manually — no Place ID on record.</p>
            )}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <iframe
                title="Venue Location Preview"
                className="h-56 w-full"
                loading="lazy"
                src={`https://www.google.com/maps?q=${encodeURIComponent(`${latValue},${lngValue}`)}&z=15&output=embed`}
              />
            </div>
          </div>
        ) : null}
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
    </div>
  );
}

type VenuesSectionProps = {
  venues: Venue[];
  onVenueCreated: (venue: Venue) => void;
};

type ViewMode = "list" | "create" | "edit";

export function VenuesSection({ venues, onVenueCreated }: VenuesSectionProps) {
  const [mode, setMode] = useState<ViewMode>("list");
  const [venueList, setVenueList] = useState<Venue[]>(venues);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [form, setForm] = useState<VenueFormState>(BLANK_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    setVenueList(venues);
  }, [venues]);

  const sortedVenues = useMemo(() => {
    const list = [...venueList];
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

  function buildVenuePayload() {
    return {
      name: form.name.trim(),
      street: form.street.trim(),
      address: buildAddressLabel(form),
      radius: Number.parseInt(form.radius, 10) || 100,
      latitude: form.latitude ? Number.parseFloat(form.latitude) : undefined,
      longitude: form.longitude ? Number.parseFloat(form.longitude) : undefined,
      displayName: form.displayName.trim() || undefined,
      logoText: form.logoText.trim() || undefined,
      iconEmoji: form.iconEmoji.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim().toUpperCase() || undefined,
      zipCode: form.zipCode.trim() || undefined,
      country: form.country.trim() || undefined,
      county: form.county.trim() || undefined,
      region: form.region.trim() || undefined,
      placeId: form.placeId.trim() || undefined,
    };
  }

  function validateVenueForm(): string | null {
    if (!form.name.trim()) return "Venue name is required.";
    if (!form.street.trim()) return "Street address is required.";
    if (!form.city.trim()) return "City is required.";
    if (!form.state.trim()) return "State is required.";
    if (!form.zipCode.trim()) return "ZIP code is required.";
    if (!form.country.trim()) return "Country is required.";

    const latitude = Number.parseFloat(form.latitude);
    const longitude = Number.parseFloat(form.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return "Latitude must be between -90 and 90.";
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return "Longitude must be between -180 and 180.";
    }
    return null;
  }

  function startCreate() {
    setForm(BLANK_FORM);
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
    const validationError = validateVenueForm();
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
        body: JSON.stringify({ resource: "venues", ...buildVenuePayload() }),
      });
      const payload = (await res.json()) as { ok: boolean; item?: Venue; error?: string };
      if (!payload.ok || !payload.item) throw new Error(payload.error ?? "Failed to create venue.");

      onVenueCreated(payload.item);
      setVenueList((prev) => [payload.item!, ...prev]);
      setSuccessMsg(`Venue "${payload.item.name}" created successfully.`);
      setForm(BLANK_FORM);
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create venue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit() {
    if (!editingVenue) return;
    const validationError = validateVenueForm();
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
        body: JSON.stringify({ resource: "venues", id: editingVenue.id, ...buildVenuePayload() }),
      });
      const payload = (await res.json()) as { ok: boolean; item?: Venue; error?: string };
      if (!payload.ok || !payload.item) throw new Error(payload.error ?? "Failed to update venue.");

      setVenueList((prev) => prev.map((venue) => (venue.id === payload.item!.id ? payload.item! : venue)));
      setSuccessMsg(`Venue "${payload.item.name}" updated.`);
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update venue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(venue: Venue) {
    if (!confirm(`Delete venue "${venue.name}"? This action cannot be undone.`)) return;
    setBusy(true);
    setError("");
    setSuccessMsg("");

    try {
      const response = await fetch(`/api/admin?resource=venues&id=${encodeURIComponent(venue.id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to delete venue.");
      }

      setVenueList((prev) => prev.filter((entry) => entry.id !== venue.id));
      setSuccessMsg(`Venue "${venue.name}" deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete venue.");
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
        submitLabel="Create Venue"
        mode="create"
      />
    );
  }

  if (mode === "edit" && editingVenue) {
    return (
      <VenueForm
        key={`venue-edit-${editingVenue.id}`}
        title={`Editing: ${editingVenue.name}`}
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

  const sortLabel = (key: SortKey, text: string) =>
    `${text}${sortBy === key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}`;

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
            + Create Venue
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
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedVenues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">No venues yet. Create one above.</td>
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
                            void handleDelete(venue);
                          }}
                          disabled={busy}
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
    </div>
  );
}
