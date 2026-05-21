"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Venue } from "@/types";
import { TH, TD, TR } from "@/components/admin/AdminShell";

type AddressSuggestion = {
  label: string;
  latitude: number;
  longitude: number;
};

type SortKey = "name" | "city" | "state" | "zipCode" | "address";

type VenueFormState = {
  name: string;
  displayName: string;
  logoText: string;
  iconEmoji: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  region: string;
  radius: string;
  latitude: string;
  longitude: string;
};

const BLANK_FORM: VenueFormState = {
  name: "",
  displayName: "",
  logoText: "",
  iconEmoji: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  county: "",
  region: "",
  radius: "100",
  latitude: "",
  longitude: "",
};

function venueToForm(v: Venue): VenueFormState {
  return {
    name: v.name,
    displayName: v.displayName ?? "",
    logoText: v.logoText ?? "",
    iconEmoji: v.iconEmoji ?? "",
    address: v.address ?? "",
    city: v.city ?? "",
    state: v.state ?? "",
    zipCode: v.zipCode ?? "",
    county: v.county ?? "",
    region: v.region ?? "",
    radius: String(v.radius),
    latitude: String(v.latitude),
    longitude: String(v.longitude),
  };
}

function parseAddressBits(label: string): Partial<Pick<VenueFormState, "city" | "state" | "zipCode">> {
  const normalized = label.trim();
  if (!normalized) return {};

  // Typical patterns: "Street, City, ST 12345, USA" or "Street, City, ST"
  const segments = normalized.split(",").map((item) => item.trim()).filter(Boolean);
  if (segments.length < 2) return {};

  const city = segments.length >= 2 ? segments[segments.length - 3] ?? segments[segments.length - 2] : "";
  const stateZipCandidate = segments[segments.length - 2] ?? "";
  const match = stateZipCandidate.match(/\b([A-Z]{2})\b(?:\s+(\d{5}(?:-\d{4})?))?/);

  return {
    city: city || "",
    state: match?.[1] ?? "",
    zipCode: match?.[2] ?? "",
  };
}

type AddressInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
};

