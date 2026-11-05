import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/partner-social-promo-plan.md Phase 5 — Instagram "Post now": token crypto, OAuth state, the
// Graph client, the post state machine (one container / one publish per post, even on a double tap),
// the OAuth callback, disconnect and Meta's deauthorize clean-up. Supabase and Meta are in-memory fakes.

vi.mock("server-only", () => ({}));

// Phase 8: the routes are sealed while the Post now box is off the sheet (SOCIAL_POST_NOW_ON_SHEET = false).
// These tests exercise the routes as they'll behave once it's back, so the switch is mocked on; the
// "sealed" test below turns it off again with the env flag still on.
const postNowSwitch = vi.hoisted(() => ({ onSheet: true }));
vi.mock("@/lib/social/flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social/flags")>();
  return { ...actual, isSocialPostNowLive: () => actual.isSocialPublishEnabled() && postNowSwitch.onSheet };
});

// Phase 10: a test can make encryption throw for one token slot (a context containing `failOn`).
const cryptoSwitch = vi.hoisted(() => ({ failOn: null as string | null }));
vi.mock("@/lib/social/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/social/crypto")>();
  return {
    ...actual,
    encryptSocialToken: (plaintext: string, context: string) => {
      if (cryptoSwitch.failOn && context.includes(cryptoSwitch.failOn)) throw new actual.SocialCryptoError("test: encryption failed");
      return actual.encryptSocialToken(plaintext, context);
    },
  };
});

// ── In-memory Supabase ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { social_connections: [], social_posts: [] };
const files = new Map<string, number>();
const removedFiles: string[] = [];
/** Every write sent to the fake DB (Phase 10 counts them), and a switch that makes the next upserts fail. */
const dbWrites: { table: string; op: string; rows: Row[] }[] = [];
const dbFaults = { upsert: false, update: false };
/**
 * Phase 19: runs before every update, with its patch, before the rows are matched (so it can play a request
 * that moves a post meanwhile). "fail" makes that one update return an error, as a lost answer would.
 */
const dbHooks: { onUpdate: ((table: string, patch: Row) => "fail" | void) | null } = { onUpdate: null };

const builder = (table: string) => {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  let patch: Row = {};
  let payload: Row | Row[] = {};
  let returning = false;
  let head = false;
  let limitN: number | null = null;
  let conflict: string[] = [];
  const run = () => {
    const rows = tables[table];
    const now = new Date().toISOString();
    if (op !== "select") dbWrites.push({ table, op, rows: op === "insert" || op === "upsert" ? [payload].flat() : [] });
    if (op === "update" && dbHooks.onUpdate?.(table, patch) === "fail") return { data: null, error: { message: "test: update failed" } };
    if (op === "insert") {
      rows.push({ created_at: now, updated_at: now, claimed_at: null, container_id: null, external_post_id: null, permalink: null, error: null, ...(payload as Row) });
      return { data: null, error: null };
    }
    if (op === "upsert") {
      // Like PostgREST: one request is one statement, so every row lands or (on an error) none does.
      if (dbFaults.upsert) return { data: null, error: { message: "test: upsert failed" } };
      for (const value of [payload].flat()) {
        const index = rows.findIndex((row) => conflict.every((column) => row[column] === value[column]));
        if (index >= 0) rows[index] = { ...rows[index], ...value };
        else rows.push({ id: crypto.randomUUID(), created_at: now, ...value });
      }
      return { data: null, error: null };
    }
    const matched = rows.filter((row) => filters.every((filter) => filter(row)));
    if (op === "delete") {
      tables[table] = rows.filter((row) => !matched.includes(row));
      return { data: null, error: null };
    }
    if (op === "update") {
      if (dbFaults.update) return { data: null, error: { message: "test: update failed" } };
      matched.forEach((row) => Object.assign(row, patch));
      return { data: returning ? matched.map((row) => ({ ...row })) : null, error: null };
    }
    const data = (limitN === null ? matched : matched.slice(0, limitN)).map((row) => ({ ...row }));
    return { data: head ? null : data, error: null, count: matched.length };
  };
  const query = {
    select: (_columns?: string, options?: { head?: boolean }) => {
      if (op === "update") returning = true;
      else head = Boolean(options?.head);
      return query;
    },
    update: (value: Row) => ((op = "update"), (patch = value), query),
    insert: (value: Row) => ((op = "insert"), (payload = value), query),
    upsert: (value: Row | Row[], options: { onConflict: string }) => ((op = "upsert"), (payload = value), (conflict = options.onConflict.split(",")), query),
    delete: () => ((op = "delete"), query),
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
    neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), query),
    is: (column: string, value: null) => (filters.push((row) => (row[column] ?? null) === value), query),
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), query),
    lt: (column: string, value: string) => (filters.push((row) => typeof row[column] === "string" && (row[column] as string) < value), query),
    gte: (column: string, value: string) => (filters.push((row) => typeof row[column] === "string" && (row[column] as string) >= value), query),
    order: () => query,
    limit: (n: number) => ((limitN = n), query),
    maybeSingle: async () => {
      const result = run();
      return { data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: result.error ?? null };
    },
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
  };
  return query;
};

const storageApi = {
  createSignedUploadUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/upload/${path}?token=t`, path, token: "t" }, error: null }),
  list: async (folder: string, options: { search: string }) => {
    const path = `${folder}/${options.search}`;
    return { data: files.has(path) ? [{ name: options.search, metadata: { size: files.get(path) } }] : [], error: null };
  },
  createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/read/${path}?token=r` }, error: null }),
  remove: async (paths: string[]) => {
    paths.forEach((path) => {
      files.delete(path);
      removedFiles.push(path);
    });
    return { data: null, error: null };
  },
};

vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (table: string) => builder(table), storage: { from: () => storageApi } } }));

const ownerAuth = { ownerId: "owner-1", venueIds: ["venue-a", "venue-b"] };
vi.mock("@/lib/requireOwnerAuth", () => ({ requireOwnerAuth: async () => ownerAuth }));

// ── Fake Meta ───────────────────────────────────────────────────────────────────────────

type MetaCall = { method: string; url: URL; body: URLSearchParams | null; headers: Headers };
/** `network`: the request "never answered" (fetch rejects, as on a timeout). `cutOff`: a 200 whose body can't be read. */
type MetaAnswer = { status?: number; body?: unknown; network?: true; cutOff?: true };
let metaCalls: MetaCall[] = [];
/** A route may be async (Phase 19: something else happens while Meta answers). */
let metaRoute: (call: MetaCall) => MetaAnswer | Promise<MetaAnswer>;

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const body = init?.body instanceof URLSearchParams ? init.body : null;
  const call = { method: init?.method ?? "GET", url, body, headers: new Headers(init?.headers) };
  metaCalls.push(call);
  const answer = await metaRoute(call);
  if (answer.network) throw new TypeError("fetch failed");
  if (answer.cutOff) return new Response('{"id":"med', { status: 200, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "content-type": "application/json" } });
});

const SECRET = "partner-app-secret";
const PAGE_TOKEN = "PAGE-TOKEN-123";

beforeEach(() => {
  tables.social_connections = [];
  tables.social_posts = [];
  files.clear();
  removedFiles.length = 0;
  dbWrites.length = 0;
  dbFaults.upsert = false;
  dbFaults.update = false;
  dbHooks.onUpdate = null;
  cryptoSwitch.failOn = null;
  metaCalls = [];
  metaRoute = () => ({ status: 500, body: { error: { code: 1 } } });
  vi.stubEnv("SOCIAL_TOKEN_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("META_PARTNER_APP_SECRET", SECRET);
  vi.stubEnv("SESSION_SECRET", "session-secret");
  vi.stubEnv("NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED", "true");
  vi.stubGlobal("fetch", fetchMock);
  postNowSwitch.onSheet = true;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const crypto_ = await import("@/lib/social/crypto");
const { createSocialOAuthState, verifySocialOAuthState, SOCIAL_OAUTH_COOKIE } = await import("@/lib/social/oauthState");
const rules = await import("@/lib/social/socialPublishRules");
const { metaAuthorizeUrl, metaAppSecretProof } = await import("@/lib/social/metaConfig");
const connections = await import("@/lib/social/socialConnections");
const posts = await import("@/lib/social/socialPosts");

const connectVenue = async (venueId = "venue-a", metaUserId = "555") => {
  await connections.saveSocialConnections([
    connections.connectionRow(
      "instagram",
      { venueId, ownerId: "owner-1", metaUserId, scopes: ["instagram_basic"] },
      connections.instagramConnectedAccount({ pageId: "page-1", pageName: "The Bar", pageToken: PAGE_TOKEN, instagramId: "17841400000000001", username: "thebar" }),
    ),
  ]);
  return (await connections.loadConnection(venueId, "instagram"))!;
};

const newPost = async (format: "post" | "story" | "reel", connection: Awaited<ReturnType<typeof connectVenue>>) => {
  const created = await posts.createSocialPost({
    venueId: connection.venueId,
    ownerId: "owner-1",
    connection,
    format,
    templateId: "live_trivia",
    scheduleId: "sched-1",
    prizeIds: ["prize-1"],
    musicId: "game-night-beat",
    caption: "Live Trivia tonight #trivia",
    coverMs: format === "reel" ? 12_600 : null,
  });
  return created;
};

const igRoutes = (statusCodes: string[] = []) => {
  metaRoute = (call) => {
    if (call.url.pathname.endsWith("/media")) return { body: { id: "container-1" } };
    if (call.url.pathname.endsWith("/media_publish")) return { body: { id: "media-1" } };
    if (call.url.pathname.endsWith("/container-1")) return { body: { status_code: statusCodes.shift() ?? "FINISHED" } };
    if (call.url.pathname.endsWith("/media-1")) return { body: { permalink: "https://www.instagram.com/p/abc/" } };
    return { status: 404, body: { error: { code: 100 } } };
  };
};

// ── Tests ───────────────────────────────────────────────────────────────────────────────

describe("social token crypto", () => {
  it("round-trips, binds the value to its row and field, and fails closed", () => {
    const context = crypto_.socialTokenContext("venue-a", "instagram", "page_token");
    const sealed = crypto_.encryptSocialToken("secret-token", context);
    expect(sealed).not.toContain("secret-token");
    expect(crypto_.decryptSocialToken(sealed, context)).toBe("secret-token");
    expect(() => crypto_.decryptSocialToken(sealed, crypto_.socialTokenContext("venue-b", "instagram", "page_token"))).toThrow();
    expect(() => crypto_.decryptSocialToken(sealed, crypto_.socialTokenContext("venue-a", "instagram", "user_token"))).toThrow();
    const previous = process.env.SOCIAL_TOKEN_KEY;
    vi.stubEnv("SOCIAL_TOKEN_KEY", randomBytes(32).toString("hex"));
    expect(() => crypto_.decryptSocialToken(sealed, context)).toThrow();
    vi.stubEnv("SOCIAL_TOKEN_KEY_PREVIOUS", previous ?? "");
    expect(crypto_.decryptSocialToken(sealed, context)).toBe("secret-token");
    vi.stubEnv("SOCIAL_TOKEN_KEY", "");
    expect(crypto_.isSocialTokenKeyConfigured()).toBe(false);
    expect(() => crypto_.encryptSocialToken("x", context)).toThrow();
  });
});

describe("social OAuth state", () => {
  const withCookie = (cookie: string) => new Request("https://x.test/cb", { headers: { cookie } });
  it("verifies only with the matching nonce cookie, before expiry, untampered", () => {
    const started = createSocialOAuthState({ ownerId: "owner-1", venueId: "venue-a" }, 1_000)!;
    const nonce = started.cookie.split(";")[0].split("=")[1];
    expect(verifySocialOAuthState(withCookie(`${SOCIAL_OAUTH_COOKIE}=${nonce}`), started.state, 2_000)).toEqual({ ownerId: "owner-1", venueId: "venue-a" });
    expect(verifySocialOAuthState(withCookie(`${SOCIAL_OAUTH_COOKIE}=other`), started.state, 2_000)).toBeNull();
    expect(verifySocialOAuthState(withCookie(""), started.state, 2_000)).toBeNull();
    expect(verifySocialOAuthState(withCookie(`${SOCIAL_OAUTH_COOKIE}=${nonce}`), started.state, 1_000 + 11 * 60_000)).toBeNull();
    expect(verifySocialOAuthState(withCookie(`${SOCIAL_OAUTH_COOKIE}=${nonce}`), `x${started.state}`, 2_000)).toBeNull();
    expect(started.cookie).toContain("HttpOnly");
    expect(started.cookie).toContain("Path=/api/owner/social");
  });
});

describe("rules", () => {
  it("classifies Meta errors", () => {
    expect(rules.classifyGraphError(190, null)).toBe("token");
    expect(rules.classifyGraphError(200, null)).toBe("permission");
    expect(rules.classifyGraphError(9007, 2207027)).toBe("not_ready");
    expect(rules.classifyGraphError(9, 2207042)).toBe("rate_limit");
    expect(rules.classifyGraphError(9004, 2207052)).toBe("media");
    expect(rules.classifyGraphError(24, 2207008)).toBe("expired");
    expect(rules.postErrorFor("permission")).toBe("reconnect");
  });
  it("checks captions and permalinks", () => {
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    const ats = Array.from({ length: 21 }, (_, i) => `@a${i}`).join(" ");
    for (const provider of ["instagram", "facebook"] as const) {
      expect(rules.socialCaptionProblem("x".repeat(2200), provider)).toBeNull();
      expect(rules.socialCaptionProblem("x".repeat(2201), provider)).toMatch(/2200/);
    }
    // Phase 20: hashtag and @ limits are Instagram's only.
    expect(rules.socialCaptionProblem(tags, "instagram")).toMatch(/^Instagram allows at most 30 hashtags/);
    expect(rules.socialCaptionProblem(ats, "instagram")).toMatch(/^Instagram allows at most 20 @/);
    expect(rules.socialCaptionProblem(tags, "facebook")).toBeNull();
    expect(rules.socialCaptionProblem(ats, "facebook")).toBeNull();
    expect(rules.safeInstagramPermalink("https://www.instagram.com/reel/abc/")).toBe("https://www.instagram.com/reel/abc/");
    expect(rules.safeInstagramPermalink("javascript:alert(1)")).toBeNull();
    expect(rules.safeInstagramPermalink("https://evil.test/instagram.com")).toBeNull();
  });
  it("builds the Facebook Login for Business URL with config_id and no scope", () => {
    const url = new URL(metaAuthorizeUrl({ configId: "123", redirectUri: "https://h.test/api/owner/social/meta/callback", state: "s" }));
    expect(url.hostname).toBe("www.facebook.com");
    expect(url.searchParams.get("config_id")).toBe("123");
    expect(url.searchParams.get("client_id")).toBe("870343082807996");
    expect(url.searchParams.has("scope")).toBe(false);
  });
});

describe("Post now: pictures", () => {
  it("creates, uploads, publishes once, and clears the file and caption", async () => {
    const connection = await connectVenue();
    igRoutes();
    const created = await newPost("post", connection);
    expect(created.uploadUrl).toContain("posts/");
    const mediaPath = String(tables.social_posts[0].media_path);
    files.set(mediaPath, 300_000);

    const outcome = await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(outcome).toMatchObject({ ok: true, post: { status: "published", permalink: "https://www.instagram.com/p/abc/" } });

    const container = metaCalls.find((call) => call.url.pathname.endsWith("/17841400000000001/media"))!;
    expect(container.method).toBe("POST");
    expect(container.body?.get("image_url")).toContain("https://storage.test/read/posts/");
    expect(container.body?.get("caption")).toBe("Live Trivia tonight #trivia");
    expect(container.body?.get("access_token")).toBe(PAGE_TOKEN);
    expect(container.body?.get("appsecret_proof")).toBe(metaAppSecretProof(PAGE_TOKEN, SECRET));
    expect(container.url.search).not.toContain(PAGE_TOKEN);
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/media_publish"))).toHaveLength(1);

    expect(tables.social_posts[0]).toMatchObject({ status: "published", caption: "", media_path: null, external_post_id: "media-1" });
    expect(removedFiles).toEqual([mediaPath]);
  });

  it("a double tap makes one container and one post", async () => {
    const connection = await connectVenue();
    igRoutes();
    const created = await newPost("post", connection);
    files.set(String(tables.social_posts[0].media_path), 1000);
    const [a, b] = await Promise.all([
      posts.publishSocialPost({ venueId: "venue-a", postId: created.postId }),
      posts.publishSocialPost({ venueId: "venue-a", postId: created.postId }),
    ]);
    expect([a, b].filter((outcome) => outcome.ok && outcome.post.status === "published")).toHaveLength(1);
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/media"))).toHaveLength(1);
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/media_publish"))).toHaveLength(1);
  });

  it("refuses before calling Meta when the file never arrived, or for another venue", async () => {
    const connection = await connectVenue();
    igRoutes();
    const created = await newPost("post", connection);
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId })).toEqual({ ok: false, code: "not_uploaded" });
    expect(await posts.publishSocialPost({ venueId: "venue-b", postId: created.postId })).toEqual({ ok: false, code: "not_found" });
    expect(metaCalls).toHaveLength(0);
  });

  it("a Story sends media_type STORIES and no caption", async () => {
    const connection = await connectVenue();
    igRoutes();
    const created = await newPost("story", connection);
    files.set(String(tables.social_posts[0].media_path), 1000);
    await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    const container = metaCalls.find((call) => call.url.pathname.endsWith("/media"))!;
    expect(container.body?.get("media_type")).toBe("STORIES");
    expect(container.body?.has("caption")).toBe(false);
  });

  it("a refused token fails the post and asks the partner to reconnect", async () => {
    const connection = await connectVenue();
    metaRoute = () => ({ status: 400, body: { error: { code: 190, message: `bad ${PAGE_TOKEN}` } } });
    const warn = vi.spyOn(console, "warn");
    const created = await newPost("post", connection);
    files.set(String(tables.social_posts[0].media_path), 1000);
    const outcome = await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(outcome).toMatchObject({ ok: true, post: { status: "failed", error: "reconnect" } });
    expect(tables.social_connections[0].status).toBe("reconnect_needed");
    expect(JSON.stringify(warn.mock.calls)).not.toContain(PAGE_TOKEN);
    warn.mockRestore();
  });
});

