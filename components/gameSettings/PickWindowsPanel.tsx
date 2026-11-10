"use client";

// Pick windows in Game Settings, owner + admin (docs/cancelled-prizes-pick-windows-away-mode-plan.md
// Phase B4). One card: per sport "Always open" or "Set days" (open day + time, close day + time, the
// bar's clock). Saves only the sports that changed through the existing Game Settings save
// (`pickWindows`, B1). Draft rules: lib/pickemPickWindowForm.ts.

import { useState } from "react";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Dropdown } from "@/components/ui/Dropdown";
import {
  PICK_WINDOW_DAYS,
  PICK_WINDOW_DAY_LABELS,
  type PickEmPickWindow,
  type PickEmPickWindows,
  type PickWindowDay,
} from "@/lib/pickemPickWindow";
import {
  DEFAULT_PICK_WINDOW,
  PICK_WINDOW_FORM_SPORTS,
  pickWindowChangesFromDrafts,
  pickWindowDraftsError,
  pickWindowShown,
  type PickWindowDrafts,
} from "@/lib/pickemPickWindowForm";
import type { PickEmSportSlug } from "@/lib/pickemSports";

type Tone = "owner" | "admin";

type SavedSettings = { pickWindows?: PickEmPickWindows };

type PickWindowsPanelProps<T extends SavedSettings> = {
  tone: Tone;
  /** "/api/owner/game-settings" or "/api/admin/game-settings". */
  endpoint: string;
  venueId: string;
  saved: PickEmPickWindows;
  disabled?: boolean;
  onSaved: (settings: T) => void;
  /** Owner only: a 401 hands its code back so the page can send the partner to sign in. */
  onUnauthorized?: (code: string | undefined) => void;
};

const STYLES: Record<
  Tone,
  {
    card: string;
    eyebrow: string;
    title: string;
    muted: string;
    row: string;
    sport: string;
    segment: string;
    segmentOn: string;
    segmentOff: string;
    label: string;
    field: string;
    error: string;
    success: string;
    save: string;
  }
> = {
  owner: {
    card: "rounded-2xl border border-ht-hairline bg-ht-surface p-5 shadow-ht-card",
    eyebrow: "text-xs font-black uppercase tracking-[0.14em] text-ht-cyan-300",
    title: "mt-2 text-lg font-black text-ht-primary",
    muted: "mt-1 text-sm font-semibold text-ht-muted",
    row: "border-t border-ht-hairline py-4 first:border-t-0",
    sport: "text-sm font-black text-ht-primary",
    segment: "inline-flex rounded-xl border border-ht-hairline bg-ht-elevated p-0.5",
    segmentOn: "rounded-lg bg-ht-cyan-500 px-3 py-1.5 text-caption font-black text-slate-950",
    segmentOff: "rounded-lg px-3 py-1.5 text-caption font-black text-ht-muted",
    label: "w-14 shrink-0 text-caption font-black uppercase tracking-[0.12em] text-ht-secondary",
    field:
      "min-h-11 rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 text-sm font-bold text-ht-primary outline-none focus:border-ht-cyan-400",
    error: "mt-4 rounded-xl border border-ht-rose-500/30 bg-ht-rose-500/10 px-3 py-2 text-xs font-bold text-ht-rose-300",
    success: "mt-4 rounded-xl border border-ht-cyan-500/30 bg-ht-cyan-500/10 px-3 py-2 text-xs font-bold text-ht-cyan-300",
    save: "mt-4 w-full rounded-xl border border-ht-soft bg-ht-cyan-500 px-4 py-3 text-sm font-black text-slate-950 transition active:translate-y-px disabled:opacity-50",
  },
  admin: {
    card: "rounded-xl border border-slate-200 bg-white p-6 shadow-sm",
    eyebrow: "text-xs font-semibold uppercase tracking-wide text-slate-500",
    title: "mt-1 text-lg font-semibold text-slate-900",
    muted: "mt-1 text-sm text-slate-500",
    row: "border-t border-slate-200 py-4 first:border-t-0",
    sport: "text-sm font-semibold text-slate-900",
    segment: "inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5",
    segmentOn: "rounded-md bg-indigo-600 px-3 py-1.5 text-caption font-semibold text-white",
    segmentOff: "rounded-md px-3 py-1.5 text-caption font-semibold text-slate-600",
    label: "w-14 shrink-0 text-caption font-semibold uppercase tracking-wide text-slate-500",
    field:
      "min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500",
    error: "mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700",
    success: "mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700",
    save: "mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50",
  },
};

