#!/usr/bin/env node

/**
 * Phase 7a of docs/prop-bingo-nfl-plan.md — what are the MLB team-event base rates, really?
 *
 * The fourteen `mlb_webhook_team_event_at_least` squares in `buildMLBPlayerPropCandidatesFromRecentStats`
 * are seven hardcoded thresholds carrying seven hardcoded probabilities, identical for every game.
 * Nobody ever checked those seven numbers against a box score. This script does, so 7b can replace
 * them with measured ones instead of differently-invented ones.
 *
 * ## What it measures
 *
 * Six of the seven events are ordinary box-score quantities on `/mlb/v1/stats` (verified 2026-08-17):
 *
 *   hit -> `hits`   walk -> `bb`   hit_by_pitch -> `hit_by_pitch`
 *   strikeout -> `k`   groundout -> `ground_outs`   flyout -> `fly_outs`
 *
 * Summed over every batter on a team in a game, these are exactly the counts the MLB webhook
 * accumulates, so `P(team count >= threshold)` measured here is the probability the shipped
 * `mlb_webhook_team_event_at_least` resolver settles true.
 *
 * The seventh, `quick_out_under_3_pitches`, is **not** a balldontlie field — it is derived from our
 * own webhook stream. It cannot be measured here at all, by design; see the plan's 7a note.
 *
 * ## Two views, because 7b needs both
 *
 *   1. **Marginal** — `P(X >= n)` for every event at every plausible threshold, across all
 *      team-games. This is what picks the league-default rung.
 *   2. **Conditional on trailing form** — the same table, split by whether the team's own trailing
 *      average for that event (computed leak-free from *earlier* games only, the same 21-day window
 *      the production builder uses) was low/mid/high. This is what says whether scaling a threshold
 *      per game is worth doing, and by how much. If the split bands are on top of each other, a
 *      per-game threshold is theatre.
 *
 * Usage (same convention as scripts/validate-nfl-bingo-grading.cjs):
 *   npm run bingo:measure:mlb
 *   npm run bingo:measure:mlb -- --days 45 --json > docs/phase0-artifacts/mlb-event-rates.json
 */

const BASE_URL = process.env.BALLDONTLIE_API_BASE_URL ?? "https://api.balldontlie.io";
const API_KEY = process.env.BALLDONTLIE_API_KEY;

/**
 * `/mlb/v1/games` silently ignores `start_date` / `end_date` — passing them returns the oldest
 * games in the archive (year-2000 spring training), not the requested window. Verified 2026-08-17.
 * `dates[]` is the parameter that actually filters. Day-at-a-time is therefore deliberate here.
 */
async function fetchGamesOnDate(isoDate) {
  return fetchAll("/mlb/v1/games", { per_page: "100", "dates[]": isoDate });
}

async function fetchAll(path, params, maxPages = 12) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams(params);
    if (cursor !== null) query.set("cursor", String(cursor));
    const response = await fetch(`${BASE_URL}${path}?${query}`, { headers: { Authorization: API_KEY } });
    if (!response.ok) {
      console.error(`[measure] ${path} -> ${response.status}`);
      return rows;
    }
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    if (typeof payload.meta?.next_cursor !== "number") {
      return rows;
    }
    cursor = payload.meta.next_cursor;
  }
  console.error(`[measure] truncated at ${maxPages} pages: ${path}`);
  return rows;
}

/** event -> the `/mlb/v1/stats` batter field it sums, and the thresholds worth reporting. */
const EVENTS = {
  hit: { field: "hits", thresholds: [4, 5, 6, 7, 8, 9, 10, 11, 12], shipped: 5 },
  walk: { field: "bb", thresholds: [1, 2, 3, 4, 5, 6], shipped: 2 },
  hit_by_pitch: { field: "hit_by_pitch", thresholds: [1, 2], shipped: 1 },
  strikeout: { field: "k", thresholds: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], shipped: 5 },
  groundout: { field: "ground_outs", thresholds: [3, 4, 5, 6, 7, 8, 9, 10, 11], shipped: 4 },
  flyout: { field: "fly_outs", thresholds: [3, 4, 5, 6, 7, 8, 9, 10, 11], shipped: 4 },
};

/** Probabilities the shipped code assigns today, for the priced-vs-realized column. */
const SHIPPED_PROBABILITIES = {
  hit: 0.78,
  walk: 0.62,
  hit_by_pitch: 0.38,
  strikeout: 0.67,
  groundout: 0.74,
  flyout: 0.74,
};

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseArgs(argv) {
  const args = { days: 30, json: false, endDate: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--days") {
      args.days = Number.parseInt(argv[i + 1] ?? "30", 10);
      i += 1;
    } else if (argv[i] === "--end-date") {
      args.endDate = String(argv[i + 1] ?? "").trim() || null;
      i += 1;
    } else if (argv[i] === "--json") {
      args.json = true;
    }
  }
  return args;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * P(X >= k) for a negative binomial fitted to `mean` and `variance` by method of moments.
 * Falls back to Poisson when the data is under-dispersed (variance <= mean), where NB is undefined.
 */
