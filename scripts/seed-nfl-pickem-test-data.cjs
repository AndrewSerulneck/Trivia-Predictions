// Seeds a realistic multi-week NFL Pick 'Em dev/test state:
//
// 1. Drops a flag file (.nfl-pickem-test-data) that lib/nflPickEm.ts checks —
//    when present, fetchNFLGamesFromBDL() returns fake games instead of
//    calling the real balldontlie API (which has no games in the off-season).
// 2. Upserts FOUR throwaway `nfl_pickem_weeks` rows in the reserved
//    week_number range 996-999: three completed past weeks (every game
//    final — week 996 has only 2 of the 4 sim users picking, a negative case
//    for the 3+-picker minimum-participation gate; week 997 has a clear #1;
//    week 998 has an exact tie for first) and one "current" week guaranteed
//    to have a mix of already-kicked-off and not-yet-started games.
// 3. Creates 4 fake `nflsim_`-prefixed users at the target venue with a mix
//    of correct/wrong/pending picks across all four weeks, so the
//    leaderboard has content and Phase 7's winner-resolution + tiebreaker
//    cases are both verifiable.
//
// IMPORTANT: the game generation logic here (matchups, scores, kickoff
// slots) mirrors `generateMockNFLGames` in lib/nflPickEm.ts byte-for-byte.
// It's duplicated (not imported) so this script can run as plain
// `node --env-file=.env.local ...` with no TS loader. If you change one,
// change the other.
//
// Run:   node --env-file=.env.local scripts/seed-nfl-pickem-test-data.cjs [venueId]
// Undo:  node --env-file=.env.local scripts/unseed-nfl-pickem-test-data.cjs
//
// After seeding, restart `npm run dev` (or wait for the route to be hit
// again) and open /nfl-pickem.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

const FLAG_PATH = path.join(__dirname, "..", ".nfl-pickem-test-data");
// The app's weeks API defaults to the current calendar year when no ?season=
// is given, so the test weeks must use that same season to show up by default.
const TEST_SEASON = new Date().getUTCFullYear();

const WEEK_NUMBERS = {
  lowParticipation: 996, // furthest past, fully complete, only 2 of 4 sim users picked (participation-gate negative case)
  pastA: 997, // furthest past (with picks from all 4 users), fully complete, distinct correct-pick counts (clear #1)
  pastB: 998, // past, fully complete, EXACT TIE for first between two users
  current: 999, // in-progress: locked + open games at once
};

const DEFAULT_VENUE_ID = "venue-pacific-street";

const NFL_PICKEM_SPORT_KEY = "americanfootball_nfl";
const NFL_PICKEM_LEAGUE = "NFL";
const PICKEM_REWARD_POINTS = 10;

// ── Mirrors lib/nflPickEm.ts ─────────────────────────────────────────────

const MOCK_NFL_MATCHUPS = [
  { home: "Kansas City Chiefs", away: "Baltimore Ravens", homeId: "mock-kc", awayId: "mock-bal" },
  { home: "San Francisco 49ers", away: "Dallas Cowboys", homeId: "mock-sf", awayId: "mock-dal" },
  { home: "Buffalo Bills", away: "Miami Dolphins", homeId: "mock-buf", awayId: "mock-mia" },
  { home: "Philadelphia Eagles", away: "New York Giants", homeId: "mock-phi", awayId: "mock-nyg" },
  { home: "Detroit Lions", away: "Green Bay Packers", homeId: "mock-det", awayId: "mock-gb" },
  { home: "Cincinnati Bengals", away: "Cleveland Browns", homeId: "mock-cin", awayId: "mock-cle" },
  { home: "Seattle Seahawks", away: "Los Angeles Rams", homeId: "mock-sea", awayId: "mock-lar" },
  { home: "Houston Texans", away: "Jacksonville Jaguars", homeId: "mock-hou", awayId: "mock-jax" },
  { home: "Minnesota Vikings", away: "Chicago Bears", homeId: "mock-min", awayId: "mock-chi" },
  { home: "New Orleans Saints", away: "Tampa Bay Buccaneers", homeId: "mock-no", awayId: "mock-tb" },
  { home: "Los Angeles Chargers", away: "Denver Broncos", homeId: "mock-lac", awayId: "mock-den" },
  { home: "Pittsburgh Steelers", away: "New York Jets", homeId: "mock-pit", awayId: "mock-nyj" },
  { home: "Indianapolis Colts", away: "Tennessee Titans", homeId: "mock-ind", awayId: "mock-ten" },
  { home: "Arizona Cardinals", away: "Atlanta Falcons", homeId: "mock-ari", awayId: "mock-atl" },
];

