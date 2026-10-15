"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { WizardFooter } from "@/components/navigation/WizardFooter";
import { OwnerSheet } from "@/components/owner/sheet/OwnerSheet";
import { SlideSteps } from "@/components/owner/sheet/SlideSteps";
import { StepHeading } from "@/components/owner/sheet/StepHeading";
import { HightopLoader } from "@/components/ui/HightopLoader";
import {
  defaultOpenGroupKeys,
  formatOccurrenceDate,
  gameCountLabel,
  groupGameHistory,
  groupsByYear,
  playerCountLabel,
  rewardWinnerLabel,
  winnersLabel,
  type OwnerGameDetail,
  type OwnerGameHistoryRow,
  type OwnerGameMonthGroup,
  type OwnerGameWeekGroup,
  type OwnerRewardDetail,
  type OwnerRewardHistoryRow,
} from "@/lib/ownerHistoryDisplay";
import type { UseOwnerSheetResult } from "@/lib/useOwnerSheet";

// The Partner Dashboard's "Game Results" sheet (docs/live-trivia-weekly-places-reward-plan.md §5f,
// Phase 8): past Live Trivia games and rewards at the selected venue, and who won each.
//
// URL-MIRRORED like the other dashboard sheets: `?sheet=history` is the list (two tabs: Games,
// Rewards), `&step=game` / `&step=reward` is one game's standings or one reward's history, so the
// phone's Back returns to the list or closes. Which game/reward is open lives in memory, so a reload
// on a detail step corrects back to the list (nav.correctStep). Hosted by the dashboard page in its
// own Suspense (HistorySheetHost) and keyed by venue, so a venue switch starts clean.
//
// GROUPED (Andrew, 2026-10-14): the Games tab is Month → Week → Day, plus Year on top once the venue
// has run Live Trivia for more than a year (groupGameHistory, lib/ownerHistoryDisplay.ts). Months and
// weeks fold open and shut; only the newest of each starts open, so the list stays short however
// long the venue's history gets.
//
// READ-ONLY and ON DEMAND: one request per list page (the Rewards tab's first page only when that tab
// is opened), one per detail tap; nothing while closed, no polling. Usernames only — never a player id.

type Tab = "games" | "rewards";
type Screen = "list" | "game" | "reward";
const SCREENS: readonly Screen[] = ["list", "game", "reward"];

type ListState<Row> = {
  status: "idle" | "loading" | "ready" | "error";
  rows: Row[];
  nextBefore: string | null;
  /** A "Show more" is in flight (the rows stay on screen). */
  loadingMore: boolean;
  error: string | null;
};

const idleList = <Row,>(): ListState<Row> => ({ status: "idle", rows: [], nextBefore: null, loadingMore: false, error: null });

type PageResult =
  | { ok: true; value: { kind: "games"; rows: OwnerGameHistoryRow[]; nextBefore: string | null; firstGameDate?: string | null } | { kind: "rewards"; rows: OwnerRewardHistoryRow[]; nextBefore: string | null } }
  | { ok: false; message: string };

type Selected =
  | { kind: "game"; row: OwnerGameHistoryRow }
  | { kind: "reward"; row: OwnerRewardHistoryRow };

type Detail =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "game"; game: OwnerGameDetail }
  | { status: "reward"; reward: OwnerRewardDetail };

const EMPTY_CLASS =
  "rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3 py-4 text-center text-sm font-semibold text-ht-muted";
const ROW_CLASS =
  "flex w-full items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-elevated/40 p-3 text-left transition active:translate-y-px";
const LINK_CLASS = "min-h-11 px-2 text-sm font-black text-ht-cyan-300 underline-offset-2 hover:underline";

/** GET a history endpoint. Every failure becomes a message; nothing throws. */
const getJson = async <T,>(url: string, pick: (json: Record<string, unknown>) => T | undefined): Promise<{ ok: true; value: T } | { ok: false; message: string }> => {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const value = json.ok === true ? pick(json) : undefined;
    if (!res.ok || value === undefined) {
      return { ok: false, message: typeof json.error === "string" ? json.error : "Couldn't load game results." };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, message: "Couldn't load game results. Check your connection." };
  }
};