const DAY_OPTIONS = PICK_WINDOW_DAYS.map((day) => ({ value: day, label: PICK_WINDOW_DAY_LABELS[day] }));

export const PickWindowsPanel = <T extends SavedSettings>({
  tone,
  endpoint,
  venueId,
  saved,
  disabled = false,
  onSaved,
  onUnauthorized,
}: PickWindowsPanelProps<T>) => {
  const s = STYLES[tone];
  const [drafts, setDrafts] = useState<PickWindowDrafts>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const changes = pickWindowChangesFromDrafts(saved, drafts);
  const draftError = pickWindowDraftsError(drafts);

  const setSport = (slug: PickEmSportSlug, window: PickEmPickWindow | null) => {
    setDrafts((current) => ({ ...current, [slug]: window }));
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!changes || draftError || saving || disabled) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venueId, pickWindows: changes }),
      });
      if (res.status === 401 && onUnauthorized) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        onUnauthorized(body.code);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; settings?: T; error?: string };
      if (!res.ok || !json.ok || !json.settings) throw new Error(json.error ?? "Couldn't save. Try again.");
      onSaved(json.settings);
      setDrafts({});
      setSuccess("Saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const daySelect = (value: PickWindowDay, onChange: (day: PickWindowDay) => void, ariaLabel: string) =>
    tone === "owner" ? (
      <Dropdown
        value={value}
        onChange={onChange}
        options={DAY_OPTIONS}
        ariaLabel={ariaLabel}
        size="sm"
        disabled={disabled}
        className={`${s.field} w-24`}
      />
    ) : (
      <AdminSelect
        value={value}
        onChange={onChange}
        options={DAY_OPTIONS}
        ariaLabel={ariaLabel}
        disabled={disabled}
        className={`${s.field} w-24`}
      />
    );

  return (
    <div className={s.card} data-testid="pick-windows-panel">
      <p className={s.eyebrow}>Pick &apos;Em</p>
      <h2 className={s.title}>Pick windows</h2>
      <p className={s.muted}>Games still lock at kickoff. With spreads, each game&apos;s line stays fixed once shown.</p>

      <div className="mt-4">
        {PICK_WINDOW_FORM_SPORTS.map(({ slug, label }) => {
          const window = pickWindowShown(saved, drafts, slug);
          return (
            <div key={slug} className={s.row}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={s.sport}>{label}</span>
                <div className={s.segment} role="group" aria-label={`${label} picks`}>
                  <button
                    type="button"
                    aria-pressed={window === null}
                    disabled={disabled}
                    onClick={() => setSport(slug, null)}
                    className={window === null ? s.segmentOn : s.segmentOff}
                  >
                    Always open
                  </button>
                  <button
                    type="button"
                    aria-pressed={window !== null}
                    disabled={disabled}
                    onClick={() => setSport(slug, window ?? saved[slug] ?? DEFAULT_PICK_WINDOW)}
                    className={window !== null ? s.segmentOn : s.segmentOff}
                  >
                    Set days
                  </button>
                </div>
              </div>
              {window ? (
                <div className="mt-3 space-y-2">
                  {(["open", "close"] as const).map((edge) => {
                    const dayKey = edge === "open" ? "openDay" : "closeDay";
                    const timeKey = edge === "open" ? "openTime" : "closeTime";
                    const edgeLabel = edge === "open" ? "Opens" : "Closes";
                    return (
                      <div key={edge} className="flex items-center gap-2">
                        <span className={s.label}>{edgeLabel}</span>
                        {daySelect(
                          window[dayKey],
                          (day) => setSport(slug, { ...window, [dayKey]: day }),
                          `${label} ${edgeLabel.toLowerCase()} day`,
                        )}
                        <input
                          type="time"
                          aria-label={`${label} ${edgeLabel.toLowerCase()} time`}
                          value={window[timeKey]}
                          disabled={disabled}
                          onChange={(e) => {
                            if (/^\d{2}:\d{2}$/.test(e.target.value)) setSport(slug, { ...window, [timeKey]: e.target.value });
                          }}
                          className={`${s.field} min-w-0 flex-1`}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {error || draftError ? <div className={s.error}>{error ?? draftError}</div> : null}
      {success ? <div className={s.success}>{success}</div> : null}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={disabled || saving || !changes || draftError !== null}
        className={s.save}
      >
        {saving ? "Saving…" : changes ? "Save pick windows" : "Saved"}
      </button>
    </div>
  );
};
