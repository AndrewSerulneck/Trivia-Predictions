"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BracketEditor, type BracketFlush } from "@/components/bracket/BracketEditor";
import { BracketReview } from "@/components/bracket/BracketReview";
import { BracketStandings } from "@/components/bracket/BracketStandings";
import { useBracketData } from "@/components/bracket/useBracketData";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { GameAppBar } from "@/components/venue/AppBar";
import { haptic } from "@/lib/haptics";
import { SEASONAL_GAME_WINDOWS, seasonalWindowState } from "@/lib/seasonalGames";
import { getUserId, getVenueId } from "@/lib/storage";
import { BRACKET_TEASER_SUBTITLE } from "@/lib/venueGameCards";
import { slotsOfKind } from "@/lib/brackets/tree";
import {
  bracketChampionPick,
  bracketDisplayYear,
  bracketGenderLabel,
  bracketHeadline,
  bracketKeyFor,
  bracketKindLabel,
  bracketProgressLine,
  bracketSaveMessage,
  bracketSeatTeams,
  bracketSwitcher,
  defaultBracketKey,
  selectableBrackets,
  type BracketOption,
} from "@/lib/bracketsView";

// The March Madness screen (docs/squares-and-brackets-plan.md Phase 8): a switcher for the brackets that
// are open or graded, then for the chosen one —
//   open      a summary with Fill out / Edit and "Copy my picks from <Venue>", and the editor;
//   locked    "My bracket" (right / wrong / still alive) and "Standings" with Find a player.
// Every rule is in lib/brackets/* and lib/bracketsView.ts; the reads and their cost rules are in
// useBracketData.ts (one read when the page opens, no polling).

type Mode = "home" | "edit" | "bracket" | "standings";

const EXIT_SAVE_WAIT_MS = 3_000;

const defaultMode = (option: BracketOption): Mode => {
  if (option.phase === "open") return "home";
  return (option.tournament.kinds[option.kind].mine?.pickCount ?? 0) > 0 ? "bracket" : "standings";
};

