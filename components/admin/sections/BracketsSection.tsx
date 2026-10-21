"use client";

import { useCallback, useEffect, useState } from "react";
import { adminField, adminLabel } from "@/lib/adminStyles";
import { BRACKET_GAME_NAME } from "@/lib/venueGameCards";
import type { BracketGameState, BracketTeam } from "@/lib/brackets/games";
import type { BracketsAdminOverview, BracketsAdminTournament } from "@/lib/bracketsAdmin";
import type { BracketSyncReport } from "@/lib/bracketsSync";

// Admin panel for the bracket engine (docs/squares-and-brackets-plan.md, Phase 7). Status plus the
// fix-ups: create a tournament (live, or a rehearsal replay on a past season), run / dry-run the
// sync, region names, link an opening-round game to its seat, set a seat's team, override a result
// (re-grades; a complete round's venue points are taken back and paid again; "No result" HOLDS the
// game so the feed can't fill it until "Let the feed decide"), move a lock, set a rehearsal's replay
// clock, archive. Every change is logged server-side and asks for a sync (plan 10.1). The
// championship row also takes the final score, for when the feed has none (prizes need it, 10.2).

const ROUND_LABEL: Record<number, string> = {
  0: "Opening round",
  1: "Round of 64",
  2: "Round of 32",
  3: "Sweet 16",
  4: "Elite Eight",
  5: "Final Four",
  6: "Championship",
};

const formatTime = (iso: string | null | undefined): string => (iso ? new Date(iso).toLocaleString() : "—");

const toLocalInput = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const teamLabel = (team: BracketTeam | null): string => (team ? `${team.seed ?? "?"} ${team.college || team.name}` : "TBD");

const buttonClass =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50";
const primaryClass =
  "rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";

type Post = (body: Record<string, unknown>, confirmText?: string) => Promise<void>;

const syncSummary = (sync: BracketSyncReport): string =>
  `${sync.label}${sync.dryRun ? " (dry run)" : ""}: ${sync.changedGames} game(s) changed, ${sync.newResults} new result(s), ` +
  `${sync.mismatches} mismatch(es)${sync.locksMoved.length ? `, locks ${sync.locksMoved.join(", ")}` : ""}` +
  `${sync.paidRounds.length ? `, paid round(s) ${sync.paidRounds.join(", ")} (${sync.credited} credits)` : ""}` +
  `${sync.needsAdmin ? `. NEEDS ADMIN: ${sync.needsAdmin}` : ""}${sync.errors.length ? `. Errors: ${sync.errors.join("; ")}` : ""}.`;