describe("Post now: Reels", () => {
  it("waits for FINISHED, then publishes once with the end card as cover", async () => {
    const connection = await connectVenue();
    igRoutes(["IN_PROGRESS", "FINISHED"]);
    const created = await newPost("reel", connection);
    files.set(String(tables.social_posts[0].media_path), 11_000_000);

    const first = await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(first).toMatchObject({ ok: true, post: { status: "processing" } });
    const container = metaCalls.find((call) => call.url.pathname.endsWith("/media"))!;
    expect(container.body?.get("media_type")).toBe("REELS");
    expect(container.body?.get("thumb_offset")).toBe("12600");
    expect(container.body?.get("video_url")).toContain(".mp4");

    expect((await posts.pollSocialPost({ venueId: "venue-a", postId: created.postId }))?.status).toBe("processing");
    const [x, y] = await Promise.all([
      posts.pollSocialPost({ venueId: "venue-a", postId: created.postId }),
      posts.pollSocialPost({ venueId: "venue-a", postId: created.postId }),
    ]);
    expect([x?.status, y?.status]).toContain("published");
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/media_publish"))).toHaveLength(1);
  });

  it("an upload abandoned for an hour is failed and its file deleted when Recent posts loads", async () => {
    const connection = await connectVenue();
    await newPost("reel", connection);
    tables.social_posts[0].created_at = new Date(Date.now() - 61 * 60_000).toISOString();
    const list = await posts.listRecentSocialPosts("venue-a", { instagram: connection, facebook: null });
    expect(list[0]).toMatchObject({ status: "failed", error: "upload_missing" });
    expect(removedFiles).toHaveLength(1);
    expect(metaCalls).toHaveLength(0);
  });
});

describe("connections", () => {
  it("never returns the token from a view, and the stored value is encrypted", async () => {
    const connection = await connectVenue();
    expect(JSON.stringify(connections.connectionView(connection))).not.toContain(PAGE_TOKEN);
    expect(String(tables.social_connections[0].access_token_enc)).not.toContain(PAGE_TOKEN);
    expect(connections.connectionView(connection)).toEqual({ state: "connected", username: "thebar" });
  });

  it("Meta's deauthorize removes that login's connections on every venue and cancels open posts", async () => {
    const a = await connectVenue("venue-a", "555");
    await connectVenue("venue-b", "555");
    await newPost("reel", a);
    files.set(String(tables.social_posts[0].media_path), 1000);
    expect(await connections.removeMetaUserSocialConnections("555")).toBe(2);
    expect(tables.social_connections).toHaveLength(0);
    expect(tables.social_posts[0]).toMatchObject({ status: "cancelled", caption: "", media_path: null });
    expect(files.size).toBe(0);
    expect(metaCalls).toHaveLength(0);
  });

  it("disconnect removes the app from the Facebook login only when no venue still uses it", async () => {
    await connectVenue("venue-a", "555");
    await connectVenue("venue-b", "555");
    metaRoute = () => ({ body: { success: true } });
    await connections.disconnectConnection("venue-a", "instagram");
    expect(metaCalls).toHaveLength(0);
    await connections.disconnectConnection("venue-b", "instagram");
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0].method).toBe("DELETE");
    expect(metaCalls[0].url.pathname).toMatch(/\/555\/permissions$/);
    expect(metaCalls[0].url.searchParams.get("access_token")).toBe(`870343082807996|${SECRET}`);
  });

  it("a pending account choice expires after an hour", async () => {
    await connections.saveSocialConnections([
      connections.pendingChoiceRow(
        "instagram",
        { venueId: "venue-a", ownerId: "owner-1", metaUserId: "555", scopes: [] },
        { userToken: "USER-TOKEN", expiresInS: 5_000_000 },
        connections.instagramChoicesOf([
          { pageId: "p1", pageName: "One", pageToken: "t1", instagramId: "1", username: "one" },
          { pageId: "p2", pageName: "Two", pageToken: "t2", instagramId: "2", username: "two" },
        ]),
      ),
    ]);
    expect(JSON.stringify(tables.social_connections[0].account_choices)).not.toContain("t1");
    const pending = await connections.loadConnection("venue-a", "instagram");
    expect(connections.connectionView(pending)).toMatchObject({ state: "choose_account", choices: [{ instagramId: "1" }, { instagramId: "2" }] });
    expect(await connections.loadConnection("venue-a", "instagram", Date.now() + 61 * 60_000)).toBeNull();
    expect(tables.social_connections).toHaveLength(0);
  });
});

describe("OAuth callback route", () => {
  // Every permission granted, as the login asks for them all. The Pages below can't be posted to as a
  // Page (tasks ANALYZE), so these Instagram cases aren't changed by the Facebook side (Phase 10:
  // a Page permission switched off would read `facebook_declined`), except that Instagram saved with no
  // Page to post to reads `facebook_no_page` (Phase 15).
  const callback = async (
    accounts: unknown[],
    permissions = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  ) => {
    metaRoute = (call) => {
      const path = call.url.pathname;
      if (path.endsWith("/oauth/access_token")) {
        return call.url.searchParams.get("grant_type") === "fb_exchange_token"
          ? { body: { access_token: "LONG-USER", expires_in: 5_183_944 } }
          : { body: { access_token: "SHORT-USER", expires_in: 3600 } };
      }
      if (path.endsWith("/me")) return { body: { id: "555" } };
      if (path.endsWith("/me/permissions")) return { body: { data: permissions.map((permission) => ({ permission, status: "granted" })) } };
      if (path.endsWith("/me/accounts")) return { body: { data: accounts } };
      return { status: 404, body: { error: { code: 100 } } };
    };
    const started = createSocialOAuthState({ ownerId: "owner-1", venueId: "venue-a" })!;
    const nonce = started.cookie.split(";")[0].split("=")[1];
    const { GET } = await import("@/app/api/owner/social/meta/callback/route");
    const response = await GET(
      new Request(`https://h.test/api/owner/social/meta/callback?code=abc&state=${encodeURIComponent(started.state)}`, {
        headers: { cookie: `${SOCIAL_OAUTH_COOKIE}=${nonce}` },
      }),
    );
    return new URL(response.headers.get("location") ?? "");
  };
  const page = (id: string, ig: string | null) => ({
    id,
    name: `Page ${id}`,
    access_token: `PT-${id}`,
    tasks: ["ANALYZE"],
    ...(ig ? { instagram_business_account: { id: ig, username: `ig${ig}` } } : {}),
  });

  it("one account: connects with the Page token; the user token is not kept", async () => {
    const location = await callback([page("1", "901"), page("2", null)]);
    expect(location.searchParams.get("socialResult")).toBe("facebook_no_page");
    expect(location.searchParams.get("socialVenue")).toBe("venue-a");
    const row = tables.social_connections[0];
    expect(row).toMatchObject({ status: "active", external_account_id: "901", meta_user_id: "555", page_id: "1" });
    expect(crypto_.decryptSocialToken(String(row.access_token_enc), crypto_.socialTokenContext("venue-a", "instagram", "page_token"))).toBe("PT-1");
    const exchange = metaCalls.find((call) => call.url.searchParams.get("redirect_uri"));
    expect(exchange?.url.searchParams.get("redirect_uri")).toBe("https://h.test/api/owner/social/meta/callback");
  });

  it("several accounts: asks which; none: explains; a missing permission: stores nothing", async () => {
    expect((await callback([page("1", "901"), page("2", "902")])).searchParams.get("socialResult")).toBe("choose_account");
    expect(tables.social_connections[0].status).toBe("choose_account");
    tables.social_connections = [];
    expect((await callback([page("1", null)])).searchParams.get("socialResult")).toBe("no_instagram");
    expect((await callback([page("1", "901")], ["instagram_basic"])).searchParams.get("socialResult")).toBe("missing_permissions");
    expect(tables.social_connections).toHaveLength(0);
  });

  it("a forged or replayed state never exchanges the code", async () => {
    const { GET } = await import("@/app/api/owner/social/meta/callback/route");
    const response = await GET(new Request("https://h.test/api/owner/social/meta/callback?code=abc&state=forged.sig"));
    expect(new URL(response.headers.get("location") ?? "").searchParams.get("socialResult")).toBe("expired");
    expect(metaCalls).toHaveLength(0);
  });
});

