"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { Dropdown } from "@/components/ui/Dropdown";

type Venue = {
  id: string;
  name: string;
};

type NFLPickEmScoringMode = "standard" | "spread";

type VenueGameSettings = {
  venueId: string;
  nflPickEmScoringMode: NFLPickEmScoringMode;
  createdAt: string | null;
  updatedAt: string | null;
};

const OPTIONS: Array<{
  value: NFLPickEmScoringMode;
  label: string;
  description: string;
}> = [
  {
    value: "standard",
    label: "Standard",
    description: "Picks win when the selected team wins the game.",
  },
  {
    value: "spread",
    label: "Spread Mode",
    description: "Picks win when the selected team covers the spread.",
  },
];

const OwnerGameSettingsPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [savedSettings, setSavedSettings] = useState<VenueGameSettings | null>(null);
  const [draftMode, setDraftMode] = useState<NFLPickEmScoringMode>("standard");
  const [loading, setLoading] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadVenues = async () => {
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          router.push("/owner/login");
          return;
        }
        const json = (await res.json()) as { ok: boolean; venues?: Venue[] };
        const loadedVenues = json.venues ?? [];
        setVenues(loadedVenues);
        setSelectedVenueId((prev) => prev || loadedVenues[0]?.id || "");
      } finally {
        setLoading(false);
      }
    };
    void loadVenues();
  }, [router]);

  useEffect(() => {
    if (!selectedVenueId) {
      setSavedSettings(null);
      setDraftMode("standard");
      return;
    }
    let cancelled = false;
    const loadSettings = async () => {
      setLoadingSettings(true);
      setError(null);
      setStatusMessage(null);
      try {
        const res = await fetch(`/api/owner/game-settings?venueId=${encodeURIComponent(selectedVenueId)}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          router.push("/owner/login");
          return;
        }
        const json = (await res.json()) as {
          ok: boolean;
          settings?: VenueGameSettings;
          error?: string;
        };
        if (!json.ok || !json.settings) {
          throw new Error(json.error ?? "Failed to load game settings.");
        }
        if (cancelled) return;
        setSavedSettings(json.settings);
        setDraftMode(json.settings.nflPickEmScoringMode);
      } catch (loadError) {
        if (!cancelled) {
          setSavedSettings(null);
          setDraftMode("standard");
          setError(loadError instanceof Error ? loadError.message : "Failed to load game settings.");
        }
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
  }, [selectedVenueId, router]);

  const selectedVenue = useMemo(
    () => venues.find((venue) => venue.id === selectedVenueId) ?? null,
    [venues, selectedVenueId],
  );
  const hasChanges = draftMode !== (savedSettings?.nflPickEmScoringMode ?? "standard");

  const handleSave = async () => {
    if (!selectedVenueId || saving || !hasChanges) return;
    setSaving(true);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/owner/game-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenueId,
          nflPickEmScoringMode: draftMode,
        }),
      });
      if (res.status === 401) {
        router.push("/owner/login");
        return;
      }
      const json = (await res.json()) as {
        ok: boolean;
        settings?: VenueGameSettings;
        error?: string;
      };
      if (!json.ok || !json.settings) {
        throw new Error(json.error ?? "Failed to save game settings.");
      }
      setSavedSettings(json.settings);
      setDraftMode(json.settings.nflPickEmScoringMode);
      setStatusMessage("Saved. New NFL picks will settle using this mode.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save game settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <OwnerShell
      title="Game Settings"
      subtitle="Choose how NFL Pick 'Em works at your venue"
      maxWidth="lg"
      variant="dark"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/owner/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ht-exit-border bg-gradient-to-br from-ht-exit-from via-ht-exit-via to-ht-exit-to px-4 text-sm font-black text-ht-exit-text"
          >
            ← Dashboard
          </Link>

          {venues.length > 1 ? (
            <Dropdown
              value={selectedVenueId}
              onChange={setSelectedVenueId}
              options={venues.map((venue) => ({ value: venue.id, label: venue.name }))}
              ariaLabel="Select venue"
              size="sm"
              className="min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            />
          ) : null}
        </div>

        {loading ? (
          <p className="text-center text-sm font-semibold text-ht-muted">Loading…</p>
        ) : !selectedVenueId ? (
          <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
            <p className="text-sm font-semibold text-ht-muted">No venue found for this account.</p>
          </div>
        ) : (
          <>
            {error ? (
              <div className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300">
                {error}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="flex items-start gap-2 rounded-xl border border-ht-cyan-500/30 bg-ht-cyan-500/10 px-3 py-2 text-xs font-bold text-ht-cyan-300">
                <span className="min-w-0 flex-1">{statusMessage}</span>
                <button
                  type="button"
                  onClick={() => setStatusMessage(null)}
                  aria-label="Dismiss"
                  className="shrink-0 px-1 font-black"
                >
                  ×
                </button>
              </div>
            ) : null}

            <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-5 shadow-ht-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">NFL Pick &apos;Em</p>
                  <h2 className="mt-2 text-lg font-black text-ht-primary">
                    {selectedVenue?.name ?? "This venue"}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-ht-muted">
                    Standard uses the game winner. Spread mode uses the locked line at kickoff.
                  </p>
                </div>
                <span className="rounded-full border border-ht-soft bg-ht-elevated px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-ht-secondary">
                  {savedSettings?.nflPickEmScoringMode === "spread" ? "Spread live" : "Standard live"}
                </span>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {OPTIONS.map((option) => {
                  const selected = draftMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setDraftMode(option.value)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? "border-ht-cyan-400 bg-ht-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]"
                          : "border-ht-hairline bg-ht-elevated hover:border-ht-soft"
                      }`}
                      aria-pressed={selected}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-black text-ht-primary">{option.label}</span>
                        <span
                          className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-black ${
                            selected
                              ? "border-ht-cyan-300 bg-ht-cyan-400 text-slate-950"
                              : "border-ht-elevated-2 text-ht-muted"
                          }`}
                        >
                          {selected ? "✓" : ""}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ht-muted">{option.description}</p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 rounded-2xl border border-ht-hairline bg-ht-elevated px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-secondary">When this applies</p>
                <p className="mt-1 text-sm font-semibold text-ht-muted">
                  Pending picks use the current mode when the NFL game settles. Picks already graded stay as-is.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || loadingSettings || !hasChanges}
                className="mt-5 w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition active:translate-y-px disabled:opacity-50"
              >
                {loadingSettings ? "Loading…" : saving ? "Saving…" : hasChanges ? "Save NFL Pick 'Em Setting" : "Saved"}
              </button>
            </div>
          </>
        )}
      </div>
    </OwnerShell>
  );
};

export default OwnerGameSettingsPage;
