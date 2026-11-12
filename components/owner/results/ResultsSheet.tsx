"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { WizardFooter } from "@/components/navigation/WizardFooter";
import { GameStandingsScreen } from "@/components/owner/results/GameStandingsScreen";
import { PlayerBreakdownScreen } from "@/components/owner/results/PlayerBreakdownScreen";
import { ResultsGameCard } from "@/components/owner/results/ResultsGameCard";
import { ResultsRewardRow } from "@/components/owner/results/ResultsRewardRow";
import { RewardDetailScreen } from "@/components/owner/results/RewardDetailScreen";
import {
  type Fetched,
  breakdownUrl,
  gameUrl,
  getJson,
  pickBreakdown,
  pickGameScreen,
  pickReward,
  pickTimeline,
  rewardUrl,
  timelineUrl,
  useLoaded,
} from "@/components/owner/results/resultsApi";
import { EMPTY_CLASS, ListError, ShowMore } from "@/components/owner/results/resultsUi";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { SlideSteps } from "@/components/owner/sheet/SlideSteps";
import { HightopLoader } from "@/components/ui/HightopLoader";
import { groupResultsMonths, rewardItemKey } from "@/lib/results/resultsDisplay";
import { RESULTS_THEME } from "@/lib/themeTokens";
import type { ResultsGameRow, ResultsRewardItem, ResultsStanding, ResultsTimelinePage } from "@/lib/results/types";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// The Partner Dashboard's "Results" sheet (docs/partner-results-page-plan.md Phase 4): ONE timeline of
// the venue's games, newest first under plain month headings. Each game shows its winner and a
// compact prize summary. Standalone prizes keep their dates and open their history. No tabs.
//
//   list    the timeline
//   game    one game: "Find a player" + the FULL standings + rewards won at it
//   player  one player's questions: right/wrong and points (never their typed answer)
//   prize   one prize's history (was `reward`; an old `step=reward` link lands on the list like any unknown step)
//
// URL-MIRRORED like the other dashboard sheets: `?sheet=history` is the list and `&step=game|player|prize`
// a screen above it, so the phone's Back steps back or closes. Which game/player/reward is open lives in
// memory, so a reload on a detail step corrects to the list (nav.correctStep). The router is never used for a step.
// Hosted by the dashboard page (HistorySheetHost) and keyed by venue, so a venue switch starts clean.
//
// READ-ONLY and ON DEMAND: one request per timeline page, one per tap; nothing while closed, no polling.
// Usernames and scores only — never a player id. Labels and units come from the competition registry
// (lib/results/competitions.ts); nothing here names a competition.

type Screen = "list" | "game" | "player" | "prize";
const SCREENS: readonly Screen[] = ["list", "game", "player", "prize"];

/** The URL step to show. Anything else (including the old `reward`) is the list, and the step is cleared. */
const screenOfStep = (step: string | null): Screen =>
  step === "game" || step === "player" || step === "prize" ? step : "list";

type TimelineState = {
  status: "idle" | "ready" | "error";
  games: ResultsGameRow[];
  rewards: ResultsRewardItem[];
  nextBefore: string | null;
  firstGameDate: string | null;
  /** A "Show more" is in flight (the rows stay on screen). */
  loadingMore: boolean;
  error: string | null;
};

const idleTimeline = (): TimelineState => ({
  status: "idle",
  games: [],
  rewards: [],
  nextBefore: null,
  firstGameDate: null,
  loadingMore: false,
  error: null,
});

type GameSelection = { game: ResultsGameRow; nonce: number };
type PlayerSelection = { standing: ResultsStanding; nonce: number };
type RewardSelection = { reward: ResultsRewardItem; nonce: number; from: "list" | "game" };

export type ResultsSheetProps = {
  nav: UseOwnerSheetResult;
  /** The dashboard's selected venue; null while venues load or on an account with none. */
  venue: { id: string; name: string } | null;
};

