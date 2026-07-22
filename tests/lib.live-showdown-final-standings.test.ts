import { beforeEach, describe, expect, it, vi } from "vitest";

// loadOccurrenceFinalStandings selects every live_showdown_answers row for an
// occurrence unbounded — Supabase/PostgREST caps a single response at 1000 rows,
// so a sold-out venue's occurrence (many players × many questions) can silently
// truncate the standings the winner resolver uses to pick who won. This pins the
// pagination fix: results across the page boundary must still all be counted.
const TOTAL_ROWS = 1001;

type AnswerRow = { user_id: string; points_awarded: number };

function buildRows(): AnswerRow[] {
  const rows: AnswerRow[] = [];
  // 1000 rows for "trailing-user" (1 point each) plus 1 row for "leading-user"
  // worth more than all of them combined — the leader's row only exists in the
  // second page, so a resolver that stops after page 1 would crown the wrong winner.
  for (let i = 0; i < TOTAL_ROWS - 1; i++) {
    rows.push({ user_id: "trailing-user", points_awarded: 1 });
  }
  rows.push({ user_id: "leading-user", points_awarded: TOTAL_ROWS });
  return rows;
}

const mocks = vi.hoisted(() => ({ rows: [] as AnswerRow[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (_table: string) => {
      const query = {
        eq: () => query,
        range: (from: number, to: number) => {
          const data = mocks.rows.slice(from, to + 1);
          return Promise.resolve({ data, error: null });
        },
      };
      return { select: () => query };
    },
  },
}));

import { loadOccurrenceFinalStandings } from "@/lib/liveShowdownEngine";

beforeEach(() => {
  mocks.rows = buildRows();
});

describe("loadOccurrenceFinalStandings — pagination", () => {
  it("aggregates rows across a page boundary instead of truncating at the page size", async () => {
    const standings = await loadOccurrenceFinalStandings("sched-1", "2026-07-21");
    const leader = standings.find((s) => s.userId === "leading-user");
    expect(leader?.totalPoints).toBe(TOTAL_ROWS);
    expect(standings[0].userId).toBe("leading-user");

    const trailing = standings.find((s) => s.userId === "trailing-user");
    expect(trailing?.totalPoints).toBe(TOTAL_ROWS - 1);
  });
});
