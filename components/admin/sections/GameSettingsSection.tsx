"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminFieldAccent, adminLabel } from "@/lib/adminStyles";
import type { Venue } from "@/types";

type NFLPickEmScoringMode = "standard" | "spread";

type VenueGameSettings = {
  venueId: string;
  nflPickEmScoringMode: NFLPickEmScoringMode;
  createdAt: string | null;
  updatedAt: string | null;
};

type GameSettingsSectionProps = {
  venues: Venue[];
};

const OPTIONS: Array<{
  value: NFLPickEmScoringMode;
  label: string;
  description: string;
}> = [
  {
    value: "standard",
    label: "Standard",
    description: "Picks win when the selected team wins the game outright.",
  },
  {
    value: "spread",
    label: "Spread Mode",
    description: "Picks win when the selected team covers the locked spread.",
  },
];

export function GameSettingsSection({ venues }: GameSettingsSectionProps) {
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id ?? "");
  const [savedSettings, setSavedSettings] = useState<VenueGameSettings | null>(null);
  const [draftMode, setDraftMode] = useState<NFLPickEmScoringMode>("standard");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setSelectedVenueId((current) => {
      if (current && venues.some((venue) => venue.id === current)) return current;
      return venues[0]?.id ?? "";
    });
  }, [venues]);

  useEffect(() => {
    if (!selectedVenueId) {
      setSavedSettings(null);
      setDraftMode("standard");
      return;
    }

    let cancelled = false;

    const loadSettings = async () => {
      setLoadingSettings(true);
      setError("");
      setSuccess("");
      try {
        const response = await fetch(
          `/api/admin/game-settings?venueId=${encodeURIComponent(selectedVenueId)}`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as {
          ok: boolean;
          settings?: VenueGameSettings;
          error?: string;
        };

        if (!response.ok || !payload.ok || !payload.settings) {
          throw new Error(payload.error ?? "Failed to load game settings.");
        }

        if (cancelled) return;
        setSavedSettings(payload.settings);
        setDraftMode(payload.settings.nflPickEmScoringMode);
      } catch (err) {
        if (cancelled) return;
        setSavedSettings(null);
        setDraftMode("standard");
        setError(err instanceof Error ? err.message : "Failed to load game settings.");
      } finally {
        if (!cancelled) {
          setLoadingSettings(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [selectedVenueId]);

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [selectedVenueId, venues],
  );

  const hasChanges = draftMode !== (savedSettings?.nflPickEmScoringMode ?? "standard");

  const handleSave = async () => {
    if (!selectedVenueId || saving || !hasChanges) return;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/game-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenueId,
          nflPickEmScoringMode: draftMode,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        settings?: VenueGameSettings;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.settings) {
        throw new Error(payload.error ?? "Failed to save game settings.");
      }

      setSavedSettings(payload.settings);
      setDraftMode(payload.settings.nflPickEmScoringMode);
      setSuccess("Saved. Pending NFL picks will settle using this venue's current mode.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save game settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_1fr] md:items-end">
          <div>
            <label className={adminLabel}>Venue</label>
            <AdminSelect
              value={selectedVenueId}
              onChange={setSelectedVenueId}
              ariaLabel="Venue"
              className={adminFieldAccent}
              options={venues.map((venue) => ({
                value: venue.id,
                label: venue.name,
              }))}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rule</p>
            <p className="mt-1 text-sm text-slate-600">
              Pending NFL picks use the venue&apos;s current mode when the game settles. Already-settled picks stay as-is.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">NFL Pick &apos;Em</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              {selectedVenue?.name ?? "Select a venue"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose whether this venue grades NFL picks by outright winner or by spread.
            </p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
            {savedSettings?.nflPickEmScoringMode === "spread" ? "Spread live" : "Standard live"}
          </span>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        ) : null}

        {!selectedVenueId ? (
          <div className="mt-5 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            No venues available.
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {OPTIONS.map((option) => {
                const selected = draftMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDraftMode(option.value)}
                    className={`rounded-xl border p-4 text-left transition ${
                      selected
                        ? "border-indigo-500 bg-indigo-50 shadow-[0_0_0_1px_rgba(99,102,241,0.12)]"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                    aria-pressed={selected}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-900">{option.label}</span>
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold ${
                          selected
                            ? "border-indigo-500 bg-indigo-600 text-white"
                            : "border-slate-300 text-slate-400"
                        }`}
                      >
                        {selected ? "✓" : ""}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{option.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                {loadingSettings ? "Loading current setting…" : hasChanges ? "Unsaved changes" : "No unsaved changes"}
              </p>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={loadingSettings || saving || !hasChanges}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingSettings ? "Loading…" : saving ? "Saving…" : hasChanges ? "Save Game Settings" : "Saved"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
