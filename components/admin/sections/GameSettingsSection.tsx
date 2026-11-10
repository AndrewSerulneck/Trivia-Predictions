"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { PickWindowsPanel } from "@/components/gameSettings/PickWindowsPanel";
import { adminFieldAccent, adminLabel } from "@/lib/adminStyles";
import type { PickEmPickWindows } from "@/lib/pickemPickWindow";
import type { Venue } from "@/types";

type NFLPickEmScoringMode = "standard" | "spread";
type ScoringModeField = "nflPickEmScoringMode" | "cfbPickEmScoringMode";

type VenueGameSettings = {
  venueId: string;
  nflPickEmScoringMode: NFLPickEmScoringMode;
  cfbPickEmScoringMode: NFLPickEmScoringMode;
  pickWindows?: PickEmPickWindows;
  createdAt: string | null;
  updatedAt: string | null;
};

type GameSettingsSectionProps = {
  venues: Venue[];
};

type ScoringModeGame = {
  field: ScoringModeField;
  eyebrow: string;
  intro: string;
  defaultMode: NFLPickEmScoringMode;
  options: Array<{ value: NFLPickEmScoringMode; label: string; liveLabel: string; description: string }>;
  savedMessage: string;
};

const SCORING_MODE_GAMES: ScoringModeGame[] = [
  {
    field: "nflPickEmScoringMode",
    eyebrow: "NFL Pick 'Em",
    intro: "Choose whether this venue grades NFL picks by outright winner or by spread.",
    defaultMode: "standard",
    options: [
      {
        value: "standard",
        label: "Standard",
        liveLabel: "Standard live",
        description: "Picks win when the selected team wins the game outright.",
      },
      {
        value: "spread",
        label: "Spread Mode",
        liveLabel: "Spread live",
        description: "Picks win when the selected team covers the locked spread.",
      },
    ],
    savedMessage: "Saved. Pending NFL picks will settle using this venue's current mode.",
  },
  {
    field: "cfbPickEmScoringMode",
    eyebrow: "College Football Pick 'Em",
    intro: "Spread (the default) or pick the winner. Each pick keeps the rule it was made under.",
    defaultMode: "spread",
    options: [
      {
        value: "spread",
        label: "Spread",
        liveLabel: "Spread live",
        description: "Picks win when the team covers the line locked at kickoff. No line yet = can't be picked.",
      },
      {
        value: "standard",
        label: "Pick the winner",
        liveLabel: "Winner picks live",
        description: "Picks win when the selected team wins the game outright.",
      },
    ],
    savedMessage: "Saved. New college football picks use this rule.",
  },
];

const liveLabelOf = (game: ScoringModeGame, mode: NFLPickEmScoringMode): string =>
  game.options.find((option) => option.value === mode)?.liveLabel ?? mode;

export function GameSettingsSection({ venues }: GameSettingsSectionProps) {
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id ?? "");
  const [savedSettings, setSavedSettings] = useState<VenueGameSettings | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ScoringModeField, NFLPickEmScoringMode>>>({});
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingField, setSavingField] = useState<ScoringModeField | null>(null);
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
      setDrafts({});
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
        setDrafts({});
      } catch (err) {
        if (cancelled) return;
        setSavedSettings(null);
        setDrafts({});
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

  const savedModeOf = (game: ScoringModeGame): NFLPickEmScoringMode => savedSettings?.[game.field] ?? game.defaultMode;
  const draftModeOf = (game: ScoringModeGame): NFLPickEmScoringMode => drafts[game.field] ?? savedModeOf(game);

  const handleSave = async (game: ScoringModeGame) => {
    const draftMode = draftModeOf(game);
    if (!selectedVenueId || savingField || draftMode === savedModeOf(game)) return;

    setSavingField(game.field);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/game-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenueId,
          [game.field]: draftMode,
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
      setDrafts((current) => {
        const next = { ...current };
        delete next[game.field];
        return next;
      });
      setSuccess(game.savedMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save game settings.");
    } finally {
      setSavingField(null);
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
              Pending NFL picks use the venue&apos;s current mode when the game settles. College Football picks keep the
              rule they were made under. Already-settled picks stay as-is.
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      ) : null}

      {SCORING_MODE_GAMES.map((game) => {
        const savedMode = savedModeOf(game);
        const draftMode = draftModeOf(game);
        const hasChanges = draftMode !== savedMode;
        const saving = savingField === game.field;
        return (
          <div key={game.field} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{game.eyebrow}</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  {selectedVenue?.name ?? "Select a venue"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{game.intro}</p>
              </div>
              <span className="inline-flex w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                {liveLabelOf(game, savedMode)}
              </span>
            </div>

            {!selectedVenueId ? (
              <div className="mt-5 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No venues available.
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {game.options.map((option) => {
                    const selected = draftMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDrafts((current) => ({ ...current, [game.field]: option.value }))}
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
                            className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-caption font-bold ${
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
                    onClick={() => void handleSave(game)}
                    disabled={loadingSettings || savingField !== null || !hasChanges}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingSettings ? "Loading…" : saving ? "Saving…" : hasChanges ? "Save Game Settings" : "Saved"}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {selectedVenueId ? (
        <PickWindowsPanel<VenueGameSettings>
          key={`pick-windows-${selectedVenueId}`}
          tone="admin"
          endpoint="/api/admin/game-settings"
          venueId={selectedVenueId}
          saved={savedSettings?.pickWindows ?? {}}
          disabled={loadingSettings || !savedSettings}
          onSaved={setSavedSettings}
        />
      ) : null}
    </div>
  );
}