export function BracketGame({ onBack }: { /** Injected by GameLandingExperience (runs the venue return transition). */ onBack?: () => void }) {
  const [identity, setIdentity] = useState<{ userId: string; venueId: string } | null | undefined>(undefined);
  useEffect(() => {
    const userId = getUserId() || "";
    const venueId = getVenueId() || "";
    Promise.resolve().then(() => setIdentity(userId && venueId ? { userId, venueId } : null));
  }, []);

  const { status, tournaments, save, copy, reload } = useBracketData(identity ?? null);
  const [now] = useState(() => new Date());

  const options = useMemo(() => selectableBrackets(tournaments), [tournaments]);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const selected = useMemo(
    () => options.find((option) => option.key === (pickedKey ?? defaultBracketKey(options))) ?? options[0] ?? null,
    [options, pickedKey],
  );
  const [view, setView] = useState<{ key: string; mode: Mode } | null>(null);
  const mode: Mode = selected ? (view?.key === selected.key ? view.mode : defaultMode(selected)) : "home";
  // A phase that moved on (the bracket just locked) cannot stay in the editor.
  const effectiveMode: Mode = selected && selected.phase !== "open" && (mode === "edit" || mode === "home") ? defaultMode(selected) : mode;
  const setMode = useCallback((key: string, next: Mode) => setView({ key, mode: next }), []);

  const seatTeams = useMemo(() => (selected ? bracketSeatTeams(selected.tournament.games) : []), [selected]);
  const switcher = useMemo(() => bracketSwitcher(options, selected), [options, selected]);

  // Copying a bracket replaces the editor's draft, so it gets a new editor.
  const [copyNonce, setCopyNonce] = useState(0);
  const [copyState, setCopyState] = useState<{ confirm: string | null; busy: boolean; message: string | null }>({
    confirm: null,
    busy: false,
    message: null,
  });

  const flushRef = useRef<BracketFlush | null>(null);
  const exit = useCallback(async () => {
    try {
      const flush = flushRef.current?.();
      if (flush) await Promise.race([flush, new Promise<void>((resolve) => window.setTimeout(resolve, EXIT_SAVE_WAIT_MS))]);
    } finally {
      onBack?.();
    }
  }, [onBack]);

  const selectedId = selected?.tournament.id;
  const selectedKind = selected?.kind;
  const saveEntry = useCallback(
    (picks: ReadonlyArray<number | null>, tiebreaker: number | null, keepalive?: boolean) =>
      save({ tournamentId: selectedId ?? "", kind: selectedKind ?? "main", picks, tiebreaker, keepalive }),
    [save, selectedId, selectedKind],
  );

  const runCopy = useCallback(
    async (fromVenueId: string) => {
      if (!selectedId || !selectedKind) return;
      setCopyState({ confirm: null, busy: true, message: null });
      const result = await copy({ tournamentId: selectedId, kind: selectedKind, fromVenueId });
      if (result.ok) {
        haptic("success");
        setCopyNonce((value) => value + 1);
        setCopyState({ confirm: null, busy: false, message: null });
        return;
      }
      haptic("warning");
      setCopyState({
        confirm: null,
        busy: false,
        message: result.network ? "No connection. Please try again." : bracketSaveMessage(result.outcome),
      });
    },
    [copy, selectedId, selectedKind],
  );

  const editing = selected?.phase === "open" && effectiveMode === "edit";
  const kindState = selected ? selected.tournament.kinds[selected.kind] : null;
  const headline = selected && kindState
    ? bracketHeadline({ phase: selected.phase, kind: selected.kind, mine: kindState.mine, lockAt: kindState.lockAt })
    : null;
  const total = selected ? slotsOfKind(selected.kind).length : 0;
  const mine = kindState?.mine ?? null;
  const champion = mine ? bracketChampionPick(mine.picks, selected?.tournament.winnerSeats ?? []) : null;
  const championName = champion ? (seatTeams[champion.seat]?.name ?? null) : null;

  const teaser = seasonalWindowState(SEASONAL_GAME_WINDOWS.bracket, now) === "teaser";

  return (
    <div className="min-h-[60vh] text-white">
      <GameAppBar game="bracket" onExit={() => void exit()} />

      <div className="space-y-3 px-2 pb-8 pt-3">
        {status === "loading" || identity === undefined ? (
          <div className="flex justify-center py-16">
            <HightopLoader />
          </div>
        ) : status === "no-venue" ? (
          <Notice title="Open this from your venue" detail="Join your venue first, then come back to fill out your bracket." />
        ) : status === "off" ? (
          <Notice title="Not available right now" detail="This game isn't open yet." />
        ) : status === "error" ? (
          <Notice title="The bracket didn't load" detail="Check your connection and try again." action={{ label: "Try again", onClick: reload }} />
        ) : !selected || !kindState || !headline ? (
          <Notice
            title={teaser ? "Brackets open Selection Sunday" : "Brackets open soon"}
            detail={teaser ? BRACKET_TEASER_SUBTITLE : "They open as soon as the matchups are set."}
          />
        ) : (
          <>
            {editing ? (
              <h1 className="px-1 text-footnote font-black uppercase tracking-wide text-orange-200">
                {selected.label} · {bracketDisplayYear(selected.tournament.season)}
                {selected.tournament.rehearsal ? " · Rehearsal" : ""}
              </h1>
            ) : (
              <>
                {switcher.genders.length > 1 || switcher.kinds.length > 1 ? (
                  <nav aria-label="Brackets" className="space-y-1.5">
                    {switcher.genders.length > 1 ? (
                      <Chips
                        label="Tournament"
                        items={switcher.genders.map((gender) => ({
                          id: gender,
                          text: bracketGenderLabel(gender),
                          active: gender === selected.tournament.gender,
                        }))}
                        onSelect={(gender) => {
                          const key = bracketKeyFor(options, gender as "men" | "women", selected.kind);
                          if (key) setPickedKey(key);
                        }}
                      />
                    ) : null}
                    {switcher.kinds.length > 1 ? (
                      <Chips
                        label="Bracket"
                        items={switcher.kinds.map((kind) => ({ id: kind, text: bracketKindLabel(kind), active: kind === selected.kind }))}
                        onSelect={(kind) => {
                          const key = bracketKeyFor(options, selected.tournament.gender, kind as "main" | "second");
                          if (key) setPickedKey(key);
                        }}
                      />
                    ) : null}
                  </nav>
                ) : null}

                <section aria-live="polite" className="px-1">
                  <p className="text-caption font-black uppercase tracking-wide text-orange-200">
                    {selected.label} · {bracketDisplayYear(selected.tournament.season)}
                    {selected.tournament.rehearsal ? " · Rehearsal" : ""}
                  </p>
                  <h1 className="text-[clamp(1.5rem,7vw,1.9rem)] font-black leading-tight [font-family:var(--ht-font-display)]">{headline.title}</h1>
                  {headline.detail ? <p className="mt-0.5 text-footnote font-semibold text-orange-100/80">{headline.detail}</p> : null}
                </section>
              </>
            )}

            {selected.phase !== "open" ? (
              <div role="tablist" aria-label="View" className="grid grid-cols-2 gap-1.5">
                {(["bracket", "standings"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={effectiveMode === tab}
                    onClick={() => setMode(selected.key, tab)}
                    className={`tp-player-pressable min-h-[2.5rem] !rounded-full !border-0 text-footnote !font-black ${
                      effectiveMode === tab ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white"
                    }`}
                  >
                    {tab === "bracket" ? "My bracket" : "Standings"}
                  </button>
                ))}
              </div>
            ) : null}

            {selected.phase === "open" && effectiveMode === "edit" ? (
              <BracketEditor
                key={`${selected.key}:${copyNonce}`}
                option={selected}
                seatTeams={seatTeams}
                onSave={saveEntry}
                onSaved={() => setMode(selected.key, "home")}
                flushRef={flushRef}
              />
            ) : null}

            {selected.phase === "open" && effectiveMode !== "edit" ? (
              <section className="space-y-3">
                <div className="space-y-2 rounded-2xl bg-black/25 px-4 py-4">
                  <p className="text-base font-black tabular-nums">
                    {mine ? bracketProgressLine(mine.picks, selected.kind) : `0 of ${total}`} picks made
                  </p>
                  {championName ? <p className="text-footnote font-semibold text-orange-100/80">Your champion: {championName}</p> : null}
                  <button
                    type="button"
                    onClick={() => {
                      haptic("commit");
                      setMode(selected.key, "edit");
                    }}
                    className="tp-player-hit-target tp-player-pressable w-full !rounded-2xl !border-0 bg-amber-300 px-4 py-3 text-base !font-black text-slate-950"
                  >
                    {!mine || mine.pickCount === 0 ? "Fill out my bracket" : mine.pickCount < total ? "Keep filling it out" : "Edit my bracket"}
                  </button>
                </div>

                {kindState.copyFrom.length > 0 ? (
                  <div className="space-y-1.5 rounded-2xl bg-black/25 px-4 py-3">
                    {kindState.copyFrom.map((from) => (
                      <div key={from.venueId} className="space-y-1.5">
                        {copyState.confirm === from.venueId ? (
                          <div role="alert" className="space-y-2">
                            <p className="text-footnote font-semibold text-orange-100/90">
                              This replaces the {mine?.pickCount ?? 0} picks you have here.
                            </p>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                disabled={copyState.busy}
                                onClick={() => void runCopy(from.venueId)}
                                className="tp-player-pressable min-h-[2.5rem] !rounded-xl !border-0 bg-amber-300 text-footnote !font-black text-slate-950 disabled:opacity-60"
                              >
                                Copy picks
                              </button>
                              <button
                                type="button"
                                onClick={() => setCopyState({ confirm: null, busy: false, message: null })}
                                className="tp-player-pressable min-h-[2.5rem] !rounded-xl !border-0 bg-white/10 text-footnote !font-black text-white"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={copyState.busy}
                            onClick={() => (mine && mine.pickCount > 0 ? setCopyState({ confirm: from.venueId, busy: false, message: null }) : void runCopy(from.venueId))}
                            className="tp-player-pressable w-full !rounded-xl !border-0 bg-white/10 px-3 py-2.5 text-left text-footnote !font-black text-white disabled:opacity-60"
                          >
                            {copyState.busy ? "Copying…" : `Copy my picks from ${from.venueName}`}
                            <span className="ml-1.5 font-semibold text-orange-100/70">{from.pickCount} picks</span>
                          </button>
                        )}
                      </div>
                    ))}
                    {copyState.message ? (
                      <p role="alert" className="rounded-xl bg-rose-500/15 px-3 py-2 text-footnote font-semibold text-rose-200">
                        {copyState.message}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {selected.phase !== "open" && effectiveMode === "bracket" ? <BracketReview key={selected.key} option={selected} seatTeams={seatTeams} /> : null}
            {selected.phase !== "open" && effectiveMode === "standings" && identity ? (
              <BracketStandings
                key={selected.key}
                identity={identity}
                tournamentId={selected.tournament.id}
                kind={selected.kind}
                isComplete={selected.phase === "complete"}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Chips({
  label,
  items,
  onSelect,
}: {
  label: string;
  items: ReadonlyArray<{ id: string; text: string; active: boolean }>;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.active}
          onClick={() => onSelect(item.id)}
          className={`tp-player-pressable min-h-[2.5rem] !rounded-full !border-0 !px-4 text-footnote !font-black ${
            item.active ? "bg-amber-300 text-slate-950" : "bg-white/10 text-white"
          }`}
        >
          {item.text}
        </button>
      ))}
    </div>
  );
}

function Notice({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <section className="space-y-2 px-3 py-10 text-center">
      <h1 className="text-2xl font-black [font-family:var(--ht-font-display)]">{title}</h1>
      <p className="text-base font-semibold text-orange-100/80">{detail}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="tp-player-hit-target tp-player-pressable mt-2 rounded-2xl !border-0 bg-amber-300 px-5 py-2.5 text-base font-black text-slate-950"
        >
          {action.label}
        </button>
      ) : null}
    </section>
  );
}
