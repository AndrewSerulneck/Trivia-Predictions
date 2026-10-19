import { StepHeading } from "@/components/owner/sheet/StepHeading";
import { BARE_BUTTON_CLASS, Chevron, EMPTY_CLASS, ListError } from "@/components/owner/results/resultsUi";
import { HightopLoader } from "@/components/ui/HightopLoader";
import type { Loaded } from "@/components/owner/results/resultsApi";
import { formatOccurrenceDate, playerCountLabel } from "@/lib/ownerHistoryDisplay";
import { getResultsCompetition } from "@/lib/results/competitions";
import { matchesPlayerSearch, rewardTitleAt, rewardWinnersLine, scoreLabel } from "@/lib/results/resultsDisplay";
import type { ResultsGameRow, ResultsGameScreen, ResultsRewardItem, ResultsStanding } from "@/lib/results/types";

// One game's screen: its date and name, a "Find a player" box, the FULL standings (everyone who
// scored), and the rewards won at it. A player with a breakdown token is a tap target; a deleted
// player, a 0-point player or a competition with no breakdown is a plain row. Usernames and scores
// only: the standings carry no player id (lib/results/types.ts).

const SEARCH_CLASS =
  "min-h-11 w-full rounded-xl border border-ht-elevated-2 bg-ht-elevated px-3 py-2.5 text-base font-bold text-ht-primary outline-none placeholder:text-ht-muted focus:border-ht-cyan-400";

const StandingLine = ({ standing, unit }: { standing: ResultsStanding; unit: string }) => (
  <>
    <span className="min-w-0 flex-1 truncate font-bold text-ht-primary">
      <span className="mr-2 text-ht-muted">#{standing.rank}</span>
      {standing.username ?? "Deleted player"}
    </span>
    <span className="shrink-0 font-black text-ht-primary">{scoreLabel(standing.score, unit)}</span>
  </>
);

export const GameStandingsScreen = ({
  game,
  loaded,
  currentYear,
  query,
  onQueryChange,
  onRetry,
  onOpenPlayer,
  onOpenReward,
}: {
  /** The timeline's row for this game, shown while the screen loads. */
  game: ResultsGameRow;
  loaded: Loaded<ResultsGameScreen>;
  currentYear: number;
  /** The search text lives in the sheet, so it survives a visit to a player and back. */
  query: string;
  onQueryChange: (query: string) => void;
  onRetry: () => void;
  onOpenPlayer: (standing: ResultsStanding) => void;
  onOpenReward: (reward: ResultsRewardItem) => void;
}) => {
  const competition = getResultsCompetition(game.competitionId);
  const unit = competition?.scoreUnit ?? "";
  const screen = loaded.status === "ready" ? loaded.value : null;
  const shown = screen?.game ?? game;
  const canOpen = competition?.hasBreakdown === true;
  const standings = screen?.standings ?? [];
  const matches = standings.filter((standing) => matchesPlayerSearch(standing.username, query));

  return (
    <div className="space-y-3">
      <StepHeading hint={`${competition ? `${competition.label} · ` : ""}${shown.title} · ${playerCountLabel(shown.playerCount)}`}>
        {formatOccurrenceDate(shown.date, currentYear)}
      </StepHeading>
      {loaded.status === "loading" ? <HightopLoader size="md" className="py-8" /> : null}
      {loaded.status === "error" ? <ListError message={loaded.message} onRetry={onRetry} /> : null}
      {screen?.game.inProgress ? (
        <p className={EMPTY_CLASS}>This game is still being played. Final standings appear when it ends.</p>
      ) : null}
      {screen && !screen.game.inProgress && standings.length === 0 ? <p className={EMPTY_CLASS}>Nobody scored in this game.</p> : null}
      {screen && standings.length > 0 ? (
        <>
          <div>
            <label htmlFor="results-find-player" className="mb-1.5 block text-footnote font-bold text-ht-muted">
              Find a player
            </label>
            <input
              id="results-find-player"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={SEARCH_CLASS}
            />
          </div>
          {matches.length === 0 ? (
            <p className={EMPTY_CLASS}>No player matches “{query.trim()}”.</p>
          ) : (
            <ol className="divide-y divide-ht-hairline rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3">
              {matches.map((standing, index) => (
                <li key={`${standing.rank}-${index}`}>
                  {canOpen && standing.entry ? (
                    <button type="button" onClick={() => onOpenPlayer(standing)} className={BARE_BUTTON_CLASS}>
                      <div className="flex min-h-11 items-center gap-3 py-2.5">
                        <StandingLine standing={standing} unit={unit} />
                        <Chevron />
                      </div>
                    </button>
                  ) : (
                    <div className="flex min-h-11 items-center gap-3 py-2.5">
                      <StandingLine standing={standing} unit={unit} />
                      <span className="invisible">
                        <Chevron />
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      ) : null}
      {screen && screen.rewards.length > 0 ? (
        <section aria-label="Prizes won at this game" className="space-y-1.5 pt-2">
          <p className="px-1 text-caption font-black uppercase tracking-wider text-ht-muted">Prizes won at this game</p>
          <ul className="space-y-2">
            {screen.rewards.map((reward) => (
              <li key={`${reward.rewardId}:${reward.cycleStart}`}>
                <button
                  type="button"
                  onClick={() => onOpenReward(reward)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-[14px] border border-ht-hairline bg-ht-elevated/40 p-3 text-left transition active:translate-y-px"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-black text-ht-primary">🎁 {rewardTitleAt(reward, screen.rewards)}</div>
                    <div className="mt-0.5 truncate text-footnote font-bold text-ht-emerald-300">{rewardWinnersLine(reward)}</div>
                  </div>
                  <Chevron />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