export const ResultsSheet = ({ nav, venue }: ResultsSheetProps) => {
  const open = nav.sheet === "history";
  const venueId = venue?.id ?? null;
  const [timeline, setTimeline] = useState<TimelineState>(idleTimeline);
  const [gameSel, setGameSel] = useState<GameSelection | null>(null);
  const [playerSel, setPlayerSel] = useState<PlayerSelection | null>(null);
  const [rewardSel, setRewardSel] = useState<RewardSelection | null>(null);
  const [query, setQuery] = useState("");
  const taps = useRef(0);

  // Each open shows a fresh timeline: a game that ended since the last look must appear.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTimeline(idleTimeline());
      setGameSel(null);
      setPlayerSel(null);
      setRewardSel(null);
      setQuery("");
    }
  }
  // Bumped on every open/close: a "Show more" still in flight from an earlier open must not land on the
  // fresh (idle) timeline, or it would mark it ready and the first page would never load.
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
  }, [open]);

  const rawStep = nav.displayStepFor("history");
  const wanted: Screen = screenOfStep(rawStep);
  const available: Record<Screen, boolean> = {
    list: true,
    game: gameSel !== null,
    player: gameSel !== null && playerSel !== null,
    prize: rewardSel !== null,
  };
  // A detail step whose selection a reload forgot can't be shown: back to the list.
  const screen: Screen = available[wanted] ? wanted : "list";
  const urlStep = nav.step;
  const correctStep = nav.correctStep;
  useEffect(() => {
    if (open && urlStep !== null && screen === "list") correctStep(null);
  }, [open, urlStep, screen, correctStep]);

  const applyPage = useCallback((before: string | null, result: Fetched<ResultsTimelinePage>) => {
    setTimeline((prev) => {
      if (result.ok) {
        const page = result.value;
        return {
          status: "ready",
          games: before ? [...prev.games, ...page.games] : page.games,
          rewards: before ? [...prev.rewards, ...page.rewards] : page.rewards,
          nextBefore: page.nextBefore,
          firstGameDate: before ? prev.firstGameDate : (page.firstGameDate ?? null),
          loadingMore: false,
          error: null,
        };
      }
      // A failed "Show more" keeps the rows and says so under them; a failed first page is an error screen.
      return before ? { ...prev, loadingMore: false, error: result.message } : { ...idleTimeline(), status: "error", error: result.message };
    });
  }, []);

  const showMore = (before: string) => {
    if (!venueId) return;
    setTimeline((prev) => ({ ...prev, loadingMore: true, error: null }));
    const startedIn = generation.current;
    void getJson(timelineUrl(venueId, before), pickTimeline).then((result) => {
      if (generation.current === startedIn) applyPage(before, result);
    });
  };

  // The first page, once per open. "Try again" puts the timeline back to "idle", which runs this again.
  useEffect(() => {
    if (!open || !venueId || timeline.status !== "idle") return;
    let cancelled = false;
    void getJson(timelineUrl(venueId, null), pickTimeline).then((result) => {
      if (!cancelled) applyPage(null, result);
    });
    return () => {
      cancelled = true;
    };
  }, [open, venueId, timeline.status, applyPage]);

  // One read per tap (and per "Try again"): a null URL = nothing selected / sheet closed = no request.
  const [gameLoaded, retryGame] = useLoaded(open && venueId && gameSel ? gameUrl(venueId, gameSel.game) : null, gameSel?.nonce ?? 0, pickGameScreen);
  const entry = playerSel?.standing.entry ?? null;
  const [playerLoaded, retryPlayer] = useLoaded(
    open && venueId && gameSel && entry ? breakdownUrl(venueId, gameSel.game, entry) : null,
    playerSel?.nonce ?? 0,
    pickBreakdown,
  );
  const [rewardLoaded, retryReward] = useLoaded(
    open && venueId && rewardSel ? rewardUrl(venueId, rewardSel.reward.rewardId) : null,
    rewardSel?.nonce ?? 0,
    pickReward,
  );

  const openGame = (game: ResultsGameRow) => {
    taps.current += 1;
    setGameSel({ game, nonce: taps.current });
    setPlayerSel(null);
    setQuery("");
    nav.goToStep("game");
  };
  const openPlayer = (standing: ResultsStanding) => {
    taps.current += 1;
    setPlayerSel({ standing, nonce: taps.current });
    nav.goToStep("player");
  };
  const openReward = (reward: ResultsRewardItem, from: "list" | "game") => {
    taps.current += 1;
    setRewardSel({ reward, nonce: taps.current, from });
    nav.goToStep("prize");
  };

  const renderTimeline = (): ReactNode => (
    <div className="space-y-6">
      {groupResultsMonths(timeline).map((month) => (
        <section key={month.key} aria-label={month.label} className="space-y-2">
          <h2 className={`text-base font-extrabold ${RESULTS_THEME.month}`}>{month.label}</h2>
          <ul className="space-y-1">
            {month.entries.map((item) => (
              <li key={item.kind === "game" ? `${item.game.competitionId}:${item.game.gameKey}` : rewardItemKey(item.reward)}>
                {item.kind === "game" ? (
                  <ResultsGameCard game={item.game} rewards={item.rewards} onOpenGame={() => openGame(item.game)} />
                ) : (
                  <ResultsRewardRow reward={item.reward} onOpen={() => openReward(item.reward, "list")} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );

  const renderList = (): ReactNode => {
    if (!venue) return <p className={EMPTY_CLASS}>Choose a venue to see its results.</p>;
    const empty = timeline.games.length === 0 && timeline.rewards.length === 0;
    return (
      <div className="space-y-3">
        <p data-step-heading tabIndex={-1} className="text-sm font-semibold text-ht-muted outline-none">
          {venue.name}
        </p>
        {timeline.status === "idle" ? <HightopLoader size="md" className="py-8" /> : null}
        {timeline.status === "error" ? (
          <ListError message={timeline.error ?? "Couldn't load results."} onRetry={() => setTimeline(idleTimeline())} />
        ) : null}
        {timeline.status === "ready" && empty && !timeline.nextBefore ? (
          <p className={EMPTY_CLASS}>No results yet. Games you run here will show up after they&apos;re played.</p>
        ) : null}
        {timeline.status === "ready" && !empty ? renderTimeline() : null}
        {timeline.status === "ready" && timeline.error ? (
          <p className="text-center text-footnote font-semibold text-ht-rose-300">{timeline.error}</p>
        ) : null}
        {timeline.status === "ready" && timeline.nextBefore ? (
          <ShowMore busy={timeline.loadingMore} onClick={() => timeline.nextBefore && showMore(timeline.nextBefore)} />
        ) : null}
      </div>
    );
  };

  const renderScreen = (id: Screen): ReactNode => {
    if (id === "game" && gameSel) {
      return (
        <GameStandingsScreen
          game={gameSel.game}
          loaded={gameLoaded}
          currentYear={new Date().getFullYear()}
          query={query}
          onQueryChange={setQuery}
          onRetry={retryGame}
          onOpenPlayer={openPlayer}
          onOpenReward={(reward) => openReward(reward, "game")}
        />
      );
    }
    if (id === "player" && gameSel && playerSel) {
      return <PlayerBreakdownScreen game={gameSel.game} standing={playerSel.standing} loaded={playerLoaded} onRetry={retryPlayer} />;
    }
    if (id === "prize" && rewardSel) return <RewardDetailScreen reward={rewardSel.reward} loaded={rewardLoaded} onRetry={retryReward} />;
    return renderList();
  };

  // Where Back goes: a player's screen is under their game; a reward opened from a game's screen is too.
  const previous: string | null = screen === "player" || (screen === "prize" && rewardSel?.from === "game") ? "game" : null;
  const footer: ReactNode =
    screen === "list" ? undefined : <WizardFooter variant="inline" tone="dark" onBack={() => nav.goBack(previous)} />;

  return (
    <OwnerSheet open={open} onRequestClose={nav.closeSheet} title={<><span aria-hidden="true">🏆</span> Results</>} footer={footer} scrollKey={screen}>
      <SlideSteps steps={SCREENS} current={screen} renderStep={renderScreen} />
    </OwnerSheet>
  );
};
