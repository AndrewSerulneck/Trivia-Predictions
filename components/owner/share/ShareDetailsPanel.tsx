"use client";

import { useEffect, useState } from "react";
import {
  parseInstagramHandle,
  SHARE_DETAILS_COPY as COPY,
  shareDetailsSummary,
  type VenueShareDetails,
} from "@/lib/venueShareDetails";

// "On shared pictures" (docs/native-app-store-plan.md Phase 9e): which of the bar's name,
// address and Instagram handle a player's share picture shows. ONE choice per venue (Andrew,
// 2026-10-22), so this one panel is shown wherever a partner sets things up — the Schedule
// sheet's Review, the Prize wizard's Confirm (owner variant only), Game Settings — and the
// admin venue form. It saves on its own: the venue setting is not part of the game or prize.
//
// Cost: one GET per venue per page visit (cached below, refreshed by a save), none on the
// player side.

type Host = "owner" | "admin";

const ENDPOINTS: Record<Host, string> = {
  owner: "/api/owner/venues/share-details",
  admin: "/api/admin/venues/share-details",
};

type Reply = { ok: boolean; details?: VenueShareDetails; error?: string };

// Survives the step remounts inside a sheet (SlideSteps), so revisiting Review doesn't refetch.
const cache = new Map<string, VenueShareDetails>();
const inFlight = new Map<string, Promise<VenueShareDetails>>();

