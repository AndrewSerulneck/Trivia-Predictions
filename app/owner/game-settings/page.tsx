"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { ShareDetailsPanel } from "@/components/owner/share/ShareDetailsPanel";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { Dropdown } from "@/components/ui/Dropdown";
import { ownerAuthRecoveryPath } from "@/lib/ownerAuthCodes";

type Venue = {
  id: string;
  name: string;
};

type NFLPickEmScoringMode = "standard" | "spread";
type ScoringModeField = "nflPickEmScoringMode" | "cfbPickEmScoringMode";

type VenueGameSettings = {
  venueId: string;
  nflPickEmScoringMode: NFLPickEmScoringMode;
  cfbPickEmScoringMode: NFLPickEmScoringMode;
  createdAt: string | null;
  updatedAt: string | null;
};

type ScoringModeOption = {
  value: NFLPickEmScoringMode;
  label: string;
  /** The badge while this mode is saved. */
  liveLabel: string;
  description: string;
};

type ScoringModeGame = {
  field: ScoringModeField;
  eyebrow: string;
  intro: string;
  /** What a venue with no saved choice plays. */
  defaultMode: NFLPickEmScoringMode;
  options: ScoringModeOption[];
  whenThisApplies: string;
  saveLabel: string;
  savedMessage: string;
};

const SCORING_MODE_GAMES: ScoringModeGame[] = [
  {
    field: "nflPickEmScoringMode",
    eyebrow: "NFL Pick 'Em",
    intro: "Standard uses the game winner. Spread mode uses the locked line at kickoff.",
    defaultMode: "standard",
    options: [
      {
        value: "standard",
        label: "Standard",
        liveLabel: "Standard live",
        description: "Picks win when the selected team wins the game.",
      },
      {
        value: "spread",
        label: "Spread Mode",
        liveLabel: "Spread live",
        description: "Picks win when the selected team covers the spread.",
      },
    ],
    whenThisApplies: "Pending picks use the current mode when the NFL game settles. Picks already graded stay as-is.",
    saveLabel: "Save NFL Pick 'Em Setting",
    savedMessage: "Saved. New NFL picks will settle using this mode.",
  },
  {
    field: "cfbPickEmScoringMode",
    eyebrow: "College Football Pick 'Em",
    intro: "Spread uses the line locked at kickoff. Pick the winner uses the final score.",
    defaultMode: "spread",
    options: [
      {
        value: "spread",
        label: "Spread",
        liveLabel: "Spread live",
        description: "Picks win when the team covers the spread. A game without a line yet can't be picked.",
      },
      {
        value: "standard",
        label: "Pick the winner",
        liveLabel: "Winner picks live",
        description: "Picks win when the selected team wins the game.",
      },
    ],
    whenThisApplies: "Each pick keeps the rule it was made under. A change applies to new picks only.",
    saveLabel: "Save College Football Setting",
    savedMessage: "Saved. New college football picks use this rule.",
  },
];

const liveLabelOf = (game: ScoringModeGame, mode: NFLPickEmScoringMode): string =>
  game.options.find((option) => option.value === mode)?.liveLabel ?? mode;

const OwnerGameSettingsPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [savedSettings, setSavedSettings] = useState<VenueGameSettings | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<ScoringModeField, NFLPickEmScoringMode>>>({});
  const [savingField, setSavingField] = useState<ScoringModeField | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadVenues = async () => {
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          router.push(ownerAuthRecoveryPath(body.code));
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
      setDrafts({});
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
          const body = (await res.json().catch(() => ({}))) as { code?: string };
          router.push(ownerAuthRecoveryPath(body.code));
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
        setDrafts({});
      } catch (loadError) {
        if (!cancelled) {
          setSavedSettings(null);
          setDrafts({});
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
  const savedModeOf = (game: ScoringModeGame): NFLPickEmScoringMode => savedSettings?.[game.field] ?? game.defaultMode;
  const draftModeOf = (game: ScoringModeGame): NFLPickEmScoringMode => drafts[game.field] ?? savedModeOf(game);

  const handleSave = async (game: ScoringModeGame) => {
    const draftMode = draftModeOf(game);
    if (!selectedVenueId || savingField || draftMode === savedModeOf(game)) return;
    setSavingField(game.field);
    setError(null);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/owner/game-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenueId,
          [game.field]: draftMode,
        }),
      });
      if (res.status === 401) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        router.push(ownerAuthRecoveryPath(body.code));
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
      setDrafts((current) => {
        const next = { ...current };
        delete next[game.field];
        return next;
      });
      setStatusMessage(game.savedMessage);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save game settings.");
    } finally {
      setSavingField(null);
    }
  };

  return (
    <OwnerShell
      title="Game Settings"
      subtitle="How games are scored and shared at your venue"
      maxWidth="lg"
      variant="dark"
      backTo={{ href: "/owner/dashboard", label: "Dashboard", preferHref: true }}
    >
      <div className="space-y-5">
        {venues.length > 1 ? (
          <div className="flex justify-end">
            <Dropdown
              value={selectedVenueId}
              onChange={setSelectedVenueId}
              options={venues.map((venue) => ({ value: venue.id, label: venue.name }))}
              ariaLabel="Select venue"
              size="sm"
              className="min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            />
          </div>
        ) : null}

        {loading ? (
          <HightopLoader size="lg" className="py-10" />
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

            {SCORING_MODE_GAMES.map((game) => {
              const savedMode = savedModeOf(game);
              const draftMode = draftModeOf(game);
              const hasChanges = draftMode !== savedMode;
              const saving = savingField === game.field;
              return (
                <div key={game.field} className="rounded-2xl border border-ht-hairline bg-ht-surface p-5 shadow-ht-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">{game.eyebrow}</p>
                      <h2 className="mt-2 text-lg font-black text-ht-primary">
                        {selectedVenue?.name ?? "This venue"}
                      </h2>
                      <p className="mt-1 text-sm font-semibold text-ht-muted">{game.intro}</p>
                    </div>
                    <span className="rounded-full border border-ht-soft bg-ht-elevated px-3 py-1 text-caption font-black uppercase tracking-[0.12em] text-ht-secondary">
                      {liveLabelOf(game, savedMode)}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {game.options.map((option) => {
                      const selected = draftMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setDrafts((current) => ({ ...current, [game.field]: option.value }))}
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
                              className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-caption font-black ${
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
                    <p className="mt-1 text-sm font-semibold text-ht-muted">{game.whenThisApplies}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleSave(game)}
                    disabled={savingField !== null || loadingSettings || !hasChanges}
                    className="mt-5 w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition active:translate-y-px disabled:opacity-50"
                  >
                    {loadingSettings ? "Loading…" : saving ? "Saving…" : hasChanges ? game.saveLabel : "Saved"}
                  </button>
                </div>
              );
            })}

            {/* What players' share pictures show (Phase 9e); also asked in Schedule and Prizes. */}
            <ShareDetailsPanel key={selectedVenueId} venueId={selectedVenueId} />
          </>
        )}
      </div>
    </OwnerShell>
  );
};

export default OwnerGameSettingsPage;
