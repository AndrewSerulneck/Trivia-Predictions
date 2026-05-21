"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Venue } from "@/types";
import { TH, TD, TR } from "@/components/admin/AdminShell";

// ─── Types ────────────────────────────────────────────────────────────────────

type AddressSuggestion = {
  label: string;
  latitude: number;
  longitude: number;
};

type VenueFormState = {
  name: string;
  displayName: string;
  logoText: string;
  iconEmoji: string;
  address: string;
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
    radius: String(v.radius),
    latitude: String(v.latitude),
    longitude: String(v.longitude),
  };
}

// ─── Address Autocomplete ─────────────────────────────────────────────────────

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
      const key = q.toLowerCase();
      const cached = cacheRef.current.get(key);
      if (cached) {
        setSuggestions(cached);
        setOpen(true);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/places?q=${encodeURIComponent(q)}&limit=6&provider=google`,
          { cache: "no-store" }
        );
        const payload = (await res.json()) as {
          ok: boolean;
          suggestions?: AddressSuggestion[];
        };
        const items = payload.suggestions ?? [];
        cacheRef.current.set(key, items);
        setSuggestions(items);
        setOpen(items.length > 0);
      } catch {
        setSuggestions([]);
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
        onChange={(e) => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="123 Main St, City, ST 12345"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
      {loading && (
        <span className="absolute right-3 top-2.5 text-xs text-slate-400">…</span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={() => {
                onSelect(s);
                onChange(s.label);
                setOpen(false);
              }}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-indigo-50"
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Venue Form ───────────────────────────────────────────────────────────────

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

function VenueForm({
  title,
  form,
  onChange,
  onSubmit,
  onCancel,
  busy,
  error,
  submitLabel,
}: VenueFormProps) {
  const field =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
  const label = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-base font-semibold text-slate-900">{title}</h2>
      <div className="grid grid-cols-2 gap-5">
        <div>
          <label className={label}>Venue Name *</label>
          <input
            className={field}
            value={form.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="The Rusty Anchor"
          />
        </div>
        <div>
          <label className={label}>Display Name</label>
          <input
            className={field}
            value={form.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
            placeholder="Rusty Anchor (optional override)"
          />
        </div>
        <div>
          <label className={label}>Logo Text</label>
          <input
            className={field}
            value={form.logoText}
            onChange={(e) => onChange({ logoText: e.target.value })}
            placeholder="RA"
          />
        </div>
        <div>
          <label className={label}>Icon Emoji</label>
          <input
            className={field}
            value={form.iconEmoji}
            onChange={(e) => onChange({ iconEmoji: e.target.value })}
            placeholder="⚓"
          />
        </div>
        <div className="col-span-2">
          <label className={label}>Address *</label>
          <AddressInput
            value={form.address}
            onChange={(v) => onChange({ address: v })}
            onSelect={(s) =>
              onChange({
                address: s.label,
                latitude: String(s.latitude),
                longitude: String(s.longitude),
              })
            }
          />
        </div>
        <div>
          <label className={label}>Latitude</label>
          <input
            className={field}
            value={form.latitude}
            onChange={(e) => onChange({ latitude: e.target.value })}
            placeholder="Auto-filled from address"
          />
        </div>
        <div>
          <label className={label}>Longitude</label>
          <input
            className={field}
            value={form.longitude}
            onChange={(e) => onChange({ longitude: e.target.value })}
            placeholder="Auto-filled from address"
          />
        </div>
        <div>
          <label className={label}>Geofence Radius (meters) *</label>
          <input
            type="number"
            min={10}
            max={50000}
            className={field}
            value={form.radius}
            onChange={(e) => onChange({ radius: e.target.value })}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────

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

  useEffect(() => {
    setVenueList(venues);
  }, [venues]);

  function patchForm(patch: Partial<VenueFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setError("");
  }

  // ── Create ──────────────────────────────────────────────────────────────

  function startCreate() {
    setForm(BLANK_FORM);
    setError("");
    setSuccessMsg("");
    setMode("create");
  }

  async function handleCreate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "venues",
          name: form.name.trim(),
          address: form.address.trim(),
          radius: parseInt(form.radius, 10) || 100,
          latitude: form.latitude ? parseFloat(form.latitude) : undefined,
          longitude: form.longitude ? parseFloat(form.longitude) : undefined,
          displayName: form.displayName.trim() || undefined,
          logoText: form.logoText.trim() || undefined,
          iconEmoji: form.iconEmoji.trim() || undefined,
        }),
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

  // ── Edit ────────────────────────────────────────────────────────────────

  function startEdit(venue: Venue) {
    setEditingVenue(venue);
    setForm(venueToForm(venue));
    setError("");
    setSuccessMsg("");
    setMode("edit");
  }

  async function handleEdit() {
    if (!editingVenue) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: "venues",
          id: editingVenue.id,
          name: form.name.trim(),
          address: form.address.trim(),
          radius: parseInt(form.radius, 10) || 100,
          latitude: form.latitude ? parseFloat(form.latitude) : undefined,
          longitude: form.longitude ? parseFloat(form.longitude) : undefined,
          displayName: form.displayName.trim() || undefined,
          logoText: form.logoText.trim() || undefined,
          iconEmoji: form.iconEmoji.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as { ok: boolean; item?: Venue; error?: string };
      if (!payload.ok || !payload.item) throw new Error(payload.error ?? "Failed to update venue.");
      setVenueList((prev) => prev.map((v) => (v.id === payload.item!.id ? payload.item! : v)));
      setSuccessMsg(`Venue "${payload.item.name}" updated.`);
      setMode("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update venue.");
    } finally {
      setBusy(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

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

  // List view
  return (
    <div className="space-y-4">
      {successMsg && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{successMsg}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Header */}
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

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className={TH}>Name</th>
                <th className={TH}>Display Name</th>
                <th className={TH}>Address</th>
                <th className={TH}>Radius (m)</th>
                <th className={TH}>Coordinates</th>
                <th className={`${TH} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {venueList.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No venues yet. Create one above.
                  </td>
                </tr>
              )}
              {venueList.map((v) => (
                <tr key={v.id} className={TR}>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      {v.iconEmoji && <span>{v.iconEmoji}</span>}
                      <span className="font-medium text-slate-900">{v.name}</span>
                    </div>
                  </td>
                  <td className={`${TD} text-slate-500`}>{v.displayName ?? "—"}</td>
                  <td className={`${TD} max-w-xs truncate text-slate-500`}>
                    {v.address ?? "—"}
                  </td>
                  <td className={`${TD} tabular-nums`}>{v.radius}</td>
                  <td className={`${TD} tabular-nums text-slate-400`}>
                    {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                  </td>
                  <td className={`${TD} text-right`}>
                    <button
                      onClick={() => startEdit(v)}
                      className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
