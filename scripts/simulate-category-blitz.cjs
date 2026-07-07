#!/usr/bin/env node

/**
 * Headless multi-user simulation + correctness harness for Category Blitz.
 *
 * Drives the REAL server engine (lib/categoryBlitz.ts — including live Haiku
 * grading) with N synthetic players across M rounds, then asserts the game's
 * invariants. No browsers, no HTTP/cookie auth: it calls the server-only lib
 * functions directly and seeds/cleans its own isolated data.
 *
 * Why it exists: proving Category Blitz stays correct under real concurrent
 * play (duplicates cancelling, wrong-letter/invalid answers scoring 0, unique
 * valid answers scoring 2, cumulative session totals, the leaderboard, the
 * spectator lock, and scoring idempotency) without opening 10+ real sessions.
 *
 * Usage:
 *   node --env-file=.env.local --conditions react-server --import tsx \
 *     scripts/simulate-category-blitz.cjs [options]
 *
 * Options:
 *   --users <n>        Synthetic players. Default: 12
 *   --rounds <n>       Rounds to play in the session. Default: 3
 *   --llm              Use Haiku to generate realistic *valid* answers so the
 *                      2-point award path + nonzero leaderboards are exercised.
 *                      (The grader Haiku always runs regardless — this only
 *                      shapes the answers we feed it.) Default: off.
 *   --venue-id <id>    Run against a specific venue instead of the isolated
 *                      sim venue. Use with care — this writes real rounds.
 *   --keep             Skip teardown (leave sim users/session in place).
 *   --concurrency-only Only run the concurrency/idempotency stress, 1 round.
 *   -h, --help         Show this help.
 *
 * Exit code is non-zero if any HARD invariant fails.
 */

const crypto = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

// ── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    users: 12,
    rounds: 3,
    llm: false,
    venueId: "",
    keep: false,
    concurrencyOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === "--users") { args.users = Math.max(2, Math.floor(Number(argv[++i] ?? 12))); }
    else if (t === "--rounds") { args.rounds = Math.max(1, Math.floor(Number(argv[++i] ?? 3))); }
    else if (t === "--llm") { args.llm = true; }
    else if (t === "--venue-id") { args.venueId = String(argv[++i] ?? "").trim(); }
    else if (t === "--keep") { args.keep = true; }
    else if (t === "--concurrency-only") { args.concurrencyOnly = true; }
    else if (t === "--help" || t === "-h") { printHelp(); process.exit(0); }
  }
  return args;
}

function printHelp() {
  console.log(`Category Blitz simulation harness

  node --env-file=.env.local --conditions react-server --import tsx \\
    scripts/simulate-category-blitz.cjs [--users 12] [--rounds 3] [--llm] \\
    [--venue-id <id>] [--keep] [--concurrency-only]`);
}

// ── Tiny assertion framework ────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m", bold: "\x1b[1m",
};
const stats = { pass: 0, fail: 0, warn: 0 };

function hard(label, cond, detail = "") {
  if (cond) { stats.pass += 1; console.log(`  ${C.green}✓${C.reset} ${label}`); }
  else { stats.fail += 1; console.log(`  ${C.red}✗ ${label}${C.reset}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`); }
}

function soft(label, cond, detail = "") {
  if (cond) { stats.pass += 1; console.log(`  ${C.green}✓${C.reset} ${label}`); }
  else { stats.warn += 1; console.log(`  ${C.yellow}⚠ ${label}${C.reset}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`); }
}

function section(title) {
  console.log(`\n${C.bold}${C.cyan}▸ ${title}${C.reset}`);
}

// ── Supabase (service role) for setup/teardown ──────────────────────────────

function getAdminClient() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const SIM_VENUE_ID = "sim-category-blitz";

async function ensureSimVenue(db) {
  const { data } = await db.from("venues").select("id").eq("id", SIM_VENUE_ID).maybeSingle();
  if (data) return SIM_VENUE_ID;
  const { error } = await db.from("venues").insert({
    id: SIM_VENUE_ID,
    name: "Category Blitz Simulation",
    latitude: 0,
    longitude: 0,
    radius: 100,
  });
  if (error) throw new Error(`Failed to create sim venue: ${error.message}`);
  return SIM_VENUE_ID;
}

/**
 * Create N synthetic players: a real auth.users row (the submissions FK
 * requires it) plus a public.users profile at the venue. Returns
 * { userId, authId, username } for each.
 */
