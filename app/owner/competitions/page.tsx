"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OwnerShell } from "@/components/owner/OwnerShell";
import { getTimeZoneParts } from "@/lib/categoryBlitzScheduleTime";
import { OWNER_COMPETITION_TEMPLATES, type OwnerCompetitionTemplate } from "@/lib/ownerCompetitionTemplates";
import type { ChallengeCampaign, ChallengeLeaderboardEntry } from "@/types";

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

type Venue = { id: string; name: string };
type Competition = ChallengeCampaign & { progressPoints: number };

const TEMPLATE_ACCENT_CLASS: Record<string, string> = {
  pickem: "bg-ht-game-pickem",
  bingo: "bg-ht-game-bingo",
  fantasy: "bg-ht-game-fantasy",
  trivia: "bg-ht-game-trivia",
  blitz: "bg-ht-game-blitz",
};

const TEMPLATE_GLYPH: Record<string, string> = {
  pickem_race: "🏈",
  prop_bingo_night: "🎯",
  fantasy_night: "🏆",
  trivia_gauntlet: "🧠",
  house_party: "🎉",
};

// A campaign doesn't store which template created it (templates are expanded at
// creation, not kept as a FK) — recover a display glyph by matching gameTypes +
// challengeMode back to the closest template. Falls back to a generic trophy.
function glyphForCompetition(competition: Competition): string {
  const sortedTypes = [...competition.gameTypes].sort().join(",");
  const match = OWNER_COMPETITION_TEMPLATES.find(
    (t) => [...t.gameTypes].sort().join(",") === sortedTypes && t.challengeMode === competition.challengeMode,
  );
  return match ? (TEMPLATE_GLYPH[match.id] ?? "🏆") : "🏆";
}

const formatDateLabel = (isoDate: string | undefined, timeZone: string): string => {
  if (!isoDate) return "—";
  try {
    return new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
  } catch {
    return isoDate;
  }
};

