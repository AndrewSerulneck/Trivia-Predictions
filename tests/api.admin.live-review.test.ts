import { readFileSync, readdirSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Quick Review, Live mode route and Publish (docs/speed-trivia-backlog-and-quality-plan.md Phase 4c). Supabase and
// GitHub are faked; nothing leaves the process. Publish must append (D10) and never write trivia_questions.
// Phase 4c.2: the PR is recorded before merging, settled in one RPC, pr_open while it waits, the open-PR guard, the PR check.
vi.mock("server-only", () => ({}));
type Row = Record<string, unknown>;
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rpc: vi.fn(),
  rows: [] as Row[],
  runs: [] as Row[],
  updates: [] as { table: string; patch: Row; filters: [string, unknown][] }[],
  upserts: [] as { table: string; rows: Row[] }[],
  /** trivia_questions slugs (any pool) Publish's slug check sees, and the slug lists it asked about. */
  dbSlugs: [] as string[],
  slugReads: [] as string[][],
  slugReadError: false,
  readFiles: vi.fn(),
  openPr: vi.fn(),
  merge: vi.fn(),
  findOpenPr: vi.fn(),
  prState: vi.fn(),
}));
vi.mock("@/lib/adminAuth", () => ({ requireAdminAuth: mocks.auth }));
vi.mock("@/lib/liveTriviaGithub", () => ({
  LiveGithubError: class extends Error { code = "github"; },
  readLiveFiles: mocks.readFiles,
  openPublishPr: mocks.openPr,
  mergePublishPr: mocks.merge,
  findOpenPublishPr: mocks.findOpenPr,
  readPrState: mocks.prState,
}));
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "question_writer_runs") {
        const runs = { select: () => runs, eq: () => runs, order: () => runs, limit: async () => ({ data: mocks.runs, error: null }) };
        return runs;
      }
      if (table === "trivia_questions") {
        // Publish may only READ slugs here (4c.9 #2); any write fails the test.
        const t = {
          select: (cols: string) => { if (cols !== "slug") throw new Error(`unexpected trivia_questions read ${cols}`); return t; },
          in: async (k: string, v: string[]) => {
            if (k !== "slug") throw new Error(`unexpected filter ${k}`);
            mocks.slugReads.push([...v]);
            if (mocks.slugReadError) return { data: null, error: { message: "down" } };
            return { data: mocks.dbSlugs.filter((x) => v.includes(x)).map((slug) => ({ slug })), error: null };
          },
        };
        return t;
      }
      const filters: [string, unknown][] = [];
      const orders: [string, boolean][] = [];
      let patch: Row | null = null;
      let head = false;
      let counted = false;
      let cap = Infinity;
      const matches = (r: Row) => filters.every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : k === "payload->>category" ? (r.payload as Row).category === v : r[k] === v));
      const field = (r: Row, k: string) => (k === "audience->score" ? ((r.audience as Row | null)?.score ?? null) : r[k]) as number | string | null;
      /** PostgREST's order: each key in turn, nulls last when descending (nullsFirst: false). */
      const sorted = (rows: Row[]) => [...rows].sort((x, y) => {
        for (const [k, asc] of orders) {
          const a = field(x, k), b = field(y, k);
          if (a === b) continue;
          if (a == null) return 1;
          if (b == null) return -1;
          return (a < b ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
      const q = {
        select: (_cols?: string, opts?: { head?: boolean; count?: string }) => { head = Boolean(opts?.head); counted = opts?.count === "exact"; return q; },
        eq: (k: string, v: unknown) => { filters.push([k, v]); return q; },
        in: (k: string, v: unknown[]) => { filters.push([k, v]); return q; },
        order: (k: string, opts?: { ascending?: boolean }) => { orders.push([k, opts?.ascending !== false]); return q; },
        limit: (n: number) => { cap = n; return q; },
        maybeSingle: async () => ({ data: mocks.rows.filter(matches)[0] ?? null, error: null }),
        update: (p: Row) => { patch = p; return q; },
        upsert: async (rows: Row[]) => { mocks.upserts.push({ table, rows }); return { error: null }; },
        then: (resolve: (v: unknown) => void) => {
          if (patch) {
            mocks.updates.push({ table, patch, filters: [...filters] });
            const hit = mocks.rows.filter(matches);
            hit.forEach((r) => Object.assign(r, patch));
            resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
            return;
          }
          const hit = mocks.rows.filter(matches);
          resolve(head ? { count: hit.length, error: null } : { data: sorted(hit).slice(0, cap), count: counted ? hit.length : null, error: null });
        },
      };
      return q;
    },
  },
}));
import { GET, POST } from "@/app/api/admin/trivia/live-review/route";