const loadDetails = (host: Host, venueId: string): Promise<VenueShareDetails> => {
  const key = `${host}:${venueId}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetch(`${ENDPOINTS[host]}?venueId=${encodeURIComponent(venueId)}`, { cache: "no-store" })
    .then(async (res) => {
      const reply = (await res.json().catch(() => ({ ok: false }))) as Reply;
      if (!reply.ok || !reply.details) throw new Error(reply.error ?? COPY.loadFailed);
      cache.set(key, reply.details);
      return reply.details;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
};

type Draft = { handle: string; showName: boolean; showAddress: boolean; showInstagram: boolean };

const draftOf = (details: VenueShareDetails): Draft => ({
  handle: details.instagramHandle ? `@${details.instagramHandle}` : "",
  showName: details.showName,
  showAddress: details.showAddress,
  showInstagram: details.showInstagram,
});

const TONES = {
  dark: {
    box: "rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3 py-2.5",
    label: "text-caption font-black uppercase tracking-wider text-ht-muted",
    value: "font-bold text-ht-primary",
    muted: "text-xs font-semibold text-ht-muted",
    link: "min-h-11 shrink-0 rounded-lg px-2 text-sm font-black text-ht-cyan-300",
    option: "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm font-bold text-ht-primary",
    optionOn: "border-ht-cyan-400 bg-ht-cyan-500/10",
    optionOff: "border-ht-hairline bg-ht-elevated",
    check: "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-caption font-black",
    checkOn: "border-ht-cyan-300 bg-ht-cyan-400 text-slate-950",
    checkOff: "border-ht-elevated-2 text-ht-muted",
    input:
      "w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none focus:border-ht-cyan-400",
    save: "min-h-11 flex-1 rounded-xl bg-ht-cyan-500 px-4 text-sm font-black text-slate-950 disabled:opacity-50",
    cancel: "min-h-11 rounded-xl px-4 text-sm font-black text-ht-muted",
    error: "text-xs font-bold text-ht-rose-300",
    ok: "text-xs font-bold text-ht-cyan-300",
  },
  light: {
    box: "rounded-lg border border-slate-200 bg-white px-4 py-3",
    label: "text-xs font-semibold uppercase tracking-wide text-slate-500",
    value: "font-semibold text-slate-900",
    muted: "text-xs text-slate-500",
    link: "min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-indigo-600",
    option: "flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-semibold text-slate-800",
    optionOn: "border-indigo-400 bg-indigo-50",
    optionOff: "border-slate-200 bg-white",
    check: "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-caption font-bold",
    checkOn: "border-indigo-500 bg-indigo-600 text-white",
    checkOff: "border-slate-300 text-slate-400",
    input: "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500",
    save: "min-h-11 flex-1 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50",
    cancel: "min-h-11 rounded-lg px-4 text-sm font-semibold text-slate-600",
    error: "text-xs font-semibold text-red-700",
    ok: "text-xs font-semibold text-emerald-700",
  },
} as const;

export const ShareDetailsPanel = ({
  venueId,
  host = "owner",
  tone = "dark",
}: {
  venueId: string;
  host?: Host;
  tone?: keyof typeof TONES;
}) => {
  const t = TONES[tone];
  const key = `${host}:${venueId}`;
  const [loaded, setLoaded] = useState<{ key: string; details: VenueShareDetails } | null>(() => {
    const cached = cache.get(key);
    return cached ? { key, details: cached } : null;
  });
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  const details = loaded?.key === key ? loaded.details : null;
  const error = loadError?.key === key ? loadError.message : null;

  useEffect(() => {
    if (!venueId || cache.has(key)) return;
    let cancelled = false;
    loadDetails(host, venueId).then(
      (next) => {
        if (!cancelled) setLoaded({ key, details: next });
      },
      (err: unknown) => {
        if (!cancelled) setLoadError({ key, message: err instanceof Error ? err.message : COPY.loadFailed });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [host, key, venueId]);

  const startEditing = () => {
    if (!details) return;
    setDraft(draftOf(details));
    setMessage(null);
  };

  const save = async () => {
    if (!draft || saving) return;
    const handle = parseInstagramHandle(draft.handle);
    if (!handle.ok) {
      setMessage({ kind: "error", text: handle.error });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(ENDPOINTS[host], {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          instagramHandle: handle.handle,
          showName: draft.showName,
          showAddress: draft.showAddress,
          showInstagram: draft.showInstagram,
        }),
      });
      const reply = (await res.json().catch(() => ({ ok: false }))) as Reply;
      if (!reply.ok || !reply.details) throw new Error(reply.error ?? COPY.saveFailed);
      cache.set(key, reply.details);
      setLoaded({ key, details: reply.details });
      setDraft(null);
      setMessage({ kind: "ok", text: COPY.saved });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : COPY.saveFailed });
    } finally {
      setSaving(false);
    }
  };

  const option = (field: "showName" | "showAddress" | "showInstagram", label: string) => {
    if (!draft) return null;
    const on = draft[field];
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => setDraft({ ...draft, [field]: !on })}
        className={`${t.option} ${on ? t.optionOn : t.optionOff}`}
      >
        <span>{label}</span>
        <span className={`${t.check} ${on ? t.checkOn : t.checkOff}`} aria-hidden="true">
          {on ? "✓" : ""}
        </span>
      </button>
    );
  };

  return (
    <section className={t.box} aria-label={COPY.heading} data-share-details-panel="">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={t.label}>{COPY.heading}</p>
          <p className={t.value}>{details ? shareDetailsSummary(details) : error ? COPY.loadFailed : "…"}</p>
        </div>
        {details && !draft ? (
          <button type="button" onClick={startEditing} aria-label="Change what shared pictures show" className={t.link}>
            {COPY.change}
          </button>
        ) : null}
      </div>

      {draft ? (
        <div className="mt-2 space-y-2.5 pb-1">
          <p className={t.muted}>{COPY.hint}</p>
          {option("showName", COPY.showName)}
          {option("showAddress", COPY.showAddress)}
          {option("showInstagram", COPY.showInstagram)}
          {draft.showInstagram ? (
            <div>
              <label htmlFor={`share-handle-${venueId}`} className="sr-only">
                {COPY.handleLabel}
              </label>
              <input
                id={`share-handle-${venueId}`}
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={draft.handle}
                onChange={(event) => setDraft({ ...draft, handle: event.target.value })}
                placeholder={COPY.handlePlaceholder}
                className={t.input}
              />
              <p className={`mt-1 ${t.muted}`}>{COPY.handleHint}</p>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void save()} disabled={saving} className={t.save}>
              {saving ? COPY.saving : COPY.save}
            </button>
            <button type="button" onClick={() => setDraft(null)} disabled={saving} className={t.cancel}>
              {COPY.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={`mt-1 ${message.kind === "error" ? t.error : t.ok}`}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
};