describe("flag off", () => {
  it.each([
    ["the env flag is off", () => vi.stubEnv("NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED", "")],
    ["the env flag is on but the Post now box is off the sheet (Phase 8)", () => { postNowSwitch.onSheet = false; }],
  ])("every /api/owner/social route answers 404 when %s", async (_label, seal) => {
    seal();
    const req = (path: string, method = "GET", body?: unknown) =>
      new Request(`https://h.test${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
    const params = { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) };
    const statuses = [
      (await (await import("@/app/api/owner/social/meta/connect/route")).GET(req("/x?venueId=venue-a"))).status,
      (await (await import("@/app/api/owner/social/meta/callback/route")).GET(req("/x"))).status,
      (await (await import("@/app/api/owner/social/status/route")).GET(req("/x?venueId=venue-a"))).status,
      (await (await import("@/app/api/owner/social/instagram/route")).DELETE(req("/x?venueId=venue-a", "DELETE"))).status,
      (await (await import("@/app/api/owner/social/instagram/choose/route")).POST(req("/x", "POST", { venueId: "venue-a" }))).status,
      (await (await import("@/app/api/owner/social/facebook/route")).DELETE(req("/x?venueId=venue-a", "DELETE"))).status,
      (await (await import("@/app/api/owner/social/facebook/choose/route")).POST(req("/x", "POST", { venueId: "venue-a" }))).status,
      (await (await import("@/app/api/owner/social/posts/route")).POST(req("/x", "POST", { venueId: "venue-a" }))).status,
      (await (await import("@/app/api/owner/social/posts/[id]/route")).GET(req("/x?venueId=venue-a"), params)).status,
      (await (await import("@/app/api/owner/social/posts/[id]/publish/route")).POST(req("/x", "POST", { venueId: "venue-a" }), params)).status,
    ];
    expect(statuses).toEqual(Array(10).fill(404));
  });

  it("another venue's id is refused with the flag on", async () => {
    const { GET } = await import("@/app/api/owner/social/status/route");
    expect((await GET(new Request("https://h.test/x?venueId=venue-z"))).status).toBe(403);
  });
});

// ── Phase 6: Facebook Page ─────────────────────────────────────────────────────────────────

const FB_PAGE_TOKEN = "FB-PAGE-TOKEN-456";
const FB_PAGE = "1020304050";

const connectFacebook = async (venueId = "venue-a", metaUserId = "555") => {
  await connections.saveSocialConnections([
    connections.connectionRow(
      "facebook",
      { venueId, ownerId: "owner-1", metaUserId, scopes: ["pages_manage_posts"] },
      connections.facebookConnectedAccount({ pageId: FB_PAGE, pageName: "The Bar", pageToken: FB_PAGE_TOKEN, tasks: ["CREATE_CONTENT"], instagram: null }),
    ),
  ]);
  return (await connections.loadConnection(venueId, "facebook"))!;
};

const newFacebookPost = async (format: "post" | "reel", connection: Awaited<ReturnType<typeof connectFacebook>>) =>
  posts.createSocialPost({
    venueId: connection.venueId,
    ownerId: "owner-1",
    connection,
    format,
    templateId: "live_trivia",
    scheduleId: null,
    prizeIds: [],
    musicId: null,
    caption: "Trivia tonight",
    coverMs: null,
  });

const fbRoutes = (statuses: unknown[] = []) => {
  metaRoute = (call) => {
    const path = call.url.pathname;
    if (path.endsWith(`/${FB_PAGE}/photos`)) return { body: { id: "photo-1", post_id: `${FB_PAGE}_777` } };
    if (path.endsWith(`/${FB_PAGE}/video_reels`)) {
      return call.body?.get("upload_phase") === "start"
        ? { body: { video_id: "88001", upload_url: "https://rupload.facebook.com/video-upload/88001" } }
        : { body: { success: true } };
    }
    if (call.url.hostname === "rupload.facebook.com") return { body: { success: true } };
    if (path.endsWith("/88001")) {
      return {
        body: {
          status: statuses.shift() ?? { video_status: "ready", publishing_phase: { status: "complete", publish_status: "published" } },
          permalink_url: "/reel/88001",
        },
      };
    }
    return { status: 404, body: { error: { code: 100 } } };
  };
};

describe("Phase 6: Facebook Page Post now", () => {
  it("a Post publishes as one Page photo with the caption, and keeps the Facebook permalink", async () => {
    const connection = await connectFacebook();
    fbRoutes();
    const created = await newFacebookPost("post", connection);
    const mediaPath = String(tables.social_posts[0].media_path);
    files.set(mediaPath, 400_000);

    const outcome = await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(outcome).toMatchObject({
      ok: true,
      post: { provider: "facebook", status: "published", permalink: `https://www.facebook.com/${FB_PAGE}_777` },
    });
    const photo = metaCalls.find((call) => call.url.pathname.endsWith(`/${FB_PAGE}/photos`))!;
    expect(photo.method).toBe("POST");
    expect(photo.body?.get("url")).toContain("https://storage.test/read/posts/");
    expect(photo.body?.get("caption")).toBe("Trivia tonight");
    expect(photo.body?.get("published")).toBe("true");
    expect(photo.body?.get("access_token")).toBe(FB_PAGE_TOKEN);
    expect(photo.body?.get("appsecret_proof")).toBe(metaAppSecretProof(FB_PAGE_TOKEN, SECRET));
    expect(tables.social_posts[0]).toMatchObject({ provider: "facebook", status: "published", caption: "", media_path: null });
    expect(removedFiles).toEqual([mediaPath]);
  });

  it("a double tap posts the photo once", async () => {
    const connection = await connectFacebook();
    fbRoutes();
    const created = await newFacebookPost("post", connection);
    files.set(String(tables.social_posts[0].media_path), 1000);
    await Promise.all([
      posts.publishSocialPost({ venueId: "venue-a", postId: created.postId }),
      posts.publishSocialPost({ venueId: "venue-a", postId: created.postId }),
    ]);
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/photos"))).toHaveLength(1);
  });

  it("a photo left mid-publish by a dead request is failed, never sent twice", async () => {
    const connection = await connectFacebook();
    fbRoutes();
    const created = await newFacebookPost("post", connection);
    Object.assign(tables.social_posts[0], { status: "publishing", claimed_at: new Date(Date.now() - 5 * 60_000).toISOString() });
    // Phase 9: it may already be on the Page, so it says "unconfirmed", never a plain "failed".
    expect(await posts.pollSocialPost({ venueId: "venue-a", postId: created.postId })).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(metaCalls).toHaveLength(0);
  });

  it("a Reel: start → hosted upload (token in the header only) → finish → waits → published once", async () => {
    const connection = await connectFacebook();
    fbRoutes([{ video_status: "processing", processing_phase: { status: "in_progress" }, publishing_phase: { status: "not_started" } }]);
    const created = await newFacebookPost("reel", connection);
    files.set(String(tables.social_posts[0].media_path), 11_000_000);

    const first = await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(first).toMatchObject({ ok: true, post: { status: "processing" } });
    expect(tables.social_posts[0].container_id).toBe("88001");

    const upload = metaCalls.find((call) => call.url.hostname === "rupload.facebook.com")!;
    expect(upload.url.pathname).toBe("/video-upload/v26.0/88001");
    expect(upload.url.search).toBe("");
    expect(upload.headers.get("authorization")).toBe(`OAuth ${FB_PAGE_TOKEN}`);
    expect(upload.headers.get("file_url")).toContain(".mp4");
    const finish = metaCalls.find((call) => call.body?.get("upload_phase") === "finish")!;
    expect(finish.body?.get("video_id")).toBe("88001");
    expect(finish.body?.get("video_state")).toBe("PUBLISHED");
    expect(finish.body?.get("description")).toBe("Trivia tonight");

    expect((await posts.pollSocialPost({ venueId: "venue-a", postId: created.postId }))?.status).toBe("processing");
    const [x, y] = await Promise.all([
      posts.pollSocialPost({ venueId: "venue-a", postId: created.postId }),
      posts.pollSocialPost({ venueId: "venue-a", postId: created.postId }),
    ]);
    expect([x?.status, y?.status]).toContain("published");
    expect(tables.social_posts[0]).toMatchObject({ status: "published", permalink: "https://www.facebook.com/reel/88001", external_post_id: "88001" });
    expect(metaCalls.filter((call) => call.body?.get("upload_phase") === "start")).toHaveLength(1);
  });

  it("a Reel Meta reports as an error fails as not accepted; a refused token asks to reconnect", async () => {
    const connection = await connectFacebook();
    fbRoutes([{ video_status: "error" }]);
    const created = await newFacebookPost("reel", connection);
    files.set(String(tables.social_posts[0].media_path), 1000);
    await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(await posts.pollSocialPost({ venueId: "venue-a", postId: created.postId })).toMatchObject({ status: "failed", error: "media_rejected" });

    metaRoute = () => ({ status: 400, body: { error: { code: 190 } } });
    const second = await newFacebookPost("post", connection);
    files.set(String(tables.social_posts.find((row) => row.id === second.postId)!.media_path), 1000);
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: second.postId })).toMatchObject({
      ok: true,
      post: { status: "failed", error: "reconnect" },
    });
    expect(tables.social_connections[0].status).toBe("reconnect_needed");
  });

  it("the Facebook token is its own encrypted slot: an Instagram post can't use it, and the view hides it", async () => {
    const facebook = await connectFacebook();
    expect(JSON.stringify(connections.facebookConnectionView(facebook))).not.toContain(FB_PAGE_TOKEN);
    expect(connections.facebookConnectionView(facebook)).toEqual({ state: "connected", pageName: "The Bar" });
    expect(String(tables.social_connections[0].access_token_enc)).not.toContain(FB_PAGE_TOKEN);
    expect(() =>
      crypto_.decryptSocialToken(String(tables.social_connections[0].access_token_enc), crypto_.socialTokenContext("venue-a", "instagram", "page_token")),
    ).toThrow();
    // No Instagram connection: an Instagram post can't be created against the Facebook row.
    expect(await connections.loadConnection("venue-a", "instagram")).toBeNull();
  });

  it("disconnecting Facebook keeps Instagram and the app; deauthorize removes both", async () => {
    await connectVenue("venue-a", "555");
    await connectFacebook("venue-a", "555");
    metaRoute = () => ({ body: { success: true } });
    await connections.disconnectConnection("venue-a", "facebook");
    expect(tables.social_connections.map((row) => row.provider)).toEqual(["instagram"]);
    expect(metaCalls).toHaveLength(0);
    await connectFacebook("venue-a", "555");
    expect(await connections.removeMetaUserSocialConnections("555")).toBe(2);
    expect(tables.social_connections).toHaveLength(0);
  });

  it("Recent posts lists both providers", async () => {
    const instagram = await connectVenue();
    const facebook = await connectFacebook();
    await newPost("post", instagram);
    await newFacebookPost("post", facebook);
    const list = await posts.listRecentSocialPosts("venue-a", { instagram, facebook });
    expect(list.map((post) => post.provider).sort()).toEqual(["facebook", "instagram"]);
  });

  it("the posts route refuses a Facebook Story and needs a Facebook connection", async () => {
    const { POST } = await import("@/app/api/owner/social/posts/route");
    const body = (extra: Record<string, unknown>) =>
      new Request("https://h.test/api/owner/social/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ venueId: "venue-a", templateId: "live_trivia", caption: "", byteSize: 1000, ...extra }),
      });
    expect((await POST(body({ provider: "facebook", format: "story" }))).status).toBe(400);
    // Phase 20: 31 hashtags is a 400 for Instagram, not for Facebook (which then reaches the connection check).
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect((await POST(body({ provider: "instagram", format: "post", caption: tags }))).status).toBe(400);
    expect((await POST(body({ provider: "facebook", format: "post", caption: tags }))).status).toBe(409);
    expect((await POST(body({ provider: "facebook", format: "post" }))).status).toBe(409);
    await connectFacebook();
    const created = await POST(body({ provider: "facebook", format: "post" }));
    expect(created.status).toBe(200);
    expect(tables.social_posts[0]).toMatchObject({ provider: "facebook", external_account_id: FB_PAGE });
  });

  it("rules: Facebook errors, Reel status and permalinks", () => {
    expect(rules.classifyGraphError(80001, null)).toBe("rate_limit");
    expect(rules.classifyGraphError(100, 1363040)).toBe("media");
    expect(rules.classifyGraphError(324, null)).toBe("media");
    const status = (extra: Partial<Parameters<typeof rules.facebookReelStep>[0]>) =>
      rules.facebookReelStep({ videoStatus: null, uploading: null, processing: null, publishing: null, publishStatus: null, ...extra }, { finishSent: true });
    expect(status({ videoStatus: "processing", publishing: "not_started" })).toBe("wait");
    expect(status({ publishing: "completed" })).toBe("published");
    expect(status({ publishStatus: "published" })).toBe("published");
    expect(status({ processing: "error" })).toBe("failed");
    expect(status({ videoStatus: "expired" })).toBe("expired");
    expect(rules.safeFacebookPermalink("/reel/1")).toBe("https://www.facebook.com/reel/1");
    expect(rules.safeFacebookPermalink("https://evilfacebook.com/x")).toBeNull();
    expect(rules.safeFacebookPermalink("javascript:alert(1)")).toBeNull();
  });
});

