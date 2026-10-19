// March Madness brackets — what the player screen decides from GET /api/bracket/state
// (docs/squares-and-brackets-plan.md, Phase 8). Pure and client-safe: no I/O, no server-only, so the
// screens stay dumb and the tests pin every rule here. The bracket RULES (which seat may be picked,
// scoring, clearing later picks) are NOT here: they live in lib/brackets/*.ts and in SQL, and this file
// only calls them.

import type { BracketGameView, BracketTournamentView } from "@/lib/bracketsEntries";
import type { BracketKindPhase } from "@/lib/brackets/games";
import { bracketPickCount } from "@/lib/brackets/picks";
import { bracketRoundPoints, isSeatAlive } from "@/lib/brackets/scoring";
import {
  BRACKET_BASE_ROUND,
  BRACKET_GENDERS,
  BRACKET_KINDS,
  BRACKET_REGION_COUNT,
  BRACKET_SEAT_COUNT,
  BRACKET_SLOT_COUNT,
  childSlots,
  regionOfSlot,
  roundOfSlot,
  seatsOfRound1Slot,
  slotsOfKind,
  type BracketGender,
  type BracketKind,
  type BracketRound,
} from "@/lib/brackets/tree";

// ── Names ───────────────────────────────────────────────────────────────────────────────────────

export const BRACKET_ROUND_NAMES: Record<BracketRound, string> = {
  1: "Round of 64",
  2: "Round of 32",
  3: "Sweet 16",
  4: "Elite Eight",
  5: "Final Four",
  6: "Championship",
};

export const bracketGenderLabel = (gender: BracketGender): string => (gender === "men" ? "Men's" : "Women's");

export const bracketKindLabel = (kind: BracketKind): string => (kind === "main" ? "Bracket" : "Second chance");

/** "Men's bracket" / "Women's second chance". */
export const bracketOptionLabel = (gender: BracketGender, kind: BracketKind): string =>
  `${bracketGenderLabel(gender)} ${kind === "main" ? "bracket" : "second chance"}`;

/** A region's name, or "Region n" until the admin has entered it (Selection Sunday). */
export const bracketRegionName = (names: ReadonlyArray<string | null>, region: number): string =>
  names[region]?.trim() || `Region ${region + 1}`;

/** The calendar year a tournament is played in: the feed's `season` is the year the season STARTED. */
export const bracketDisplayYear = (feedSeason: number): number => feedSeason + 1;

// ── Which brackets can be shown ─────────────────────────────────────────────────────────────────

export type BracketOption = {
  key: string;
  tournament: BracketTournamentView;
  kind: BracketKind;
  phase: BracketKindPhase;
  label: string;
};

export const bracketOptionKey = (tournamentId: string, kind: BracketKind): string => `${tournamentId}:${kind}`;

/**
 * The brackets a player can open: the ones that are open, locked or graded (plan Phase 8: "only the
 * open or graded ones"). Men's before women's, the main bracket before the second chance.
 */
export const selectableBrackets = (tournaments: readonly BracketTournamentView[]): BracketOption[] => {
  const options: BracketOption[] = [];
  for (const kind of BRACKET_KINDS) {
    for (const gender of BRACKET_GENDERS) {
      for (const tournament of tournaments) {
        if (tournament.gender !== gender) continue;
        const phase = tournament.kinds[kind].phase;
        if (phase === "not_open") continue;
        options.push({ key: bracketOptionKey(tournament.id, kind), tournament, kind, phase, label: bracketOptionLabel(gender, kind) });
      }
    }
  }
  return options;
};

/** Which bracket the screen opens on: one the player still has to finish, else any open one, else the first. */
export const defaultBracketKey = (options: readonly BracketOption[]): string | null => {
  const unfinished = options.find((option) => {
    if (option.phase !== "open") return false;
    const mine = option.tournament.kinds[option.kind].mine;
    return !mine || mine.pickCount < slotsOfKind(option.kind).length;
  });
  return (unfinished ?? options.find((option) => option.phase === "open") ?? options.find((option) => option.kind === "main") ?? options[0])?.key ?? null;
};

/** The switcher's two rows: genders that have a bracket, and the kinds the chosen gender has. */
export const bracketSwitcher = (
  options: readonly BracketOption[],
  selected: BracketOption | null,
): { genders: BracketGender[]; kinds: BracketKind[] } => {
  if (!selected) return { genders: [], kinds: [] };
  return {
    genders: BRACKET_GENDERS.filter((gender) => options.some((option) => option.tournament.gender === gender)),
    kinds: BRACKET_KINDS.filter((kind) =>
      options.some((option) => option.tournament.gender === selected.tournament.gender && option.kind === kind),
    ),
  };
};