const historyUrl = (venueId: string, kind: Tab, before: string | null): string =>
  `/api/owner/history?venueId=${encodeURIComponent(venueId)}&kind=${kind}${before ? `&before=${encodeURIComponent(before)}` : ""}`;

const thisYear = (): number => new Date().getFullYear();

/** Today on the partner's device, YYYY-MM-DD (their phone is in the venue's timezone in practice). */
const todayIso = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const GROUP_HEADER_CLASS: Record<"year" | "month" | "week", string> = {
  year: "min-h-11 px-1 text-lg font-black text-ht-primary",
  month: "min-h-11 rounded-xl border border-ht-hairline bg-ht-elevated/60 px-3 font-black text-ht-primary",
  week: "min-h-11 px-2 text-sm font-black text-ht-secondary",
};

const GroupHeader = ({
  level,
  label,
  count,
  open,
  onToggle,
}: {
  level: "year" | "month" | "week";
  label: string;
  count: string;
  open: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    aria-expanded={open}
    onClick={onToggle}
    className={`flex w-full items-center gap-2 text-left transition active:translate-y-px ${GROUP_HEADER_CLASS[level]}`}
  >
    <ChevronRight className={`h-4 w-4 shrink-0 text-ht-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
    <span className="min-w-0 flex-1 truncate">{label}</span>
    <span className="shrink-0 text-xs font-semibold text-ht-muted">{count}</span>
  </button>
);

const ShowMore = ({ busy, onClick }: { busy: boolean; onClick: () => void }) => (
  <div className="flex justify-center">
    <button type="button" onClick={onClick} disabled={busy} className={`${LINK_CLASS} disabled:opacity-60`}>
      {busy ? "Loading…" : "Show more"}
    </button>
  </div>
);

const ListError = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className={EMPTY_CLASS}>
    <p>{message}</p>
    <button type="button" onClick={onRetry} className={`mt-1 ${LINK_CLASS}`}>
      Try again
    </button>
  </div>
);

const GameRow = ({ game, onOpen }: { game: OwnerGameHistoryRow; onOpen: () => void }) => {
  const result = game.inProgress
    ? "Playing now"
    : game.winners.length > 0
      ? `🏆 ${winnersLabel(game.winners)} · ${game.topPoints.toLocaleString("en-US")} pts`
      : "Nobody scored";
  return (
    <button type="button" onClick={onOpen} className={ROW_CLASS}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black text-ht-primary">{game.scheduleName}</div>
        <div className="mt-0.5 text-xs font-semibold text-ht-muted">{playerCountLabel(game.playerCount)}</div>
        <div className={`mt-1 text-xs font-bold ${game.winners.length > 0 ? "text-ht-emerald-300" : "text-ht-muted"}`}>{result}</div>
      </div>
      <span className="shrink-0 text-lg text-slate-500" aria-hidden>
        ›
      </span>
    </button>
  );
};

const RewardHistoryRow = ({ reward, onOpen }: { reward: OwnerRewardHistoryRow; onOpen: () => void }) => {
  const shown = reward.lastWinners.slice(0, 3);
  const more = reward.lastWinners.length - shown.length;
  const winners =
    shown.length > 0
      ? `🏆 ${shown.map(rewardWinnerLabel).join(", ")}${more > 0 ? ` & ${more} more` : ""}`
      : "No winner";
  return (
    <button type="button" onClick={onOpen} className={ROW_CLASS}>
      <div className="min-w-0 flex-1">
        <div className="truncate font-black text-ht-primary">{reward.name}</div>
        <div className="mt-0.5 text-xs font-semibold text-ht-muted">
          {reward.howWon}
          {reward.isActive ? "" : " · Ended"}
        </div>
        <div className="mt-1 text-xs font-semibold text-ht-muted">{reward.lastCycleLabel}</div>
        <div className={`mt-0.5 text-xs font-bold ${shown.length > 0 ? "text-ht-emerald-300" : "text-ht-muted"}`}>{winners}</div>
      </div>
      <span className="shrink-0 text-lg text-slate-500" aria-hidden>
        ›
      </span>
    </button>
  );
};

const GameDetailScreen = ({ row, detail, onRetry }: { row: OwnerGameHistoryRow; detail: Detail; onRetry: () => void }) => (
  <div className="space-y-3">
    <StepHeading hint={`${row.scheduleName} · ${playerCountLabel(detail.status === "game" ? detail.game.playerCount : row.playerCount)}`}>
      {formatOccurrenceDate(row.occurrenceDate, thisYear())}
    </StepHeading>
    {detail.status === "loading" ? <HightopLoader size="md" className="py-8" /> : null}
    {detail.status === "error" ? <ListError message={detail.message} onRetry={onRetry} /> : null}
    {detail.status === "game" ? (
      detail.game.inProgress ? (
        <p className={EMPTY_CLASS}>This game is still being played. Final standings appear when it ends.</p>
      ) : detail.game.standings.length === 0 ? (
        <p className={EMPTY_CLASS}>Nobody scored in this game.</p>
      ) : (
        <ol className="divide-y divide-ht-hairline rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3">
          {detail.game.standings.map((standing, index) => (
            <li key={`${standing.rank}-${index}`} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate font-bold text-ht-primary">
                <span className="mr-2 text-ht-muted">#{standing.rank}</span>
                {standing.username ?? "Deleted player"}
              </span>
              <span className="shrink-0 font-black text-ht-primary">{standing.points.toLocaleString("en-US")} pts</span>
            </li>
          ))}
        </ol>
      )
    ) : null}
  </div>
);

const RewardDetailScreen = ({ row, detail, onRetry }: { row: OwnerRewardHistoryRow; detail: Detail; onRetry: () => void }) => (
  <div className="space-y-3">
    <StepHeading hint={`${row.howWon}${row.isActive ? "" : " · Ended"}`}>{row.name}</StepHeading>
    {detail.status === "loading" ? <HightopLoader size="md" className="py-8" /> : null}
    {detail.status === "error" ? <ListError message={detail.message} onRetry={onRetry} /> : null}
    {detail.status === "reward" ? (
      detail.reward.cycles.length === 0 ? (
        <p className={EMPTY_CLASS}>No winners yet.</p>
      ) : (
        <ul className="space-y-2">
          {detail.reward.cycles.map((cycle) => (
            <li key={cycle.cycleStart} className="rounded-xl border border-ht-hairline bg-ht-elevated/40 p-3">
              <p className="text-caption font-black uppercase tracking-wider text-ht-muted">{cycle.label}</p>
              {cycle.winners.length === 0 ? (
                <p className="mt-1 text-sm font-semibold text-ht-muted">{cycle.note ?? "No winner."}</p>
              ) : (
                <ul className="mt-1 space-y-1.5">
                  {cycle.winners.map((winner, index) => (
                    <li key={`${winner.place ?? "w"}-${index}`} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate font-bold text-ht-primary">{rewardWinnerLabel(winner)}</span>
                        <span className="shrink-0 font-black text-ht-primary">{winner.points.toLocaleString("en-US")} pts</span>
                      </div>
                      <div className="text-xs font-semibold text-ht-muted">
                        {winner.prize}
                        {winner.redeemed === null ? "" : winner.redeemed ? " · Redeemed" : " · Not redeemed yet"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )
    ) : null}
    {detail.status === "reward" && detail.reward.truncated ? (
      <p className="text-center text-xs font-semibold text-ht-muted">Showing the most recent {detail.reward.cycles.length}.</p>
    ) : null}
  </div>
);

export type GameResultsSheetProps = {
  nav: UseOwnerSheetResult;
  /** The dashboard's selected venue; null while venues load or on an account with none. */
  venue: { id: string; name: string } | null;
};

export const GameResultsSheet = ({ nav, venue }: GameResultsSheetProps) => {
  const open = nav.sheet === "history";
  const venueId = venue?.id ?? null;
  const [tab, setTab] = useState<Tab>("games");
  const [games, setGames] = useState<ListState<OwnerGameHistoryRow>>(idleList);
  const [rewards, setRewards] = useState<ListState<OwnerRewardHistoryRow>>(idleList);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [detail, setDetail] = useState<Detail>({ status: "loading" });
  const [detailAttempt, setDetailAttempt] = useState(0);
  // The venue's first game (from the first Games page): over a year ago → group by year too.
  const [firstGameDate, setFirstGameDate] = useState<string | null>(null);
  // Groups the partner folded open or shut, against each group's default (only the newest open).
  const [toggledGroups, setToggledGroups] = useState<ReadonlySet<string>>(() => new Set());

  // Each open shows fresh lists: a game that ended since the last look must appear.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGames(idleList());
      setRewards(idleList());
      setFirstGameDate(null);
      setToggledGroups(new Set());
    }
  }
  // Bumped on every open/close: a "Show more" still in flight from an earlier open must not land
  // on the fresh (idle) lists, or it would mark them ready and the first page would never load.
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
  }, [open]);

  const rawStep = nav.displayStepFor("history");
  const wanted: Screen = rawStep === "game" || rawStep === "reward" ? rawStep : "list";
  // A detail step whose game/reward a reload forgot can't be shown: back to the list.
  const screen: Screen = wanted !== "list" && selected?.kind === wanted ? wanted : "list";
  const urlStep = nav.step;
  const correctStep = nav.correctStep;
  useEffect(() => {
    if (open && urlStep !== null && screen === "list") correctStep(null);
  }, [open, urlStep, screen, correctStep]);

  // Fetch one page (no state touched), then fold it into that tab's list.
  const fetchPage = useCallback(
    async (kind: Tab, before: string | null): Promise<PageResult> => {
      if (!venueId) return { ok: false, message: "Choose a venue first." };
      return kind === "games"
        ? getJson(historyUrl(venueId, "games", before), (json) =>
            Array.isArray(json.games)
              ? {
                  kind: "games" as const,
                  rows: json.games as OwnerGameHistoryRow[],
                  nextBefore: (json.nextBefore as string | null) ?? null,
                  firstGameDate: typeof json.firstGameDate === "string" ? json.firstGameDate : null,
                }
              : undefined,
          )
        : getJson(historyUrl(venueId, "rewards", before), (json) =>
            Array.isArray(json.rewards)
              ? { kind: "rewards" as const, rows: json.rewards as OwnerRewardHistoryRow[], nextBefore: (json.nextBefore as string | null) ?? null }
              : undefined,
          );
    },
    [venueId],
  );

  const applyPage = useCallback((kind: Tab, before: string | null, result: PageResult) => {
    const fold = <Row,>(prev: ListState<Row>, rows: Row[] | null, nextBefore: string | null): ListState<Row> => {
      if (result.ok && rows) {
        return { status: "ready", rows: before ? [...prev.rows, ...rows] : rows, nextBefore, loadingMore: false, error: null };
      }
      const message = result.ok ? "Couldn't load game results." : result.message;
      // A failed "Show more" keeps the rows and says so under them; a failed first page is an error screen.
      return before ? { ...prev, loadingMore: false, error: message } : { ...idleList<Row>(), status: "error", error: message };
    };
    const page = result.ok ? result.value : null;
    if (page?.kind === "games" && !before) setFirstGameDate(page.firstGameDate ?? null);
    if (kind === "games") setGames((prev) => fold(prev, page?.kind === "games" ? page.rows : null, page?.nextBefore ?? null));
    else setRewards((prev) => fold(prev, page?.kind === "rewards" ? page.rows : null, page?.nextBefore ?? null));
  }, []);

  const showMore = (kind: Tab, before: string) => {
    if (kind === "games") setGames((prev) => ({ ...prev, loadingMore: true, error: null }));
    else setRewards((prev) => ({ ...prev, loadingMore: true, error: null }));
    const startedIn = generation.current;
    void fetchPage(kind, before).then((result) => {
      if (generation.current === startedIn) applyPage(kind, before, result);
    });
  };

  // The visible tab's first page, once per open (the other tab waits until it is chosen). "Try again"
  // puts a list back to "idle", which runs this again.
  const activeStatus = tab === "games" ? games.status : rewards.status;
  useEffect(() => {
    if (!open || !venueId || activeStatus !== "idle") return;
    let cancelled = false;
    void fetchPage(tab, null).then((result) => {
      if (!cancelled) applyPage(tab, null, result);
    });
    return () => {
      cancelled = true;
    };
  }, [open, venueId, tab, activeStatus, fetchPage, applyPage]);

  // One detail request per tap (and per "Try again").
  useEffect(() => {
    if (!open || !venueId || !selected || screen === "list") return;
    let cancelled = false;
    const url =
      selected.kind === "game"
        ? `/api/owner/history/games/${encodeURIComponent(selected.row.scheduleId)}?venueId=${encodeURIComponent(venueId)}&date=${encodeURIComponent(selected.row.occurrenceDate)}`
        : `/api/owner/history/rewards/${encodeURIComponent(selected.row.rewardId)}?venueId=${encodeURIComponent(venueId)}`;
    void (async () => {
      if (selected.kind === "game") {
        const result = await getJson<OwnerGameDetail>(url, (json) => (json.game as OwnerGameDetail | undefined) ?? undefined);
        if (!cancelled) setDetail(result.ok ? { status: "game", game: result.value } : { status: "error", message: result.message });
      } else {
        const result = await getJson<OwnerRewardDetail>(url, (json) => (json.reward as OwnerRewardDetail | undefined) ?? undefined);
        if (!cancelled) setDetail(result.ok ? { status: "reward", reward: result.value } : { status: "error", message: result.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, venueId, selected, screen, detailAttempt]);

  const openDetail = (next: Selected) => {
    setSelected(next);
    setDetail({ status: "loading" });
    nav.goToStep(next.kind);
  };

  const retryDetail = () => {
    setDetail({ status: "loading" });
    setDetailAttempt((n) => n + 1);
  };

  const toggleGroup = (key: string) =>
    setToggledGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderGames = (): ReactNode => {
    const oldestLoaded = games.rows[games.rows.length - 1]?.occurrenceDate ?? null;
    // An unknown first date falls back to what is loaded: rows already spanning a year group by year.
    const byYear = groupsByYear(firstGameDate ?? oldestLoaded, todayIso());
    const years = groupGameHistory(games.rows, { byYear, moreToLoad: Boolean(games.nextBefore) });
    const defaults = defaultOpenGroupKeys(years);
    const isOpen = (key: string) => defaults.has(key) !== toggledGroups.has(key);

    const renderWeek = (week: OwnerGameWeekGroup) => (
      <li key={week.key}>
        <GroupHeader
          level="week"
          label={week.label}
          count={gameCountLabel(week.gameCount, week.complete)}
          open={isOpen(week.key)}
          onToggle={() => toggleGroup(week.key)}
        />
        {isOpen(week.key) ? (
          <div className="space-y-3 pb-2 pl-2">
            {week.days.map((day) => (
              <div key={day.date} className="space-y-1.5">
                <p className="px-1 text-caption font-black uppercase tracking-wider text-ht-muted">{day.label}</p>
                <ul className="space-y-2">
                  {day.games.map((game) => (
                    <li key={`${game.scheduleId}:${game.occurrenceDate}`}>
                      <GameRow game={game} onOpen={() => openDetail({ kind: "game", row: game })} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </li>
    );

    const renderMonth = (month: OwnerGameMonthGroup) => (
      <li key={month.key} className="space-y-1">
        <GroupHeader
          level="month"
          label={month.label}
          count={gameCountLabel(month.gameCount, month.complete)}
          open={isOpen(month.key)}
          onToggle={() => toggleGroup(month.key)}
        />
        {isOpen(month.key) ? <ul className="pl-1">{month.weeks.map(renderWeek)}</ul> : null}
      </li>
    );

    if (!byYear) return <ul className="space-y-2">{years.flatMap((year) => year.months).map(renderMonth)}</ul>;
    return (
      <ul className="space-y-2">
        {years.map((year) => (
          <li key={year.key} className="space-y-2">
            <GroupHeader
              level="year"
              label={year.label}
              count={gameCountLabel(year.gameCount, year.complete)}
              open={isOpen(year.key)}
              onToggle={() => toggleGroup(year.key)}
            />
            {isOpen(year.key) ? <ul className="space-y-2">{year.months.map(renderMonth)}</ul> : null}
          </li>
        ))}
      </ul>
    );
  };

  const renderList = (): ReactNode => {
    if (!venue) {
      return <p className={EMPTY_CLASS}>Choose a venue to see its game results.</p>;
    }
    const list = tab === "games" ? games : rewards;
    return (
      <div className="space-y-3">
        <StepHeading hint={venue.name}>Game results</StepHeading>
        <div role="tablist" aria-label="Game results" className="grid grid-cols-2 gap-2">
          {(["games", "rewards"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-11 rounded-xl border px-3 text-sm font-black ${
                tab === id ? "border-ht-cyan-300 bg-ht-cyan-300/15 text-ht-cyan-300" : "border-ht-hairline bg-ht-elevated/40 text-ht-muted"
              }`}
            >
              {id === "games" ? "Live Trivia games" : "Rewards"}
            </button>
          ))}
        </div>
        {list.status === "idle" || list.status === "loading" ? <HightopLoader size="md" className="py-8" /> : null}
        {list.status === "error" ? <ListError
            message={list.error ?? "Couldn't load game results."}
            onRetry={() => (tab === "games" ? setGames(idleList()) : setRewards(idleList()))}
          /> : null}
        {list.status === "ready" && list.rows.length === 0 ? (
          <p className={EMPTY_CLASS}>
            {tab === "games" ? "No Live Trivia games played here yet." : "No reward has been won here yet."}
          </p>
        ) : null}
        {list.status === "ready" && list.rows.length > 0 ? (
          tab === "games" ? (
            renderGames()
          ) : (
            <ul className="space-y-2">
              {rewards.rows.map((reward) => (
                <li key={reward.rewardId}>
                  <RewardHistoryRow reward={reward} onOpen={() => openDetail({ kind: "reward", row: reward })} />
                </li>
              ))}
            </ul>
          )
        ) : null}
        {list.status === "ready" && list.error ? <p className="text-center text-xs font-semibold text-ht-rose-300">{list.error}</p> : null}
        {list.status === "ready" && list.nextBefore ? (
          <ShowMore busy={list.loadingMore} onClick={() => list.nextBefore && showMore(tab, list.nextBefore)} />
        ) : null}
      </div>
    );
  };

  const renderScreen = (id: Screen): ReactNode => {
    if (id === "game" && selected?.kind === "game") return <GameDetailScreen row={selected.row} detail={detail} onRetry={retryDetail} />;
    if (id === "reward" && selected?.kind === "reward") return <RewardDetailScreen row={selected.row} detail={detail} onRetry={retryDetail} />;
    return renderList();
  };

  const footer: ReactNode =
    screen === "list" ? undefined : <WizardFooter variant="inline" tone="dark" onBack={() => nav.goBack(null)} />;

  return (
    <OwnerSheet open={open} onRequestClose={nav.closeSheet} title="Game Results" footer={footer} scrollKey={screen}>
      <SlideSteps steps={SCREENS} current={screen} renderStep={renderScreen} />
    </OwnerSheet>
  );
};