describe("Phase 6: one login connects Instagram and the Facebook Page", () => {
  const ALL = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement", "pages_manage_posts"];
  const run = async (accounts: unknown[], permissions = ALL) => {
    metaRoute = (call) => {
      const path = call.url.pathname;
      if (path.endsWith("/oauth/access_token")) return { body: { access_token: "USER", expires_in: 5_000_000 } };
      if (path.endsWith("/me")) return { body: { id: "555" } };
      if (path.endsWith("/me/permissions")) return { body: { data: permissions.map((permission) => ({ permission, status: "granted" })) } };
      if (path.endsWith("/me/accounts")) return { body: { data: accounts } };
      return { status: 404, body: { error: { code: 100 } } };
    };
    const started = createSocialOAuthState({ ownerId: "owner-1", venueId: "venue-a" })!;
    const nonce = started.cookie.split(";")[0].split("=")[1];
    const { GET } = await import("@/app/api/owner/social/meta/callback/route");
    const response = await GET(
      new Request(`https://h.test/api/owner/social/meta/callback?code=abc&state=${encodeURIComponent(started.state)}`, {
        headers: { cookie: `${SOCIAL_OAUTH_COOKIE}=${nonce}` },
      }),
    );
    return new URL(response.headers.get("location") ?? "").searchParams.get("socialResult");
  };
  const page = (id: string, ig: string | null, tasks: string[] = ["CREATE_CONTENT", "MANAGE"]) => ({
    id,
    name: `Page ${id}`,
    access_token: `PT-${id}`,
    tasks,
    ...(ig ? { instagram_business_account: { id: ig, username: `ig${ig}` } } : {}),
  });
  const provider = (name: string) => tables.social_connections.find((row) => row.provider === name);

  it("one Page with Instagram: both connect, each with the Page token in its own slot", async () => {
    expect(await run([page("11", "901")])).toBe("connected");
    expect(provider("instagram")).toMatchObject({ status: "active", external_account_id: "901" });
    expect(provider("facebook")).toMatchObject({ status: "active", page_id: "11", external_account_id: "11", display_name: "Page 11" });
    const sealed = String(provider("facebook")!.access_token_enc);
    expect(crypto_.decryptSocialToken(sealed, crypto_.socialTokenContext("venue-a", "facebook", "page_token"))).toBe("PT-11");
  });

  it("several Pages: asks which Page (the user token kept encrypted for that choice), then connects the pick", async () => {
    expect(await run([page("11", "901"), page("12", null), page("13", null, ["ANALYZE"])])).toBe("choose_account");
    expect(provider("instagram")).toMatchObject({ status: "active" });
    const pending = await connections.loadConnection("venue-a", "facebook");
    expect(connections.facebookConnectionView(pending)).toEqual({
      state: "choose_page",
      choices: [
        { pageId: "11", pageName: "Page 11" },
        { pageId: "12", pageName: "Page 12" },
      ],
    });
    expect(JSON.stringify(provider("facebook")!.account_choices)).not.toContain("PT-");
    expect(await connections.chooseConnection("facebook", "venue-a", "owner-1", "13")).toBe("not_found");
    expect(await connections.chooseConnection("facebook", "venue-a", "owner-1", "12")).toBe("connected");
    expect(provider("facebook")).toMatchObject({ status: "active", page_id: "12" });
  });

  it("a Page with no Instagram: Facebook only; Page permission switched off: Instagram only, and says so", async () => {
    expect(await run([page("11", null)])).toBe("facebook_only");
    expect(provider("instagram")).toBeUndefined();
    expect(provider("facebook")).toMatchObject({ status: "active" });
    tables.social_connections = [];
    // Phase 10: was plain `connected`; now names the switched-off Page permission.
    expect(await run([page("11", "901")], ALL.filter((permission) => permission !== "pages_manage_posts"))).toBe("facebook_declined");
    expect(provider("facebook")).toBeUndefined();
  });

  // ── Phase 10: the right reason, one save (plan §5.4) ──

  const NO_INSTAGRAM = ALL.filter((permission) => !permission.startsWith("instagram_"));
  const NO_PAGE_POSTS = ALL.filter((permission) => permission !== "pages_manage_posts");

  it.each([
    ["both switched off", "missing_permissions", ["pages_show_list"], [page("11", "901")]],
    ["nothing linked on either", "no_instagram", ALL, [page("11", null, ["ANALYZE"])]],
    ["Instagram off, no Page to post to", "instagram_declined_no_page", NO_INSTAGRAM, [page("11", "901", ["ANALYZE"])]],
    ["no Instagram linked, Page posts off", "facebook_declined_no_instagram", NO_PAGE_POSTS, [page("11", null)]],
    ["several Instagram accounts, one Page", "choose_account", ALL, [page("11", "901"), page("12", "902", ["ANALYZE"])]],
    ["one Instagram account, several Pages", "choose_account", ALL, [page("11", "901"), page("12", null)]],
    ["both saved", "connected", ALL, [page("11", "901")]],
    ["Instagram switched off, Page saved", "instagram_declined", NO_INSTAGRAM, [page("11", "901")]],
    ["no Instagram linked, Page saved", "facebook_only", ALL, [page("11", null)]],
    ["Instagram saved, Page posts switched off", "facebook_declined", NO_PAGE_POSTS, [page("11", "901")]],
    // Phase 15: was plain `connected`, which gave the partner no reason the Page didn't connect.
    ["Instagram saved, no Page to post to", "facebook_no_page", ALL, [page("11", "901", ["ANALYZE"])]],
  ] as const)("callback result table: %s → %s", async (_name, expected, permissions, accounts) => {
    expect(await run([...accounts], [...permissions])).toBe(expected);
  });

  it("the result rules cover all 16 outcome pairs exactly as the plan's table says", () => {
    const outcomes = ["saved", "choose", "not_granted", "none_linked"] as const;
    const expected = (ig: (typeof outcomes)[number], fb: (typeof outcomes)[number]) => {
      if (ig === "not_granted" && fb === "not_granted") return "missing_permissions";
      if (ig === "choose" || fb === "choose") return "choose_account";
      if (ig === "saved" && fb === "saved") return "connected";
      if (ig === "not_granted" && fb === "saved") return "instagram_declined";
      if (ig === "none_linked" && fb === "saved") return "facebook_only";
      if (ig === "saved" && fb === "not_granted") return "facebook_declined";
      if (ig === "saved" && fb === "none_linked") return "facebook_no_page";
      if (ig === "not_granted") return "instagram_declined_no_page"; // Phase 20 (third review #4)
      if (fb === "not_granted") return "facebook_declined_no_instagram";
      return "no_instagram";
    };
    for (const ig of outcomes) for (const fb of outcomes) expect(rules.socialConnectResult(ig, fb), `${ig}/${fb}`).toBe(expected(ig, fb));
    expect([rules.socialConnectOutcome(false, 3), rules.socialConnectOutcome(true, 0), rules.socialConnectOutcome(true, 1), rules.socialConnectOutcome(true, 2)]).toEqual([
      "not_granted",
      "none_linked",
      "saved",
      "choose",
    ]);
  });

  it("every connect result has copy for the sheet", async () => {
    const { SOCIAL_POST_COPY } = await import("@/lib/promo/promoCopy");
    expect(SOCIAL_POST_COPY.results.instagram_declined).toMatch(/leave Instagram on/);
    expect(SOCIAL_POST_COPY.results.facebook_declined).toMatch(/Instagram is connected/);
    expect(SOCIAL_POST_COPY.results.facebook_no_page).toMatch(/^Instagram is connected\. We didn't find a Facebook Page you can post to\./);
  });

  it("Instagram switched off at reconnect: the earlier active Instagram row from the same Facebook user becomes Reconnect", async () => {
    await connectVenue("venue-a", "555");
    expect(await run([page("11", "901")], NO_INSTAGRAM)).toBe("instagram_declined");
    expect(provider("instagram")).toMatchObject({ status: "reconnect_needed", last_error: "declined at reconnect" });
    expect(provider("facebook")).toMatchObject({ status: "active", page_id: "11" });
  });

  it("a row made by another Facebook user, or on another venue, is left alone", async () => {
    await connectVenue("venue-a", "999");
    await connectVenue("venue-b", "555");
    expect(await run([page("11", "901")], NO_INSTAGRAM)).toBe("instagram_declined");
    expect(tables.social_connections.filter((row) => row.provider === "instagram").map((row) => row.status)).toEqual(["active", "active"]);
  });

  it("both switched off: nothing saved, and the same user's earlier rows become Reconnect", async () => {
    await connectVenue("venue-a", "555");
    dbWrites.length = 0;
    expect(await run([page("11", "901")], ["pages_show_list"])).toBe("missing_permissions");
    expect(provider("instagram")).toMatchObject({ status: "reconnect_needed" });
    expect(dbWrites.filter((write) => write.op === "upsert")).toHaveLength(0);
  });

  it("both rows go in ONE upsert; if it fails the partner reads error and nothing changed", async () => {
    await connectVenue("venue-a", "555");
    const before = structuredClone(tables.social_connections);
    dbWrites.length = 0;
    dbFaults.upsert = true;
    expect(await run([page("11", "901")])).toBe("error");
    expect(dbWrites).toHaveLength(1);
    expect(dbWrites[0]).toMatchObject({ table: "social_connections", op: "upsert" });
    expect(dbWrites[0].rows.map((row) => row.provider)).toEqual(["instagram", "facebook"]);
    expect(new Set(dbWrites[0].rows.map((row) => Object.keys(row).sort().join(","))).size).toBe(1);
    expect(tables.social_connections).toEqual(before);
  });

  it("the same login on success: one upsert with both rows, both active", async () => {
    expect(await run([page("11", "901")])).toBe("connected");
    expect(dbWrites.filter((write) => write.op !== "select")).toHaveLength(1);
    expect(dbWrites[0].rows).toHaveLength(2);
  });

  // ── Phase 15: no Page to post to, stale rows (plan §5.9) ──

  const connectFacebookRow = async (venueId = "venue-a", metaUserId = "555") =>
    connections.saveSocialConnections([
      connections.connectionRow(
        "facebook",
        { venueId, ownerId: "owner-1", metaUserId, scopes: ALL },
        connections.facebookConnectedAccount({ pageId: "old-page", pageName: "Old Page", pageToken: "PT-OLD", tasks: ["CREATE_CONTENT"], instagram: null }),
      ),
    ]);
  const updates = () => dbWrites.filter((write) => write.op === "update");

  it("rules: a gone row is each not_granted / none_linked provider, with its reason; saved / choose are never gone", () => {
    expect(rules.socialGoneConnections({ instagram: "saved", facebook: "none_linked" })).toEqual([{ provider: "facebook", reason: "no account at reconnect" }]);
    expect(rules.socialGoneConnections({ instagram: "not_granted", facebook: "none_linked" })).toEqual([
      { provider: "instagram", reason: "declined at reconnect" },
      { provider: "facebook", reason: "no account at reconnect" },
    ]);
    expect(rules.socialGoneConnections({ instagram: "saved", facebook: "choose" })).toEqual([]);
  });

  it("Instagram granted but no longer linked: the same user's earlier active Instagram row becomes Reconnect", async () => {
    await connectVenue("venue-a", "555");
    expect(await run([page("11", null)])).toBe("facebook_only");
    expect(provider("instagram")).toMatchObject({ status: "reconnect_needed", last_error: "no account at reconnect" });
    expect(provider("facebook")).toMatchObject({ status: "active", page_id: "11" });
  });

  it("no Page to post to: the same user's earlier active Facebook row becomes Reconnect, Instagram is replaced", async () => {
    await connectFacebookRow("venue-a", "555");
    expect(await run([page("11", "901", ["ANALYZE"])])).toBe("facebook_no_page");
    expect(provider("facebook")).toMatchObject({ status: "reconnect_needed", last_error: "no account at reconnect", page_id: "old-page" });
    expect(provider("instagram")).toMatchObject({ status: "active", external_account_id: "901" });
  });

  it("none_linked never touches a row made by another Facebook user, or on another venue", async () => {
    await connectFacebookRow("venue-a", "999");
    await connectFacebookRow("venue-b", "555");
    expect(await run([page("11", "901", ["ANALYZE"])])).toBe("facebook_no_page");
    expect(tables.social_connections.filter((row) => row.provider === "facebook").map((row) => row.status)).toEqual(["active", "active"]);
  });

  it("both saved: no mark is sent at all (the upsert replaces both rows)", async () => {
    await connectVenue("venue-a", "555");
    dbWrites.length = 0;
    expect(await run([page("11", "901")])).toBe("connected");
    expect(updates()).toHaveLength(0);
  });

  it("one declined and one with nothing linked: both rows marked, one update per reason", async () => {
    await connectVenue("venue-a", "555");
    await connectFacebookRow("venue-a", "555");
    dbWrites.length = 0;
    expect(await run([page("11", "901", ["ANALYZE"])], NO_INSTAGRAM)).toBe("instagram_declined_no_page");
    expect(provider("instagram")).toMatchObject({ status: "reconnect_needed", last_error: "declined at reconnect" });
    expect(provider("facebook")).toMatchObject({ status: "reconnect_needed", last_error: "no account at reconnect" });
    expect(updates()).toHaveLength(2);
  });

  it("a failing mark is logged and the result stands", async () => {
    await connectFacebookRow("venue-a", "555");
    dbFaults.update = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(await run([page("11", "901", ["ANALYZE"])])).toBe("facebook_no_page");
      expect(warn).toHaveBeenCalledWith("[SocialMeta] gone-mark-failed", expect.objectContaining({ venueId: "venue-a" }));
      expect(provider("facebook")).toMatchObject({ status: "active" });
      expect(provider("instagram")).toMatchObject({ status: "active" });
    } finally {
      warn.mockRestore();
    }
  });

  it("an encryption failure on the second row writes nothing at all", async () => {
    await connectVenue("venue-a", "555");
    const before = structuredClone(tables.social_connections);
    dbWrites.length = 0;
    cryptoSwitch.failOn = "social:facebook:";
    expect(await run([page("11", "901")], NO_INSTAGRAM.concat(["instagram_basic", "instagram_content_publish"]))).toBe("error");
    expect(dbWrites).toHaveLength(0);
    expect(tables.social_connections).toEqual(before);
  });
});