function GameRow({ tournamentId, game, post, busy }: { tournamentId: string; game: BracketGameState; post: Post; busy: boolean }) {
  const [winner, setWinner] = useState<string>(game.winnerSide ?? "");
  const [reason, setReason] = useState("");
  const isFinal = game.round === 6;
  const [homeScore, setHomeScore] = useState(game.homeScore === null ? "" : String(game.homeScore));
  const [awayScore, setAwayScore] = useState(game.awayScore === null ? "" : String(game.awayScore));
  // Scores go with the override only when both are filled and differ from what is stored.
  const scoresGiven = isFinal && homeScore !== "" && awayScore !== "";
  const scoresChanged = scoresGiven && (Number(homeScore) !== game.homeScore || Number(awayScore) !== game.awayScore);
  const status = game.winnerSide
    ? `${game.winnerSide === "home" ? teamLabel(game.homeTeam) : teamLabel(game.awayTeam)} won${game.resultSource === "admin" ? " (admin)" : ""}`
    : game.statusDetail ?? "—";
  // "No result" on a game that isn't held yet is a change: it holds the game.
  const unchanged = winner === (game.winnerSide ?? "") && (winner !== "" || game.resultHeld) && !scoresChanged;
  return (
    <li className="flex flex-wrap items-end gap-2 border-b border-slate-100 py-2">
      <div className="min-w-[14rem] flex-1">
        <p className="text-sm text-slate-900">
          {game.round === 0 ? `Opener ${game.location}` : `Slot ${game.slot}`} · {teamLabel(game.homeTeam)} {game.homeScore ?? ""} vs{" "}
          {teamLabel(game.awayTeam)} {game.awayScore ?? ""}{" "}
          {game.resultHeld && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-caption font-bold text-amber-800">HELD</span>
          )}
        </p>
        <p className="text-caption text-slate-600">
          {formatTime(game.tipAt)} · {status}
        </p>
        {game.mismatchNote ? <p className="text-caption font-semibold text-amber-700">{game.mismatchNote}</p> : null}
      </div>
      <select className={adminField} value={winner} onChange={(e) => setWinner(e.target.value)} aria-label="Winner">
        <option value="">No result</option>
        <option value="home">{teamLabel(game.homeTeam)}</option>
        <option value="away">{teamLabel(game.awayTeam)}</option>
      </select>
      {isFinal && (
        <>
          <input
            className={`${adminField} w-24`}
            type="number"
            min={0}
            max={200}
            inputMode="numeric"
            aria-label={`${teamLabel(game.homeTeam)} final score`}
            placeholder="Home pts"
            value={homeScore}
            onChange={(e) => setHomeScore(e.target.value)}
          />
          <input
            className={`${adminField} w-24`}
            type="number"
            min={0}
            max={200}
            inputMode="numeric"
            aria-label={`${teamLabel(game.awayTeam)} final score`}
            placeholder="Away pts"
            value={awayScore}
            onChange={(e) => setAwayScore(e.target.value)}
          />
        </>
      )}
      <input className={adminField} placeholder="Reason (logged)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button
        type="button"
        className={buttonClass}
        disabled={busy || reason.trim().length < 3 || unchanged}
        onClick={() =>
          void post(
            {
              action: "override_result",
              tournamentId,
              round: game.round,
              location: game.location,
              winner: winner || null,
              reason,
              ...(scoresChanged ? { homeScore: Number(homeScore), awayScore: Number(awayScore) } : {}),
            },
            (winner
              ? "Override this result? "
              : "Hold this game with no result? The feed won't fill it until you press Let the feed decide. ") +
              "Every bracket is re-scored. If its round was already complete, that round's venue points are taken back and paid again at the next sync. Prizes already settled after the championship are NOT changed.",
          )
        }
      >
        Override
      </button>
      {game.resultHeld && (
        <button
          type="button"
          className={buttonClass}
          disabled={busy || reason.trim().length < 3}
          onClick={() =>
            void post(
              { action: "release_result", tournamentId, round: game.round, location: game.location, reason },
              "Let the feed decide this game? The next sync records the feed's final result.",
            )
          }
        >
          Let the feed decide
        </button>
      )}
    </li>
  );
}