const DIR = "data/live-trivia/categories";
const id = (n: number) => `85000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidate = (n: number, over: Row = {}): Row => ({
  id: id(n), game: "live", status: "pending_review", source: "chatgpt", created_at: `2026-11-16T01:0${n}:00Z`, edit: null, possible_repeat: null,
  tag: { areaId: "area-rock", area: "Classic rock", era: "1970s", subject: `Band ${n}`, subjectKey: `band ${n}` },
  audience: { score: n, familiar: 4, fun: 4, estCorrect: 40, flags: [] },
  payload: { question: `Which band recorded brand-new hit number ${n}?`, answer: "Queen", acceptableAnswers: [], category: "Music", difficulty: "easy", sourceUrl: null },
  ...over,
});
const post = (body: unknown) => POST(new Request("https://example.invalid/api/admin/trivia/live-review", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const get = (query = "") => GET(new Request(`https://example.invalid/api/admin/trivia/live-review${query}`));
const files = () => new Map(readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => [`${DIR}/${f}`, readFileSync(`${DIR}/${f}`, "utf8")] as [string, string | null]));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true });
  mocks.rows = [candidate(1), candidate(2), candidate(3, { status: "keep" })];
  mocks.runs = [];
  mocks.updates = [];
  mocks.upserts = [];
  mocks.dbSlugs = [];
  mocks.slugReads = [];
  mocks.slugReadError = false;
  mocks.findOpenPr.mockResolvedValue(null);
  mocks.prState.mockResolvedValue("open");
});