/** The option a tap on the switcher lands on: same kind if the new gender has it, else its first. */
export const bracketKeyFor = (
  options: readonly BracketOption[],
  gender: BracketGender,
  kind: BracketKind,
): string | null =>
  (options.find((option) => option.tournament.gender === gender && option.kind === kind) ??
    options.find((option) => option.tournament.gender === gender))?.key ?? null;

// ── Teams in seats ──────────────────────────────────────────────────────────────────────────────

export type BracketSeatTeam = {
  seat: number;
  seed: number | null;
  /** Full display name ("Michigan State", or "Texas / NC State" for an undecided opening-round game). */
  name: string;
  abbreviation: string;
  /** An opening-round game still decides who sits here. */
  pending: boolean;
  /** Nothing is known about this seat yet. */
  tbd: boolean;
};

const teamOf = (game: BracketGameView | undefined, side: "home" | "away") => (game ? (side === "home" ? game.home : game.away) : null);

/**
 * The 64 seats' teams, from the tournament's games. A seat whose round-1 team is not set yet takes
 * its opening-round game: the winner once decided, else "A / B" (picking it means whoever wins).
 */
export const bracketSeatTeams = (games: readonly BracketGameView[]): BracketSeatTeam[] => {
  const round1 = new Map<number, BracketGameView>();
  const openers = new Map<number, BracketGameView>();
  for (const game of games) {
    if (game.round === 1 && game.slot !== null) round1.set(game.slot, game);
    if (game.round === 0 && game.feedsSeat !== null) openers.set(game.feedsSeat, game);
  }
  return Array.from({ length: BRACKET_SEAT_COUNT }, (_, seat): BracketSeatTeam => {
    const slot = Math.floor(seat / 2);
    const team = teamOf(round1.get(slot), seat % 2 === 0 ? "home" : "away");
    if (team) return { seat, seed: team.seed, name: team.name, abbreviation: team.abbreviation, pending: false, tbd: false };
    const opener = openers.get(seat);
    if (opener) {
      if (opener.winnerSide) {
        const winner = teamOf(opener, opener.winnerSide);
        if (winner) return { seat, seed: winner.seed, name: winner.name, abbreviation: winner.abbreviation, pending: false, tbd: false };
      }
      if (opener.home && opener.away) {
        return {
          seat,
          seed: opener.home.seed ?? opener.away.seed,
          name: `${opener.home.name} / ${opener.away.name}`,
          abbreviation: `${opener.home.abbreviation} / ${opener.away.abbreviation}`,
          pending: true,
          tbd: false,
        };
      }
    }
    return { seat, seed: null, name: "TBD", abbreviation: "TBD", pending: false, tbd: true };
  });
};

// ── Steps (the fill-out flow and the read-only view share them) ─────────────────────────────────

export type BracketGroup = {
  id: string;
  title: string;
  /** Points per correct pick in this group's round; null when the group mixes rounds. */
  points: number | null;
  slots: number[];
  /** Show each matchup's round name (the group mixes rounds). */
  showRound: boolean;
};

export type BracketStep = {
  id: string;
  title: string;
  /** The region this step is for (0–3), or null for the Final Four / a multi-region step. */
  region: number | null;
  groups: BracketGroup[];
};

const FINISH_STEP_ID = "finish";
export const bracketFinishStepId = FINISH_STEP_ID;

const groupBy = <T,>(items: readonly T[], keyOf: (item: T) => number): Map<number, T[]> => {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
};

const roundGroups = (idPrefix: string, slots: readonly number[]): BracketGroup[] =>
  [...groupBy(slots, roundOfSlot).entries()].map(([round, inRound]) => ({
    id: `${idPrefix}-r${round}`,
    title: BRACKET_ROUND_NAMES[round as BracketRound],
    points: bracketRoundPoints(round as BracketRound),
    slots: inRound,
    showRound: false,
  }));

/**
 * The steps of filling out a kind of bracket (plan Phase 8): one region at a time (15 picks), then the
 * Final Four (3 picks), then Finish. The second chance has only 3 picks per region, so its regions
 * share one step. Every step but Finish lists the slots to pick.
 */
