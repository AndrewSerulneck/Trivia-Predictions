import "server-only";
import { randomUUID } from "node:crypto";
import { LIVE_CATEGORIES, fileFor } from "@/lib/live-trivia-quality/categories.cjs";
import { PublishError, planPublish } from "@/lib/live-trivia-quality/publish.cjs";
import { isMatchableAnswer } from "@/lib/liveShowdownGrading";
import { LiveGithubError, findOpenPublishPr, mergePublishPr, openPublishPr, readLiveFiles, readPrState } from "@/lib/liveTriviaGithub";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { QuickReviewAudience } from "@/types/speedTriviaQuickReview";
import type { LivePublishResult, LiveReviewItem, LiveReviewPage, LiveReviewUndoResult } from "@/types/liveTriviaReview";

// Quick Review, Live mode (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c steps 4-5). Free: no paid calls.
// Marks live on question_candidates (game 'live'): pending_review -> keep | reject, Undo back to pending_review.
// Publish appends kept candidates to the canonical Live Trivia JSON through a GitHub PR (D10) and never writes
// trivia_questions (it only reads its slugs, 4c.9 #2): the merge runs Sync Live Trivia, which imports them. A PR that isn't merged leaves its rows
// pr_open until the PR check sees it merged (published) or closed (back to keep) (Phase 4c.2).

export const LIVE_REVIEW_LIMIT = 200;
export const LIVE_PUBLISH_LIMIT = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ANSWER = 120;
const MAX_ACCEPTABLE = 8;
const MAX_ACCEPTABLE_CHARS = 80;

export class LiveReviewError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

const admin = () => {
  if (!supabaseAdmin) throw new LiveReviewError("unavailable", "Supabase admin client is not configured.", 500);
  return supabaseAdmin;
};

export type PublishDeps = {
  readFiles: typeof readLiveFiles;
  openPr: typeof openPublishPr;
  merge: typeof mergePublishPr;
  findOpenPr: typeof findOpenPublishPr;
  prState: typeof readPrState;
};

const DEFAULT_DEPS: PublishDeps = {
  readFiles: readLiveFiles, openPr: openPublishPr, merge: mergePublishPr, findOpenPr: findOpenPublishPr, prState: readPrState,
};

export const isLiveReviewId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export const isLiveCategory = (value: unknown): value is string => typeof value === "string" && LIVE_CATEGORIES.includes(value);

type CandidateRow = {
  id: string;
  payload: Record<string, unknown>;
  edit: { answer?: string; acceptableAnswers?: string[] } | null;
  tag: { area?: string | null; era?: string | null } | null;
  audience: (QuickReviewAudience & Record<string, unknown>) | null;
  possible_repeat: { slug?: string; question?: string; answer?: string } | null;
  source: string;
  created_at: string;
};

const str = (value: unknown) => (typeof value === "string" ? value : "");
const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

const toItem = (row: CandidateRow): LiveReviewItem => {
  const p = row.payload ?? {};
  const sourceUrl = str(p.sourceUrl);
  const a = row.audience;
  const repeat = row.possible_repeat;
  return {
    id: row.id,
    question: str(p.question),
    answer: row.edit?.answer ?? str(p.answer),
    acceptableAnswers: row.edit?.acceptableAnswers ?? list(p.acceptableAnswers),
    category: str(p.category),
    difficulty: str(p.difficulty) || null,
    area: row.tag?.area ?? null,
    era: row.tag?.era ?? null,
    sourceUrl: sourceUrl.startsWith("https://") ? sourceUrl : null,
    whyTrue: str(p.whyTrue).trim() || null,
    source: row.source,
    createdAt: row.created_at,
    audience: a && Number.isInteger(a.score)
      ? { score: a.score, familiar: a.familiar, fun: a.fun, estCorrect: a.estCorrect, flags: Array.isArray(a.flags) ? a.flags : [] }
      : null,
    possibleRepeat: repeat?.question ? { slug: str(repeat.slug), question: str(repeat.question), answer: str(repeat.answer) } : null,
    edited: row.edit != null,
  };
};

