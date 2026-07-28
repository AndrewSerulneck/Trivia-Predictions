// Re-syncs nfl_pickem_weeks from balldontlie and shows a before/after diff of
// every stored week — the Phase 2 verification step in
// docs/nfl-pickem-code-review-fixes-plan.md (the week anchor moved from "the
// Thursday of the earliest kickoff" to "the Thursday whose Tue→Tue span holds
// the most games", so stored week_start_date values can legitimately shift).
//
// Reads the CURRENT rows first and writes them to a JSON snapshot before
// touching anything, so any change is reversible.
//
// Dry run (default — reads and diffs, writes nothing):
//   node --env-file=.env.local scripts/resync-nfl-weeks.cjs [season]
// Apply:
//   node --env-file=.env.local scripts/resync-nfl-weeks.cjs [season] --apply
//
// The anchoring logic below MIRRORS resolveWeekAnchorThursday / nflWeekSpanMs in
// lib/nflPickEm.ts. It is duplicated (not imported) so this runs as plain node
// with no TS loader — if you change one, change the other.

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLOVER_UTC_HOUR = 5;

const season = Number(process.argv.find((arg) => /^\d{4}$/.test(arg))) || new Date().getFullYear();
const apply = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bdlKey = process.env.BALLDONTLIE_API_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local");
  process.exit(1);
}
if (!bdlKey) {
  console.error("Missing BALLDONTLIE_API_KEY. Run with --env-file=.env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const thursdayOfWeek = (ms) => {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 4 + 7) % 7));
  return d;
};

const spanOf = (weekStartDate) => {
  const anchorMs = Date.parse(`${weekStartDate}T00:00:00.000Z`);
  const daysSinceTuesday = (new Date(anchorMs).getUTCDay() - 2 + 7) % 7;
  const startMs = anchorMs - daysSinceTuesday * DAY_MS + ROLLOVER_UTC_HOUR * 60 * 60 * 1000;
  return { startMs, endMsExclusive: startMs + 7 * DAY_MS };
};

const anchorThursday = (kickoffs) => {
  const candidates = new Map();
  for (const ms of kickoffs) {
    const thursday = thursdayOfWeek(ms);
    candidates.set(thursday.getTime(), thursday);
  }
  const scored = [...candidates.values()].map((thursday) => {
    const span = spanOf(thursday.toISOString().slice(0, 10));
    return {
      thursday,
      contained: kickoffs.filter((ms) => ms >= span.startMs && ms < span.endMsExclusive).length,
    };
  });
  scored.sort((a, b) => b.contained - a.contained || b.thursday.getTime() - a.thursday.getTime());
  return scored[0].thursday;
};

async function fetchAllGames() {
  const games = [];
  let cursor = null;

  for (let page = 0; page < 40; page += 1) {
    const query = new URLSearchParams({ "seasons[]": String(season), per_page: "100", postseason: "false" });
    if (cursor) query.set("cursor", String(cursor));

    const response = await fetch(`https://api.balldontlie.io/nfl/v1/games?${query}`, {
      headers: { Authorization: bdlKey },
    });
    if (!response.ok) throw new Error(`balldontlie ${response.status}: ${await response.text()}`);

    const body = await response.json();
    games.push(...(body.data ?? []));
    cursor = body.meta?.next_cursor ?? null;
    if (!cursor) break;
  }

  return games;
}

(async () => {
  const { data: before, error: beforeError } = await supabase
    .from("nfl_pickem_weeks")
    .select("*")
    .eq("season", season)
    .order("week_number", { ascending: true });

  if (beforeError) throw beforeError;

  const snapshotPath = path.join(process.cwd(), `nfl-weeks-${season}-before.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(before, null, 2));
  console.log(`Snapshot of ${before.length} stored week(s) → ${snapshotPath}\n`);

  const games = await fetchAllGames();
  console.log(`Fetched ${games.length} regular-season games for ${season}.\n`);

  const byWeek = new Map();
  for (const game of games) {
    const weekNumber = Number(game.week);
    if (!Number.isFinite(weekNumber) || weekNumber < 1) continue;
    if (!byWeek.has(weekNumber)) byWeek.set(weekNumber, []);
    byWeek.get(weekNumber).push(game);
  }

  const planned = [];
  for (const [weekNumber, weekGames] of [...byWeek.entries()].sort((a, b) => a[0] - b[0])) {
    const kickoffs = weekGames.map((g) => Date.parse(g.date)).filter(Number.isFinite);
    if (kickoffs.length === 0) continue;

    const thursday = anchorThursday(kickoffs);
    const weekStartDate = thursday.toISOString().slice(0, 10);
    const weekEnd = new Date(thursday);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 4);

    const span = spanOf(weekStartDate);
    const outside = kickoffs.filter((ms) => ms < span.startMs || ms >= span.endMsExclusive);

    planned.push({
      weekNumber,
      weekStartDate,
      weekEndDate: weekEnd.toISOString().slice(0, 10),
      gamesCount: weekGames.length,
      outside: outside.length,
      span,
    });
  }

  // Overlap tripwire — same rule as assertNoOverlappingWeekSpans.
  const ordered = [...planned].sort((a, b) => a.span.startMs - b.span.startMs);
  let overlaps = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].span.startMs < ordered[i - 1].span.endMsExclusive) {
      overlaps += 1;
      console.error(
        `OVERLAP: week ${ordered[i - 1].weekNumber} (${ordered[i - 1].weekStartDate}) and ` +
          `week ${ordered[i].weekNumber} (${ordered[i].weekStartDate})`
      );
    }
  }

  const beforeByNumber = new Map(before.map((row) => [row.week_number, row]));
  let changed = 0;

  console.log("wk  stored start → new start   stored end → new end     games  notes");
  for (const plan of planned) {
    const prior = beforeByNumber.get(plan.weekNumber);
    const startChanged = prior && prior.week_start_date !== plan.weekStartDate;
    const endChanged = prior && prior.week_end_date !== plan.weekEndDate;
    if (startChanged || endChanged || !prior) changed += 1;

    const notes = [
      !prior ? "NEW" : null,
      startChanged ? "START MOVED" : null,
      endChanged ? "END MOVED" : null,
      plan.outside > 0 ? `${plan.outside} game(s) outside span` : null,
    ].filter(Boolean);

    console.log(
      `${String(plan.weekNumber).padStart(2)}  ${(prior?.week_start_date ?? "—").padEnd(12)}→ ${plan.weekStartDate}   ` +
        `${(prior?.week_end_date ?? "—").padEnd(12)}→ ${plan.weekEndDate}   ${String(plan.gamesCount).padStart(3)}   ${notes.join(", ")}`
    );
  }

  console.log(
    `\n${planned.length} week(s) planned, ${changed} would change, ${overlaps} overlap(s), ` +
      `${before.length} currently stored.`
  );

  if (overlaps > 0) {
    console.error("\nRefusing to write: overlapping spans.");
    process.exit(1);
  }

  if (!apply) {
    console.log("\nDry run — nothing written. Re-run with --apply to write.");
    return;
  }

  for (const plan of planned) {
    const weekGames = byWeek.get(plan.weekNumber);
    const thursdayGames = weekGames.filter((g) => new Date(g.date).getUTCDay() === 4);
    const byKickoff = [...weekGames].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const lockGame = thursdayGames.length > 0
      ? thursdayGames.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0]
      : byKickoff[0];

    const { error } = await supabase.from("nfl_pickem_weeks").upsert(
      {
        season,
        week_number: plan.weekNumber,
        week_start_date: plan.weekStartDate,
        week_end_date: plan.weekEndDate,
        thursday_kickoff: lockGame.date,
        games_count: plan.gamesCount,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "season,week_number" }
    );

    if (error) console.error(`week ${plan.weekNumber}: ${error.message}`);
  }

  const { data: after } = await supabase
    .from("nfl_pickem_weeks")
    .select("week_number, week_start_date, week_end_date, games_count")
    .eq("season", season)
    .order("week_number", { ascending: true });

  console.log(`\nWrote ${planned.length} week(s). ${after.length} week(s) now stored for ${season}.`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