export const bracketSteps = (kind: BracketKind, regionNames: ReadonlyArray<string | null>): BracketStep[] => {
  const all = slotsOfKind(kind);
  const inRegions = all.filter((slot) => regionOfSlot(slot) !== null);
  const finalFour = all.filter((slot) => regionOfSlot(slot) === null);
  const steps: BracketStep[] = [];
  if (kind === "main") {
    for (let region = 0; region < BRACKET_REGION_COUNT; region += 1) {
      steps.push({
        id: `region-${region}`,
        title: bracketRegionName(regionNames, region),
        region,
        groups: roundGroups(`region-${region}`, inRegions.filter((slot) => regionOfSlot(slot) === region)),
      });
    }
  } else {
    steps.push({
      id: "regions",
      title: `${BRACKET_ROUND_NAMES[BRACKET_BASE_ROUND.second]} & ${BRACKET_ROUND_NAMES[4]}`,
      region: null,
      groups: Array.from({ length: BRACKET_REGION_COUNT }, (_, region): BracketGroup => ({
        id: `regions-${region}`,
        title: bracketRegionName(regionNames, region),
        points: null,
        slots: inRegions.filter((slot) => regionOfSlot(slot) === region),
        showRound: true,
      })),
    });
  }
  steps.push({ id: "final-four", title: "Final Four", region: null, groups: roundGroups("final-four", finalFour) });
  steps.push({ id: FINISH_STEP_ID, title: "Finish", region: null, groups: [] });
  return steps;
};

/** Picks made in a step, out of its slots. */
export const bracketStepProgress = (step: BracketStep, picks: ReadonlyArray<number | null>): { done: number; total: number } => {
  const slots = step.groups.flatMap((group) => group.slots);
  return { done: slots.filter((slot) => (picks[slot] ?? null) !== null).length, total: slots.length };
};

/** "41 of 63". */
export const bracketProgressLine = (picks: ReadonlyArray<number | null>, kind: BracketKind): string =>
  `${bracketPickCount(picks, kind)} of ${slotsOfKind(kind).length}`;

/**
 * The two seats a matchup offers, home side first. Round 1: the game's two seats. A later round: what
 * the two games feeding it produced — your own picks (or, for the second chance's first round, the real
 * results). A side is null until that feeding pick exists.
 */
export const bracketMatchupSides = (
  picks: ReadonlyArray<number | null>,
  slot: number,
  kind: BracketKind,
  winnerSeats: ReadonlyArray<number | null>,
): [number | null, number | null] => {
  if (roundOfSlot(slot) === 1) return seatsOfRound1Slot(slot);
  const children = childSlots(slot);
  if (!children) return [null, null];
  const source = roundOfSlot(slot) === BRACKET_BASE_ROUND[kind] ? winnerSeats : picks;
  return [source[children[0]] ?? null, source[children[1]] ?? null];
};

// ── After the lock: right / wrong / still alive ─────────────────────────────────────────────────

export type BracketPickState = "none" | "correct" | "wrong" | "alive" | "out";

export const bracketPickState = (
  picks: ReadonlyArray<number | null>,
  winnerSeats: ReadonlyArray<number | null>,
  slot: number,
): BracketPickState => {
  const pick = picks[slot] ?? null;
  if (pick === null) return "none";
  const winner = winnerSeats[slot] ?? null;
  if (winner !== null) return pick === winner ? "correct" : "wrong";
  return isSeatAlive(pick, winnerSeats) ? "alive" : "out";
};

export type BracketPickCounts = Record<BracketPickState, number>;

export const bracketPickCounts = (
  picks: ReadonlyArray<number | null>,
  winnerSeats: ReadonlyArray<number | null>,
  kind: BracketKind,
): BracketPickCounts => {
  const counts: BracketPickCounts = { none: 0, correct: 0, wrong: 0, alive: 0, out: 0 };
  for (const slot of slotsOfKind(kind)) counts[bracketPickState(picks, winnerSeats, slot)] += 1;
  return counts;
};

/** The championship pick and whether that team can still win it. Null when none was made. */
export const bracketChampionPick = (
  picks: ReadonlyArray<number | null>,
  winnerSeats: ReadonlyArray<number | null>,
): { seat: number; state: BracketPickState } | null => {
  const seat = picks[BRACKET_SLOT_COUNT - 1] ?? null;
  return seat === null ? null : { seat, state: bracketPickState(picks, winnerSeats, BRACKET_SLOT_COUNT - 1) };
};