describe("Live review route", () => {
  it("requires an admin", async () => {
    mocks.auth.mockResolvedValue({ ok: false, status: 401, error: "Admin login required." });
    expect((await get()).status).toBe(401);
    expect((await post({ action: "publish" })).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("says Writer stopped when the writer is silent or on the fallback, not before its first run", async () => {
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    expect((await (await get()).json()).writerStopped).toBe(false);
    mocks.runs = [{ run_date: day(5), source: "chatgpt" }];
    expect((await (await get()).json()).writerStopped).toBe(true);
    mocks.runs = [{ run_date: day(0), source: "gemini-fallback" }, { run_date: day(1), source: "gemini-fallback" }];
    expect((await (await get()).json()).writerStopped).toBe(true);
    mocks.runs = [{ run_date: day(0), source: "chatgpt" }];
    expect((await (await get()).json()).writerStopped).toBe(false);
  });

  it("lists waiting candidates best score first, with the kept count and the categories", async () => {
    const body = await (await get()).json();
    expect(body.items.map((i: Row) => i.id)).toEqual([id(2), id(1)]);
    expect(body).toMatchObject({ kept: 1, total: 2 });
    expect(body.categories).toContain("Current Events");
    expect(body.items[0]).toMatchObject({ answer: "Queen", area: "Classic rock", era: "1970s", source: "chatgpt", possibleRepeat: null });
    expect((await get("?category=Bingo")).status).toBe(400);
  });

  it("keeps, rejects and undoes only from the right states", async () => {
    expect(await (await post({ action: "keep", id: id(1) })).json()).toMatchObject({ ok: true, decided: true });
    expect(mocks.rows[0].status).toBe("keep");
    expect(await (await post({ action: "keep", id: id(1) })).json()).toMatchObject({ decided: false });
    expect(await (await post({ action: "undo", id: id(1) })).json()).toMatchObject({ ok: true, status: "pending_review" });
    expect(await (await post({ action: "reject", id: id(2) })).json()).toMatchObject({ decided: true });
    expect((await post({ action: "keep", id: "nope" })).status).toBe(400);
    mocks.rows[2].status = "published";
    expect((await post({ action: "undo", id: id(3) })).status).toBe(409);
  });

  it("edits the answer and acceptable answers, within the Live limits", async () => {
    const ok = await (await post({ action: "edit", id: id(1), answer: " Freddie  Mercury ", acceptableAnswers: ["Mercury", "mercury", ""] })).json();
    expect(ok).toMatchObject({ ok: true, answer: "Freddie Mercury", acceptableAnswers: ["Mercury"] });
    expect(mocks.rows[0].edit).toEqual({ answer: "Freddie Mercury", acceptableAnswers: ["Mercury"] });
    expect((await post({ action: "edit", id: id(1), answer: "The Lord of the Rings", acceptableAnswers: [] })).status).toBe(400);
    expect((await post({ action: "edit", id: id(1), answer: "Queen", acceptableAnswers: Array(9).fill("x") })).status).toBe(400);
  });

  it("refuses an answer grading can never match, and drops such an acceptable answer (4c.9 #6)", async () => {
    for (const answer of ["$", "-", "%", ",", "$ - %"]) {
      expect((await post({ action: "edit", id: id(1), answer, acceptableAnswers: [] })).status).toBe(400);
    }
    for (const answer of ["$5", "1,000", "50%", "300 BC", "1,000,000 BC"]) {
      expect(await (await post({ action: "edit", id: id(1), answer, acceptableAnswers: [] })).json()).toMatchObject({ ok: true, answer });
    }
    const body = await (await post({ action: "edit", id: id(1), answer: "Queen", acceptableAnswers: ["$", "Queen band", "-"] })).json();
    expect(body.acceptableAnswers).toEqual(["Queen band"]);
  });

  it("sorts the whole queue in SQL and reports the real count (4c.9 #5)", async () => {
    // 250 waiting: the 249 oldest score 1, the newest scores 9. Before 4c.9 only the 200 oldest were read.
    mocks.rows = Array.from({ length: 250 }, (_, n) => candidate(n + 1, {
      created_at: new Date(Date.UTC(2026, 10, 1) + n * 60_000).toISOString(),
      audience: n === 249 ? { score: 9, familiar: 4, fun: 4, estCorrect: 40, flags: [] } : n === 0 ? null : { score: 1, familiar: 4, fun: 4, estCorrect: 40, flags: [] },
    }));
    const body = await (await get()).json();
    expect(body.total).toBe(250);
    expect(body.items).toHaveLength(200);
    expect(body.items[0].id).toBe(id(250));
    expect(body.items[1].id).toBe(id(2)); // then oldest first among equal scores
    expect(body.items.map((i: Row) => i.id)).not.toContain(id(1)); // unscored sorts last
  });
});

describe("Publish", () => {
  const PR = "https://github.com/o/r/pull/9";
  const STALE = () => new Date(Date.now() - 11 * 60_000).toISOString();
  type Fail = { record?: boolean; settle?: boolean };
  let fail: Fail = {};
  const held = (args: Row) => (r: Row) => r.publish_claim === args.p_claim && r.status === "publishing";
  /** The four Publish RPCs, faithful to 20261117025917 (all-or-nothing counts). */
  const rpcs = () => mocks.rpc.mockImplementation(async (name: string, args: Row) => {
    if (name === "live_candidates_publish_claim") {
      const kept = mocks.rows.filter((r) => r.status === "keep" || (r.status === "publishing" && !r.pr_url));
      kept.forEach((r) => Object.assign(r, { status: "publishing", publish_claim: args.p_claim, claimed_at: "now" }));
      return { data: kept.map((r) => ({ id: r.id, slot: {}, payload: r.payload, edit: r.edit, tag: r.tag, questionRef: "x" })), error: null };
    }
    if (name === "live_candidates_publish_record_pr") {
      const asked = args.p_rows as Row[];
      const hit = asked.map((a) => mocks.rows.find((r) => r.id === a.id && held(args)(r)));
      if (fail.record || hit.some((r) => !r)) return { data: null, error: { message: "publish-record-mismatch" } };
      hit.forEach((r, i) => Object.assign(r!, { pr_url: args.p_pr_url, question_ref: asked[i].questionRef }));
      return { data: hit.length, error: null };
    }
    if (name === "live_candidates_publish_settle") {
      const asked = args.p_rows as Row[];
      const hit = asked.map((a) => mocks.rows.find((r) => r.id === a.id && held(args)(r)));
      if (fail.settle || hit.some((r) => !r)) return { data: null, error: { message: "publish-settle-mismatch" } };
      hit.forEach((r, i) => {
        const a = asked[i];
        Object.assign(r!, a.status === "reject"
          ? { status: "reject", reason: a.reason, pr_url: null }
          : { status: a.status, question_ref: a.questionRef, pr_url: a.prUrl || null }, { publish_claim: null, claimed_at: null });
      });
      return { data: hit.length, error: null };
    }
    if (name === "live_candidates_pr_settle") {
      const moved = mocks.rows.filter((r) => r.pr_url === args.p_pr_url && (r.status === "pr_open" ? args.p_state !== "open" : r.status === "publishing" && Date.parse(String(r.claimed_at)) <= Date.now() - 600_000));
      const status = args.p_state === "merged" ? "published" : args.p_state === "closed" ? "keep" : "pr_open";
      moved.forEach((r) => Object.assign(r, { status, publish_claim: null, claimed_at: null }, args.p_state === "closed" ? { pr_url: null } : {}));
      return { data: moved.map((r) => ({ id: r.id, payload: r.payload, tag: r.tag, questionRef: r.question_ref })), error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  });
  const calls = (name: string) => mocks.rpc.mock.calls.filter(([n]) => n === name);
  const githubReady = (merged: boolean) => {
    mocks.readFiles.mockResolvedValue({ baseSha: "base", files: files() });
    mocks.openPr.mockResolvedValue({ url: PR, number: 9, branch: "live-trivia-publish-x", commitSha: "c" });
    mocks.merge.mockImplementation(async () => {
      // The PR is recorded on its rows before the merge is attempted.
      expect(mocks.rows.filter((r) => r.status === "publishing").every((r) => r.pr_url === PR)).toBe(true);
      return merged;
    });
  };
  beforeEach(() => { fail = {}; rpcs(); });

  it("appends kept questions in one PR, records it, merges it, settles in one call and writes tags", async () => {
    mocks.rows[1].status = "keep";
    githubReady(true);
    const body = await (await post({ action: "publish" })).json();
    expect(body).toMatchObject({ ok: true, prUrl: PR, merged: true, waiting: false, published: 2, already: 0, refused: 0, files: [`${DIR}/music.v1.json`] });
    const [, changes] = mocks.openPr.mock.calls[0] as [string, { path: string; content: string }[]];
    const before = readFileSync(`${DIR}/music.v1.json`, "utf8");
    const lastOld = before.lastIndexOf("}", before.lastIndexOf("]"));
    expect(changes[0].content.slice(0, lastOld + 1)).toBe(before.slice(0, lastOld + 1));
    expect(JSON.parse(changes[0].content).questions.length).toBe(JSON.parse(before).questions.length + 2);
    expect(mocks.rows.filter((r) => r.status === "published").map((r) => r.pr_url)).toEqual([PR, PR]);
    expect(calls("live_candidates_publish_settle")).toHaveLength(1);
    expect(mocks.updates).toEqual([]); // no per-row updates any more
    expect(mocks.upserts[0].table).toBe("question_tags");
    expect(mocks.upserts[0].rows[0]).toMatchObject({ game: "live", category: "Music", area_id: "area-rock", era: "1970s", tagged_by: "writer:live-publish" });
  });

  describe("slugs used by trivia_questions (4c.9 #2)", () => {
    const BASE = "which-band-recorded-brand-new-hit-number-3";
    const addedSlugs = () => (mocks.openPr.mock.calls[0][1] as { content: string }[]).flatMap((c) => JSON.parse(c.content).questions.map((q: Row) => q.slug));

    it("checks the planned slugs in one read and publishes as planned when none is used", async () => {
      githubReady(true);
      expect(await (await post({ action: "publish" })).json()).toMatchObject({ published: 1, refused: 0 });
      expect(mocks.slugReads).toEqual([[BASE]]);
      expect(addedSlugs()).toContain(BASE);
    });

    it("re-plans around a slug a Speed row already uses", async () => {
      githubReady(true);
      mocks.dbSlugs = [BASE];
      expect(await (await post({ action: "publish" })).json()).toMatchObject({ published: 1, refused: 0 });
      expect(mocks.slugReads).toEqual([[BASE], [`${BASE}-2`]]);
      expect(addedSlugs()).toContain(`${BASE}-2`);
      expect(addedSlugs()).not.toContain(BASE);
      expect(mocks.rows[2]).toMatchObject({ status: "published", question_ref: `${BASE}-2` });
    });

    it("after 3 reads of clashes, refuses the candidate as slug-taken and opens no PR", async () => {
      githubReady(true);
      mocks.dbSlugs = [BASE, `${BASE}-2`, `${BASE}-3`];
      expect(await (await post({ action: "publish" })).json()).toMatchObject({ published: 0, refused: 1, prUrl: "" });
      expect(mocks.slugReads).toHaveLength(3);
      expect(mocks.openPr).not.toHaveBeenCalled();
      expect(mocks.rows[2]).toMatchObject({ status: "reject", reason: "publish:slug-taken" });
    });

    it("a stuck candidate doesn't hold back the others", async () => {
      githubReady(true);
      mocks.merge.mockResolvedValue(true); // the refused row stays claimed, with no PR, until the settle
      mocks.rows[1].status = "keep";
      mocks.dbSlugs = [BASE, `${BASE}-2`, `${BASE}-3`];
      expect(await (await post({ action: "publish" })).json()).toMatchObject({ published: 1, refused: 1 });
      expect(mocks.slugReads).toHaveLength(3);
      expect(addedSlugs()).toContain("which-band-recorded-brand-new-hit-number-2");
      expect(mocks.rows[1]).toMatchObject({ status: "published" });
      expect(mocks.rows[2]).toMatchObject({ status: "reject", reason: "publish:slug-taken" });
    });

    it("a failed slug check sends every claim back to keep and opens no PR", async () => {
      githubReady(true);
      mocks.slugReadError = true;
      expect((await post({ action: "publish" })).status).toBe(502);
      expect(mocks.rows[2]).toMatchObject({ status: "keep", publish_claim: null });
      expect(mocks.openPr).not.toHaveBeenCalled();
    });
  });

  it("leaves a PR that isn't merged as pr_open: no tags, Undo says it waits, and the queue shows it", async () => {
    githubReady(false);
    const body = await (await post({ action: "publish" })).json();
    expect(body).toMatchObject({ ok: true, prUrl: PR, merged: false, waiting: true, published: 1 });
    expect(mocks.rows[2]).toMatchObject({ status: "pr_open", pr_url: PR, publish_claim: null });
    expect(mocks.rows[2].question_ref).not.toBe("x");
    expect(mocks.upserts).toEqual([]);
    const undo = await post({ action: "undo", id: id(3) });
    expect(undo.status).toBe(409);
    expect((await undo.json()).error).toBe("Waiting on GitHub.");
    expect(await (await get()).json()).toMatchObject({ kept: 0, waiting: { waiting: 1, prUrl: PR } });
  });

  it("the PR check: a closed PR's questions go back to keep and Undo works; a merged one is published with tags", async () => {
    Object.assign(mocks.rows[2], { status: "pr_open", pr_url: PR, question_ref: "final-3" });
    mocks.prState.mockResolvedValueOnce("closed");
    expect(await (await get()).json()).toMatchObject({ kept: 1, waiting: { waiting: 0, prUrl: "" } });
    expect(mocks.rows[2]).toMatchObject({ status: "keep", pr_url: null });
    expect(await (await post({ action: "undo", id: id(3) })).json()).toMatchObject({ ok: true, status: "pending_review" });

    Object.assign(mocks.rows[2], { status: "pr_open", pr_url: PR, question_ref: "final-3" });
    mocks.prState.mockResolvedValueOnce("merged");
    await get();
    expect(mocks.rows[2].status).toBe("published");
    expect(mocks.upserts[0].rows[0]).toMatchObject({ question_ref: "final-3", tagged_by: "writer:live-publish" });
    expect(mocks.prState).toHaveBeenCalledTimes(2);
    mocks.prState.mockClear();
    await get(); // nothing waits: no GitHub call
    expect(mocks.prState).not.toHaveBeenCalled();
  });

  it("a stale publishing row with a PR is settled by the PR check, never re-claimed", async () => {
    Object.assign(mocks.rows[2], { status: "publishing", pr_url: PR, question_ref: "final-3", publish_claim: "old", claimed_at: STALE() });
    mocks.prState.mockResolvedValue("open");
    const body = await (await post({ action: "publish" })).json();
    expect(body).toMatchObject({ ok: true, published: 0, prUrl: "" });
    expect(mocks.rows[2]).toMatchObject({ status: "pr_open", pr_url: PR });
    expect(mocks.openPr).not.toHaveBeenCalled();
  });

  it("a settle that doesn't match says so and leaves the PR's rows for the PR check", async () => {
    githubReady(true);
    fail.settle = true;
    const response = await post({ action: "publish" });
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Published, but not recorded. Don't publish again; tell the developer.");
    expect(mocks.rows[2]).toMatchObject({ status: "publishing", pr_url: PR });
    expect(mocks.upserts).toEqual([]);
    mocks.rows[2].claimed_at = STALE(); // ten minutes later: the re-claim skips it
    rpcs();
    mocks.openPr.mockClear();
    expect(await (await post({ action: "publish" })).json()).toMatchObject({ published: 0 });
    expect(mocks.openPr).not.toHaveBeenCalled();
  });

  it("a PR that can't be recorded stops before merging and keeps the claim", async () => {
    githubReady(true);
    fail.record = true;
    expect((await post({ action: "publish" })).status).toBe(502);
    expect(mocks.merge).not.toHaveBeenCalled();
    expect(mocks.rows[2].status).toBe("publishing");
    expect(mocks.rows[2].pr_url).toBeUndefined();
    expect(calls("live_candidates_publish_settle")).toHaveLength(0);
  });

  it("an open Publish PR blocks a new one and sends the claims back to keep", async () => {
    mocks.findOpenPr.mockResolvedValue({ url: "https://github.com/o/r/pull/4", number: 4 });
    const body = await (await post({ action: "publish" })).json();
    expect(body).toMatchObject({ ok: true, waiting: true, merged: false, prUrl: "https://github.com/o/r/pull/4", published: 0 });
    expect(mocks.rows[2]).toMatchObject({ status: "keep", publish_claim: null });
    expect(mocks.readFiles).not.toHaveBeenCalled();
    expect(mocks.openPr).not.toHaveBeenCalled();
  });

  it("sends every claim back to keep when GitHub fails before the PR exists", async () => {
    mocks.readFiles.mockRejectedValue(Object.assign(new Error("down"), { code: "github" }));
    const response = await post({ action: "publish" });
    expect(response.status).toBe(500);
    expect(mocks.rows[2]).toMatchObject({ status: "keep", publish_claim: null });
    expect(mocks.openPr).not.toHaveBeenCalled();
  });

  it("refuses a second Publish while one is running, and does nothing with nothing kept", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "publish-in-progress" } });
    expect((await post({ action: "publish" })).status).toBe(409);
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await (await post({ action: "publish" })).json()).toMatchObject({ ok: true, published: 0, prUrl: "" });
    expect(mocks.readFiles).not.toHaveBeenCalled();
  });
});