function negativeBinomialAtLeast(k, mean, variance) {
  if (k <= 0) return 1;
  if (mean <= 0) return 0;
  if (variance <= mean) {
    // Poisson tail.
    let term = Math.exp(-mean);
    let cdf = term;
    for (let i = 1; i < k; i += 1) {
      term = (term * mean) / i;
      cdf += term;
    }
    return Math.max(0, Math.min(1, 1 - cdf));
  }
  const r = (mean * mean) / (variance - mean);
  const p = r / (r + mean);
  // pmf(0) = p^r, pmf(i) = pmf(i-1) * (r + i - 1) / i * (1 - p)
  let term = Math.exp(r * Math.log(p));
  let cdf = term;
  for (let i = 1; i < k; i += 1) {
    term = (term * (r + i - 1) * (1 - p)) / i;
    cdf += term;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * q;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

async function main() {
  if (!API_KEY) {
    console.error("BALLDONTLIE_API_KEY is not set. Run via `npm run bingo:measure:mlb`.");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  const end = args.endDate ? new Date(`${args.endDate}T12:00:00Z`) : new Date();
  const dates = [];
  for (let offset = 1; offset <= args.days; offset += 1) {
    dates.push(isoDay(new Date(end.getTime() - offset * 24 * 60 * 60 * 1000)));
  }
  dates.sort();

  /** One row per team per completed game, in chronological order. */
  const teamGames = [];
  let gamesScanned = 0;
  let gamesWithoutStats = 0;

  for (const date of dates) {
    const games = await fetchGamesOnDate(date);
    const finals = games.filter(
      (game) => String(game.status ?? "") === "STATUS_FINAL" && String(game.season_type ?? "") === "regular"
    );
    if (finals.length === 0) continue;

    for (let index = 0; index < finals.length; index += 8) {
      const chunk = finals.slice(index, index + 8);
      const query = new URLSearchParams({ per_page: "100" });
      for (const game of chunk) query.append("game_ids[]", String(game.id));
      const statRows = await fetchAllWithQuery("/mlb/v1/stats", query);

      const byGameTeam = new Map();
      for (const row of statRows) {
        const gameId = String(row.game_id ?? "");
        const teamName = String(row.team_name ?? "").trim();
        if (!gameId || !teamName) continue;
        const key = `${gameId}::${teamName}`;
        const current = byGameTeam.get(key) ?? { gameId, teamName, date, counts: {} };
        for (const [event, spec] of Object.entries(EVENTS)) {
          current.counts[event] = (current.counts[event] ?? 0) + num(row[spec.field]);
        }
        byGameTeam.set(key, current);
      }

      for (const game of chunk) {
        gamesScanned += 1;
        const sides = [...byGameTeam.values()].filter((entry) => entry.gameId === String(game.id));
        if (sides.length !== 2) {
          gamesWithoutStats += 1;
          continue;
        }
        // Each side carries the other's counts as "allowed", so a team's trailing pitching/defence
        // rate is measurable from the same rows without a second fetch.
        sides[0].allowed = sides[1].counts;
        sides[1].allowed = sides[0].counts;
        sides[0].opponent = sides[1].teamName;
        sides[1].opponent = sides[0].teamName;
        teamGames.push(...sides);
      }
    }
    process.stderr.write(`[measure] ${date}: ${finals.length} finals, ${teamGames.length} team-games so far\n`);
  }

  if (teamGames.length === 0) {
    console.error("[measure] no team-games collected — check the date window and API access.");
    process.exit(1);
  }

  // --- View 1: marginal P(X >= n) -----------------------------------------------------------
  const marginal = {};
  for (const [event, spec] of Object.entries(EVENTS)) {
    const values = teamGames.map((entry) => entry.counts[event] ?? 0);
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    const atLeast = {};
    for (const threshold of spec.thresholds) {
      atLeast[threshold] = values.filter((value) => value >= threshold).length / values.length;
    }
    // 7b prices a *per-game* threshold, which needs a distribution, not just this table: the
    // opponent-adjusted rate lands between the measured rungs. Fit a negative binomial by moments
    // and report it against the measured column so the fit is auditable rather than asserted.
    // (Poisson is rejected on sight for these — variance runs above the mean for every event.)
    const nbAtLeast = {};
    for (const threshold of spec.thresholds) {
      nbAtLeast[threshold] = Number(negativeBinomialAtLeast(threshold, mean, variance).toFixed(3));
    }
    const nbMaxError = Math.max(
      ...spec.thresholds.map((threshold) => Math.abs(nbAtLeast[threshold] - atLeast[threshold]))
    );
    marginal[event] = {
      sample: values.length,
      mean: Number(mean.toFixed(3)),
      variance: Number(variance.toFixed(3)),
      varianceOverMean: Number((variance / mean).toFixed(3)),
      negativeBinomialAtLeast: nbAtLeast,
      negativeBinomialMaxError: Number(nbMaxError.toFixed(3)),
      p10: quantile(sorted, 0.1),
      p25: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      p90: quantile(sorted, 0.9),
      max: sorted[sorted.length - 1],
      atLeast,
      shippedThreshold: spec.shipped,
      shippedProbability: SHIPPED_PROBABILITIES[event],
      realizedAtShippedThreshold: atLeast[spec.shipped] ?? null,
    };
  }

  // --- View 2: is there any per-game signal, and where does it come from? ---------------------
  // Three candidate predictors of a team's count in a game, all computed leak-free from that team's
  // (and its opponent's) *earlier* games only — exactly the information the production builder has:
  //
  //   own       the team's own trailing average for the event (offence)
  //   opponent  the opponent's trailing average *allowed* for the event (pitching/defence)
  //   combined  the mean of the two
  //
  // 7b only earns a per-game threshold for events where a predictor actually moves the count. For
  // the rest, a "per-game" number would be decoration over a league constant.
  const history = new Map();
  const MIN_TRAILING_GAMES = 5;
  const samplesByEvent = {};
  for (const event of Object.keys(EVENTS)) samplesByEvent[event] = [];

  for (const entry of teamGames) {
    const own = history.get(entry.teamName) ?? [];
    const opponentPrior = history.get(entry.opponent) ?? [];
    if (own.length >= MIN_TRAILING_GAMES && opponentPrior.length >= MIN_TRAILING_GAMES) {
      for (const event of Object.keys(EVENTS)) {
        const ownRate = own.reduce((sum, past) => sum + (past.counts[event] ?? 0), 0) / own.length;
        const opponentRate =
          opponentPrior.reduce((sum, past) => sum + (past.allowed[event] ?? 0), 0) / opponentPrior.length;
        samplesByEvent[event].push({
          own: ownRate,
          opponent: opponentRate,
          combined: (ownRate + opponentRate) / 2,
          actual: entry.counts[event] ?? 0,
        });
      }
    }
    own.push(entry);
    history.set(entry.teamName, own);
  }

  /** OLS of actual on one predictor, plus the correlation — the honest measure of "does it move?". */
  function regress(samples, key) {
    const n = samples.length;
    if (n < 30) return null;
    const meanX = samples.reduce((sum, s) => sum + s[key], 0) / n;
    const meanY = samples.reduce((sum, s) => sum + s.actual, 0) / n;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const s of samples) {
      sxy += (s[key] - meanX) * (s.actual - meanY);
      sxx += (s[key] - meanX) ** 2;
      syy += (s.actual - meanY) ** 2;
    }
    if (sxx === 0 || syy === 0) return null;
    const slope = sxy / sxx;
    const correlation = sxy / Math.sqrt(sxx * syy);
    return {
      n,
      slope: Number(slope.toFixed(3)),
      correlation: Number(correlation.toFixed(3)),
      r2: Number((correlation * correlation).toFixed(4)),
      predictorMean: Number(meanX.toFixed(3)),
      predictorSd: Number(Math.sqrt(sxx / n).toFixed(3)),
    };
  }

  const conditionalReport = {};
  for (const [event, spec] of Object.entries(EVENTS)) {
    const samples = samplesByEvent[event];
    const predictors = {
      own: regress(samples, "own"),
      opponent: regress(samples, "opponent"),
      combined: regress(samples, "combined"),
    };
    // Terciles on the best predictor, so the report shows the realised spread the slope implies.
    const best = ["combined", "opponent", "own"].reduce((winner, key) => {
      if (!predictors[key]) return winner;
      if (!winner || Math.abs(predictors[key].correlation) > Math.abs(predictors[winner].correlation)) return key;
      return winner;
    }, null);
    if (!best || samples.length === 0) {
      conditionalReport[event] = { sample: samples.length, predictors };
      continue;
    }
    const sortedPredictor = samples.map((sample) => sample[best]).sort((a, b) => a - b);
    const lowCut = quantile(sortedPredictor, 1 / 3);
    const highCut = quantile(sortedPredictor, 2 / 3);
    const bands = { low: [], mid: [], high: [] };
    for (const sample of samples) {
      if (sample[best] <= lowCut) bands.low.push(sample.actual);
      else if (sample[best] >= highCut) bands.high.push(sample.actual);
      else bands.mid.push(sample.actual);
    }
    const describe = (values) => {
      if (values.length === 0) return null;
      const atLeast = {};
      for (const threshold of spec.thresholds) {
        atLeast[threshold] = Number((values.filter((value) => value >= threshold).length / values.length).toFixed(3));
      }
      return {
        sample: values.length,
        mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)),
        atLeast,
      };
    };
    conditionalReport[event] = {
      sample: samples.length,
      predictors,
      bestPredictor: best,
      bandCutoffs: { low: Number(lowCut.toFixed(3)), high: Number(highCut.toFixed(3)) },
      low: describe(bands.low),
      mid: describe(bands.mid),
      high: describe(bands.high),
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    window: { days: args.days, from: dates[0], to: dates[dates.length - 1] },
    coverage: { gamesScanned, gamesWithoutStats, teamGames: teamGames.length },
    note:
      "quick_out_under_3_pitches is not a balldontlie field and is deliberately absent — it can only be measured from our own webhook settlement history.",
    marginal,
    conditionalOnTrailingForm: conditionalReport,
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nMLB team-event base rates — ${dates[0]} .. ${dates[dates.length - 1]}`);
  console.log(`team-games: ${teamGames.length} (from ${gamesScanned} finals, ${gamesWithoutStats} without stats)\n`);
  console.log("event            mean   p25  med  p75   shipped(thr/prob)  realized@thr");
  for (const [event, row] of Object.entries(marginal)) {
    console.log(
      `${event.padEnd(15)} ${String(row.mean).padStart(5)} ${String(row.p25).padStart(5)} ${String(row.median).padStart(4)} ${String(row.p75).padStart(4)}   ${String(row.shippedThreshold).padStart(3)} / ${row.shippedProbability.toFixed(2)}        ${row.realizedAtShippedThreshold.toFixed(3)}`
    );
  }
  console.log("\nP(X >= n), all team-games (measured / negative-binomial fit):");
  for (const [event, row] of Object.entries(marginal)) {
    const cells = Object.entries(row.atLeast)
      .map(([threshold, probability]) => `${threshold}:${probability.toFixed(2)}`)
      .join("  ");
    const fit = Object.entries(row.negativeBinomialAtLeast)
      .map(([threshold, probability]) => `${threshold}:${probability.toFixed(2)}`)
      .join("  ");
    console.log(`  ${event.padEnd(15)} ${cells}`);
    console.log(`  ${"".padEnd(15)} ${fit}   (var/mean ${row.varianceOverMean}, max err ${row.negativeBinomialMaxError})`);
  }
  console.log("\nPer-game predictors — slope of actual count on each trailing rate (r = correlation):");
  console.log("event            own slope/r        opp slope/r        combined slope/r    best");
  for (const [event, row] of Object.entries(conditionalReport)) {
    if (!row.predictors) continue;
    const cell = (fit) => (fit ? `${String(fit.slope).padStart(6)} / ${String(fit.correlation).padStart(6)}` : "        n/a   ");
    console.log(
      `${event.padEnd(15)} ${cell(row.predictors.own)}   ${cell(row.predictors.opponent)}   ${cell(row.predictors.combined)}   ${row.bestPredictor ?? "-"}`
    );
  }

  console.log("\nP(X >= n) by tercile of the best predictor:");
  for (const [event, row] of Object.entries(conditionalReport)) {
    if (!row.low) continue;
    console.log(`  ${event} — ${row.bestPredictor} (cutoffs ${row.bandCutoffs.low} / ${row.bandCutoffs.high})`);
    for (const band of ["low", "mid", "high"]) {
      const cells = Object.entries(row[band].atLeast)
        .map(([threshold, probability]) => `${threshold}:${probability.toFixed(2)}`)
        .join("  ");
      console.log(`    ${band.padEnd(5)} n=${String(row[band].sample).padStart(4)} mean=${row[band].mean.toFixed(2)}  ${cells}`);
    }
  }
  console.log("");
}

/** `/mlb/v1/stats` needs repeated `game_ids[]`, which a plain object can't express. */
async function fetchAllWithQuery(path, query, maxPages = 12) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < maxPages; page += 1) {
    const scoped = new URLSearchParams(query);
    if (cursor !== null) scoped.set("cursor", String(cursor));
    const response = await fetch(`${BASE_URL}${path}?${scoped}`, { headers: { Authorization: API_KEY } });
    if (!response.ok) {
      console.error(`[measure] ${path} -> ${response.status}`);
      return rows;
    }
    const payload = await response.json();
    rows.push(...(payload.data ?? []));
    if (typeof payload.meta?.next_cursor !== "number") {
      return rows;
    }
    cursor = payload.meta.next_cursor;
  }
  return rows;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