async function createSimPlayers(db, venueId, count, runId) {
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const email = `sim_${runId}_${i}@cbsim.test`;
    const username = `sim${runId}u${i}`; // matches ^[A-Za-z0-9_]{3,20}$
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (authErr || !authData?.user) throw new Error(`auth.admin.createUser failed: ${authErr?.message}`);
    const authId = authData.user.id;

    const { data: profile, error: profErr } = await db
      .from("users")
      .insert({
        auth_id: authId,
        username,
        username_normalized: username.toLowerCase(),
        venue_id: venueId,
        points: 0,
      })
      .select("id, auth_id, username")
      .single();
    if (profErr || !profile) throw new Error(`users insert failed: ${profErr?.message}`);
    players.push({ userId: profile.id, authId: profile.auth_id, username: profile.username });
  }
  return players;
}

async function teardown(db, venueId, players, runId) {
  // Sessions cascade to rounds → submissions → participants.
  await db.from("category_blitz_sessions").delete().eq("venue_id", venueId);
  if (players.length > 0) {
    await db.from("users").delete().in("id", players.map((p) => p.userId));
    for (const p of players) {
      await db.auth.admin.deleteUser(p.authId).catch(() => undefined);
    }
  }
  // Leave the reusable sim venue in place.
  console.log(`${C.dim}Torn down ${players.length} sim players (run ${runId}).${C.reset}`);
}

// ── Answer generation ───────────────────────────────────────────────────────

/** A garbage word that starts with `letter` and is reliably category-invalid. */
function garbageAnswer(letter, salt) {
  return `${letter}${"qzxjpvk"}${salt}`;
}

/** A wrong-letter answer: deterministically fails the starting-letter check. */
function wrongLetterAnswer(letter) {
  const other = letter.toUpperCase() === "Z" ? "A" : "Z";
  return `${other}ebra${other.toLowerCase()}test`;
}

/**
 * Ask Haiku for a few genuinely-valid answers per category (used in --llm mode
 * so the 2-point path is exercised with answers the grader should accept).
 * Returns Map<categoryIndex, string[]>. Best-effort: empty on any failure.
 */