function TournamentCard({ item, post, busy }: { item: BracketsAdminTournament; post: Post; busy: boolean }) {
  const { tournament: t, games } = item;
  const [regions, setRegions] = useState<string[]>(t.regionNames.map((name) => name ?? ""));
  const [mainLock, setMainLock] = useState(toLocalInput(t.mainLockAt));
  const [secondLock, setSecondLock] = useState(toLocalInput(t.secondLockAt));
  const [clock, setClock] = useState(toLocalInput(item.clockNow));
  const [archiveReason, setArchiveReason] = useState("");
  const [openerSeat, setOpenerSeat] = useState<Record<number, string>>({});
  const [seatTeam, setSeatTeam] = useState<Record<string, string>>({});
  const label = `${t.gender === "men" ? "Men's" : "Women's"} tournament, March ${t.season + 1}`;
  const round1 = games.filter((g) => g.round === 1);
  const openers = games.filter((g) => g.round === 0);
  const emptySeats = round1.flatMap((g) =>
    (["home", "away"] as const).filter((side) => !(side === "home" ? g.homeTeam : g.awayTeam)).map((side) => ({ game: g, side })),
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <div className="grid gap-1 text-sm text-slate-800">
        <p className="text-base font-bold text-slate-900">
          {label}{" "}
          {t.purpose === "rehearsal" && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-caption font-bold text-amber-800">REHEARSAL</span>
          )}
        </p>
        {t.purpose === "rehearsal" && (
          <p>Replay clock {formatTime(item.clockNow)}. Only hidden venues can enter, so only they get points.</p>
        )}
        <p>
          Main: {item.phases.main} · lock {formatTime(t.mainLockAt)} ({t.mainLockSetBy}) · {item.entries.main} entries
        </p>
        <p>
          Second chance: {item.phases.second} · lock {formatTime(t.secondLockAt)} ({t.secondLockSetBy}) · {item.entries.second} entries
        </p>
        <p>
          Feed read {formatTime(t.feedCheckedAt)} · next {t.nextSyncAt ? formatTime(t.nextSyncAt) : t.completedAt ? "done" : "now"} ·{" "}
          {t.winnerSeats.filter((s) => s !== null).length} of 63 decided
          {t.championshipTotal !== null ? ` · championship total ${t.championshipTotal}` : ""}
        </p>
        <p className="text-caption text-slate-600">
          Prizes:{" "}
          {t.prizesSettledAt
            ? `settled ${formatTime(t.prizesSettledAt)} (a later correction does not change them)`
            : "settled after the championship"}
        </p>
        <p className="text-caption text-slate-600">
          Venue points by round:{" "}
          {item.rounds
            .map((r) => `${ROUND_LABEL[r.round]} ${r.paidGradeNo === r.gradeNo ? `paid ${formatTime(r.paidAt)}` : "not paid"}${r.gradeNo > 1 ? ` (grade ${r.gradeNo})` : ""}`)
            .join(" · ")}
        </p>
      </div>

      {item.problems.length > 0 && (
        <ul className="rounded border border-amber-300 bg-amber-50 p-2">
          {item.problems.map((problem) => (
            <li key={problem} className="text-caption text-amber-900">
              {problem}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryClass} disabled={busy} onClick={() => void post({ action: "sync", tournamentId: t.id })}>
          Sync now
        </button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => void post({ action: "dry_run", tournamentId: t.id })}>
          Dry run (no writes)
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {regions.map((name, i) => (
          <label key={i} className="block">
            <span className={adminLabel}>Region {i + 1}</span>
            <input
              className={adminField}
              value={name}
              onChange={(e) => setRegions((list) => list.map((value, j) => (j === i ? e.target.value : value)))}
            />
          </label>
        ))}
        <div className="flex items-end">
          <button
            type="button"
            className={buttonClass}
            disabled={busy}
            onClick={() => void post({ action: "set_region_names", tournamentId: t.id, names: regions.map((r) => r.trim() || null) })}
          >
            Save regions
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["main", mainLock, setMainLock, "Main bracket lock"],
            ["second", secondLock, setSecondLock, "Second-chance lock"],
          ] as const
        ).map(([kind, value, set, text]) => (
          <div key={kind} className="flex flex-wrap items-end gap-2">
            <label className="block flex-1">
              <span className={adminLabel}>{text} (your clock{t.purpose === "rehearsal" ? ", replay time" : ""})</span>
              <input className={adminField} type="datetime-local" value={value} onChange={(e) => set(e.target.value)} />
            </label>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !value}
              onClick={() => void post({ action: "move_lock", tournamentId: t.id, kind, lockAt: new Date(value).toISOString() }, "Move this lock? Entries close then.")}
            >
              Save
            </button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void post({ action: "move_lock", tournamentId: t.id, kind, lockAt: null })}>
              Follow feed
            </button>
          </div>
        ))}
      </div>

      {t.purpose === "rehearsal" && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className={adminLabel}>Replay clock (set it later to move the replay forward)</span>
            <input className={adminField} type="datetime-local" value={clock} onChange={(e) => setClock(e.target.value)} />
          </label>
          <button
            type="button"
            className={buttonClass}
            disabled={busy || !clock}
            onClick={() => void post({ action: "set_clock", tournamentId: t.id, asOf: new Date(clock).toISOString() })}
          >
            Set clock
          </button>
        </div>
      )}

      {openers.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-slate-900">Opening round → Round-of-64 seat</p>
          {openers.map((opener) => (
            <div key={opener.location} className="flex flex-wrap items-end gap-2">
              <p className="min-w-[16rem] flex-1 text-sm text-slate-800">
                Opener {opener.location}: {teamLabel(opener.homeTeam)} / {teamLabel(opener.awayTeam)} →{" "}
                {opener.feedsSeat === null ? "not linked" : `seat ${opener.feedsSeat} (${opener.feedsSeatSetBy})`}
              </p>
              <select
                className={adminField}
                aria-label="Seat"
                value={openerSeat[opener.location] ?? ""}
                onChange={(e) => setOpenerSeat((m) => ({ ...m, [opener.location]: e.target.value }))}
              >
                <option value="">Choose a seat…</option>
                {round1.flatMap((g) =>
                  (["home", "away"] as const).map((side) => {
                    const seat = 2 * (g.slot as number) + (side === "home" ? 0 : 1);
                    return (
                      <option key={seat} value={seat}>
                        Seat {seat}: game {g.location} {side} ({teamLabel(side === "home" ? g.homeTeam : g.awayTeam)})
                      </option>
                    );
                  }),
                )}
              </select>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !openerSeat[opener.location]}
                onClick={() => void post({ action: "link_opener", tournamentId: t.id, location: opener.location, seat: Number(openerSeat[opener.location]) })}
              >
                Link
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || opener.feedsSeat === null}
                onClick={() => void post({ action: "link_opener", tournamentId: t.id, location: opener.location, seat: null })}
              >
                Unlink
              </button>
            </div>
          ))}
        </div>
      )}

      {emptySeats.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-slate-900">Round-of-64 seats with no team</p>
          {emptySeats.map(({ game, side }) => {
            const key = `${game.slot}:${side}`;
            return (
              <div key={key} className="flex flex-wrap items-end gap-2">
                <p className="min-w-[12rem] flex-1 text-sm text-slate-800">
                  Game {game.location} ({side}) vs {teamLabel(side === "home" ? game.awayTeam : game.homeTeam)}
                </p>
                <select className={adminField} aria-label="Team" value={seatTeam[key] ?? ""} onChange={(e) => setSeatTeam((m) => ({ ...m, [key]: e.target.value }))}>
                  <option value="">Choose a team…</option>
                  {item.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {teamLabel(team)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || !seatTeam[key]}
                  onClick={() => void post({ action: "set_seat_team", tournamentId: t.id, slot: game.slot, side, teamId: Number(seatTeam[key]) })}
                >
                  Set team
                </button>
              </div>
            );
          })}
        </div>
      )}

      {[0, 1, 2, 3, 4, 5, 6].map((round) => {
        const roundGames = games.filter((g) => g.round === round);
        if (roundGames.length === 0) return null;
        return (
          <details key={round} className="rounded border border-slate-200 p-2">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              {ROUND_LABEL[round]} · {roundGames.filter((g) => g.winnerSide).length}/{roundGames.length} decided
            </summary>
            <ul>
              {roundGames.map((game) => (
                <GameRow key={`${game.round}:${game.location}`} tournamentId={t.id} game={game} post={post} busy={busy} />
              ))}
            </ul>
          </details>
        );
      })}

      <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
        <label className="block flex-1">
          <span className={adminLabel}>Archive reason</span>
          <input className={adminField} value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} />
        </label>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || archiveReason.trim().length < 3}
          onClick={() => void post({ action: "archive", tournamentId: t.id, reason: archiveReason }, "Archive this tournament? Players will no longer see it, and the sync never re-creates it.")}
        >
          Archive
        </button>
      </div>
    </div>
  );
}