function mockFinalScore(index) {
  const home = 13 + ((index * 7) % 22);
  let away = 10 + ((index * 13) % 25);
  if (away === home) away += 3;
  return { home, away };
}

function setUtcHm(base, hours, minutes) {
  const d = new Date(base);
  d.setUTCHours(hours, minutes, 0, 0);
  return d;
}

function buildCalendarKickoffs(weekStart) {
  const thursday = new Date(weekStart);
  const sunday = new Date(weekStart);
  sunday.setUTCDate(sunday.getUTCDate() + 3);
  const monday = new Date(weekStart);
  monday.setUTCDate(monday.getUTCDate() + 4);

  return [
    setUtcHm(thursday, 20, 20),
    setUtcHm(sunday, 13, 0),
    setUtcHm(sunday, 13, 0),
    setUtcHm(sunday, 13, 0),
    setUtcHm(sunday, 13, 0),
    setUtcHm(sunday, 16, 5),
    setUtcHm(sunday, 16, 5),
    setUtcHm(sunday, 16, 25),
    setUtcHm(sunday, 16, 25),
    setUtcHm(sunday, 16, 25),
    setUtcHm(sunday, 20, 20),
    setUtcHm(sunday, 20, 20),
    setUtcHm(monday, 20, 15),
    setUtcHm(monday, 20, 15),
  ];
}

function buildCurrentWeekKickoffs(now) {
  const hoursFromNow = (h) => new Date(now + h * 60 * 60 * 1000);
  return [
    hoursFromNow(-5),
    hoursFromNow(-2),
    hoursFromNow(2),
    hoursFromNow(5),
    hoursFromNow(9),
    hoursFromNow(24),
    hoursFromNow(27),
    hoursFromNow(30),
    hoursFromNow(48),
    hoursFromNow(51),
    hoursFromNow(72),
    hoursFromNow(75),
    hoursFromNow(96),
    hoursFromNow(99),
  ];
}

function generateWeekGames(fromDate, toDate) {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T23:59:59.999Z`);
  const now = Date.now();

  const nowWithinWeek = now >= from.getTime() && now <= to.getTime();
  const nearWeek =
    Math.abs(now - from.getTime()) <= 6 * 24 * 60 * 60 * 1000 ||
    Math.abs(now - to.getTime()) <= 6 * 24 * 60 * 60 * 1000;
  const treatAsCurrentWeek = nowWithinWeek || nearWeek;

  const kickoffs = treatAsCurrentWeek ? buildCurrentWeekKickoffs(now) : buildCalendarKickoffs(from);

  return MOCK_NFL_MATCHUPS.map((matchup, index) => {
    const startsAt = (kickoffs[index] ?? kickoffs[kickoffs.length - 1]).toISOString();
    const startsAtMs = Date.parse(startsAt);
    const isPast = startsAtMs < now;
    const score = mockFinalScore(index);
    return {
      id: `mock-${matchup.homeId}-${matchup.awayId}`,
      homeTeam: matchup.home,
      awayTeam: matchup.away,
      homeTeamId: matchup.homeId,
      awayTeamId: matchup.awayId,
      startsAt,
      homeScore: isPast ? score.home : null,
      awayScore: isPast ? score.away : null,
      winnerTeam: isPast ? (score.home > score.away ? matchup.home : matchup.away) : null,
      status: isPast ? "final" : "scheduled",
    };
  });
}

function compositeGameId(game) {
  return `${game.id}__${game.startsAt}__${game.awayTeam}__${game.homeTeam}`;
}

// ── Week windows ────────────────────────────────────────────────────────

// The most recent Thursday on or before `date` (a Thursday-Monday NFL week
// never spans a Tue/Wed, so this is always <= `date`, satisfying Phase 3's
// "dropdown only shows weeks with week_start_date <= today").
function mostRecentThursdayOnOrBefore(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

// ── DB helpers ──────────────────────────────────────────────────────────

function getDb() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key);
}

async function upsertWeek(db, { weekNumber, displayLabel, weekStart }) {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 4);
  const thursdayKickoff = new Date(weekStart);
  thursdayKickoff.setUTCHours(20, 20, 0, 0);

  const { data: week, error } = await db
    .from("nfl_pickem_weeks")
    .upsert(
      {
        season: TEST_SEASON,
        week_number: weekNumber,
        week_type: "regular",
        display_label: displayLabel,
        week_start_date: dateKey(weekStart),
        week_end_date: dateKey(weekEnd),
        thursday_kickoff: thursdayKickoff.toISOString(),
        games_count: MOCK_NFL_MATCHUPS.length,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "season,week_number,week_type" }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert nfl_pickem_weeks row (week_number=${weekNumber}): ${error.message}`);
  }
  return week;
}

