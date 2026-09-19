import incident from "@/tests/fixtures/bingo-brunswick-grove-2026-09-09.json";

type Row = Record<string, unknown>;
/** Synthetic shape-complete rows for isolated rule tests, not captured historical evidence. */
export const nflZeroStats = (): Row => Object.fromEntries(Object.keys(incident.provider.stats.rows[0]).filter(key => key !== "player" && key !== "team").map(key => [key, 0]));
export function completeSyntheticNFLStats(rows: Row[], home: string, away: string): Row[] {
  if (!rows.length) return [];
  const complete = rows.map(row => ({ ...nflZeroStats(), ...row }));
  for (const [index, team] of [home, away].entries()) {
    if (!complete.some(row => (row.team as Row)?.full_name === team)) complete.push({ ...nflZeroStats(), player: { id: 900000 + index, first_name: "Fixture", last_name: `Participant${index}`, position_abbreviation: "LB" }, team: { id: index + 1, full_name: team } });
  }
  return complete;
}
/** The synthetic sequence explicitly starts at kickoff and ends at the supplied final score. */
export function completeSyntheticNFLPlays(rows: Row[], game: Row): Row[] {
  if (!rows.length) return [];
  return [
    { type_slug: "kickoff", period: 1, clock_display: "15:00", home_score: 0, away_score: 0 },
    ...rows,
    ...(/final/i.test(String(game.status)) ? [{ type_slug: "end-of-game", period: 4, clock_display: "0:00", home_score: game.home_team_score, away_score: game.visitor_team_score }] : []),
  ];
}