// ── Headline ────────────────────────────────────────────────────────────────────────────────────

/** "Thu, Mar 18, 12:15 PM EDT" on the viewer's clock (or `timeZone`, for tests). */
export const formatBracketLock = (lockAt: string | null, timeZone?: string): string | null => {
  if (!lockAt) return null;
  const ms = Date.parse(lockAt);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(ms));
};

export type BracketHeadline = { title: string; detail: string | null };

export const bracketHeadline = (params: {
  phase: BracketKindPhase;
  kind: BracketKind;
  mine: BracketTournamentView["kinds"][BracketKind]["mine"];
  lockAt: string | null;
  timeZone?: string;
}): BracketHeadline => {
  const { phase, kind, mine, lockAt, timeZone } = params;
  const total = slotsOfKind(kind).length;
  if (phase === "open") {
    const lock = formatBracketLock(lockAt, timeZone);
    const lockLine = lock ? `Picks lock ${lock}` : null;
    if (!mine || mine.pickCount === 0) return { title: "Fill out your bracket", detail: lockLine };
    if (mine.pickCount < total) return { title: `${total - mine.pickCount} picks to go`, detail: lockLine };
    return { title: "Your bracket is in", detail: lockLine ? `You can change it until picks lock ${lock}` : null };
  }
  if (phase === "locked") {
    return mine && mine.pickCount > 0
      ? { title: "Picks are locked", detail: `${mine.score} points so far` }
      : { title: "Picks are locked", detail: "You didn't fill this one out." };
  }
  return mine && mine.pickCount > 0
    ? { title: "Final standings", detail: `You finished with ${mine.score} points` }
    : { title: "Final standings", detail: "You didn't fill this one out." };
};

// ── Saving ──────────────────────────────────────────────────────────────────────────────────────

/** Why a save or copy was refused, in words for the player. */
export const bracketSaveMessage = (outcome: string | null): string => {
  switch (outcome) {
    case "locked":
      return "Picks just locked. Your last saved picks are the ones that count.";
    case "not_open":
      return "This bracket isn't open yet.";
    case "wrong_venue":
      return "Open this from the venue you joined.";
    case "rehearsal_only":
    case "no_tournament":
      return "This bracket isn't available right now.";
    case "invalid_picks":
    case "source_invalid":
      return "Those picks no longer fit this bracket. Please check them and try again.";
    case "invalid_tiebreaker":
      return "Enter a whole number from 0 to 400 for the tiebreaker.";
    case "no_source":
      return "There's no bracket to copy.";
    default:
      return "That didn't save. Please try again.";
  }
};

/** The state with `kind`'s entry replaced by what was just saved — no re-read needed. */
export const withSavedEntry = (
  tournaments: readonly BracketTournamentView[],
  params: {
    tournamentId: string;
    kind: BracketKind;
    picks: ReadonlyArray<number | null>;
    tiebreaker: number | null;
    savedAt: string;
    maxPossible: number;
  },
): BracketTournamentView[] =>
  tournaments.map((tournament) =>
    tournament.id !== params.tournamentId
      ? tournament
      : {
          ...tournament,
          kinds: {
            ...tournament.kinds,
            [params.kind]: {
              ...tournament.kinds[params.kind],
              mine: {
                picks: [...params.picks],
                tiebreaker: params.tiebreaker,
                pickCount: bracketPickCount(params.picks, params.kind),
                score: tournament.kinds[params.kind].mine?.score ?? 0,
                maxPossible: params.maxPossible,
                savedAt: params.savedAt,
              },
            },
          },
        },
  );

/** Don't re-read the state on returning to the tab more often than this. */
export const BRACKET_STATE_STALE_MS = 5 * 60_000;

/** Only the tournament states that change while the page is open are worth a re-read on return. */
export const bracketStateCanChange = (tournaments: readonly BracketTournamentView[]): boolean =>
  tournaments.some((tournament) => BRACKET_KINDS.some((kind) => tournament.kinds[kind].phase !== "complete"));

/** Standings search: case-insensitive "contains". */
export const filterBracketStandings = <T extends { username: string }>(rows: readonly T[], query: string): T[] => {
  const needle = query.trim().toLowerCase();
  return needle ? rows.filter((row) => row.username.toLowerCase().includes(needle)) : [...rows];
};