const SIM_USERNAMES = ["nflsim_ace", "nflsim_fox", "nflsim_rex", "nflsim_pip"];

async function createSimUsers(db, venueId) {
  const users = [];
  for (const username of SIM_USERNAMES) {
    const email = `${username}_${crypto.randomUUID().slice(0, 8)}@nflpickemsim.test`;
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (authErr || !authData?.user) {
      throw new Error(`auth.admin.createUser failed for ${username}: ${authErr?.message}`);
    }

    const { data: profile, error: profErr } = await db
      .from("users")
      .insert({
        auth_id: authData.user.id,
        username,
        venue_id: venueId,
        points: 0,
      })
      .select("id, auth_id, username")
      .single();
    if (profErr || !profile) {
      throw new Error(`users insert failed for ${username}: ${profErr?.message}`);
    }
    users.push({ userId: profile.id, authId: profile.auth_id, username: profile.username });
  }
  return users;
}

// Each sim user has a fixed "strategy": which games they pick, and which
// side. This is what produces the required mix of correct / wrong /
// still-pending picks, and varying participation counts, across all weeks.
//
// `pick` optionally receives the week_number so week 998 can be steered into
// an EXACT TIE for first (nflsim_fox mirrors nflsim_ace's always-correct pick
// for that one week only) while every other week keeps its normal, distinct
// spread — Phase 7 needs both a clear #1 (week 997) and a real tie (week 998)
// to exercise the tiebreaker.
const USER_STRATEGIES = {
  nflsim_ace: { indices: (n) => n.map((_, i) => i), pick: (game) => game.winnerTeam ?? game.homeTeam },
  nflsim_fox: {
    indices: (n) => n.map((_, i) => i),
    pick: (game, i, weekNumber) =>
      weekNumber === WEEK_NUMBERS.pastB ? game.winnerTeam ?? game.homeTeam : i % 2 === 0 ? game.homeTeam : game.awayTeam,
  },
  nflsim_rex: {
    indices: (n) => n.slice(0, 7).map((_, i) => i),
    pick: (game, i) => (i % 2 === 0 ? game.awayTeam : game.homeTeam),
  },
  nflsim_pip: {
    indices: (n) => n.slice(9).map((_, i) => i + 9),
    pick: (game) => {
      if (!game.winnerTeam) return game.awayTeam;
      return game.winnerTeam === game.homeTeam ? game.awayTeam : game.homeTeam;
    },
  },
};

// Returns { username: correctCount } for the users who actually picked that
// week, so callers can print/assert a per-week/per-user summary without
// re-deriving it from the strategies.
async function seedPicksForWeek(db, venueId, users, week, games, participantUsernames) {
  const participants = participantUsernames
    ? users.filter((user) => participantUsernames.includes(user.username))
    : users;
  const correctCounts = {};

  for (const user of participants) {
    const strategy = USER_STRATEGIES[user.username];
    const indices = strategy.indices(games);
    let correctCount = 0;
    const rows = indices.map((i) => {
      const game = games[i];
      const pickTeam = strategy.pick(game, i, week.week_number);
      const selectedSide = pickTeam === game.homeTeam ? "home" : "away";
      const selectedTeamId = selectedSide === "home" ? game.homeTeamId : game.awayTeamId;
      const status = game.status === "final" ? (pickTeam === game.winnerTeam ? "won" : "lost") : "pending";
      if (status === "won") correctCount += 1;
      return {
        user_id: user.userId,
        venue_id: venueId,
        sport_slug: "nfl",
        sport_key: NFL_PICKEM_SPORT_KEY,
        league: NFL_PICKEM_LEAGUE,
        game_id: compositeGameId(game),
        home_team_id: game.homeTeamId,
        away_team_id: game.awayTeamId,
        selected_team: pickTeam,
        selected_side: selectedSide,
        selected_team_id: selectedTeamId,
        game_label: `${game.awayTeam} vs ${game.homeTeam}`,
        home_team: game.homeTeam,
        away_team: game.awayTeam,
        starts_at: game.startsAt,
        status,
        home_score: game.homeScore,
        away_score: game.awayScore,
        resolved_at: status === "pending" ? null : new Date().toISOString(),
        reward_points: PICKEM_REWARD_POINTS,
      };
    });
    correctCounts[user.username] = correctCount;

    if (rows.length > 0) {
      const { error } = await db.from("pickem_picks").upsert(rows, { onConflict: "user_id,game_id" });
      if (error) {
        throw new Error(`pickem_picks upsert failed for ${user.username}/week ${week.week_number}: ${error.message}`);
      }
    }

    const { error: rpcError } = await db.rpc("recalculate_nfl_user_week", {
      p_user_id: user.userId,
      p_venue_id: venueId,
      p_nfl_week_id: week.id,
    });
    if (rpcError) {
      throw new Error(`recalculate_nfl_user_week failed for ${user.username}/week ${week.week_number}: ${rpcError.message}`);
    }
  }

  return correctCounts;
}