function AddressInput({ value, onChange, onSelect }: AddressInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());

  function handleInput(raw: string) {
    onChange(raw);
    const q = raw.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const cacheKey = q.toLowerCase();
      const cached = cacheRef.current.get(cacheKey);
      if (cached) {
        setSuggestions(cached);
        setOpen(cached.length > 0);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`/api/admin/places?q=${encodeURIComponent(q)}&limit=6&provider=google`, {
          cache: "no-store",
        });
        const payload = (await res.json()) as { ok: boolean; suggestions?: AddressSuggestion[] };
        const items = payload.suggestions ?? [];
        cacheRef.current.set(cacheKey, items);
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(event) => handleInput(event.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="123 Main St, City, ST 12345"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      {loading ? <span className="absolute right-3 top-2.5 text-xs text-slate-400">…</span> : null}
      {open && suggestions.length > 0 ? (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.label}-${index}`}
              onMouseDown={() => {
                onSelect(suggestion);
                onChange(suggestion.label);
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-indigo-50"
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
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
};

function VenueForm({ title, form, onChange, onSubmit, onCancel, busy, error, submitLabel }: VenueFormProps) {
  const field =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
  const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-base font-semibold text-slate-900">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={label}>Venue Name *</label>
          <input className={field} value={form.name} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div>
          <label className={label}>Display Name</label>
          <input className={field} value={form.displayName} onChange={(e) => onChange({ displayName: e.target.value })} />
        </div>
        <div>
          <label className={label}>Logo Text</label>
          <input className={field} value={form.logoText} onChange={(e) => onChange({ logoText: e.target.value })} />
        </div>
        <div>
          <label className={label}>Icon Emoji</label>
          <input className={field} value={form.iconEmoji} onChange={(e) => onChange({ iconEmoji: e.target.value })} />
        </div>

        <div className="md:col-span-2">
          <label className={label}>Address *</label>
          <AddressInput
            value={form.address}
            onChange={(address) => {
              onChange({ address });
              const parsed = parseAddressBits(address);
              onChange({
                city: form.city || parsed.city || "",
                state: form.state || parsed.state || "",
                zipCode: form.zipCode || parsed.zipCode || "",
              });
            }}
            onSelect={(suggestion) => {
              const parsed = parseAddressBits(suggestion.label);
              onChange({
                address: suggestion.label,
                latitude: String(suggestion.latitude),
                longitude: String(suggestion.longitude),
                city: parsed.city || form.city,
                state: parsed.state || form.state,
                zipCode: parsed.zipCode || form.zipCode,
              });
            }}
          />
        </div>

        <div>
          <label className={label}>City</label>
          <input className={field} value={form.city} onChange={(e) => onChange({ city: e.target.value })} />
        </div>
        <div>
          <label className={label}>State</label>
          <input className={field} value={form.state} onChange={(e) => onChange({ state: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <label className={label}>ZIP Code</label>
          <input className={field} value={form.zipCode} onChange={(e) => onChange({ zipCode: e.target.value })} />
        </div>
        <div>
          <label className={label}>County</label>
          <input className={field} value={form.county} onChange={(e) => onChange({ county: e.target.value })} />
        </div>
        <div>
          <label className={label}>Region</label>
          <input className={field} value={form.region} onChange={(e) => onChange({ region: e.target.value })} />
        </div>
        <div>
          <label className={label}>Geofence Radius (m) *</label>
          <input
            type="number"
            min={25}
            max={2000}
            className={field}
            value={form.radius}
            onChange={(e) => onChange({ radius: e.target.value })}
          />
        </div>
        <div>
          <label className={label}>Latitude</label>
          <input className={field} value={form.latitude} onChange={(e) => onChange({ latitude: e.target.value })} />
        </div>
        <div>
          <label className={label}>Longitude</label>
          <input className={field} value={form.longitude} onChange={(e) => onChange({ longitude: e.target.value })} />
        </div>
      </div>

      {error ? <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Saving..." : submitLabel}
        </button>
        {onCancel ? (
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
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
        if (sortBy === "city") return venue.city ?? "";
        if (sortBy === "state") return venue.state ?? "";
        if (sortBy === "zipCode") return venue.zipCode ?? "";
        return venue.address ?? "";
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
      address: form.address.trim(),
      radius: parseInt(form.radius, 10) || 100,
      latitude: form.latitude ? parseFloat(form.latitude) : undefined,
      longitude: form.longitude ? parseFloat(form.longitude) : undefined,
      displayName: form.displayName.trim() || undefined,
      logoText: form.logoText.trim() || undefined,
      iconEmoji: form.iconEmoji.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      zipCode: form.zipCode.trim() || undefined,
      county: form.county.trim() || undefined,
      region: form.region.trim() || undefined,
    };
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
      setSuccessMsg(`Venue \"${payload.item.name}\" created successfully.`);
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
      setSuccessMsg(`Venue \"${payload.item.name}\" updated.`);
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update venue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(venue: Venue) {
    if (!confirm(`Delete venue \"${venue.name}\"? This action cannot be undone.`)) return;
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
      setSuccessMsg(`Venue \"${venue.name}\" deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete venue.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "create") {
    return (
      <VenueForm
        title="Create New Venue"
        form={form}
        onChange={patchForm}
        onSubmit={handleCreate}
        onCancel={() => setMode("list")}
        busy={busy}
        error={error}
        submitLabel="Create Venue"
      />
    );
  }

  if (mode === "edit" && editingVenue) {
    return (
      <VenueForm
        title={`Editing: ${editingVenue.name}`}
        form={form}
        onChange={patchForm}
        onSubmit={handleEdit}
        onCancel={() => setMode("list")}
        busy={busy}
        error={error}
        submitLabel="Save Changes"
      />
    );
  }

  const sortLabel = (key: SortKey, label: string) =>
    `${label}${sortBy === key ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}`;

  return (
    <div className="space-y-4">
      {successMsg ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{successMsg}</div> : null}
      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Venues</h2>
            <p className="text-xs text-slate-500">{venueList.length} venues</p>
          </div>
          <button
            onClick={startCreate}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Create Venue
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("name")}>{sortLabel("name", "Name")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("city")}>{sortLabel("city", "City")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("state")}>{sortLabel("state", "State")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("zipCode")}>{sortLabel("zipCode", "Zip")}</th>
                <th className={`${TH} cursor-pointer`} onClick={() => toggleSort("address")}>{sortLabel("address", "Address")}</th>
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
                      </div>
                    </td>
                    <td className={`${TD} text-slate-600`}>{venue.city ?? "-"}</td>
                    <td className={`${TD} text-slate-600`}>{venue.state ?? "-"}</td>
                    <td className={`${TD} text-slate-600`}>{venue.zipCode ?? "-"}</td>
                    <td className={`${TD} max-w-xs truncate text-slate-500`}>{venue.address ?? "-"}</td>
                    <td className={`${TD} text-right`}>
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => startEdit(venue)}
                          disabled={busy}
                          className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            void handleDelete(venue);
                          }}
                          disabled={busy}
                          className="rounded border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
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