async function generateValidAnswers(letter, categories) {
  const map = new Map();
  const keyName = "ANTHROPIC_API_KEY_CATEGORY_BLITZ_ANSWER_GRADER";
  const apiKey = process.env[keyName];
  if (!apiKey) { console.log(`${C.yellow}--llm set but ${keyName} missing; skipping generation.${C.reset}`); return map; }

  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic.default({ apiKey });
  const lines = categories.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const prompt = `For a letter-category word game, the round letter is "${letter}".
For each category below, give 3 real, common, unambiguously-correct answers that start with "${letter}" (ignoring a leading "the/a/an"). Each must make "[Answer] IS A(N) [Category]" definitionally true.
Return ONLY a JSON array of {"index": <number>, "answers": ["...","...","..."]}. No prose.

Categories:
${lines}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    });
    const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("no JSON array");
    const parsed = JSON.parse(jsonMatch[0]);
    for (const item of parsed) {
      const idx = Number(item.index) - 1;
      const answers = Array.isArray(item.answers) ? item.answers.map(String) : [];
      if (idx >= 0 && idx < categories.length) map.set(idx, answers);
    }
  } catch (err) {
    console.log(`${C.yellow}Valid-answer generation failed (${err.message}); continuing without it.${C.reset}`);
  }
  return map;
}

// ── Expectation engine ──────────────────────────────────────────────────────
//
// Given the assembled answer matrix, compute what scoring MUST produce for the
// mechanically-determined cases (duplicate / wrong_letter / skip) and what it
// SHOULD produce for the semantic cases (garbage=invalid, generated=correct).

function buildExpectations(engine, letter, submissionsByCat) {
  // submissionsByCat: Map<catIndex, Array<{ userId, answer, kind }>>
  // kind ∈ 'valid' | 'garbage' | 'wrong_letter' | 'dup'
  const expected = new Map(); // key `${userId}:${cat}` → { hardReason?, softReason?, hardPoints? }
  for (const [cat, subs] of submissionsByCat) {
    const normCounts = new Map();
    for (const s of subs) {
      const n = engine.normalizeAnswer(s.answer);
      normCounts.set(n, (normCounts.get(n) ?? 0) + 1);
    }
    for (const s of subs) {
      const key = `${s.userId}:${cat}`;
      const norm = engine.normalizeAnswer(s.answer);
      const isUnique = (normCounts.get(norm) ?? 0) === 1;
      const letterOk = engine.answerStartsWithLetter(s.answer, letter);
      if (!isUnique) { expected.set(key, { hardReason: "duplicate", hardPoints: 0 }); }
      else if (!letterOk) { expected.set(key, { hardReason: "wrong_letter", hardPoints: 0 }); }
      else if (s.kind === "garbage") { expected.set(key, { softReason: "invalid" }); }
      else if (s.kind === "valid") { expected.set(key, { softReason: "correct" }); }
      // A 'dup'-kind token that didn't actually collide is semantically
      // indeterminate (Haiku decides) — record it with no reason expectation
      // so it's still covered by the points-consistency check, not the intent one.
      else { expected.set(key, {}); }
    }
  }
  return expected;
}

// ── One round ───────────────────────────────────────────────────────────────

async function playRound(ctx, roundNumber) {
  const { engine, venueId, sessionId, players, args } = ctx;
  section(`Round ${roundNumber}`);

  const round = await engine.startRound(sessionId);
  console.log(`  letter ${C.bold}${round.letter}${C.reset} · ${round.categories.length} categories · round ${round.id.slice(0, 8)}`);

  const validPool = args.llm
    ? await generateValidAnswers(round.letter, round.categories)
    : new Map();

  // Assemble the answer matrix. Players 0..n-1 rotate through behaviors per
  // category so every scoring path is hit and intentional duplicates form.
  const submissionsByCat = new Map();
  const plan = []; // { userId, authId, cat, answer, kind }
  for (let cat = 0; cat < round.categories.length; cat += 1) {
    const arr = [];
    const valids = validPool.get(cat) ?? [];
    for (let p = 0; p < players.length; p += 1) {
      const player = players[p];
      const roll = (p + cat) % 5;
      let answer = null;
      let kind = null;
      if (roll === 0 && valids.length > 0) {
        // Unique-ish valid answer (distinct per player where the pool allows).
        answer = valids[p % valids.length];
        kind = "valid";
      } else if (roll === 1) {
        // Force a duplicate: two neighbours submit the same shared token.
        answer = valids[0] ?? `${round.letter} commonword`;
        kind = "dup";
      } else if (roll === 2) {
        answer = wrongLetterAnswer(round.letter);
        kind = "wrong_letter";
      } else if (roll === 3) {
        answer = garbageAnswer(round.letter, `${p}${cat}`);
        kind = "garbage";
      } else {
        continue; // roll === 4 → this player skips this category
      }
      arr.push({ userId: player.userId, answer, kind });
      plan.push({ userId: player.userId, authId: player.authId, cat, answer, kind });
    }
    if (arr.length > 0) submissionsByCat.set(cat, arr);
  }

  const expected = buildExpectations(engine, round.letter, submissionsByCat);

  // Fire every submission CONCURRENTLY — the real concurrency stress on the
  // submissions upsert and the round's active-window guard.
  const results = await Promise.allSettled(
    plan.map((s) =>
      engine.submitAnswer({
        roundId: round.id,
        userId: s.userId,
        authId: s.authId,
        venueId,
        categoryIndex: s.cat,
        answer: s.answer,
      })
    )
  );
  const rejected = results.filter((r) => r.status === "rejected");
  hard(`all ${plan.length} concurrent submissions accepted`, rejected.length === 0,
    rejected.length ? `${rejected.length} rejected e.g. "${rejected[0].reason?.message}"` : "");

  // Score and verify.
  const scored = await engine.scoreRound(round.id);
  const byUserCat = new Map();
  for (const cat of scored.results) {
    for (const a of cat.answers) byUserCat.set(`${a.userId}:${cat.categoryIndex}`, a);
  }

  let hardOk = 0, hardBad = 0, softOk = 0, softBad = 0, inconsistent = 0, explBad = 0;
  let awardedPoints = 0;
  const explSamples = [];
  for (const [key, exp] of expected) {
    const actual = byUserCat.get(key);
    if (!actual) { hardBad += 1; console.log(`    ${C.red}missing verdict${C.reset} ${key}`); continue; }
    awardedPoints += actual.pointsAwarded;
    // Phase 2: every non-scoring verdict must carry a player-facing explanation;
    // correct answers must not. (Haiku's "why" for invalid; templated otherwise.)
    const needsExpl = actual.reason === "invalid" || actual.reason === "wrong_letter" || actual.reason === "duplicate";
    const hasExpl = typeof actual.explanation === "string" && actual.explanation.trim().length > 0;
    if (needsExpl && !hasExpl) { explBad += 1; console.log(`    ${C.red}no explanation${C.reset} ${key} (${actual.reason})`); }
    if (actual.reason === "correct" && hasExpl) { explBad += 1; console.log(`    ${C.red}unexpected explanation on correct${C.reset} ${key}`); }
    if (actual.reason === "invalid" && hasExpl && explSamples.length < 3) explSamples.push(`"${actual.answer}" → ${actual.explanation}`);
    // Points must be internally consistent regardless of Haiku's verdict:
    // exactly the "correct" answers, and only those, earn 2 points.
    if ((actual.reason === "correct") !== (actual.pointsAwarded === 2)) {
      inconsistent += 1;
      console.log(`    ${C.red}inconsistent${C.reset} ${key}: ${actual.reason}/${actual.pointsAwarded}`);
    }
    if (exp.hardReason) {
      if (actual.reason === exp.hardReason && actual.pointsAwarded === exp.hardPoints) hardOk += 1;
      else { hardBad += 1; console.log(`    ${C.red}mismatch${C.reset} ${key}: expected ${exp.hardReason}/0, got ${actual.reason}/${actual.pointsAwarded}`); }
    } else if (exp.softReason) {
      if (actual.reason === exp.softReason) softOk += 1; else softBad += 1;
    }
  }
  hard(`points/reason consistent for every scored answer (correct ⟺ +2)`, inconsistent === 0, `${inconsistent} inconsistent`);
  hard(`mechanical verdicts correct (duplicate/wrong_letter)`, hardBad === 0, `${hardOk} ok, ${hardBad} bad`);
  hard(`every non-scoring verdict carries an explanation (Phase 2)`, explBad === 0, `${explBad} missing/misplaced`);
  soft(`semantic verdicts matched intent (garbage→invalid, generated→correct)`, softBad === 0, `${softOk} ok, ${softBad} differed from intent`);
  if (explSamples.length > 0) {
    console.log(`    ${C.dim}Haiku explanations e.g.: ${explSamples.join("  ·  ")}${C.reset}`);
  }

  return { round, scored, awardedPoints };
}

// ── Concurrency / idempotency stress ────────────────────────────────────────

async function concurrencyStress(ctx) {
  const { engine, venueId, sessionId, players } = ctx;
  section("Concurrency & idempotency");

  const round = await engine.startRound(sessionId);
  // Everyone answers category 0 with a unique letter-correct token.
  await Promise.allSettled(
    players.map((p, i) =>
      engine.submitAnswer({
        roundId: round.id, userId: p.userId, authId: p.authId,
        venueId, categoryIndex: 0, answer: `${round.letter}unique${i}`,
      })
    )
  );

  // Score sequentially twice → must be idempotent (no double award).
  const first = await engine.scoreRound(round.id);
  const firstTotal = first.totals.reduce((s, t) => s + t.points, 0);
  const second = await engine.scoreRound(round.id);
  const secondTotal = second.totals.reduce((s, t) => s + t.points, 0);
  hard("re-scoring a complete round is idempotent (no double points)", firstTotal === secondTotal,
    `first ${firstTotal}, second ${secondTotal}`);

  // Two CONCURRENT scoreRound calls on a fresh round → must not double-award.
  const round2 = await engine.startRound(sessionId);
  await Promise.allSettled(
    players.map((p, i) =>
      engine.submitAnswer({
        roundId: round2.id, userId: p.userId, authId: p.authId,
        venueId, categoryIndex: 0, answer: `${round2.letter}concur${i}`,
      })
    )
  );
  const [ra, rb] = await Promise.all([engine.scoreRound(round2.id), engine.scoreRound(round2.id)]);
  const ta = ra.totals.reduce((s, t) => s + t.points, 0);
  const tb = rb.totals.reduce((s, t) => s + t.points, 0);
  soft("concurrent double-score does not inflate totals (race guard)", ta === tb, `A=${ta} B=${tb}`);
}

// ── Spectator enforcement ───────────────────────────────────────────────────

async function spectatorCheck(ctx) {
  const { engine, venueId, sessionId } = ctx;
  section("Spectator enforcement");
  const round = await engine.startRound(sessionId);
  // A brand-new player who never registered presence → first_seen_at null →
  // spectator → server-side submit must be rejected.
  const ghost = ctx.ghost;
  let rejected = false;
  let msg = "";
  try {
    await engine.submitAnswer({
      roundId: round.id, userId: ghost.userId, authId: ghost.authId,
      venueId, categoryIndex: 0, answer: `${round.letter}ghost`,
    });
  } catch (e) { rejected = true; msg = e.message; }
  hard("un-registered (spectating) user is blocked from submitting", rejected, msg);
  await engine.scoreRound(round.id);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = crypto.randomBytes(3).toString("hex");
  console.log(`${C.bold}Category Blitz simulation${C.reset} ${C.dim}(run ${runId})${C.reset}`);
  console.log(`${C.dim}users=${args.users} rounds=${args.rounds} llm=${args.llm} venue=${args.venueId || SIM_VENUE_ID}${C.reset}`);

  const engineMod = await import("../lib/categoryBlitz.ts");
  const shared = await import("../lib/categoryBlitzShared.ts");
  // answerStartsWithLetter lives in the shared (non server-only) module; merge
  // it in so the expectation engine can mirror the real scoring logic exactly.
  const engine = Object.assign({}, engineMod, { answerStartsWithLetter: shared.answerStartsWithLetter });
  const db = getAdminClient();
  const venueId = args.venueId || (await ensureSimVenue(db));

  let players = [];
  try {
    players = await createSimPlayers(db, venueId, args.users, runId);
    console.log(`${C.dim}Seeded ${players.length} sim players at ${venueId}.${C.reset}`);

    const session = await engine.createSession(venueId, { source: "manual" });
    const sessionId = session.id;

    // Register all-but-one player as present BEFORE any round starts → players.
    // The last player stays unregistered so spectatorCheck can use it.
    for (const p of players.slice(0, -1)) {
      await engine.registerSessionPresence({ sessionId, userId: p.userId, authId: p.authId, venueId });
    }

    // The last player is deliberately never registered as present, so it acts
    // as the "joined-late" spectator for spectatorCheck. Everyone else plays.
    const ctx = { engine, venueId, sessionId, players: players.slice(0, -1), ghost: players[players.length - 1], args };

    if (args.concurrencyOnly) {
      await concurrencyStress(ctx);
    } else {
      let totalAwarded = 0;
      for (let r = 1; r <= args.rounds; r += 1) {
        const { awardedPoints } = await playRound(ctx, r);
        totalAwarded += awardedPoints;
      }

      // Session-cumulative leaderboard sanity.
      section("Session totals & leaderboard");
      const { data: sessionRow } = await db
        .from("category_blitz_sessions")
        .select("cumulative_totals")
        .eq("id", sessionId)
        .maybeSingle();
      const cumulative = sessionRow?.cumulative_totals ?? {};
      const cumulativeSum = Object.values(cumulative).reduce((s, v) => s + Number(v), 0);
      hard("cumulative_totals equals sum of points awarded across rounds",
        cumulativeSum === totalAwarded, `cumulative=${cumulativeSum} awarded=${totalAwarded}`);

      const last = await engine.getRoundResults(await lastRoundId(db, sessionId));
      const sorted = last.totals.every((t, i, arr) => i === 0 || arr[i - 1].points >= t.points);
      hard("leaderboard is sorted by points descending", sorted);

      await spectatorCheck(ctx);
      await concurrencyStress(ctx);
    }

    await engine.endSession(sessionId);
  } finally {
    if (!args.keep) await teardown(db, venueId, players, runId);
    else console.log(`${C.yellow}--keep set: sim data left in place.${C.reset}`);
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}Result:${C.reset} ${C.green}${stats.pass} passed${C.reset}, ` +
    `${stats.fail ? C.red : C.dim}${stats.fail} failed${C.reset}, ` +
    `${stats.warn ? C.yellow : C.dim}${stats.warn} warnings${C.reset}`);
  if (stats.fail > 0) {
    console.log(`${C.red}✗ HARD invariants violated — the game is NOT safe to ship as-is.${C.reset}`);
    process.exit(1);
  }
  console.log(`${C.green}✓ All hard invariants held.${C.reset}${stats.warn ? ` ${C.yellow}(review warnings above)${C.reset}` : ""}`);
}

async function lastRoundId(db, sessionId) {
  const { data } = await db
    .from("category_blitz_rounds")
    .select("id")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id;
}

main().catch((err) => {
  console.error(`\n${C.red}Fatal:${C.reset} ${err?.stack || err?.message || err}`);
  process.exit(1);
});
