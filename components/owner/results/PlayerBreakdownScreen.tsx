import { StepHeading } from "@/components/owner/sheet/StepHeading";
import { EMPTY_CLASS, ListError } from "@/components/owner/results/resultsUi";
import { HightopLoader } from "@/components/ui/HightopLoader";
import type { Loaded } from "@/components/owner/results/resultsApi";
import { getResultsCompetition } from "@/lib/results/competitions";
import { scoreLabel } from "@/lib/results/resultsDisplay";
import type { ResultsBreakdown, ResultsBreakdownRow, ResultsGameRow, ResultsStanding } from "@/lib/results/types";

// One player's game, question by question: right or wrong, the points, and the question itself (one
// line, so a partner can match "the one about Elvis"). NEVER the player's own typed answer. The bottom
// line is the sum, which equals their standings score.

const OUTCOME: Record<ResultsBreakdownRow["outcome"], { mark: string; word: string; className: string }> = {
  right: { mark: "✓", word: "Right", className: "text-ht-emerald-300" },
  wrong: { mark: "✗", word: "Wrong", className: "text-ht-rose-300" },
  none: { mark: "–", word: "No answer", className: "text-ht-muted" },
};

/** Consecutive rows with the same `group` ("Round 1") share a heading. */
const byGroup = (rows: ReadonlyArray<ResultsBreakdownRow>): Array<{ group: string; rows: ResultsBreakdownRow[] }> => {
  const groups: Array<{ group: string; rows: ResultsBreakdownRow[] }> = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.group === row.group) last.rows.push(row);
    else groups.push({ group: row.group, rows: [row] });
  }
  return groups;
};

export const PlayerBreakdownScreen = ({
  game,
  standing,
  loaded,
  onRetry,
}: {
  game: ResultsGameRow;
  standing: ResultsStanding;
  loaded: Loaded<ResultsBreakdown>;
  onRetry: () => void;
}) => {
  const unit = getResultsCompetition(game.competitionId)?.scoreUnit ?? "";
  return (
    <div className="space-y-3">
      <StepHeading hint={`#${standing.rank} · ${scoreLabel(standing.score, unit)}`}>{standing.username ?? "Deleted player"}</StepHeading>
      {loaded.status === "loading" ? <HightopLoader size="md" className="py-8" /> : null}
      {loaded.status === "error" ? <ListError message={loaded.message} onRetry={onRetry} /> : null}
      {loaded.status === "ready" && loaded.value.rows.length === 0 ? <p className={EMPTY_CLASS}>No answers recorded for this player.</p> : null}
      {loaded.status === "ready" && loaded.value.rows.length > 0 ? (
        <>
          {byGroup(loaded.value.rows).map((section) => (
            <section key={section.group} aria-label={section.group} className="space-y-1.5">
              <p className="px-1 text-caption font-black uppercase tracking-wider text-ht-muted">{section.group}</p>
              <ul className="divide-y divide-ht-hairline rounded-xl border border-ht-hairline bg-ht-elevated/40 px-3">
                {section.rows.map((row) => {
                  const outcome = OUTCOME[row.outcome];
                  return (
                    <li key={`${row.group}-${row.label}`} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-ht-primary">{row.label}</div>
                        {row.detail ? <div className="truncate text-footnote font-semibold text-ht-muted">{row.detail}</div> : null}
                      </div>
                      <span className={`shrink-0 font-black ${outcome.className}`} role="img" aria-label={outcome.word}>
                        {outcome.mark}
                      </span>
                      <span className="w-20 shrink-0 text-right font-black text-ht-primary">{scoreLabel(row.points, unit)}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <div className="flex items-center justify-between gap-3 px-1 pt-1">
            <span className="font-black text-ht-secondary">Total</span>
            <span className="font-black text-ht-primary">{scoreLabel(loaded.value.total, unit)}</span>
          </div>
        </>
      ) : null}
    </div>
  );
};
