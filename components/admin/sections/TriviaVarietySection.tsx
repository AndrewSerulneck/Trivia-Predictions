"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminField, adminLabel } from "@/lib/adminStyles";
import { getErrorMessage } from "@/lib/errors";
import type { VarietyCategories, VarietyGame, VarietyReport } from "@/types/questionVariety";

// Admin -> Trivia Questions -> Variety (docs/speed-trivia-backlog-and-quality-plan.md Phase 4a, D14).
// Each category's areas with a question count per era; thin cells are tinted. The daily writer is sent to the
// least-covered cells, so adding an area here steers tomorrow's questions.

const ENDPOINT = "/api/admin/trivia/variety";
const GAME_LABELS: Record<VarietyGame, string> = { speed: "Speed Trivia", live: "Live Trivia" };

type Payload = { categories: VarietyCategories; report: VarietyReport; columns: string[] };

const send = async (body: unknown) => {
  const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Couldn't save. Try again.");
};

/** A cell is thin when it's empty or under half the category's even share. */
export const thinThreshold = (report: VarietyReport, columns: string[]): number => {
  let cells = 0;
  let total = 0;
  for (const area of report.areas) {
    if (!area.active) continue;
    for (const era of columns) {
      if (!appliesTo(area.eras, era)) continue;
      cells++;
      total += area.counts[era] ?? 0;
    }
  }
  return cells ? total / cells / 2 : 0;
};

/** Current Events areas hold one rolling era; every month column applies to them. */
const appliesTo = (eras: string[], column: string) => eras.includes(column) || /^\d{4}-\d{2}$/.test(column);

export const TriviaVarietySection = () => {
  const [game, setGame] = useState<VarietyGame>("speed");
  const [category, setCategory] = useState("");
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [name, setName] = useState("");
  const [eras, setEras] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const load = useCallback(async (nextGame: VarietyGame, nextCategory: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ game: nextGame, ...(nextCategory ? { category: nextCategory } : {}) });
      const response = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Partial<Payload> & { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok || !payload.report || !payload.categories || !payload.columns) {
        throw new Error(payload.error ?? "Variety is unavailable. Try again.");
      }
      setData({ categories: payload.categories, report: payload.report, columns: payload.columns });
      setCategory(payload.report.category);
    } catch (err) {
      setError(getErrorMessage(err, "Variety is unavailable. Try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("speed", "");
  }, [load]);

  const report = data?.report ?? null;
  const columns = useMemo(() => data?.columns ?? [], [data]);
  const thin = useMemo(() => (report ? thinThreshold(report, columns) : 0), [report, columns]);

  const run = async (body: Record<string, unknown>, after?: () => void) => {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await send({ game, category, ...body });
      after?.();
      setSaved("Saved.");
      await load(game, category);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't save. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const addArea = () =>
    void run({ action: "add", name, eras, note }, () => {
      setName("");
      setEras([]);
      setNote("");
    });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Variety</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={adminLabel} htmlFor="variety-game">Game</label>
            <select id="variety-game" className={adminField} value={game} disabled={loading || busy}
              onChange={(event) => {
                const next = event.target.value as VarietyGame;
                setGame(next);
                setEras([]);
                void load(next, "");
              }}>
              {(Object.keys(GAME_LABELS) as VarietyGame[]).map((value) => <option key={value} value={value}>{GAME_LABELS[value]}</option>)}
            </select>
          </div>
          <div>
            <label className={adminLabel} htmlFor="variety-category">Category</label>
            <select id="variety-category" className={adminField} value={category} disabled={loading || busy || !data}
              onChange={(event) => {
                setCategory(event.target.value);
                setEras([]);
                void load(game, event.target.value);
              }}>
              {(data?.categories[game] ?? []).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </div>
        {report ? (
          <p className="mt-4 text-sm text-slate-600" data-testid="variety-summary">
            {report.tagged} tagged
            {report.untagged ? ` · ${report.untagged} untagged` : ""}
            {report.unmapped ? ` · ${report.unmapped} unmapped` : ""}
            {report.top5Share !== null ? ` · Top 5 subjects ${Math.round(report.top5Share * 100)}%` : ""}
          </p>
        ) : null}
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {saved ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{saved}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading && !report ? <p className="py-10 text-center text-sm text-slate-400">Loading…</p> : null}
        {report && !report.areas.length ? <p className="py-10 text-center text-sm text-slate-500">No areas yet.</p> : null}
        {report && report.areas.length ? (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Area</th>
                {columns.map((era) => <th key={era} className="px-2 py-3 text-center">{era}</th>)}
                <th className="px-4 py-3 text-right">On</th>
              </tr>
            </thead>
            <tbody>
              {report.areas.map((area) => (
                <tr key={area.id} className={`border-b border-slate-100 ${area.active ? "" : "text-slate-400"}`}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{area.name}</span>
                    {area.note ? <span className="block text-xs text-slate-500">{area.note}</span> : null}
                  </td>
                  {columns.map((era) => {
                    if (!appliesTo(area.eras, era)) return <td key={era} className="px-2 py-2 text-center text-slate-300">·</td>;
                    const count = area.counts[era] ?? 0;
                    const isThin = area.active && count <= thin;
                    return (
                      <td key={era} data-thin={isThin || undefined}
                        className={`px-2 py-2 text-center tabular-nums ${isThin ? "bg-indigo-50 font-semibold text-indigo-700" : ""}`}>
                        {count}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right">
                    <button type="button" role="switch" aria-checked={area.active} aria-label={`${area.name} on`} disabled={busy}
                      onClick={() => void run({ action: "toggle", id: area.id, active: !area.active })}
                      className={`inline-flex h-6 w-11 items-center rounded-full px-0.5 transition ${area.active ? "bg-indigo-600" : "bg-slate-300"}`}>
                      <span className={`h-5 w-5 rounded-full bg-white shadow transition ${area.active ? "translate-x-5" : ""}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      {report ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            onSubmit={(event) => { event.preventDefault(); addArea(); }}>
            <h3 className="text-sm font-semibold text-slate-900">Add area</h3>
            <div>
              <label className={adminLabel} htmlFor="variety-name">Name</label>
              <input id="variety-name" className={adminField} value={name} maxLength={80} disabled={busy}
                onChange={(event) => setName(event.target.value)} />
            </div>
            <fieldset>
              <legend className={adminLabel}>Eras</legend>
              <div className="flex flex-wrap gap-2">
                {report.eraSet.map((era) => (
                  <label key={era} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-sm text-slate-700">
                    <input type="checkbox" checked={eras.includes(era)} disabled={busy}
                      onChange={(event) => setEras((prev) => event.target.checked ? [...prev, era] : prev.filter((value) => value !== era))} />
                    {era}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className={adminLabel} htmlFor="variety-note">Note</label>
              <input id="variety-note" className={adminField} value={note} maxLength={200} disabled={busy}
                onChange={(event) => setNote(event.target.value)} />
            </div>
            <button type="submit" disabled={busy || !name.trim() || !eras.length}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Add
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Top subjects</h3>
            {report.topSubjects.length ? (
              <ol className="mt-3 space-y-1 text-sm text-slate-700">
                {report.topSubjects.map((subject) => (
                  <li key={subject.subject} className="flex justify-between gap-3">
                    <span>{subject.subject}</span>
                    <span className="tabular-nums text-slate-500">{subject.count}</span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-slate-500">None yet.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
};