// ── Phase 9: no false "failed", no stale writes (plan §5.3) ───────────────────────────────────

describe("Phase 9: fenced claims, renewed leases, and unsure answers", () => {
  /** A claimed_at no request of ours wrote: another request has taken the post over. */
  const TAKEN = "2099-01-01T00:00:00.000Z";
  const row = () => tables.social_posts[0];
  const count = (match: (call: MetaCall) => boolean) => metaCalls.filter(match).length;
  const isFinish = (call: MetaCall) => call.body?.get("upload_phase") === "finish";
  const isUpload = (call: MetaCall) => call.url.hostname === "rupload.facebook.com";
  const isMediaPublish = (call: MetaCall) => call.url.pathname.endsWith("/media_publish");
  const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const poll = (postId: string) => posts.pollSocialPost({ venueId: "venue-a", postId });
  const hourAgo = () => new Date(Date.now() - 61 * 60_000).toISOString();

  /** A Facebook Reel whose answers the test steers: `upload` / `finish` answers, and the status Meta reports. */
  const steeredReel = async (answers: { upload?: () => MetaAnswer; finish?: () => MetaAnswer } = {}) => {
    const connection = await connectFacebook();
    const created = await newFacebookPost("reel", connection);
    const mediaPath = String(row().media_path);
    files.set(mediaPath, 11_000_000);
    const state: { status: unknown } = {
      status: { video_status: "processing", uploading_phase: { status: "complete" }, processing_phase: { status: "in_progress" }, publishing_phase: { status: "not_started" } },
    };
    metaRoute = (call) => {
      if (call.body?.get("upload_phase") === "start") return { body: { video_id: "88001" } };
      if (isUpload(call)) return answers.upload?.() ?? { body: { success: true } };
      if (isFinish(call)) return answers.finish?.() ?? { body: { success: true } };
      if (call.url.pathname.endsWith("/88001")) return { body: { status: state.status, permalink_url: "/reel/88001" } };
      return { status: 404, body: { error: { code: 100 } } };
    };
    return { connection, postId: created.postId, mediaPath, state };
  };
  const PUBLISHED = { video_status: "ready", uploading_phase: { status: "complete" }, publishing_phase: { status: "complete", publish_status: "published" } };

  it("a takeover mid-upload: the first request sends no finish, and its writes match nothing (the file stays)", async () => {
    const warn = quiet();
    const reel = await steeredReel({
      upload: () => {
        Object.assign(row(), { claimed_at: TAKEN });
        return { body: { success: true } };
      },
    });
    const outcome = await posts.publishSocialPost({ venueId: "venue-a", postId: reel.postId });
    expect(outcome).toMatchObject({ ok: true, post: { status: "publishing" } });
    expect(count(isFinish)).toBe(0);
    expect(row()).toMatchObject({ status: "publishing", claimed_at: TAKEN, external_post_id: null, error: null, media_path: reel.mediaPath });
    expect(files.has(reel.mediaPath)).toBe(true);
    expect(removedFiles).toEqual([]);
    expect(JSON.stringify(warn.mock.calls)).toContain("lost-claim");
    warn.mockRestore();
  });

  it("a refusal that arrives after a takeover doesn't fail the post or delete its file", async () => {
    const warn = quiet();
    const reel = await steeredReel({
      upload: () => {
        Object.assign(row(), { claimed_at: TAKEN });
        return { status: 400, body: { error: { code: 100 } } };
      },
    });
    await posts.publishSocialPost({ venueId: "venue-a", postId: reel.postId });
    expect(row()).toMatchObject({ status: "publishing", claimed_at: TAKEN, error: null, media_path: reel.mediaPath });
    expect(removedFiles).toEqual([]);
    expect(count(isFinish)).toBe(0);
    warn.mockRestore();
  });

  it("a lost video-id save stops before the upload", async () => {
    const warn = quiet();
    const connection = await connectFacebook();
    const created = await newFacebookPost("reel", connection);
    files.set(String(row().media_path), 11_000_000);
    metaRoute = (call) => {
      if (call.body?.get("upload_phase") === "start") {
        Object.assign(row(), { claimed_at: TAKEN });
        return { body: { video_id: "88001" } };
      }
      return { body: { success: true } };
    };
    await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(count(isUpload)).toBe(0);
    expect(row()).toMatchObject({ status: "publishing", container_id: null, claimed_at: TAKEN });
    warn.mockRestore();
  });

  it("Instagram: a lost container-id save stops before media_publish", async () => {
    const warn = quiet();
    const connection = await connectVenue();
    const created = await newPost("post", connection);
    files.set(String(row().media_path), 1000);
    metaRoute = (call) => {
      if (call.url.pathname.endsWith("/media")) {
        Object.assign(row(), { claimed_at: TAKEN });
        return { body: { id: "container-1" } };
      }
      return { body: { id: "media-1" } };
    };
    await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(count(isMediaPublish)).toBe(0);
    expect(row()).toMatchObject({ status: "publishing", container_id: null });
    warn.mockRestore();
  });

  it("the upload gets no answer: processing with its file; finish goes out once, after Meta shows the whole upload", async () => {
    const warn = quiet();
    const reel = await steeredReel({ upload: () => ({ network: true }) });
    reel.state.status = { video_status: "uploading", uploading_phase: { status: "in_progress", bytes_transfered: 50_002 }, publishing_phase: { status: "not_started" } };

    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: reel.postId })).toMatchObject({ ok: true, post: { status: "processing" } });
    expect(row()).toMatchObject({ status: "processing", claimed_at: null, container_id: "88001", external_post_id: null, media_path: reel.mediaPath });
    expect(count(isFinish)).toBe(0);

    // Meta is still fetching the file: wait. Never a second upload.
    expect((await poll(reel.postId))?.status).toBe("processing");
    expect(count(isUpload)).toBe(1);
    expect(count(isFinish)).toBe(0);

    // The whole file reached Meta: the first and only finish goes out, with the caption.
    reel.state.status = { video_status: "upload_complete", uploading_phase: { status: "complete" }, processing_phase: { status: "not_started" }, publishing_phase: { status: "not_started" } };
    expect((await poll(reel.postId))?.status).toBe("processing");
    expect(count(isFinish)).toBe(1);
    expect(metaCalls.find(isFinish)?.body?.get("description")).toBe("Trivia tonight");
    expect(row()).toMatchObject({ status: "processing", external_post_id: "88001" });

    // Meta still shows "not started" while it processes: never a second finish.
    expect((await poll(reel.postId))?.status).toBe("processing");
    expect(count(isFinish)).toBe(1);

    reel.state.status = PUBLISHED;
    expect(await poll(reel.postId)).toMatchObject({ status: "published", permalink: "https://www.facebook.com/reel/88001" });
    expect([count(isUpload), count(isFinish)]).toEqual([1, 1]);
    expect(removedFiles).toEqual([reel.mediaPath]);
    warn.mockRestore();
  });

  it("an upload Meta never completes ends as expired after the hour: its finish was never sent", async () => {
    const warn = quiet();
    const reel = await steeredReel({ upload: () => ({ network: true }) });
    reel.state.status = { video_status: "uploading", uploading_phase: { status: "in_progress" }, publishing_phase: { status: "not_started" } };
    await posts.publishSocialPost({ venueId: "venue-a", postId: reel.postId });
    row().created_at = hourAgo();
    expect(await poll(reel.postId)).toMatchObject({ status: "failed", error: "expired" });
    expect(count(isFinish)).toBe(0);
    expect(removedFiles).toEqual([reel.mediaPath]);
    warn.mockRestore();
  });

  it("finish gets no answer: processing; Meta then reports it published, and finish was sent once", async () => {
    const warn = quiet();
    const reel = await steeredReel({ finish: () => ({ network: true }) });
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: reel.postId })).toMatchObject({ ok: true, post: { status: "processing" } });
    expect(row()).toMatchObject({ status: "processing", claimed_at: null, external_post_id: "88001", error: null, media_path: reel.mediaPath });
    expect(files.has(reel.mediaPath)).toBe(true);

    expect((await poll(reel.postId))?.status).toBe("processing");
    reel.state.status = PUBLISHED;
    expect(await poll(reel.postId)).toMatchObject({ status: "published" });
    expect(count(isFinish)).toBe(1);
    warn.mockRestore();
  });

  it("finish gets no answer and Meta can't be asked: it waits, then is unconfirmed after the hour, never failed", async () => {
    const warn = quiet();
    const reel = await steeredReel({ finish: () => ({ status: 503, body: "<html>unavailable</html>" }) });
    await posts.publishSocialPost({ venueId: "venue-a", postId: reel.postId });
    expect(row()).toMatchObject({ status: "processing", external_post_id: "88001" });

    // The token is refused on the status read: the connection is flagged, the Reel keeps waiting.
    metaRoute = () => ({ status: 400, body: { error: { code: 190 } } });
    expect((await poll(reel.postId))?.status).toBe("processing");
    expect(tables.social_connections[0].status).toBe("reconnect_needed");
    // Meta can't be asked now (the connection needs a reconnect): still waiting, no Graph call.
    const before = metaCalls.length;
    expect((await poll(reel.postId))?.status).toBe("processing");
    expect(metaCalls).toHaveLength(before);

    row().created_at = hourAgo();
    expect(await poll(reel.postId)).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(count(isFinish)).toBe(1);
    warn.mockRestore();
  });

  it("past the hour, Meta's own answer still wins: a published Reel is marked published", async () => {
    const reel = await steeredReel();
    await posts.publishSocialPost({ venueId: "venue-a", postId: reel.postId });
    row().created_at = hourAgo();
    reel.state.status = PUBLISHED;
    expect(await poll(reel.postId)).toMatchObject({ status: "published", permalink: "https://www.facebook.com/reel/88001" });
  });

  it.each<[string, MetaAnswer]>([
    ["no answer", { network: true }],
    ["a cut-off 200", { cutOff: true }],
    ["a 502 with no Graph error", { status: 502, body: "<html>bad gateway</html>" }],
    ["Graph's 'unknown error' (code 1)", { status: 500, body: { error: { code: 1 } } }],
  ])("Instagram: media_publish with %s → processing; the container says PUBLISHED → published, media_publish sent once", async (_label, answer) => {
    const warn = quiet();
    const connection = await connectVenue();
    const container = { status: "FINISHED" };
    metaRoute = (call) => {
      if (call.url.pathname.endsWith("/media")) return { body: { id: "container-1" } };
      if (isMediaPublish(call)) return answer;
      if (call.url.pathname.endsWith("/container-1")) return { body: { status_code: container.status } };
      return { status: 404, body: { error: { code: 100 } } };
    };
    const created = await newPost("post", connection);
    const mediaPath = String(row().media_path);
    files.set(mediaPath, 1000);

    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId })).toMatchObject({
      ok: true,
      post: { status: "processing", error: null },
    });
    expect(row()).toMatchObject({ status: "processing", container_id: "container-1", claimed_at: null, media_path: mediaPath });
    expect(files.has(mediaPath)).toBe(true);

    container.status = "PUBLISHED";
    expect(await poll(created.postId)).toMatchObject({ status: "published" });
    expect(count(isMediaPublish)).toBe(1);
    expect(removedFiles).toEqual([mediaPath]);
    warn.mockRestore();
  });

  it("Instagram: a clear media_publish refusal still fails the post", async () => {
    const warn = quiet();
    const connection = await connectVenue();
    metaRoute = (call) =>
      call.url.pathname.endsWith("/media") ? { body: { id: "container-1" } } : { status: 400, body: { error: { code: 9, error_subcode: 2207042 } } };
    const created = await newPost("post", connection);
    files.set(String(row().media_path), 1000);
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId })).toMatchObject({
      ok: true,
      post: { status: "failed", error: "rate_limit" },
    });
    warn.mockRestore();
  });

  it("a Facebook photo with no answer is failed as unconfirmed and never retried", async () => {
    const warn = quiet();
    const connection = await connectFacebook();
    metaRoute = () => ({ network: true });
    const created = await newFacebookPost("post", connection);
    files.set(String(row().media_path), 1000);
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId })).toMatchObject({
      ok: true,
      post: { status: "failed", error: "unconfirmed" },
    });
    expect(await poll(created.postId)).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(count((call) => call.url.pathname.endsWith("/photos"))).toBe(1);
    warn.mockRestore();
  });

  it("a stale Reel with no video id can't be on the Page: plain failed", async () => {
    const connection = await connectFacebook();
    const created = await newFacebookPost("reel", connection);
    Object.assign(row(), { status: "publishing", claimed_at: new Date(Date.now() - 5 * 60_000).toISOString() });
    expect(await poll(created.postId)).toMatchObject({ status: "failed", error: "failed" });
    expect(metaCalls).toHaveLength(0);
  });

  it("the lease is 150 s: a post claimed 100 s ago is left alone, one claimed 160 s ago is taken over", async () => {
    const connection = await connectVenue();
    igRoutes(["IN_PROGRESS", "IN_PROGRESS"]);
    const created = await newPost("reel", connection);
    Object.assign(row(), { status: "publishing", container_id: "container-1", claimed_at: new Date(Date.now() - 100_000).toISOString() });
    expect((await poll(created.postId))?.status).toBe("publishing");
    expect(metaCalls).toHaveLength(0);
    row().claimed_at = new Date(Date.now() - 160_000).toISOString();
    expect(await poll(created.postId)).toMatchObject({ status: "processing" });
    expect(row().claimed_at).toBeNull();
  });

  it("rules: which answers are unsure, and when a Reel's first finish is sent", () => {
    const error = (kind: Parameters<typeof rules.postErrorFor>[0], code: number | null, httpStatus: number | null) => ({ kind, code, subcode: null, httpStatus });
    expect(rules.isUnsure(error("network", null, null))).toBe(true);
    expect(rules.isUnsure(error("network", null, 200))).toBe(true);
    expect(rules.isUnsure(error("other", null, 502))).toBe(true);
    expect(rules.isUnsure(error("other", null, 200))).toBe(true);
    expect(rules.isUnsure(error("other", 1, 500))).toBe(true);
    expect(rules.isUnsure(error("other", 2, 503))).toBe(true);
    expect(rules.isUnsure(error("other", null, 404))).toBe(false);
    expect(rules.isUnsure(error("other", 100, 400))).toBe(false);
    expect(rules.isUnsure(error("other", 100, 500))).toBe(false);
    expect(rules.isUnsure(error("token", 190, 400))).toBe(false);
    expect(rules.isUnsure(error("rate_limit", 4, 400))).toBe(false);
    expect(rules.SOCIAL_PUBLISH_LEASE_MS).toBe(150_000);

    const step = (extra: Partial<Parameters<typeof rules.facebookReelStep>[0]>, finishSent: boolean) =>
      rules.facebookReelStep({ videoStatus: null, uploading: null, processing: null, publishing: null, publishStatus: null, ...extra }, { finishSent });
    expect(step({ videoStatus: "upload_complete", uploading: "complete", publishing: "not_started" }, false)).toBe("send_finish");
    expect(step({ uploading: "completed" }, false)).toBe("send_finish");
    expect(step({ videoStatus: "upload_complete", uploading: "complete", publishing: "not_started" }, true)).toBe("wait");
    expect(step({ videoStatus: "uploading", uploading: "in_progress" }, false)).toBe("wait");
    expect(step({ uploading: "complete", publishing: "in_progress" }, false)).toBe("wait");
    expect(step({ publishStatus: "published" }, false)).toBe("published");
    expect(step({ videoStatus: "upload_failed" }, false)).toBe("failed");
  });
});

