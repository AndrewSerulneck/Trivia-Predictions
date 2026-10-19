import "server-only";

import { SQUARES_MOMENTS, squaresEventPhase, squaresMomentPoints } from "@/lib/squares";
import {
  EVENT_COLUMNS,
  MOMENT_COLUMNS,
  toEventRecord,
  toMomentRecord,
  type MomentRow,
  type StoreResult,
} from "@/lib/squaresStore";
import type { SquaresScoreView } from "@/lib/squaresView";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// The shared Squares score (GET /api/squares/score). The same for every venue and every player, so
// the CDN can answer it for 15 s: it carries no player, no claim and no venue — only the phase, the
// drawn digits (null until the draw), the live score the settlement already stored on the event, and
// each graded moment's winning cell. ONE database request per cache miss (the moments ride in the
// same select), and ZERO calls to the sports feed (docs/squares-and-brackets-plan.md §6).

type EventRowWithMoments = Parameters<typeof toEventRecord>[0] & { squares_event_moments: MomentRow[] | null };

export async function getSquaresScoreView(nowMs: number = Date.now()): Promise<StoreResult<SquaresScoreView>> {
  if (!supabaseAdmin) return { ok: false, error: "Supabase admin client is not configured." };
  const { data, error } = await supabaseAdmin
    .from("squares_events")
    .select(`${EVENT_COLUMNS}, squares_event_moments(${MOMENT_COLUMNS})`)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, value: { event: null, moments: [] } };

  const row = data as unknown as EventRowWithMoments;
  const event = toEventRecord(row);
  const records = (row.squares_event_moments ?? []).flatMap((moment) => {
    const record = toMomentRecord(moment);
    return record ? [record] : [];
  });
  const drawn = Boolean(event.drawnAt);

  return {
    ok: true,
    value: {
      event: {
        id: event.id,
        phase: squaresEventPhase(
          {
            lockAtMs: Date.parse(event.lockAt),
            drawnAtMs: event.drawnAt ? Date.parse(event.drawnAt) : null,
            completedAtMs: event.completedAt ? Date.parse(event.completedAt) : null,
            archivedAtMs: null,
          },
          nowMs,
        ),
        kickoffAt: event.kickoffAt,
        lockAt: event.lockAt,
        colDigits: drawn ? event.colDigits : null,
        rowDigits: drawn ? event.rowDigits : null,
        liveScore: event.liveScore
          ? { col: event.liveScore.col, row: event.liveScore.row, status: event.liveScore.status }
          : null,
      },
      moments: SQUARES_MOMENTS.map((moment) => {
        const record = records.find((item) => item.moment === moment);
        const graded = record?.graded ?? null;
        return {
          moment,
          points: squaresMomentPoints(moment),
          result: graded ? { col: graded.col, row: graded.row, winningCell: graded.winningCell, gradeNo: record?.gradeNo ?? 0 } : null,
        };
      }),
    },
  };
}
