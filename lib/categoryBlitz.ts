import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyChallengeCampaignPoints } from "@/lib/challengeCampaigns";
import { getCurrentOrNextScheduleWindow } from "@/lib/categoryBlitzScheduleTime";
import type {
  CategoryBlitzSession,
  CategoryBlitzRound,
  CategoryBlitzSubmission,
  CategoryBlitzCategoryResult,
  CategoryBlitzRoundResults,
} from "@/types";
import {
  listAllActiveSchedules,
  listSchedules,
  isWindowOpen,
  nextOccurrence,
} from "@/lib/categoryBlitzSchedules";
import categorySetsData from "@/data/category-blitz/category-sets.json";

const anthropic = new Anthropic();

// ── Broadcast helpers ─────────────────────────────────────────────────────────

/** Channel name all players in a venue subscribe to for session events. */
export function categoryBlitzChannelName(venueId: string): string {
  return `category-blitz-session:${venueId}`;
}

function broadcast(venueId: string, event: string, payload: Record<string, unknown>): void {
  if (!supabaseAdmin) return;
  void supabaseAdmin.channel(categoryBlitzChannelName(venueId)).send({
    type: "broadcast",
    event,
    payload,
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROUND_DURATION_SECONDS = 180; // 3 minutes of play
const ROUND_INTERVAL_SECONDS = 420; // 7 minutes between round starts (3 play + 4 results/intermission)
const POINTS_PER_UNIQUE_ANSWER = 2;
const LETTERS = "ABCDEFGHIJKLMNOPRSTW"; // omit Q, U, V, X, Y, Z (hard letters)
const CATEGORY_SETS: { id: number; categories: string[] }[] = categorySetsData.categorySets;

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertAdmin() {
  if (!supabaseAdmin) throw new Error("Supabase admin client is not configured.");
}

function pickRandomLetter(): string {
  return LETTERS[Math.floor(Math.random() * LETTERS.length)];
}

function pickCategorySetIndex(excludeIndices: number[]): number {
  const available = CATEGORY_SETS.map((s) => s.id).filter((id) => !excludeIndices.includes(id));
  const pool = available.length > 0 ? available : CATEGORY_SETS.map((s) => s.id);
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Normalize an answer for uniqueness comparison.
 * Lowercases, strips punctuation, collapses whitespace, and removes common
 * trailing noise words so that "New York", "new york", and "New York City"
 * all collapse to the same token.
 */
export function normalizeAnswer(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")   // strip punctuation
    .replace(/\b(the|a|an|city|town|state|country|of|and)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── LLM answer validation ─────────────────────────────────────────────────────

type ValidationRequest = { subId: string; category: string; answer: string };
type ValidationResult  = { subId: string; valid: boolean };

/**
 * Validate a batch of unique answers against their categories using Claude Haiku.
 * Returns a map of submission id → valid (true/false).
 * Falls back to valid=true on any API error so scoring never hard-fails.
 */
async function validateAnswersWithLLM(
  letter: string,
  requests: ValidationRequest[],
): Promise<Map<string, boolean>> {
  const resultMap = new Map<string, boolean>();
  if (requests.length === 0) return resultMap;

  const lines = requests
    .map((r, i) => `${i + 1}. Category: "${r.category}" | Answer: "${r.answer}"`)
    .join("\n");

  const prompt = `You are a strict judge for a letter-category word game. The required starting letter is "${letter}".

For each item below, answer YES if the answer is:
  - A genuinely valid member of that category, AND
  - Starts with the letter "${letter}" (ignoring "the", "a", "an" at the start)

Answer NO if the answer is wrong, too vague, off-topic, or starts with the wrong letter.

Be strict: partial answers, brand names used wrong, or creative stretches that don't actually fit the category should be NO.

Return ONLY a JSON array with objects {"index": <number>, "valid": <true|false>}. No explanation.

Items:
${lines}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Extract JSON array from response (may be wrapped in markdown fences).
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in LLM response");

    const parsed = JSON.parse(jsonMatch[0]) as { index: number; valid: boolean }[];
    for (const item of parsed) {
      const req = requests[item.index - 1];
      if (req) resultMap.set(req.subId, Boolean(item.valid));
    }

    // Any request not covered by the response defaults to valid=true (safe fallback).
    for (const req of requests) {
      if (!resultMap.has(req.subId)) resultMap.set(req.subId, true);
    }
  } catch {
    // On any failure, treat all answers as valid so scoring isn't blocked.
    for (const req of requests) {
      resultMap.set(req.subId, true);
    }
  }

  return resultMap;
}

// ── Row → domain mappers ──────────────────────────────────────────────────────

type SessionRow = {
  id: string;
  venue_id: string;
  status: string;
  source: string;
  scheduled_end_at: string | null;
  created_at: string;
  completed_at: string | null;
};

type RoundRow = {
  id: string;
  session_id: string;
  venue_id: string;
  letter: string;
  category_set_index: number;
  categories: string[];
  started_at: string;
  ends_at: string;
  status: string;
  created_at: string;
};

type SubmissionRow = {
  id: string;
  round_id: string;
  venue_id: string;
  user_id: string;
  auth_id: string;
  category_index: number;
  answer: string;
  normalized_answer: string;
  is_unique: boolean | null;
  is_valid: boolean | null;
  points_awarded: number;
  submitted_at: string;
};

function toSession(row: SessionRow): CategoryBlitzSession {
  return {
    id: row.id,
    venueId: row.venue_id,
    status: row.status as CategoryBlitzSession["status"],
    source: (row.source === "auto" ? "auto" : "manual"),
    scheduledEndAt: row.scheduled_end_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

const SESSION_COLS = "id, venue_id, status, source, scheduled_end_at, created_at, completed_at";

function toRound(row: RoundRow): CategoryBlitzRound {
  return {
    id: row.id,
    sessionId: row.session_id,
    venueId: row.venue_id,
    letter: row.letter,
    categorySetIndex: row.category_set_index,
    categories: Array.isArray(row.categories) ? row.categories : [],
    startedAt: row.started_at,
    endsAt: row.ends_at,
    status: row.status as CategoryBlitzRound["status"],
    createdAt: row.created_at,
  };
}

function toSubmission(row: SubmissionRow): CategoryBlitzSubmission {
  return {
    id: row.id,
    roundId: row.round_id,
    venueId: row.venue_id,
    userId: row.user_id,
    authId: row.auth_id,
    categoryIndex: row.category_index,
    answer: row.answer,
    normalizedAnswer: row.normalized_answer,
    isUnique: row.is_unique,
    isValid: row.is_valid,
    pointsAwarded: row.points_awarded,
    submittedAt: row.submitted_at,
  };
}

// ── Session management ────────────────────────────────────────────────────────

/** Returns the active/lobby session for a venue, or null. */
export async function getActiveSession(venueId: string): Promise<CategoryBlitzSession | null> {
  assertAdmin();
  const { data, error } = await supabaseAdmin!
    .from("category_blitz_sessions")
    .select(SESSION_COLS)
    .eq("venue_id", venueId)
    .in("status", ["lobby", "active", "scoring"])
    .maybeSingle<SessionRow>();

  if (error) throw new Error(error.message || "Failed to load Category Blitz session.");
  return data ? toSession(data) : null;
}

/**
 * True when an auto (engine-driven) session's scheduled window has already
 * closed. Manual (admin-driven) sessions have no scheduled_end_at and are
 * never considered stale here — only the cron/admin can end those.
 */
function isStaleAutoSession(session: CategoryBlitzSession, now: Date): boolean {
  if (session.source !== "auto" || !session.scheduledEndAt) return false;
  return new Date(session.scheduledEndAt).getTime() <= now.getTime();
}

/**
 * Force-close an auto session whose window has already ended, scoring its
 * final round first if one is still open. Best-effort: a scoring failure
 * must not block closing the session, since that's exactly the situation
 * that leaves a venue permanently stuck.
 */
async function closeStaleAutoSession(session: CategoryBlitzSession): Promise<void> {
  const latest = await getLatestRound(session.id);
  if (latest && latest.status === "active") {
    await scoreRound(latest.id).catch(() => undefined);
  }
  await endSession(session.id);
}

/**
 * Score this venue's currently active round if its timer has already
 * expired. Best-effort: normally the player's own browser scores its round
 * the instant its timer hits zero, and the cron sweeps up anything nobody
 * was watching — this is a third safety net so a venue never sits on a dead
 * timer just because this was the first request to notice.
 */
async function scoreExpiredRoundForVenue(venueId: string, now: Date): Promise<void> {
  assertAdmin();
  const { data } = await supabaseAdmin!
    .from("category_blitz_rounds")
    .select("id")
    .eq("venue_id", venueId)
    .eq("status", "active")
    .lt("ends_at", now.toISOString())
    .maybeSingle<{ id: string }>();

  if (data) {
    await scoreRound(data.id).catch(() => undefined);
  }
}

/**
 * Drives one venue's Category Blitz forward on demand, exactly like
 * getLiveShowdownState's lazy-seeding safety net drives Live Trivia: closes
 * a stale auto session, scores an expired round, opens a fresh session for
 * an open schedule window, and fires the next round once the current one has
 * finished and enough time remains in the window.
 *
 * This is what makes the game playable without the production cron —
 * `next dev` and preview deployments never run Vercel Cron, but every
 * connected player's GET /sessions poll calls this, so the game advances
 * itself as long as someone has the page open. runCategoryBlitzEngine (the
 * cron) remains a backup for venues nobody is currently watching.
 */
export async function driveVenueCategoryBlitz(
  venueId: string,
  now: Date = new Date(),
): Promise<CategoryBlitzSession | null> {
  let existing = await getActiveSession(venueId);
  if (existing && isStaleAutoSession(existing, now)) {
    await closeStaleAutoSession(existing);
    existing = null;
  }

  await scoreExpiredRoundForVenue(venueId, now);

  const schedules = await listSchedules(venueId);
  const openSchedule = schedules.find((schedule) => isWindowOpen(schedule, now));

  if (!existing) {
    if (!openSchedule) return null;

    const occurrence = getCurrentOrNextScheduleWindow(openSchedule, now);
    if (!occurrence || occurrence.windowStart > now || now >= occurrence.windowEnd) {
      return null;
    }

    try {
      const created = await createSession(venueId, {
        source: "auto",
        scheduledEndAt: occurrence.windowEnd.toISOString(),
      });
      await startRound(created.id);
      return await getActiveSession(venueId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already active")) {
        return await getActiveSession(venueId);
      }
      throw error;
    }
  }

  // Leave manual (admin-driven) sessions entirely alone — only the engine's
  // own auto sessions advance themselves on read.
  if (existing.source === "auto" && openSchedule) {
    const occurrence = getCurrentOrNextScheduleWindow(openSchedule, now);
    if (occurrence) {
      const canFitAnother = now.getTime() + ROUND_DURATION_SECONDS * 1000 <= occurrence.windowEnd.getTime();
      if (canFitAnother) {
        const latest = await getLatestRound(existing.id);
        if (!latest) {
          await startRound(existing.id);
        } else if (latest.status === "complete") {
          const nextRoundAt = new Date(latest.started_at).getTime() + ROUND_INTERVAL_SECONDS * 1000;
          if (now.getTime() >= nextRoundAt) {
            await startRound(existing.id);
          }
        }
      }
    }
  }

  return await getActiveSession(venueId);
}

export type CreateSessionOptions = {
  /** 'auto' for engine-driven sessions, 'manual' for admin-driven. Defaults to 'manual'. */
  source?: CategoryBlitzSession["source"];
  /** When the scheduled window closes (auto sessions). The engine ends the session at this time. */
  scheduledEndAt?: string | null;
};

/**
 * Create a new lobby session for a venue.
 * Throws if one already exists (enforced by DB unique index).
 */
export async function createSession(
  venueId: string,
  options: CreateSessionOptions = {},
): Promise<CategoryBlitzSession> {
  assertAdmin();
  const { data, error } = await supabaseAdmin!
    .from("category_blitz_sessions")
    .insert({
      venue_id: venueId,
      status: "lobby",
      source: options.source ?? "manual",
      scheduled_end_at: options.scheduledEndAt ?? null,
    })
    .select(SESSION_COLS)
    .single<SessionRow>();

  if (error) {
    if (error.code === "23505") {
      throw new Error("A session is already active for this venue.");
    }
    throw new Error(error.message || "Failed to create Category Blitz session.");
  }
  return toSession(data);
}

/** Advance a lobby session to 'active' and create the first round. */
export async function startRound(sessionId: string): Promise<CategoryBlitzRound> {
  assertAdmin();

  // Load session to get venueId and confirm it's in lobby/active state.
  const { data: sessionRow, error: sessionErr } = await supabaseAdmin!
    .from("category_blitz_sessions")
    .select(SESSION_COLS)
    .eq("id", sessionId)
    .maybeSingle<SessionRow>();

  if (sessionErr || !sessionRow) {
    throw new Error("Session not found.");
  }
  if (!["lobby", "active"].includes(sessionRow.status)) {
    throw new Error(`Cannot start round on a session with status '${sessionRow.status}'.`);
  }

  // Find previously used category set indices to avoid repeating.
  const { data: priorRounds } = await supabaseAdmin!
    .from("category_blitz_rounds")
    .select("category_set_index")
    .eq("session_id", sessionId);

  const usedIndices = (priorRounds ?? []).map((r: { category_set_index: number }) => r.category_set_index);
  const setIndex = pickCategorySetIndex(usedIndices);
  const categorySet = CATEGORY_SETS.find((s) => s.id === setIndex);
  if (!categorySet) throw new Error("Failed to select category set.");

  const letter = pickRandomLetter();
  const endsAt = new Date(Date.now() + ROUND_DURATION_SECONDS * 1000).toISOString();

  // Mark session active.
  await supabaseAdmin!
    .from("category_blitz_sessions")
    .update({ status: "active" })
    .eq("id", sessionId);

  const { data: roundRow, error: roundErr } = await supabaseAdmin!
    .from("category_blitz_rounds")
    .insert({
      session_id: sessionId,
      venue_id: sessionRow.venue_id,
      letter,
      category_set_index: setIndex,
      categories: categorySet.categories,
      ends_at: endsAt,
      status: "active",
    })
    .select("id, session_id, venue_id, letter, category_set_index, categories, started_at, ends_at, status, created_at")
    .single<RoundRow>();

  if (roundErr || !roundRow) {
    throw new Error(roundErr?.message || "Failed to create round.");
  }

  const round = toRound(roundRow);
  broadcast(sessionRow.venue_id, "round_started", {
    round: {
      id: round.id,
      letter: round.letter,
      categories: round.categories,
      startedAt: round.startedAt,
      endsAt: round.endsAt,
    },
  });
  return round;
}

/** End the session and mark it complete. */
export async function endSession(sessionId: string): Promise<void> {
  assertAdmin();

  const { data: sessionRow } = await supabaseAdmin!
    .from("category_blitz_sessions")
    .select("venue_id")
    .eq("id", sessionId)
    .maybeSingle<{ venue_id: string }>();

  await supabaseAdmin!
    .from("category_blitz_sessions")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (sessionRow?.venue_id) {
    broadcast(sessionRow.venue_id, "session_ended", { sessionId });
  }
}

// ── Submission ────────────────────────────────────────────────────────────────

export async function submitAnswer(params: {
  roundId: string;
  userId: string;
  authId: string;
  venueId: string;
  categoryIndex: number;
  answer: string;
}): Promise<CategoryBlitzSubmission> {
  assertAdmin();
  const { roundId, userId, authId, venueId, categoryIndex, answer } = params;

  // Validate round is still active.
  const { data: round, error: roundErr } = await supabaseAdmin!
    .from("category_blitz_rounds")
    .select("id, status, ends_at")
    .eq("id", roundId)
    .maybeSingle<{ id: string; status: string; ends_at: string }>();

  if (roundErr || !round) throw new Error("Round not found.");
  if (round.status !== "active") throw new Error("This round is no longer accepting answers.");
  if (new Date(round.ends_at) < new Date()) throw new Error("The round timer has expired.");

  const trimmed = answer.trim();
  if (!trimmed) throw new Error("Answer cannot be empty.");
  if (trimmed.length > 120) throw new Error("Answer is too long.");

  const normalized = normalizeAnswer(trimmed);

  const { data, error } = await supabaseAdmin!
    .from("category_blitz_submissions")
    .upsert(
      {
        round_id: roundId,
        venue_id: venueId,
        user_id: userId,
        auth_id: authId,
        category_index: categoryIndex,
        answer: trimmed,
        normalized_answer: normalized,
      },
      { onConflict: "round_id,auth_id,category_index" }
    )
    .select(
      "id, round_id, venue_id, user_id, auth_id, category_index, answer, normalized_answer, is_unique, is_valid, points_awarded, submitted_at"
    )
    .single<SubmissionRow>();

  if (error) throw new Error(error.message || "Failed to save answer.");
  return toSubmission(data);
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score all submissions for a round.
 * - Marks round status 'scoring' to prevent new submissions.
 * - Groups answers by category; within each category, answers with the same
 *   normalized form are duplicates (is_unique = false, 0 pts). Unique answers
 *   earn POINTS_PER_UNIQUE_ANSWER (2 pts).
 * - Awards points to each user's row in the users table.
 * - Marks round 'complete' when done.
 * Returns the scored results.
 */
export async function scoreRound(roundId: string): Promise<CategoryBlitzRoundResults> {
  assertAdmin();

  // Load round (idempotency: skip if already scored).
  const { data: round, error: roundErr } = await supabaseAdmin!
    .from("category_blitz_rounds")
    .select(
      "id, session_id, venue_id, letter, category_set_index, categories, started_at, ends_at, status, created_at"
    )
    .eq("id", roundId)
    .maybeSingle<RoundRow>();

  if (roundErr || !round) throw new Error("Round not found.");
  if (round.status === "complete") {
    return buildResults(roundId, round);
  }

  // Lock round to prevent new submissions.
  await supabaseAdmin!
    .from("category_blitz_rounds")
    .update({ status: "scoring" })
    .eq("id", roundId)
    .eq("status", "active"); // only transition from active→scoring

  // Load all submissions for this round.
  const { data: submissionRows, error: subErr } = await supabaseAdmin!
    .from("category_blitz_submissions")
    .select(
      "id, round_id, venue_id, user_id, auth_id, category_index, answer, normalized_answer, is_unique, is_valid, points_awarded, submitted_at"
    )
    .eq("round_id", roundId);

  if (subErr) throw new Error(subErr.message || "Failed to load submissions.");
  const submissions: SubmissionRow[] = submissionRows ?? [];

  // Group by category_index, then by normalized_answer to find duplicates.
  const byCategory = new Map<number, SubmissionRow[]>();
  for (const sub of submissions) {
    const arr = byCategory.get(sub.category_index) ?? [];
    arr.push(sub);
    byCategory.set(sub.category_index, arr);
  }

  // Step 1: compute uniqueness per category.
  const uniquenessMap = new Map<string, boolean>(); // subId → isUnique
  for (const [, subs] of byCategory) {
    const normCounts = new Map<string, number>();
    for (const sub of subs) {
      normCounts.set(sub.normalized_answer, (normCounts.get(sub.normalized_answer) ?? 0) + 1);
    }
    for (const sub of subs) {
      uniquenessMap.set(sub.id, (normCounts.get(sub.normalized_answer) ?? 0) === 1);
    }
  }

  // Step 2: LLM-validate only the unique answers (duplicates already score 0).
  const categories: string[] = Array.isArray(round.categories) ? round.categories : [];
  const uniqueSubs = submissions.filter((s) => uniquenessMap.get(s.id) === true);
  const validationRequests: ValidationRequest[] = uniqueSubs.map((s) => ({
    subId: s.id,
    category: categories[s.category_index] ?? `Category ${s.category_index}`,
    answer: s.answer,
  }));
  const validityMap = await validateAnswersWithLLM(round.letter, validationRequests);

  // Step 3: compute final points (unique + valid = 2 pts, anything else = 0).
  const updates: { id: string; is_unique: boolean; is_valid: boolean | null; points_awarded: number }[] = [];
  for (const sub of submissions) {
    const isUnique = uniquenessMap.get(sub.id) ?? false;
    const isValid  = isUnique ? (validityMap.get(sub.id) ?? true) : null;
    const pts      = isUnique && isValid ? POINTS_PER_UNIQUE_ANSWER : 0;
    updates.push({ id: sub.id, is_unique: isUnique, is_valid: isValid, points_awarded: pts });
  }

  // Persist uniqueness, validity, and points on each submission row.
  await Promise.all(
    updates.map(({ id, is_unique, is_valid, points_awarded }) =>
      supabaseAdmin!
        .from("category_blitz_submissions")
        .update({ is_unique, is_valid, points_awarded })
        .eq("id", id)
    )
  );

  // Tally points per user and award.
  const pointsByUser = new Map<string, number>();
  for (const u of updates) {
    const sub = submissions.find((s) => s.id === u.id)!;
    pointsByUser.set(sub.user_id, (pointsByUser.get(sub.user_id) ?? 0) + u.points_awarded);
  }

  await Promise.all(
    Array.from(pointsByUser.entries()).map(([userId, pts]) =>
      pts > 0 ? awardCategoryBlitzPoints({ userId, venueId: round.venue_id, points: pts }) : Promise.resolve()
    )
  );

  // Mark round complete.
  await supabaseAdmin!
    .from("category_blitz_rounds")
    .update({ status: "complete" })
    .eq("id", roundId);

  const results = await buildResults(roundId, round);

  broadcast(round.venue_id, "round_scored", { roundId, totals: results.totals });

  return results;
}

async function awardCategoryBlitzPoints(params: {
  userId: string;
  venueId: string;
  points: number;
}): Promise<void> {
  const { userId, venueId, points } = params;
  if (points <= 0) return;

  const { data: userRow } = await supabaseAdmin!
    .from("users")
    .select("points")
    .eq("id", userId)
    .maybeSingle<{ points: number }>();

  const currentPoints = Math.max(0, Number(userRow?.points ?? 0));

  // Apply campaign multiplier and update campaign progress.
  const campaignResult = await applyChallengeCampaignPoints({
    userId,
    venueId,
    gameType: "live-trivia", // closest existing type; category-blitz will get its own when ChallengeGameType expands
    basePoints: points,
  }).catch(() => null);

  const finalPoints = campaignResult ? Math.max(0, campaignResult.finalPoints) : points;

  await supabaseAdmin!
    .from("users")
    .update({ points: currentPoints + finalPoints })
    .eq("id", userId);
}

// ── Results ───────────────────────────────────────────────────────────────────

async function buildResults(roundId: string, round: RoundRow): Promise<CategoryBlitzRoundResults> {
  // Load current submission state (may have been updated if scoring already ran).
  const { data: subRows } = await supabaseAdmin!
    .from("category_blitz_submissions")
    .select("id, round_id, venue_id, user_id, auth_id, category_index, answer, normalized_answer, is_unique, is_valid, points_awarded, submitted_at")
    .eq("round_id", roundId);

  const submissions: SubmissionRow[] = subRows ?? [];

  // Load usernames for all submitters.
  const userIds = [...new Set(submissions.map((s) => s.user_id))];
  const usernameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: userRows } = await supabaseAdmin!
      .from("users")
      .select("id, username")
      .in("id", userIds);
    for (const u of userRows ?? []) {
      usernameMap.set(u.id, u.username);
    }
  }

  const categories: string[] = Array.isArray(round.categories) ? round.categories : [];

  const results: CategoryBlitzCategoryResult[] = categories.map((category, idx) => {
    const catSubs = submissions.filter((s) => s.category_index === idx);
    return {
      categoryIndex: idx,
      category,
      answers: catSubs.map((s) => ({
        userId: s.user_id,
        username: usernameMap.get(s.user_id) ?? "Unknown",
        answer: s.answer,
        isUnique: s.is_unique ?? false,
        isValid: s.is_valid ?? null,
        pointsAwarded: s.points_awarded,
      })),
    };
  });

  // Tally total points per user for this round.
  const totalsByUser = new Map<string, number>();
  for (const sub of submissions) {
    totalsByUser.set(sub.user_id, (totalsByUser.get(sub.user_id) ?? 0) + sub.points_awarded);
  }
  const totals = Array.from(totalsByUser.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([userId, points]) => ({
      userId,
      username: usernameMap.get(userId) ?? "Unknown",
      points,
    }));

  return {
    roundId,
    letter: round.letter,
    categories,
    results,
    totals,
  };
}

/** Load scored results for a completed round. */
export async function getRoundResults(roundId: string): Promise<CategoryBlitzRoundResults> {
  assertAdmin();

  const { data: round, error } = await supabaseAdmin!
    .from("category_blitz_rounds")
    .select(
      "id, session_id, venue_id, letter, category_set_index, categories, started_at, ends_at, status, created_at"
    )
    .eq("id", roundId)
    .maybeSingle<RoundRow>();

  if (error || !round) throw new Error("Round not found.");
  return buildResults(roundId, round);
}

/** Most recent round for a session (by created_at), or null if none. */
async function getLatestRound(sessionId: string): Promise<RoundRow | null> {
  const { data, error } = await supabaseAdmin!
    .from("category_blitz_rounds")
    .select(
      "id, session_id, venue_id, letter, category_set_index, categories, started_at, ends_at, status, created_at"
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RoundRow>();

  if (error) throw new Error(error.message || "Failed to load latest round.");
  return data ?? null;
}

// ── Cron: score expired rounds ────────────────────────────────────────────────

/**
 * Score all active rounds whose timer has expired.
 * Called by the cron job at /api/cron/category-blitz-score.
 */
export async function scoreExpiredRounds(): Promise<{ scored: string[]; errors: string[] }> {
  assertAdmin();

  const now = new Date().toISOString();
  const { data: expiredRows, error } = await supabaseAdmin!
    .from("category_blitz_rounds")
    .select("id")
    .eq("status", "active")
    .lt("ends_at", now);

  if (error) throw new Error(error.message || "Failed to query expired rounds.");

  const roundIds = (expiredRows ?? []).map((r: { id: string }) => r.id);
  const scored: string[] = [];
  const errors: string[] = [];

  for (const roundId of roundIds) {
    try {
      await scoreRound(roundId);
      scored.push(roundId);
    } catch (e) {
      errors.push(`${roundId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { scored, errors };
}

// ── Cron: automated round engine ──────────────────────────────────────────────

export type CategoryBlitzEngineResult = {
  scoring: { scored: string[]; errors: string[] };
  opened: string[];   // venueIds where a new auto session was opened
  started: string[];  // venueIds where a new round was fired
  ended: string[];    // venueIds where an auto session was closed (window over)
  errors: string[];
};

/**
 * Drives every venue's Category Blitz experience with no human in the loop:
 *   1. Scores any expired rounds (also a safety net for manual sessions).
 *   2. Closes auto sessions whose scheduled window has ended.
 *   3. For venues inside an open scheduled window, opens an auto session if none
 *      exists and fires a fresh round every ROUND_INTERVAL_SECONDS, as long as a
 *      full round can finish before the window closes.
 *
 * Idempotent and safe to run once a minute. Manual (admin-driven) sessions are
 * never opened, advanced, or closed by the engine.
 */
export async function runCategoryBlitzEngine(now: Date = new Date()): Promise<CategoryBlitzEngineResult> {
  assertAdmin();

  const result: CategoryBlitzEngineResult = {
    scoring: { scored: [], errors: [] },
    opened: [],
    started: [],
    ended: [],
    errors: [],
  };

  // Step 1: score expired rounds so cadence decisions below see fresh state.
  result.scoring = await scoreExpiredRounds();

  // Step 2: close auto sessions whose scheduled window has ended.
  const { data: closableRows } = await supabaseAdmin!
    .from("category_blitz_sessions")
    .select(SESSION_COLS)
    .eq("source", "auto")
    .in("status", ["lobby", "active", "scoring"])
    .lte("scheduled_end_at", now.toISOString());

  for (const row of (closableRows ?? []) as SessionRow[]) {
    try {
      const latest = await getLatestRound(row.id);
      if (latest && latest.status === "active") {
        await scoreRound(latest.id); // force-score the final round before closing
      }
      await endSession(row.id);
      result.ended.push(row.venue_id);
    } catch (e) {
      result.errors.push(`close ${row.venue_id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Step 3: open windows + fire rounds for venues currently inside a window.
  const schedules = await listAllActiveSchedules();
  const venueIds = [...new Set(schedules.map((s) => s.venueId))];

  for (const venueId of venueIds) {
    try {
      const openSchedule = schedules.find((s) => s.venueId === venueId && isWindowOpen(s, now));
      if (!openSchedule) continue;

      const windowStart = nextOccurrence(openSchedule, now); // current window start (open ⇒ non-null)
      if (!windowStart) continue;
      const windowEnd = new Date(windowStart.getTime() + openSchedule.windowMinutes * 60_000);

      const session = await getActiveSession(venueId);

      // Open a fresh auto session (with first round) if nothing is running.
      if (!session) {
        const created = await createSession(venueId, {
          source: "auto",
          scheduledEndAt: windowEnd.toISOString(),
        });
        await startRound(created.id);
        result.opened.push(venueId);
        continue;
      }

      // Leave manual sessions entirely alone.
      if (session.source !== "auto") continue;

      // Only fire another round if a full one can finish inside the window.
      const canFitAnother = now.getTime() + ROUND_DURATION_SECONDS * 1000 <= windowEnd.getTime();
      if (!canFitAnother) continue;

      const latest = await getLatestRound(session.id);
      if (!latest) {
        await startRound(session.id);
        result.started.push(venueId);
        continue;
      }

      // Wait for the current round (and its results window) before the next start.
      if (latest.status !== "complete") continue;
      const nextRoundAt = new Date(latest.started_at).getTime() + ROUND_INTERVAL_SECONDS * 1000;
      if (now.getTime() >= nextRoundAt) {
        await startRound(session.id);
        result.started.push(venueId);
      }
    } catch (e) {
      result.errors.push(`drive ${venueId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}