/**
 * The waiting Live candidates (best score first, then oldest; sorted in SQL, so a newer high scorer beyond the first
 * 200 still comes first, 4c.9 #5), the real number waiting, how many are kept for Publish, and how many wait on a
 * Publish PR. 3 reads, plus the PR check's GitHub call per waiting PR (usually none).
 */
export const readLiveReviewQueue = async (category: string | null, deps: Pick<PublishDeps, "prState"> = DEFAULT_DEPS): Promise<LiveReviewPage> => {
  const db = admin();
  let query = db.from("question_candidates")
    .select("id, payload, edit, tag, audience, possible_repeat, source, created_at", { count: "exact" })
    .eq("game", "live").eq("status", "pending_review");
  if (category) query = query.eq("payload->>category", category);
  // jsonb numbers sort numerically; an unscored candidate goes last.
  const ordered = query.order("audience->score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true }).limit(LIVE_REVIEW_LIMIT);
  // The PR check first, so a closed PR's questions are back in the kept count.
  const waiting = await reconcileLivePrs(deps);
  const [{ data, error, count }, kept] = await Promise.all([
    ordered,
    db.from("question_candidates").select("id", { count: "exact", head: true }).eq("game", "live").eq("status", "keep"),
  ]);
  if (error || kept.error) throw new LiveReviewError("unavailable", "Couldn't load questions.", 503);
  const items = ((data ?? []) as CandidateRow[]).map(toItem);
  return { total: Math.max(count ?? 0, items.length), items, kept: kept.count ?? 0, categories: [...LIVE_CATEGORIES], waiting };
};

const transition = async (id: string, from: string[], fields: Record<string, unknown>) => {
  const { data, error } = await admin().from("question_candidates").update(fields)
    .eq("id", id).eq("game", "live").in("status", from).select("id");
  if (error) throw new LiveReviewError("unavailable", "Couldn't save. Try again.", 503);
  return (data ?? []).length === 1;
};

/** Keep or reject one waiting candidate. False = it was no longer waiting. */
export const liveDecide = (id: string, decision: "keep" | "reject") =>
  transition(id, ["pending_review"], { status: decision, decided_at: new Date().toISOString() });

/**
 * Undo a keep or reject: back to waiting. A candidate already claimed or published can't be undone, nor one whose PR
 * waits on GitHub (pr_open); once that PR is closed, the PR check returns it to keep and Undo works.
 */
export const liveUndo = async (id: string): Promise<LiveReviewUndoResult> => {
  if (!(await transition(id, ["keep", "reject"], { status: "pending_review", decided_at: null }))) {
    const { data } = await admin().from("question_candidates").select("status").eq("id", id).eq("game", "live").maybeSingle();
    const waiting = (data as { status?: string } | null)?.status === "pr_open";
    throw new LiveReviewError("not_undoable", waiting ? "Waiting on GitHub." : "Can't undo: already published.", 409);
  }
  return { id, status: "pending_review" };
};

// A number, money, a percent or a year may run past the 2-word limit, but it must hold a digit (4c.9 #6).
const NUMERIC = /^(?=.*\d)[\d.,\s%$-]+(?:\s?(?:BC|BCE|AD|CE))?$/i;

/**
 * E: change the answer and the acceptable answers of a waiting candidate (the writer's payload is kept as written).
 * Every answer kept must be matchable by grading (4c.9 #6): an answer that normalizes to nothing is refused, and such an
 * acceptable answer is skipped like a blank.
 */
export const parseLiveEdit = (answer: unknown, acceptable: unknown) => {
  const clean = (value: unknown, max: number) => (typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "");
  const a = clean(answer, MAX_ANSWER);
  const raw = Array.isArray(acceptable) ? acceptable : null;
  if (!a || a.length > MAX_ANSWER || !isMatchableAnswer(a) || (!NUMERIC.test(a) && a.split(" ").length > 2) || !raw || raw.length > MAX_ACCEPTABLE) return null;
  const seen = new Set([a.toLowerCase()]);
  const out: string[] = [];
  for (const value of raw) {
    const v = clean(value, MAX_ACCEPTABLE_CHARS);
    if (!v) continue;
    if (v.length > MAX_ACCEPTABLE_CHARS) return null;
    if (!isMatchableAnswer(v)) continue;
    if (seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return { answer: a, acceptableAnswers: out };
};

export const liveEdit = async (id: string, edit: { answer: string; acceptableAnswers: string[] }) => {
  if (!(await transition(id, ["pending_review"], { edit }))) throw new LiveReviewError("not_pending", "Already decided.", 409);
};

type Claimed = { id: string; slot: unknown; payload: Record<string, unknown>; edit: CandidateRow["edit"]; tag: (CandidateRow["tag"] & Record<string, unknown>) | null };
type Moved = { id: string; payload: Record<string, unknown> | null; tag: Claimed["tag"]; questionRef: string };

/** PRs looked up per PR check (one GitHub GET each). */
export const PR_CHECK_LIMIT = 10;
const PR_ROWS_READ = 500;
/** The PR check stops asking GitHub after this, so it never eats Publish's 120 s (each GitHub call times out at 20 s). */
const PR_CHECK_BUDGET_MS = 15_000;
/** live_candidates_publish_claim's stale-claim age. */
const STALE_CLAIM_MS = 10 * 60_000;

/** Tags for questions now on main, so the star cap counts them. Best effort, as before 4c.2. */
const writeTags = async (rows: { payload: Record<string, unknown> | null | undefined; tag: Claimed["tag"]; slug: string }[]) => {
  const now = new Date().toISOString();
  const tags = rows.map(({ payload, tag: raw, slug }) => {
    const tag = raw ?? {};
    return {
      game: "live", question_ref: slug, category: str(payload?.category), area_id: (tag.areaId as string | null) ?? null,
      era: (tag.areaId ? (tag.era as string | null) : null) ?? null, subject: str(tag.subject), subject_key: str(tag.subjectKey),
      written_at: now, tagged_by: "writer:live-publish",
    };
  }).filter((t) => t.subject && t.subject_key);
  if (!tags.length) return;
  const { error } = await admin().from("question_tags").upsert(tags, { onConflict: "game,question_ref" });
  if (error) console.warn("Live publish: tags not saved.");
};

/**
 * The PR check (Phase 4c.2 step 6): for each Publish PR the database is waiting on (pr_open rows, and stale publishing
 * rows that have a pr_url), ask GitHub once and settle: merged -> published + tags; closed -> keep; open -> pr_open.
 * Usually 0 GitHub calls (no such rows). Never throws: a failure leaves the rows as they are.
 * Returns how many questions still wait on GitHub, and one PR link.
 */
export const reconcileLivePrs = async (deps: Pick<PublishDeps, "prState"> = DEFAULT_DEPS): Promise<{ waiting: number; prUrl: string }> => {
  const db = admin();
  const { data, error } = await db.from("question_candidates").select("id, status, pr_url, claimed_at")
    .eq("game", "live").in("status", ["pr_open", "publishing"]).limit(PR_ROWS_READ);
  if (error) {
    console.warn("Live PR check: couldn't read.");
    return { waiting: 0, prUrl: "" };
  }
  // A publishing row is the PR check's only once its claim is stale: a fresh one belongs to a running Publish.
  const stale = Date.now() - STALE_CLAIM_MS;
  const rows = ((data ?? []) as { status: string; pr_url: string | null; claimed_at: string | null }[])
    .filter((r) => r.pr_url && (r.status === "pr_open" || Date.parse(r.claimed_at ?? "") <= stale));
  const open = new Map<string, number>();
  for (const r of rows) if (r.status === "pr_open") open.set(r.pr_url as string, (open.get(r.pr_url as string) ?? 0) + 1);
  const started = Date.now();
  for (const prUrl of [...new Set(rows.map((r) => r.pr_url as string))].slice(0, PR_CHECK_LIMIT)) {
    if (Date.now() - started > PR_CHECK_BUDGET_MS) break;
    try {
      const state = await deps.prState(prUrl);
      if (!state) continue;
      const settled = await db.rpc("live_candidates_pr_settle", { p_pr_url: prUrl, p_state: state });
      if (settled.error) throw new Error(settled.error.message);
      const moved = (Array.isArray(settled.data) ? settled.data : []) as Moved[];
      if (state === "merged") await writeTags(moved.map((m) => ({ payload: m.payload, tag: m.tag, slug: m.questionRef })));
      if (state === "open") open.set(prUrl, (open.get(prUrl) ?? 0) + moved.length);
      else open.delete(prUrl);
    } catch {
      console.warn("Live PR check: a PR couldn't be checked.");
    }
  }
  const waitingPrs = [...open].filter(([, n]) => n > 0);
  return { waiting: waitingPrs.reduce((sum, [, n]) => sum + n, 0), prUrl: waitingPrs[0]?.[0] ?? "" };
};

const NOT_RECORDED = "Published, but not recorded. Don't publish again; tell the developer.";

/** Reads of trivia_questions.slug per Publish before a still-clashing candidate is refused (4c.9 #2). */
export const SLUG_CHECK_ROUNDS = 3;

/** The planned slugs already used in trivia_questions (any pool, any status). One read (≤ LIVE_PUBLISH_LIMIT slugs). */
const slugsInDatabase = async (slugs: string[]) => {
  const { data, error } = await admin().from("trivia_questions").select("slug").in("slug", slugs);
  if (error) throw new PublishError("slug-check", "Couldn't check slugs.");
  return new Set(((data ?? []) as { slug: string | null }[]).map((r) => r.slug ?? ""));
};

/**
 * Plan the Publish with slugs no trivia_questions row uses (4c.9 #2): trivia_questions.slug is one unique column shared
 * with Speed, and a Live slug that hits a Speed row would stop Sync Live Trivia. Plan, read the new slugs, reserve any
 * hit, plan again; usually 1 read. After SLUG_CHECK_ROUNDS reads, a candidate whose slug is still unchecked is
 * refused (`slug-taken`) and the rest are planned without it, keeping every reserved slug.
 */
const planWithFreeSlugs = async (files: Map<string, string | null>, claimed: Claimed[]) => {
  const reserved = new Set<string>();
  const free = new Set<string>();
  const stuck = new Set<string>();
  for (let round = 1; ; round++) {
    const plan = planPublish({ files, candidates: claimed.filter((c) => !stuck.has(c.id)), reserved });
    const unchecked = plan.published.filter((p) => !free.has(p.slug));
    if (!unchecked.length) {
      plan.refused.push(...[...stuck].map((id) => ({ id, reason: "slug-taken" })));
      return plan;
    }
    if (round > SLUG_CHECK_ROUNDS) {
      unchecked.forEach((p) => stuck.add(p.id));
      continue;
    }
    const used = await slugsInDatabase(unchecked.map((p) => p.slug));
    for (const { slug } of unchecked) (used.has(slug) ? reserved : free).add(slug);
  }
};

/**
 * Publish (N): claim the kept candidates, append them to the Live JSON on main through one PR, record the PR on the
 * claimed rows, merge it, then settle every row in one transaction: merged -> published (+ tags), PR waiting on
 * GitHub -> pr_open, refused -> reject. A failure before the PR exists releases every claim back to keep; once the
 * PR exists, rows are never released (the PR check settles them). An open Publish PR blocks a new one.
 */
export const publishLive = async (deps: PublishDeps = DEFAULT_DEPS): Promise<LivePublishResult> => {
  const db = admin();
  await reconcileLivePrs(deps);
  const claim = randomUUID();
  const { data, error } = await db.rpc("live_candidates_publish_claim", { p_claim: claim, p_limit: LIVE_PUBLISH_LIMIT });
  if (error) {
    if (/publish-in-progress/.test(error.message ?? "")) throw new LiveReviewError("in_progress", "Publish already running.", 409);
    throw new LiveReviewError("unavailable", "Couldn't publish. Try again.", 503);
  }
  const claimed = (Array.isArray(data) ? data : []) as Claimed[];
  const empty: LivePublishResult = { prUrl: "", merged: false, waiting: false, published: 0, already: 0, refused: 0, files: [] };
  if (!claimed.length) return empty;

  /** Back to keep: only for rows no PR was opened for. Checked: every claimed row must come back. */
  const release = async () => {
    const { data: back, error: releaseError } = await db.from("question_candidates")
      .update({ status: "keep", publish_claim: null, claimed_at: null })
      .eq("publish_claim", claim).eq("status", "publishing").select("id");
    if (releaseError || (back ?? []).length !== claimed.length) {
      console.warn("Live publish: claims not released.");
      return false;
    }
    return true;
  };
  const failed = () => new LiveReviewError("publish_failed", "Publish failed. Nothing changed.", 502);

  let plan: ReturnType<typeof planPublish>;
  let pr: Awaited<ReturnType<typeof openPublishPr>> | null = null;
  try {
    const waiting = await deps.findOpenPr();
    if (waiting) {
      if (!(await release())) throw failed();
      return { ...empty, prUrl: waiting.url, waiting: true };
    }
    const paths = [...new Set(claimed.map((c) => { try { return fileFor(str(c.payload?.category)); } catch { return ""; } }).filter(Boolean))];
    const { baseSha, files } = await deps.readFiles(paths);
    plan = await planWithFreeSlugs(files, claimed);
    if (plan.changes.length) {
      const summary = `Adds ${plan.published.length} reviewed Live Trivia question${plan.published.length === 1 ? "" : "s"}: `
        + plan.changes.map((c) => `${c.path.split("/").pop()} +${c.added}${c.created ? " (new file)" : ""}`).join(", ");
      pr = await deps.openPr(baseSha, plan.changes, summary);
    }
  } catch (err) {
    if (err instanceof LiveReviewError) throw err;
    const released = await release();
    if (!released || err instanceof LiveGithubError || err instanceof PublishError) throw failed();
    throw err;
  }

  // The PR exists: record it on its rows before merging. If that fails, the rows stay claimed (never released):
  // the 10-minute re-claim then meets the open-PR guard, or finds the entries on main once the PR merges.
  if (pr) {
    const recorded = await db.rpc("live_candidates_publish_record_pr", {
      p_claim: claim, p_pr_url: pr.url, p_rows: plan.published.map(({ id, slug }) => ({ id, questionRef: slug })),
    });
    if (recorded.error || recorded.data !== plan.published.length) {
      console.warn("Live publish: PR not recorded.");
      throw failed();
    }
  }
  const merged = pr ? await deps.merge(pr).catch(() => false) : false;
  const prUrl = pr?.url ?? "";

  const rows = [
    ...plan.published.map(({ id, slug }) => ({ id, status: merged ? "published" : "pr_open", questionRef: slug, prUrl })),
    ...plan.already.map(({ id, slug }) => ({ id, status: "published", questionRef: slug, prUrl: "" })),
    ...plan.refused.map(({ id, reason }) => ({ id, status: "reject", reason: `publish:${reason}` })),
  ];
  const settled = await db.rpc("live_candidates_publish_settle", { p_claim: claim, p_rows: rows });
  if (settled.error || settled.data !== rows.length) {
    console.warn("Live publish: settle failed.");
    throw new LiveReviewError("not_recorded", NOT_RECORDED, 500);
  }
  if (merged) {
    const byId = new Map(claimed.map((c) => [c.id, c]));
    await writeTags(plan.published.map(({ id, slug }) => ({ payload: byId.get(id)?.payload, tag: byId.get(id)?.tag ?? null, slug })));
  }
  return {
    prUrl, merged, waiting: Boolean(pr) && !merged, published: plan.published.length, already: plan.already.length,
    refused: plan.refused.length, files: plan.changes.map((c) => c.path),
  };
};
