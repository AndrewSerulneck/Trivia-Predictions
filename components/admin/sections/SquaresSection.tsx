"use client";

import { useCallback, useEffect, useState } from "react";
import { adminField, adminLabel } from "@/lib/adminStyles";
import { SQUARES_MOMENT_POINTS, type SquaresMoment } from "@/lib/seasonalPoints";
import { SQUARES_GAME_NAME } from "@/lib/venueGameCards";
import type { SquaresAdminOverview } from "@/lib/squaresAdmin";
import type { SquaresMomentRecord } from "@/lib/squaresStore";

// Admin panel for the Squares engine (docs/squares-and-brackets-plan.md, Phase 2). Status plus the
// fix-ups: create / re-point the event, move the lock, run the settlement now, grade a moment by
// hand, void (and optionally re-grade) a moment, archive. Every change is logged server-side.

const MOMENT_LABEL: Record<SquaresMoment, string> = { q1: "End of Q1", half: "Halftime", q3: "End of Q3", final: "Final" };

const formatTime = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : "—");

const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const buttonClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50";
const primaryClass =
  "rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";

type Post = (body: Record<string, unknown>, confirmText?: string) => Promise<void>;

function MomentRow({ moment, drawn, post, busy }: { moment: SquaresMomentRecord; drawn: boolean; post: Post; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [col, setCol] = useState("");
  const [row, setRow] = useState("");
  const [reason, setReason] = useState("");
  const graded = moment.graded;
  const scores = col.trim() !== "" && row.trim() !== "" ? { colScore: Number(col), rowScore: Number(row) } : {};

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {MOMENT_LABEL[moment.moment]} · {SQUARES_MOMENT_POINTS[moment.moment]} pts · grade #{moment.gradeNo}
          </p>
          <p className="text-caption text-slate-600">
            {graded
              ? `Graded ${graded.col}–${graded.row} → cell ${graded.winningCell} (${graded.source}) at ${formatTime(graded.gradedAt)}`
              : moment.observed
                ? `Seen ${moment.observed.col}–${moment.observed.row} since ${formatTime(new Date(moment.observed.atMs).toISOString())}`
                : "Waiting"}
          </p>
          {moment.mismatchNote ? <p className="text-caption font-semibold text-amber-700">{moment.mismatchNote}</p> : null}
        </div>
        {(graded || drawn) && (
          <button type="button" className={buttonClass} disabled={busy} onClick={() => setOpen((v) => !v)}>
            {graded ? "Void…" : "Grade by hand…"}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <label className="block">
            <span className={adminLabel}>Column team score</span>
            <input className={adminField} inputMode="numeric" value={col} onChange={(e) => setCol(e.target.value)} />
          </label>
          <label className="block">
            <span className={adminLabel}>Row team score</span>
            <input className={adminField} inputMode="numeric" value={row} onChange={(e) => setRow(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className={adminLabel}>Reason (logged)</span>
            <input className={adminField} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="sm:col-span-4">
            <button
              type="button"
              className={primaryClass}
              disabled={busy}
              onClick={() =>
                void post(
                  graded
                    ? { action: "void_moment", moment: moment.moment, reason, ...scores }
                    : { action: "grade_moment", moment: moment.moment, reason, ...scores },
                  graded
                    ? `Void ${MOMENT_LABEL[moment.moment]}? Points already paid for it are taken back. An unused Prize coupon for it is taken back (a used one is kept), and the corrected winner gets one.${
                        "colScore" in scores ? " It is re-graded with your scores." : " It re-grades from the feed (leave scores empty)."
                      }`
                    : `Grade ${MOMENT_LABEL[moment.moment]} by hand at ${col}–${row}?`,
                )
              }
            >
              {graded ? ("colScore" in scores ? "Void and re-grade" : "Void") : "Grade"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SquaresSection() {
  const [overview, setOverview] = useState<SquaresAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [gameId, setGameId] = useState("");
  const [lockAt, setLockAt] = useState("");
  const [archiveReason, setArchiveReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/squares", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; overview?: SquaresAdminOverview; error?: string };
      if (!json.ok || !json.overview) throw new Error(json.error ?? "Failed to load.");
      setOverview(json.overview);
      setError("");
      if (json.overview.event) setLockAt(toLocalInput(json.overview.event.lockAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post: Post = async (body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/squares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; message?: string; error?: string; tick?: { actions: string[]; errors: string[]; skipped?: string } };
      if (!json.ok) throw new Error(json.error ?? "Failed.");
      const tick = json.tick
        ? ` Actions: ${json.tick.actions.join(", ") || json.tick.skipped || "none"}.${json.tick.errors.length ? ` Errors: ${json.tick.errors.join("; ")}` : ""}`
        : "";
      setMessage(`${json.message ?? "Done."}${tick}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const event = overview?.event ?? null;
  const flags = overview?.flags;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{SQUARES_GAME_NAME}</h2>
        {flags && (
          <p className="text-caption text-slate-600">
            Player switch {flags.enabled ? "on" : "off"} · Rehearsal {flags.rehearsal ? "on" : "off"} · Settlement running now:{" "}
            {flags.settlementActiveNow ? "yes" : "no"} · Card window {flags.window.opensOn} to {flags.window.closesAfter} · NFL season {flags.season}
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading && !overview && <p className="text-sm text-slate-500">Loading…</p>}

      {overview && !event && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <p className="text-sm text-slate-700">No current event. The settlement creates one from the feed once the Super Bowl matchup exists.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryClass} disabled={busy} onClick={() => void post({ action: "discover" })}>
              Find the Super Bowl in the feed
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className={adminLabel}>Or any NFL game id (rehearsal)</span>
              <input className={adminField} inputMode="numeric" value={gameId} onChange={(e) => setGameId(e.target.value)} />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !gameId.trim()}
              onClick={() => void post({ action: "create_from_game", gameId: Number(gameId) }, `Create the event for game ${gameId}?`)}
            >
              Create event
            </button>
          </div>
        </div>
      )}

      {event && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <div className="grid gap-1 text-sm text-slate-800">
            <p>
              <span className="font-semibold">Columns:</span> {event.colTeam.fullName} ({event.colTeam.conference ?? "?"}) ·{" "}
              <span className="font-semibold">Rows:</span> {event.rowTeam.fullName} ({event.rowTeam.conference ?? "?"})
            </p>
            <p>
              Game {event.bdlGameId} · kickoff {formatTime(event.kickoffAt)} · lock {formatTime(event.lockAt)} ({event.lockAtSetBy})
            </p>
            <p>
              Drawn: {event.drawnAt ? `${formatTime(event.drawnAt)} — columns ${event.colDigits?.join(" ")} / rows ${event.rowDigits?.join(" ")}` : "not yet"}
            </p>
            <p>
              Live: {event.liveScore ? `${event.liveScore.col ?? "–"}–${event.liveScore.row ?? "–"} · ${event.liveScore.status ?? ""} (read ${formatTime(event.liveScore.at)})` : "—"}
              {event.completedAt ? ` · complete ${formatTime(event.completedAt)}` : ""}
            </p>
            <p>
              Boards {overview?.counts.boards ?? 0} · claimed squares {overview?.counts.claims ?? 0} · unpaid wins {overview?.counts.unpaid ?? 0}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryClass} disabled={busy} onClick={() => void post({ action: "run_now" })}>
              Run settlement now
            </button>
          </div>

          {!event.drawnAt && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-end gap-2">
                <label className="block flex-1">
                  <span className={adminLabel}>Change game id</span>
                  <input className={adminField} inputMode="numeric" value={gameId} onChange={(e) => setGameId(e.target.value)} />
                </label>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || !gameId.trim()}
                  onClick={() => void post({ action: "set_game", gameId: Number(gameId) }, `Point the event at game ${gameId}?`)}
                >
                  Save
                </button>
              </div>
              <div className="flex items-end gap-2">
                <label className="block flex-1">
                  <span className={adminLabel}>Lock time (your clock)</span>
                  <input className={adminField} type="datetime-local" value={lockAt} onChange={(e) => setLockAt(e.target.value)} />
                </label>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || !lockAt}
                  onClick={() => void post({ action: "move_lock", lockAt: new Date(lockAt).toISOString() }, "Move the lock time? Claims close and numbers are drawn then.")}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {overview?.moments.map((moment) => (
              <MomentRow key={moment.moment} moment={moment} drawn={Boolean(event.drawnAt)} post={post} busy={busy} />
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
            <label className="block flex-1">
              <span className={adminLabel}>Archive reason</span>
              <input className={adminField} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || archiveReason.trim().length < 3}
              onClick={() => void post({ action: "archive", reason: archiveReason }, "Archive this event? Players will no longer see it.")}
            >
              Archive event
            </button>
          </div>
        </div>
      )}

      {overview && overview.log.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="mb-2 text-sm font-semibold text-slate-900">Log</p>
          <ul className="flex flex-col gap-1">
            {overview.log.map((entry) => (
              <li key={entry.id} className="text-caption text-slate-700">
                {formatTime(entry.createdAt)} · {entry.actor} · {entry.action} · {JSON.stringify(entry.detail)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