describe("Phase 14: Instagram media_publish at most once (plan §5.8)", () => {
  const row = () => tables.social_posts[0];
  const isMediaPublish = (call: MetaCall) => call.url.pathname.endsWith("/media_publish");
  const isFinish = (call: MetaCall) => call.body?.get("upload_phase") === "finish";
  const publishes = () => metaCalls.filter(isMediaPublish).length;
  const poll = (postId: string) => posts.pollSocialPost({ venueId: "venue-a", postId });
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);
  afterEach(() => vi.restoreAllMocks());

  /** An Instagram picture whose media_publish answer and container status the test steers. */
  const steered = async (publish: () => MetaAnswer) => {
    const connection = await connectVenue();
    const container = { status: "FINISHED" };
    const answers = { publish };
    metaRoute = (call) => {
      if (call.url.pathname.endsWith("/media")) return { body: { id: "container-1" } };
      if (isMediaPublish(call)) return answers.publish();
      if (call.url.pathname.endsWith("/container-1")) return { body: { status_code: container.status } };
      if (call.url.pathname.endsWith("/media-1")) return { body: { permalink: "https://www.instagram.com/p/abc/" } };
      return { status: 404, body: { error: { code: 100 } } };
    };
    const created = await newPost("post", connection);
    const mediaPath = String(row().media_path);
    files.set(mediaPath, 1000);
    return { connection, postId: created.postId, mediaPath, container, answers };
  };
  /** media_publish sent, its answer lost: the post is back in "processing" with the mark. */
  const unsurePublish = async () => {
    const post = await steered(() => ({ network: true }));
    await posts.publishSocialPost({ venueId: "venue-a", postId: post.postId });
    return post;
  };
  /** A post some earlier request marked (media_publish sent) and handed back to the poll. */
  const markedReel = async (extra: Row = {}) => {
    const created = await newPost("reel", await connectVenue());
    files.set(String(row().media_path), 1000);
    Object.assign(row(), { status: "processing", container_id: "container-1", external_post_id: "container-1", updated_at: minutesAgo(1), ...extra });
    return created.postId;
  };

  it("media_publish gets no answer: processing with the mark; polls that still read FINISHED never send a second one", async () => {
    quiet();
    const post = await unsurePublish();
    expect(row()).toMatchObject({ status: "processing", claimed_at: null, container_id: "container-1", external_post_id: "container-1", media_path: post.mediaPath });
    const sentAt = row().updated_at;
    expect(await poll(post.postId)).toMatchObject({ status: "processing", error: null });
    expect(await poll(post.postId)).toMatchObject({ status: "processing", error: null });
    expect(publishes()).toBe(1);
    // A wait writes nothing, so updated_at is still the time media_publish was sent.
    expect(row().updated_at).toBe(sentAt);
    expect(files.has(post.mediaPath)).toBe(true);
  });

  it("still FINISHED once SOCIAL_INSTAGRAM_CONFIRM_MS has passed since the send: unconfirmed, media_publish sent once in all", async () => {
    quiet();
    const post = await unsurePublish();
    row().updated_at = new Date(Date.now() - rules.SOCIAL_INSTAGRAM_CONFIRM_MS + 30_000).toISOString();
    expect((await poll(post.postId))?.status).toBe("processing");
    row().updated_at = new Date(Date.now() - rules.SOCIAL_INSTAGRAM_CONFIRM_MS - 1_000).toISOString();
    expect(await poll(post.postId)).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(row()).toMatchObject({ external_post_id: null, media_path: null, caption: "" });
    expect(removedFiles).toEqual([post.mediaPath]);
    expect(publishes()).toBe(1);
  });

  it("the container then reads PUBLISHED: published, and the mark (a container id, not a media id) is cleared", async () => {
    quiet();
    const post = await unsurePublish();
    post.container.status = "PUBLISHED";
    expect(await poll(post.postId)).toMatchObject({ status: "published", error: null, permalink: null });
    expect(row()).toMatchObject({ status: "published", external_post_id: null, media_path: null });
    expect(publishes()).toBe(1);
  });

  it("Meta's clear 'not ready' clears the mark: the next FINISHED publishes, once", async () => {
    quiet();
    const post = await steered(() => ({ status: 400, body: { error: { code: 9007, error_subcode: 2207027 } } }));
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: post.postId })).toMatchObject({
      ok: true,
      post: { status: "processing" },
    });
    expect(row()).toMatchObject({ status: "processing", container_id: "container-1", external_post_id: null });
    post.answers.publish = () => ({ body: { id: "media-1" } });
    expect(await poll(post.postId)).toMatchObject({ status: "published", permalink: "https://www.instagram.com/p/abc/" });
    expect(row().external_post_id).toBe("media-1");
    // The refused one (nothing went out) and the one that did.
    expect(publishes()).toBe(2);
  });

  it("a clear refusal after the mark fails with its own reason and leaves no mark behind", async () => {
    quiet();
    const post = await steered(() => ({ status: 400, body: { error: { code: 9, error_subcode: 2207042 } } }));
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: post.postId })).toMatchObject({
      ok: true,
      post: { status: "failed", error: "rate_limit" },
    });
    expect(row().external_post_id).toBeNull();
  });

  it("a stale 'publishing' left after the mark (its request died mid-call) is released with its send time, never republished", async () => {
    quiet();
    igRoutes();
    const sentAt = minutesAgo(3);
    const postId = await markedReel({ status: "publishing", claimed_at: sentAt, updated_at: sentAt });
    expect(await poll(postId)).toMatchObject({ status: "processing", error: null });
    expect(row()).toMatchObject({ status: "processing", claimed_at: null, external_post_id: "container-1", updated_at: sentAt });
    expect(publishes()).toBe(0);

    // Already past the window when it's found: straight to unconfirmed, still no media_publish.
    Object.assign(row(), { status: "publishing", claimed_at: minutesAgo(11), updated_at: minutesAgo(11) });
    expect(await poll(postId)).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(publishes()).toBe(0);
  });

  it("a poll that read the post unmarked never publishes it if another request sent media_publish meanwhile", async () => {
    quiet();
    const created = await newPost("reel", await connectVenue());
    files.set(String(row().media_path), 1000);
    Object.assign(row(), { status: "processing", container_id: "container-1" });
    const SENT = minutesAgo(0.2);
    metaRoute = (call) => {
      if (call.url.pathname.endsWith("/container-1")) {
        // While this poll waits on Meta, another request claims the post, sends media_publish, loses the
        // answer and hands it back to "processing" with the mark.
        Object.assign(row(), { external_post_id: "container-1", updated_at: SENT });
        return { body: { status_code: "FINISHED" } };
      }
      return { body: { id: "media-1" } };
    };
    expect(await poll(created.postId)).toMatchObject({ status: "processing", error: null });
    expect(publishes()).toBe(0);
    expect(row()).toMatchObject({ status: "processing", claimed_at: null, external_post_id: "container-1" });
    // This poll's claim moved updated_at on by one status read (seconds): the window starts that much later.
    expect(Date.parse(String(row().updated_at)) - Date.parse(SENT)).toBeLessThan(60_000);
    igRoutes();
    expect(await poll(created.postId)).toMatchObject({ status: "processing", error: null });
    expect(publishes()).toBe(0);
  });

  it("the same race on a Facebook Reel's first finish (found in Phase 14): never a second finish", async () => {
    const created = await newFacebookPost("reel", await connectFacebook());
    files.set(String(row().media_path), 1000);
    Object.assign(row(), { status: "processing", container_id: "88001" });
    metaRoute = (call) => {
      if (call.url.pathname.endsWith("/88001")) {
        // Another request sends the first finish while this poll reads the status.
        row().external_post_id = "88001";
        return { body: { status: { video_status: "upload_complete", uploading_phase: { status: "complete" }, publishing_phase: { status: "not_started" } } } };
      }
      return { body: { success: true } };
    };
    expect(await poll(created.postId)).toMatchObject({ status: "processing", error: null });
    expect(metaCalls.filter(isFinish)).toHaveLength(0);
    expect(row()).toMatchObject({ status: "processing", claimed_at: null, external_post_id: "88001" });
  });

  it.each<[string, Row, () => void, number]>([
    ["past the 24 h container TTL", { created_at: minutesAgo(25 * 60) }, () => igRoutes(), 0],
    ["another account connected", { external_account_id: "999" }, () => igRoutes(), 0],
    ["disconnected", {}, () => ((tables.social_connections = []), igRoutes()), 0],
  ])("a marked post Meta can't be asked about (%s) ends unconfirmed, never a 'didn't post' reason", async (_label, extra, routes, calls) => {
    quiet();
    const postId = await markedReel(extra);
    routes();
    expect(await poll(postId)).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(metaCalls).toHaveLength(calls);
  });

  it("a refused status read of a marked post: unconfirmed, and a refused token still flags the connection", async () => {
    quiet();
    const postId = await markedReel();
    metaRoute = () => ({ status: 400, body: { error: { code: 190 } } });
    expect(await poll(postId)).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(tables.social_connections[0].status).toBe("reconnect_needed");
    expect(publishes()).toBe(0);
  });

  it("rules: containerStep with the mark, and the unconfirmed copy names the provider", async () => {
    const step = (code: string | null, publishSent: boolean, sinceSentMs = 0) => rules.containerStep(code, { publishSent, sinceSentMs });
    expect(rules.SOCIAL_INSTAGRAM_CONFIRM_MS).toBe(10 * 60_000);
    expect(step("FINISHED", false)).toBe("publish");
    expect(step("FINISHED", false, 60 * 60_000)).toBe("publish");
    expect(step("FINISHED", true)).toBe("wait");
    expect(step("FINISHED", true, rules.SOCIAL_INSTAGRAM_CONFIRM_MS - 1)).toBe("wait");
    expect(step("FINISHED", true, rules.SOCIAL_INSTAGRAM_CONFIRM_MS)).toBe("unconfirmed");
    expect(step("PUBLISHED", true)).toBe("already_published");
    expect(step("PUBLISHED", false)).toBe("already_published");
    expect(step("IN_PROGRESS", true, 60 * 60_000)).toBe("wait");
    expect(step(null, false)).toBe("wait");
    expect(step("ERROR", true)).toBe("failed");
    expect(step("EXPIRED", true)).toBe("expired");

    const { SOCIAL_POST_COPY } = await import("@/lib/promo/promoCopy");
    expect(SOCIAL_POST_COPY.errors.unconfirmed("Instagram")).toBe("We couldn't confirm this posted. Check Instagram before posting again.");
    expect(SOCIAL_POST_COPY.errors.unconfirmed("Facebook")).toBe("We couldn't confirm this posted. Check Facebook before posting again.");
  });
});