export function BracketsSection() {
  const [overview, setOverview] = useState<BracketsAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [gender, setGender] = useState<"men" | "women">("men");
  const [season, setSeason] = useState("");
  const [purpose, setPurpose] = useState<"live" | "rehearsal">("rehearsal");
  const [asOf, setAsOf] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/brackets", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; overview?: BracketsAdminOverview; error?: string };
      if (!json.ok || !json.overview) throw new Error(json.error ?? "Failed to load.");
      setOverview(json.overview);
      setSeason((value) => value || String(json.overview?.flags.season ?? ""));
      setError("");
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
      const res = await fetch("/api/admin/brackets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        sync?: BracketSyncReport;
        tick?: { synced: BracketSyncReport[]; errors: string[] };
      };
      if (!json.ok) throw new Error(json.error ?? "Failed.");
      const reports = [...(json.sync ? [json.sync] : []), ...(json.tick?.synced ?? [])].map(syncSummary);
      const tickErrors = json.tick?.errors.length ? ` Errors: ${json.tick.errors.join("; ")}` : "";
      setMessage([json.message ?? "Done.", ...reports].join(" ") + tickErrors);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const flags = overview?.flags;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{BRACKET_GAME_NAME}</h2>
        {flags && (
          <p className="text-caption text-slate-600">
            Player switch {flags.enabled ? "on" : "off"} · Rehearsal {flags.rehearsal ? "on" : "off"} · Sync running now:{" "}
            {flags.syncMode ? [flags.syncMode.live && "live", flags.syncMode.rehearsal && "rehearsals"].filter(Boolean).join(" + ") : "no"} · Card
            window {flags.window.opensOn} to {flags.window.closesAfter} · feed season {flags.season}
          </p>
        )}
      </div>

      {error && <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
      {loading && !overview && <p className="text-sm text-slate-500">Loading…</p>}

      {overview && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryClass} disabled={busy} onClick={() => void post({ action: "discover" })}>
              Look for this season&apos;s brackets
            </button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void post({ action: "run_now" })}>
              Run the sync now
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className={adminLabel}>Tournament</span>
              <select className={adminField} value={gender} onChange={(e) => setGender(e.target.value === "women" ? "women" : "men")}>
                <option value="men">Men&apos;s</option>
                <option value="women">Women&apos;s</option>
              </select>
            </label>
            <label className="block">
              <span className={adminLabel}>Feed season (2025 = March 2026)</span>
              <input className={adminField} inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value)} />
            </label>
            <label className="block">
              <span className={adminLabel}>Kind</span>
              <select className={adminField} value={purpose} onChange={(e) => setPurpose(e.target.value === "live" ? "live" : "rehearsal")}>
                <option value="rehearsal">Rehearsal (hidden venues only)</option>
                <option value="live">Live (every venue)</option>
              </select>
            </label>
            {purpose === "rehearsal" && (
              <label className="block">
                <span className={adminLabel}>Replay starts at (past)</span>
                <input className={adminField} type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
              </label>
            )}
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !season.trim() || (purpose === "rehearsal" && !asOf)}
              onClick={() =>
                void post(
                  {
                    action: "create",
                    gender,
                    season: Number(season),
                    purpose,
                    ...(purpose === "rehearsal" ? { asOf: new Date(asOf).toISOString() } : {}),
                  },
                  purpose === "live" ? "Create a LIVE tournament? Every venue will show it." : undefined,
                )
              }
            >
              Create
            </button>
          </div>
        </div>
      )}

      {overview?.tournaments.length === 0 && (
        <p className="text-sm text-slate-700">No current tournament. The sync creates them from the feed on Selection Sunday.</p>
      )}
      {overview?.tournaments.map((item) => (
        <TournamentCard key={`${item.tournament.id}:${item.tournament.feedCheckedAt ?? ""}`} item={item} post={post} busy={busy} />
      ))}

      {overview && overview.archived.length > 0 && (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="mb-2 text-sm font-semibold text-slate-900">Archived</p>
          <ul className="flex flex-col gap-1">
            {overview.archived.map((a) => (
              <li key={a.id} className="text-caption text-slate-700">
                {a.gender} {a.season + 1} ({a.purpose}) · archived {formatTime(a.archivedAt)}
              </li>
            ))}
          </ul>
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
