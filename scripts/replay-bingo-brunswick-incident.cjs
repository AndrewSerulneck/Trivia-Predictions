#!/usr/bin/env node
// Offline only: no env file, network, database, progress sweep, or board generation.
// node --conditions react-server --import tsx scripts/replay-bingo-brunswick-incident.cjs
// --assert-correct exits nonzero while current grading disagrees with the official evidence.
const fs = require('node:fs');
const path = require('node:path');

const run = async () => {
  globalThis.fetch = async () => { throw new Error('Incident replay forbids network access'); };
  // Prevent even constructing a service-role client if credentials were inherited by the shell.
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fixture = JSON.parse(fs.readFileSync(path.resolve('tests/fixtures/bingo-brunswick-grove-2026-09-09.json'), 'utf8'));
  for (const feed of Object.values(fixture.provider)) {
    if (!feed.complete) throw new Error('Cannot replay incomplete captured input as complete');
  }
  const { gradeResolversAgainstCompletedNFLGame, boardStatusesMakeALine } = require('@/lib/sportsBingo');
  const replay = gradeResolversAgainstCompletedNFLGame({
    game: fixture.provider.game.rows[0], homeTeam: fixture.card.home_team, awayTeam: fixture.card.away_team,
    designationRows: fixture.provider.designations.rows,
    statRows: fixture.provider.stats.rows, teamStatRows: fixture.provider.teamStats.rows,
    plays: fixture.provider.plays.rows, resolvers: fixture.squares.map(square => square.resolver),
  });
  const squares = fixture.squares.map((square, index) => ({
    index: square.square_index, id: square.id, label: square.label, stored: square.status,
    expected: square.expected, replay: replay[index].status,
    labelDispute: square.labelDispute ?? null, evidence: square.evidence,
  }));
  const counts = field => squares.reduce((result, square) => {
    result[square[field]] = (result[square[field]] || 0) + 1; return result;
  }, {});
  const result = {
    incident: fixture.incident, storedSportKey: fixture.card.sport_key,
    replayScope: 'Direct NFL grader with complete final provider input. Bypasses stored sport-key routing; see Vitest sweep reproduction.',
    counts: { stored: counts('stored'), expectedResolver: counts('expected'), directNFLReplay: counts('replay') },
    storedDiscrepancies: squares.filter(square => square.stored !== square.expected).length,
    directNFLDiscrepancies: squares.filter(square => square.replay !== square.expected).length,
    labelDisputes: squares.filter(square => square.labelDispute).length,
    expectedWinningLine: boardStatusesMakeALine(squares.map(square => ({ index: square.index, hit: square.expected === 'hit' }))),
    squares,
  };
  console.log(JSON.stringify(result, null, 2));
  if (process.argv.includes('--assert-correct') && result.directNFLDiscrepancies) process.exitCode = 1;
};
run().catch(error => { console.error(error.message); process.exitCode = 1; });