async function main() {
  const venueId = String(process.argv[2] ?? "").trim() || DEFAULT_VENUE_ID;
  const db = getDb();

  const { data: venue, error: venueError } = await db.from("venues").select("id").eq("id", venueId).maybeSingle();
  if (venueError) throw new Error(`Failed to look up venue "${venueId}": ${venueError.message}`);
  if (!venue) throw new Error(`Venue "${venueId}" not found. Pass a valid venue id as the first argument.`);

  const currentWeekStart = mostRecentThursdayOnOrBefore(new Date());
  const pastBWeekStart = new Date(currentWeekStart);
  pastBWeekStart.setUTCDate(pastBWeekStart.getUTCDate() - 14);
  const pastAWeekStart = new Date(currentWeekStart);
  pastAWeekStart.setUTCDate(pastAWeekStart.getUTCDate() - 21);
  const lowParticipationWeekStart = new Date(currentWeekStart);
  lowParticipationWeekStart.setUTCDate(lowParticipationWeekStart.getUTCDate() - 28);

  const weekSpecs = [
    {
      weekNumber: WEEK_NUMBERS.lowParticipation,
      displayLabel: "TEST Week (past, low participation)",
      weekStart: lowParticipationWeekStart,
      // Only 2 sim users pick this week — Phase 7's minimum-participation
      // (3+ pickers) negative case.
      participantUsernames: ["nflsim_ace", "nflsim_fox"],
    },
    { weekNumber: WEEK_NUMBERS.pastA, displayLabel: "TEST Week (past)", weekStart: pastAWeekStart },
    { weekNumber: WEEK_NUMBERS.pastB, displayLabel: "TEST Week (past)", weekStart: pastBWeekStart },
    { weekNumber: WEEK_NUMBERS.current, displayLabel: "TEST Week (current)", weekStart: currentWeekStart },
  ];

  const users = await createSimUsers(db, venueId);
  const summary = [];

  for (const spec of weekSpecs) {
    const week = await upsertWeek(db, spec);
    const weekEnd = new Date(spec.weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 4);
    const games = generateWeekGames(dateKey(spec.weekStart), dateKey(weekEnd));
    const correctCounts = await seedPicksForWeek(db, venueId, users, week, games, spec.participantUsernames);
    const lockedCount = games.filter((g) => Date.parse(g.startsAt) < Date.now()).length;
    console.log(
      `  Week ${week.week_number} (${week.week_start_date} -> ${week.week_end_date}): ${lockedCount}/${games.length} kicked off`
    );
    summary.push({ weekNumber: week.week_number, correctCounts });
  }

  fs.writeFileSync(FLAG_PATH, `seeded ${new Date().toISOString()}\n`);

  console.log("NFL Pick 'Em test data seeded.");
  console.log(`  Venue:     ${venueId}`);
  console.log(`  Flag file: ${FLAG_PATH}`);
  console.log(`  Sim users: ${users.map((u) => u.username).join(", ")}`);
  console.log("Correct-pick summary (week -> per-user correct count):");
  for (const { weekNumber, correctCounts } of summary) {
    const parts = Object.entries(correctCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([username, count]) => `${username}=${count}`)
      .join(", ");
    console.log(`  Week ${weekNumber}: ${parts}`);
  }
  console.log("Restart `npm run dev` if it's already running, then open /nfl-pickem.");
  console.log("Undo with: node --env-file=.env.local scripts/unseed-nfl-pickem-test-data.cjs");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