// ── Phase 11: one connection store, one post step (plan §5.5) ─────────────────────────────────

describe("Phase 11: one connection store for both providers", () => {
  const base = { venueId: "venue-a", ownerId: "owner-1", metaUserId: "555", scopes: [] };
  const pagesRoute = (accounts: unknown[]) => {
    metaRoute = (call) => (call.url.pathname.endsWith("/me/accounts") ? { body: { data: accounts } } : { status: 404, body: { error: { code: 100 } } });
  };

  it("pins the token AAD slots for both providers: changing them would strand every stored token", () => {
    for (const provider of ["instagram", "facebook"] as const) {
      const active = connections.connectionRow(provider, base, { pageId: "11", accountId: "901", displayName: null, pageToken: `PT-${provider}` });
      expect(crypto_.decryptSocialToken(active.access_token_enc, `social:${provider}:venue-a:page_token`)).toBe(`PT-${provider}`);
      const pending = connections.pendingChoiceRow(provider, base, { userToken: `UT-${provider}`, expiresInS: null }, []);
      expect(crypto_.decryptSocialToken(pending.access_token_enc, `social:${provider}:venue-a:user_token`)).toBe(`UT-${provider}`);
    }
  });

  it("one choice-id rule: only Meta's numeric ids survive a stored pending choice, on either provider", async () => {
    await connections.saveSocialConnections([
      connections.pendingChoiceRow("instagram", base, { userToken: "U", expiresInS: null }, [
        { instagramId: "abc", username: "x", pageName: null },
        { instagramId: "901", username: "bar", pageName: "Page 11" },
      ]),
      connections.pendingChoiceRow("facebook", base, { userToken: "U", expiresInS: null }, [
        { pageId: "page-x", pageName: "X" },
        { pageId: "12", pageName: "Page 12" },
      ]),
    ]);
    expect(connections.connectionView(await connections.loadConnection("venue-a", "instagram"))).toEqual({
      state: "choose_account",
      choices: [{ instagramId: "901", username: "bar", pageName: "Page 11" }],
    });
    expect(connections.facebookConnectionView(await connections.loadConnection("venue-a", "facebook"))).toEqual({
      state: "choose_page",
      choices: [{ pageId: "12", pageName: "Page 12" }],
    });
  });

  it("Instagram choose goes through the same path: the pick's Page token lands in the Instagram slot", async () => {
    const graphPage = (id: string, ig: string) => ({ id, name: `Page ${id}`, access_token: `PT-${id}`, instagram_business_account: { id: ig, username: `@ig${ig}` } });
    await connections.saveSocialConnections([
      connections.pendingChoiceRow(
        "instagram",
        base,
        { userToken: "USER-TOKEN", expiresInS: null },
        connections.instagramChoicesOf([
          { pageId: "11", pageName: "Page 11", pageToken: "x", instagramId: "901", username: "ig901" },
          { pageId: "12", pageName: "Page 12", pageToken: "x", instagramId: "902", username: "ig902" },
        ]),
      ),
    ]);
    pagesRoute([graphPage("11", "901"), graphPage("12", "902")]);
    expect(await connections.chooseConnection("instagram", "venue-a", "owner-1", "903")).toBe("not_found");
    expect(metaCalls).toHaveLength(0);
    expect(await connections.chooseConnection("instagram", "venue-a", "owner-1", "902")).toBe("connected");
    expect(metaCalls[0].url.searchParams.get("access_token")).toBe("USER-TOKEN");
    const row = tables.social_connections[0];
    expect(row).toMatchObject({ provider: "instagram", status: "active", page_id: "12", external_account_id: "902", display_name: "ig902", account_choices: [] });
    expect(crypto_.decryptSocialToken(String(row.access_token_enc), "social:instagram:venue-a:page_token")).toBe("PT-12");
    expect(connections.connectionView(await connections.loadConnection("venue-a", "instagram"))).toEqual({ state: "connected", username: "ig902" });
  });

  it("a refused token while choosing reads reconnect, logged under one tag with the provider", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await connections.saveSocialConnections([
      connections.pendingChoiceRow("facebook", base, { userToken: "USER-TOKEN", expiresInS: null }, [{ pageId: "12", pageName: "Page 12" }]),
    ]);
    metaRoute = () => ({ status: 400, body: { error: { code: 190 } } });
    expect(await connections.chooseConnection("facebook", "venue-a", "owner-1", "12")).toBe("reconnect");
    expect(warn).toHaveBeenCalledWith("[SocialConnections] choose-fetch-failed", { provider: "facebook", kind: "token", code: 190 });
    expect(tables.social_connections[0].status).toBe("choose_account");
  });
});

describe("Phase 11: the shared first steps of a poll, run through both providers", () => {
  type Expected = { status: string; error: string | null; metaCalls: number };
  type Case = { name: string; setup: (row: Row, provider: Provider) => void; instagram: Expected; facebook: Expected };
  type Provider = { name: "instagram" | "facebook"; container: string; start: () => Promise<string>; metaWaits: () => void };

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const PROVIDERS: Provider[] = [
    {
      name: "instagram",
      container: "container-1",
      start: async () => (await newPost("reel", await connectVenue())).postId,
      metaWaits: () => igRoutes(["IN_PROGRESS", "IN_PROGRESS"]),
    },
    {
      name: "facebook",
      container: "88001",
      start: async () => (await newFacebookPost("reel", await connectFacebook())).postId,
      metaWaits: () => {
        metaRoute = (call) =>
          call.url.pathname.endsWith("/88001")
            ? { body: { status: { video_status: "processing", uploading_phase: { status: "complete" }, processing_phase: { status: "in_progress" } } } }
            : { status: 404, body: { error: { code: 100 } } };
      },
    },
  ];
  const processing = (row: Row, provider: Provider, minutes: number) =>
    Object.assign(row, { status: "processing", container_id: provider.container, created_at: minutesAgo(minutes) });

  const CASES: Case[] = [
    {
      name: "an upload abandoned for an hour",
      setup: (row) => Object.assign(row, { created_at: minutesAgo(61) }),
      instagram: { status: "failed", error: "upload_missing", metaCalls: 0 },
      facebook: { status: "failed", error: "upload_missing", metaCalls: 0 },
    },
    {
      name: "another request's lease still held",
      setup: (row, provider) => Object.assign(row, { status: "publishing", claimed_at: new Date(Date.now() - 10_000).toISOString(), container_id: provider.container }),
      instagram: { status: "publishing", error: null, metaCalls: 0 },
      facebook: { status: "publishing", error: null, metaCalls: 0 },
    },
    {
      // Instagram's container TTL ends it with no Graph call; a Facebook Reel with a video id still asks Meta once.
      name: "past every TTL",
      setup: (row, provider) => processing(row, provider, 25 * 60),
      instagram: { status: "failed", error: "expired", metaCalls: 0 },
      facebook: { status: "failed", error: "expired", metaCalls: 1 },
    },
    {
      // Instagram: nothing can finish it. Facebook: only Meta's answer fails a Reel, so it waits.
      name: "another account connected",
      setup: (row, provider) => Object.assign(processing(row, provider, 10), { external_account_id: "999" }),
      instagram: { status: "failed", error: "reconnect", metaCalls: 0 },
      facebook: { status: "processing", error: null, metaCalls: 0 },
    },
    {
      name: "disconnected",
      setup: (row, provider) => {
        processing(row, provider, 10);
        tables.social_connections = [];
      },
      instagram: { status: "failed", error: "reconnect", metaCalls: 0 },
      facebook: { status: "processing", error: null, metaCalls: 0 },
    },
  ];

  for (const testCase of CASES) {
    for (const provider of PROVIDERS) {
      it(`${testCase.name}: ${provider.name}`, async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const postId = await provider.start();
        files.set(String(tables.social_posts[0].media_path), 1000);
        testCase.setup(tables.social_posts[0], provider);
        provider.metaWaits();
        const expected = testCase[provider.name];
        const view = await posts.pollSocialPost({ venueId: "venue-a", postId });
        expect(view).toMatchObject({ provider: provider.name, status: expected.status, error: expected.error });
        expect(tables.social_posts[0]).toMatchObject({ status: expected.status, error: expected.error });
        expect(metaCalls).toHaveLength(expected.metaCalls);
      });
    }
  }
});

// ── Phase 19: nothing that may be live is hidden or posted twice (plan §5.13) ─────────────────────