const formatTimeLabel = (time: string | undefined): string => {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (!Number.isFinite(h)) return time;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m ?? 0).padStart(2, "0")}${period}`;
};

// Default date/time windows for a template's `defaultWindow`, computed in the
// venue's local timezone. "tonight" = today 6pm–11pm; "this_week" = the current
// Mon–Sun (Monday 6pm start, Sunday 11pm end) containing today.
function defaultWindowFor(shape: "tonight" | "this_week", timeZone: string) {
  const now = new Date();
  const parts = getTimeZoneParts(now, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  const toDateStr = (y: number, mo: number, d: number) => `${y}-${pad(mo)}-${pad(d)}`;

  if (shape === "tonight") {
    const today = toDateStr(parts.year, parts.month, parts.day);
    return { startDate: today, startTime: "18:00", endDate: today, endTime: "23:00" };
  }

  // this_week: find this week's Monday (weekday: sun=0..sat=6 per getTimeZoneParts).
  const weekdayIndex = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].indexOf(parts.weekday);
  const daysSinceMonday = (weekdayIndex + 6) % 7; // mon=0, sun=6
  const mondayMs = Date.UTC(parts.year, parts.month - 1, parts.day) - daysSinceMonday * 86400000;
  const sundayMs = mondayMs + 6 * 86400000;
  const mondayDate = new Date(mondayMs);
  const sundayDate = new Date(sundayMs);
  return {
    startDate: toDateStr(mondayDate.getUTCFullYear(), mondayDate.getUTCMonth() + 1, mondayDate.getUTCDate()),
    startTime: "18:00",
    endDate: toDateStr(sundayDate.getUTCFullYear(), sundayDate.getUTCMonth() + 1, sundayDate.getUTCDate()),
    endTime: "23:00",
  };
}

const OwnerCompetitionsPage = () => {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/owner/venues");
        if (res.status === 401) {
          router.push("/owner/login");
          return;
        }
        const json = (await res.json()) as { ok: boolean; venues?: Venue[] };
        const loaded = json.venues ?? [];
        setVenues(loaded);
        setSelectedVenueId((prev) => prev || loaded[0]?.id || "");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router]);

  const fetchCompetitions = useCallback(async () => {
    if (!selectedVenueId) {
      setCompetitions([]);
      return;
    }
    setLoadError(null);
    try {
      const res = await fetch(`/api/owner/competitions?venueId=${encodeURIComponent(selectedVenueId)}`, {
        cache: "no-store",
      });
      if (res.status === 401) {
        router.push("/owner/login");
        return;
      }
      const json = (await res.json()) as { ok: boolean; competitions?: Competition[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Failed to load competitions.");
      setCompetitions(json.competitions ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load competitions.");
    }
  }, [selectedVenueId, router]);

  useEffect(() => {
    void fetchCompetitions();
  }, [fetchCompetitions]);

  const active = useMemo(() => competitions.filter((c) => c.isActive && !c.winnerUserId), [competitions]);
  const ended = useMemo(() => competitions.filter((c) => !c.isActive || c.winnerUserId), [competitions]);
  const selectedVenue = venues.find((v) => v.id === selectedVenueId);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "End this competition now? If it's mid-run, no winner will be recorded for this cycle — this can't be undone.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/owner/competitions/${id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Couldn't end that competition.");
      await fetchCompetitions();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't end that competition.");
    }
  };

  return (
    <OwnerShell title="Competitions" subtitle="Contests for the games your guests play anytime" maxWidth="lg" variant="dark">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/owner/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ht-exit-border bg-gradient-to-br from-ht-exit-from via-ht-exit-via to-ht-exit-to px-4 text-sm font-black text-ht-exit-text"
          >
            ← Dashboard
          </Link>

          {venues.length > 1 ? (
            <select
              value={selectedVenueId}
              onChange={(e) => {
                setSelectedVenueId(e.target.value);
                setShowForm(false);
              }}
              className="min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
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
            {loadError ? (
              <div className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300">
                {loadError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition active:translate-y-px"
            >
              {showForm ? "Cancel" : "+ Start a competition"}
            </button>

            {showForm ? (
              <CompetitionForm
                venueId={selectedVenueId}
                onCreated={() => {
                  setShowForm(false);
                  void fetchCompetitions();
                }}
                onCancel={() => setShowForm(false)}
              />
            ) : null}

            <CompetitionList
              title="Active & upcoming"
              competitions={active}
              onDelete={(id) => void handleDelete(id)}
            />

            {active.length === 0 && !showForm ? (
              <div className="rounded-2xl border border-ht-hairline bg-ht-surface p-8 text-center shadow-ht-card">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ht-game-pickem text-2xl">
                  🏆
                </div>
                <p className="ht-h2 mt-4">No competitions running</p>
                <p className="mt-2 text-sm font-semibold text-ht-muted">
                  Start a Pick&apos;em Race, Prop Bingo Night, or another contest for{" "}
                  {selectedVenue?.name ?? "your venue"} — pick a template and a window, and it&apos;ll appear
                  here.
                </p>
              </div>
            ) : null}

            {ended.length > 0 ? <CompetitionList title="Ended" competitions={ended} onDelete={null} dimmed /> : null}
          </>
        )}
      </div>
    </OwnerShell>
  );
};

function CompetitionList({
  title,
  competitions,
  onDelete,
  dimmed,
}: {
  title: string;
  competitions: Competition[];
  onDelete: ((id: string) => void) | null;
  dimmed?: boolean;
}) {
  if (competitions.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">{title}</p>
      {competitions.map((competition) => {
        const timezone = "America/New_York"; // display-only fallback; the engine stores naive local strings
        const topEntries: ChallengeLeaderboardEntry[] = competition.leaderboard?.topEntries ?? [];

        return (
          <div
            key={competition.id}
            className={`rounded-[14px] border border-ht-hairline bg-ht-surface p-3 shadow-ht-card ${dimmed ? "opacity-70" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ht-game-pickem text-lg">
                {glyphForCompetition(competition)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-black text-ht-primary">{competition.name}</div>
                <div className="mt-0.5 text-xs font-semibold text-ht-muted">
                  {formatDateLabel(competition.startDate, timezone)} {formatTimeLabel(competition.startTime)} –{" "}
                  {formatDateLabel(competition.endDate, timezone)} {formatTimeLabel(competition.endTime)}
                </div>
                <div className="mt-1.5">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider ${
                      dimmed ? "bg-ht-elevated text-ht-muted" : "bg-ht-cyan-500/15 text-ht-cyan-300"
                    }`}
                  >
                    {competition.challengeMode === "progress" ? "Progress" : "Leaderboard"}
                  </span>
                </div>
              </div>
              {onDelete ? (
                <button
                  type="button"
                  onClick={() => onDelete(competition.id)}
                  className="shrink-0 rounded-lg border border-ht-rose-500/30 bg-ht-rose-500/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-ht-rose-300"
                >
                  End
                </button>
              ) : null}
            </div>

            {dimmed && competition.winnerUsername ? (
              <div className="mt-3 rounded-xl bg-ht-emerald-500/10 px-3 py-2 text-xs font-bold text-ht-emerald-300">
                🏆 Winner: {competition.winnerUsername}
              </div>
            ) : null}

            {!dimmed && topEntries.length > 0 ? (
              <div className="mt-3 space-y-1 border-t border-ht-hairline pt-3">
                {topEntries.slice(0, 3).map((entry) => (
                  <div key={entry.userId} className="flex items-center justify-between text-xs">
                    <span className="font-bold text-ht-secondary">
                      #{entry.rank} {entry.username}
                    </span>
                    <span className="font-black text-ht-primary">{entry.points} pts</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type PrizeChoice = "none" | "description" | "gift_certificate";

function CompetitionForm({
  venueId,
  onCreated,
  onCancel,
}: {
  venueId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [template, setTemplate] = useState<OwnerCompetitionTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("18:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("23:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [prizeChoice, setPrizeChoice] = useState<PrizeChoice>("none");
  const [prizeDescription, setPrizeDescription] = useState("");
  const [prizeAmount, setPrizeAmount] = useState("25");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePickTemplate = (picked: OwnerCompetitionTemplate) => {
    setTemplate(picked);
    const defaults = defaultWindowFor(picked.defaultWindow, timezone);
    setStartDate(defaults.startDate);
    setStartTime(defaults.startTime);
    setEndDate(defaults.endDate);
    setEndTime(defaults.endTime);
    setStep(2);
  };

  const summaryLabel = useMemo(() => {
    if (!startDate || !endDate) return null;
    return `Runs ${formatDateLabel(startDate, timezone)} ${formatTimeLabel(startTime)} → ${formatDateLabel(endDate, timezone)} ${formatTimeLabel(endTime)}`;
  }, [startDate, startTime, endDate, endTime, timezone]);

  const handleSave = async () => {
    if (!template) return;
    if (!startDate || !endDate) {
      setError("A start and end date are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const prize =
        prizeChoice === "description"
          ? { type: "description" as const, description: prizeDescription.trim() }
          : prizeChoice === "gift_certificate"
            ? { type: "gift_certificate" as const, amount: Math.max(0.01, Number(prizeAmount) || 0) }
            : undefined;

      const res = await fetch("/api/owner/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          templateId: template.id,
          title: title.trim() || undefined,
          startDate,
          startTime,
          endDate,
          endTime,
          timezone,
          prize,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Couldn't start that competition.");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start that competition.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-ht-hairline bg-ht-surface p-4 shadow-ht-card">
      {step === 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Pick a competition</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OWNER_COMPETITION_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handlePickTemplate(t)}
                className="flex items-start gap-3 rounded-xl border border-ht-hairline bg-ht-elevated/50 p-3 text-left transition hover:border-ht-cyan-400"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base ${TEMPLATE_ACCENT_CLASS[t.accent] ?? "bg-ht-game-pickem"}`}
                >
                  {TEMPLATE_GLYPH[t.id] ?? "🏆"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-ht-primary">{t.name}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-ht-muted">{t.pitch}</div>
                </div>
              </button>
            ))}
          </div>
          <button type="button" onClick={onCancel} className="w-full py-2 text-center text-sm font-bold text-ht-muted">
            Cancel
          </button>
        </div>
      ) : step === 2 && template ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStep(1)} className="text-sm font-bold text-ht-cyan-300">
              ← {template.name}
            </button>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ht-muted">Name (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={template.name}
              className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ht-muted">Starts</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
                />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ht-muted">Ends</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-ht-muted">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {summaryLabel ? (
            <div className="rounded-xl border border-ht-cyan-500/30 bg-ht-cyan-500/10 px-3 py-2 text-xs font-bold text-ht-cyan-300">
              {summaryLabel}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setStep(3)}
            className="w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950"
          >
            Next: Prize
          </button>
        </div>
      ) : step === 3 && template ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStep(2)} className="text-sm font-bold text-ht-cyan-300">
              ← Back
            </button>
          </div>

          <p className="text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300">Prize (optional)</p>

          <div className="grid grid-cols-3 gap-2">
            {(["none", "description", "gift_certificate"] as PrizeChoice[]).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setPrizeChoice(choice)}
                className={`rounded-xl border p-2.5 text-xs font-black ${
                  prizeChoice === choice ? "border-ht-cyan-400 bg-ht-elevated text-ht-primary" : "border-ht-hairline bg-ht-elevated/50 text-ht-muted"
                }`}
              >
                {choice === "none" ? "None" : choice === "description" ? "Custom" : "Gift card"}
              </button>
            ))}
          </div>

          {prizeChoice === "description" ? (
            <input
              type="text"
              value={prizeDescription}
              onChange={(e) => setPrizeDescription(e.target.value)}
              placeholder="e.g. Round of drinks for the table"
              className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
            />
          ) : null}

          {prizeChoice === "gift_certificate" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-ht-muted">Amount ($)</label>
              <input
                type="number"
                min={1}
                step="0.01"
                value={prizeAmount}
                onChange={(e) => setPrizeAmount(e.target.value)}
                className="w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400"
              />
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
          >
            {saving ? "Starting…" : "Start competition"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default OwnerCompetitionsPage;