describe("Phase 19: Disconnect and Meta's deauthorize never hide a post that may be live", () => {
  const post = (id: string) => tables.social_posts.find((row) => row.id === id)!;
  const isMediaPublish = (call: MetaCall) => call.url.pathname.endsWith("/media_publish");
  const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const withFile = (id: string) => {
    files.set(String(post(id).media_path), 1000);
    return String(post(id).media_path);
  };
  afterEach(() => vi.restoreAllMocks());

  it("rules: a post may be live when a request holds it or media_publish / the Reel finish was sent", () => {
    const marks = (provider: "instagram" | "facebook", status: string, container: string | null, external: string | null) =>
      ({ provider, status, container_id: container, external_post_id: external }) as Parameters<typeof rules.socialPostMayBeLive>[0];
    expect(rules.socialPostMayBeLive(marks("instagram", "uploading", null, null))).toBe(false);
    expect(rules.socialPostMayBeLive(marks("instagram", "scheduled", null, null))).toBe(false);
    expect(rules.socialPostMayBeLive(marks("instagram", "processing", "c1", null))).toBe(false);
    expect(rules.socialPostMayBeLive(marks("instagram", "processing", "c1", "c1"))).toBe(true);
    expect(rules.socialPostMayBeLive(marks("instagram", "publishing", null, null))).toBe(true);
    expect(rules.socialPostMayBeLive(marks("facebook", "publishing", null, null))).toBe(true);
    expect(rules.socialPostMayBeLive(marks("facebook", "processing", "v1", null))).toBe(false);
    expect(rules.socialPostMayBeLive(marks("facebook", "processing", "v1", "v1"))).toBe(true);
    // Each mark is its own provider's.
    expect(rules.publishSent(marks("facebook", "processing", "v1", "v1"))).toBe(false);
    expect(rules.finishSent(marks("instagram", "processing", "c1", "c1"))).toBe(false);
  });

  it("Disconnect after an unsure media_publish: failed / unconfirmed with its file gone, never cancelled", async () => {
    quiet();
    const connection = await connectVenue();
    metaRoute = (call) => {
      if (call.url.pathname.endsWith("/media")) return { body: { id: "container-1" } };
      if (isMediaPublish(call)) return { network: true };
      return { body: { success: true } }; // the app's revoke after the last connection goes
    };
    const created = await newPost("post", connection);
    const mediaPath = withFile(created.postId);
    await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    expect(post(created.postId)).toMatchObject({ status: "processing", external_post_id: "container-1" });

    await connections.disconnectConnection("venue-a", "instagram");
    expect(post(created.postId)).toMatchObject({
      status: "failed",
      error: "unconfirmed",
      caption: "",
      media_path: null,
      claimed_at: null,
      external_post_id: null,
      container_id: "container-1",
    });
    expect(removedFiles).toEqual([mediaPath]);
    // Recent posts says "Not confirmed"; a later check changes nothing and never publishes again.
    expect(await posts.pollSocialPost({ venueId: "venue-a", postId: created.postId })).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(metaCalls.filter(isMediaPublish)).toHaveLength(1);
  });

  it("Disconnect of posts nothing was sent for (an unsent upload, a Reel container not yet published): cancelled", async () => {
    const connection = await connectVenue();
    const unsent = await newPost("post", connection);
    const container = await newPost("reel", connection);
    Object.assign(post(container.postId), { status: "processing", container_id: "container-1" });
    const paths = [withFile(unsent.postId), withFile(container.postId)];
    metaRoute = () => ({ body: { success: true } });
    await connections.disconnectConnection("venue-a", "instagram");
    for (const id of [unsent.postId, container.postId]) {
      expect(post(id)).toMatchObject({ status: "cancelled", error: null, caption: "", media_path: null });
    }
    expect(removedFiles.sort()).toEqual(paths.sort());
    // Nothing to decide, nothing to write: no posts, no post update.
    dbWrites.length = 0;
    await connectVenue();
    await connections.disconnectConnection("venue-a", "instagram");
    expect(dbWrites.filter((write) => write.table === "social_posts")).toHaveLength(0);
  });

  it("Meta's deauthorize (data deletion) ends each open post by the same rule, on both providers, in two updates", async () => {
    quiet();
    const instagram = await connectVenue();
    const facebook = await connectFacebook();
    const marked = (await newPost("reel", instagram)).postId;
    Object.assign(post(marked), { status: "processing", container_id: "container-1", external_post_id: "container-1" });
    const unsent = (await newPost("post", instagram)).postId;
    const finishSent = (await newFacebookPost("reel", facebook)).postId;
    Object.assign(post(finishSent), { status: "processing", container_id: "88001", external_post_id: "88001" });
    const uploadedOnly = (await newFacebookPost("reel", facebook)).postId;
    Object.assign(post(uploadedOnly), { status: "processing", container_id: "88002" });
    const photoMidCall = (await newFacebookPost("post", facebook)).postId;
    Object.assign(post(photoMidCall), { status: "publishing", claimed_at: new Date().toISOString() });
    const done = (await newPost("post", instagram)).postId;
    Object.assign(post(done), { status: "published", media_path: null, caption: "", external_post_id: "media-9" });
    for (const id of [marked, unsent, finishSent, uploadedOnly, photoMidCall]) withFile(id);
    dbWrites.length = 0;

    expect(await connections.removeMetaUserSocialConnections("555")).toBe(2);
    for (const id of [marked, finishSent, photoMidCall]) {
      expect(post(id), id).toMatchObject({ status: "failed", error: "unconfirmed", caption: "", media_path: null, external_post_id: null });
    }
    for (const id of [unsent, uploadedOnly]) expect(post(id), id).toMatchObject({ status: "cancelled", caption: "", media_path: null });
    expect(post(done)).toMatchObject({ status: "published", external_post_id: "media-9" });
    expect(files.size).toBe(0);
    expect(dbWrites.filter((write) => write.table === "social_posts" && write.op === "update")).toHaveLength(2);
    expect(metaCalls).toHaveLength(0);
  });

  it("a request mid media_publish when Disconnect lands: its late 'published' write is fenced out, the post stays unconfirmed", async () => {
    const warn = quiet();
    const connection = await connectVenue();
    metaRoute = async (call) => {
      if (call.url.pathname.endsWith("/media")) return { body: { id: "container-1" } };
      if (isMediaPublish(call)) {
        // The partner taps Disconnect while Meta is publishing it.
        await connections.disconnectConnection("venue-a", "instagram");
        return { body: { id: "media-1" } };
      }
      if (call.url.pathname.endsWith("/media-1")) return { body: { permalink: "https://www.instagram.com/p/abc/" } };
      return { body: { success: true } };
    };
    const created = await newPost("post", connection);
    const mediaPath = withFile(created.postId);
    const outcome = await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId });
    // What the panel shows: "We couldn't confirm this posted. Check Instagram before posting again."
    expect(outcome).toMatchObject({ ok: true, post: { status: "failed", error: "unconfirmed", permalink: null } });
    expect(post(created.postId)).toMatchObject({ status: "failed", error: "unconfirmed", external_post_id: null, permalink: null, media_path: null });
    expect(removedFiles).toEqual([mediaPath]);
    expect(metaCalls.filter(isMediaPublish)).toHaveLength(1);
    expect(JSON.stringify(warn.mock.calls)).toContain("lost-claim");
  });

  it("a post marked after Disconnect read it is never cancelled: it is left to the request holding it", async () => {
    quiet();
    const connection = await connectVenue();
    const created = await newPost("reel", connection);
    const mediaPath = withFile(created.postId);
    Object.assign(post(created.postId), { status: "processing", container_id: "container-1" });
    let raced = false;
    dbHooks.onUpdate = (table, patch) => {
      if (table !== "social_posts" || patch.status !== "cancelled" || raced) return;
      raced = true;
      // Between Disconnect's read and its cancel, a poll claimed it, sent media_publish, lost the answer and
      // handed it back to "processing" with the mark.
      Object.assign(post(created.postId), { external_post_id: "container-1" });
    };
    metaRoute = () => ({ body: { success: true } });
    await connections.disconnectConnection("venue-a", "instagram");
    expect(raced).toBe(true);
    expect(post(created.postId)).toMatchObject({ status: "processing", external_post_id: "container-1", media_path: mediaPath });
    expect(files.has(mediaPath)).toBe(true);
    // The connection is gone, so the next check ends it without Meta's answer: unconfirmed, never "cancelled".
    expect(await posts.pollSocialPost({ venueId: "venue-a", postId: created.postId })).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(files.has(mediaPath)).toBe(false);
  });
});

describe("Phase 19: a failure after the claim is 'unsure', never 'try again'", () => {
  const row = () => tables.social_posts[0];
  const isMediaPublish = (call: MetaCall) => call.url.pathname.endsWith("/media_publish");
  const poll = (postId: string) => posts.pollSocialPost({ venueId: "venue-a", postId });
  const leaseRunOut = () => (row().claimed_at = new Date(Date.now() - 160_000).toISOString());
  const failWrite = (status: string) => (dbHooks.onUpdate = (table, patch) => (table === "social_posts" && patch.status === status ? "fail" : undefined));
  const quietAll = () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    return vi.spyOn(console, "error").mockImplementation(() => undefined);
  };
  afterEach(() => vi.restoreAllMocks());

  const publishRoute = async (postId: string) => {
    const { POST } = await import("@/app/api/owner/social/posts/[id]/publish/route");
    return POST(
      new Request(`https://h.test/api/owner/social/posts/${postId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ venueId: "venue-a" }),
      }),
      { params: Promise.resolve({ id: postId }) },
    );
  };

  /** An Instagram picture with a container the test steers. */
  const steered = async () => {
    const connection = await connectVenue();
    const container = { status: "FINISHED" };
    metaRoute = (call) => {
      if (call.url.pathname.endsWith("/media")) return { body: { id: "container-1" } };
      if (isMediaPublish(call)) return { body: { id: "media-1" } };
      if (call.url.pathname.endsWith("/container-1")) return { body: { status_code: container.status } };
      if (call.url.pathname.endsWith("/media-1")) return { body: { permalink: "https://www.instagram.com/p/abc/" } };
      return { status: 404, body: { error: { code: 100 } } };
    };
    const created = await newPost("post", connection);
    files.set(String(row().media_path), 1000);
    return { postId: created.postId, container };
  };

  it("media_publish went out, then the final write throws: 500 unsure with the post id; the poll resolves it, sent once", async () => {
    const error = quietAll();
    const { postId, container } = await steered();
    failWrite("published");
    const response = await publishRoute(postId);
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: false, error: expect.any(String), code: "unsure", postId });
    expect(String(body.error)).not.toMatch(/try again/i);
    expect(JSON.stringify(error.mock.calls)).toContain("publish-unsure");
    expect(row()).toMatchObject({ status: "publishing", external_post_id: "container-1" });

    dbHooks.onUpdate = null;
    // While the dead request's lease holds, the poll leaves it alone; then it asks the container.
    expect((await poll(postId))?.status).toBe("publishing");
    container.status = "PUBLISHED";
    leaseRunOut();
    expect(await poll(postId)).toMatchObject({ status: "published" });
    expect(metaCalls.filter(isMediaPublish)).toHaveLength(1);
  });

  it("the same while the container still reads FINISHED: never published again (Phase 14), then unconfirmed", async () => {
    quietAll();
    const { postId } = await steered();
    failWrite("published");
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId })).toEqual({ ok: false, code: "unsure", postId });
    dbHooks.onUpdate = null;
    leaseRunOut();
    expect((await poll(postId))?.status).toBe("processing");
    row().updated_at = new Date(Date.now() - rules.SOCIAL_INSTAGRAM_CONFIRM_MS - 1_000).toISOString();
    expect(await poll(postId)).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(metaCalls.filter(isMediaPublish)).toHaveLength(1);
  });

  it("a Facebook photo that went out, then the final write throws: unsure; past the lease the poll ends it unconfirmed, sent once", async () => {
    quietAll();
    const connection = await connectFacebook();
    fbRoutes();
    const created = await newFacebookPost("post", connection);
    files.set(String(row().media_path), 1000);
    failWrite("published");
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId: created.postId })).toEqual({ ok: false, code: "unsure", postId: created.postId });
    dbHooks.onUpdate = null;
    leaseRunOut();
    expect(await poll(created.postId)).toMatchObject({ status: "failed", error: "unconfirmed" });
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/photos"))).toHaveLength(1);
  });

  it("the claim's own answer is lost: unsure too (it may have landed, and a later check would publish it)", async () => {
    quietAll();
    const { postId } = await steered();
    failWrite("publishing");
    expect(await posts.publishSocialPost({ venueId: "venue-a", postId })).toEqual({ ok: false, code: "unsure", postId });
    expect(metaCalls).toHaveLength(0);
  });

  it("a failure before the claim (the upload check) still says try again, and nothing reached Meta", async () => {
    quietAll();
    const { postId } = await steered();
    vi.spyOn(storageApi, "list").mockResolvedValueOnce({ data: null, error: { message: "storage down" } } as never);
    const response = await publishRoute(postId);
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({ ok: false, error: "Couldn't send the post. Please try again." });
    expect(row()).toMatchObject({ status: "uploading", claimed_at: null });
    expect(metaCalls).toHaveLength(0);
  });
});
