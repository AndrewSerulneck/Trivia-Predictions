import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/partner-social-promo-plan.md Phase 5 — Instagram "Post now": token crypto, OAuth state, the
// Graph client, the post state machine (one container / one publish per post, even on a double tap),
// the OAuth callback, disconnect and Meta's deauthorize clean-up. Supabase and Meta are in-memory fakes.

vi.mock("server-only", () => ({}));

// ── In-memory Supabase ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { social_connections: [], social_posts: [] };
const files = new Map<string, number>();
const removedFiles: string[] = [];

const builder = (table: string) => {
  const filters: ((row: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  let patch: Row = {};
  let payload: Row = {};
  let returning = false;
  let head = false;
  let limitN: number | null = null;
  let conflict: string[] = [];
  const run = () => {
    const rows = tables[table];
    const now = new Date().toISOString();
    if (op === "insert") {
      rows.push({ created_at: now, claimed_at: null, container_id: null, external_post_id: null, permalink: null, error: null, ...payload });
      return { data: null, error: null };
    }
    if (op === "upsert") {
      const index = rows.findIndex((row) => conflict.every((column) => row[column] === payload[column]));
      if (index >= 0) rows[index] = { ...rows[index], ...payload };
      else rows.push({ id: crypto.randomUUID(), created_at: now, ...payload });
      return { data: null, error: null };
    }
    const matched = rows.filter((row) => filters.every((filter) => filter(row)));
    if (op === "delete") {
      tables[table] = rows.filter((row) => !matched.includes(row));
      return { data: null, error: null };
    }
    if (op === "update") {
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
    upsert: (value: Row, options: { onConflict: string }) => ((op = "upsert"), (payload = value), (conflict = options.onConflict.split(",")), query),
    delete: () => ((op = "delete"), query),
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), query),
    neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), query),
    in: (column: string, values: unknown[]) => (filters.push((row) => values.includes(row[column])), query),
    lt: (column: string, value: string) => (filters.push((row) => typeof row[column] === "string" && (row[column] as string) < value), query),
    gte: (column: string, value: string) => (filters.push((row) => typeof row[column] === "string" && (row[column] as string) >= value), query),
    order: () => query,
    limit: (n: number) => ((limitN = n), query),
    maybeSingle: async () => {
      const result = run();
      return { data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data, error: null };
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

type MetaCall = { method: string; url: URL; body: URLSearchParams | null };
let metaCalls: MetaCall[] = [];
let metaRoute: (call: MetaCall) => { status?: number; body: unknown };

const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const body = init?.body instanceof URLSearchParams ? init.body : null;
  const call = { method: init?.method ?? "GET", url, body };
  metaCalls.push(call);
  const answer = metaRoute(call);
  return new Response(JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "content-type": "application/json" } });
});

const SECRET = "partner-app-secret";
const PAGE_TOKEN = "PAGE-TOKEN-123";

beforeEach(() => {
  tables.social_connections = [];
  tables.social_posts = [];
  files.clear();
  removedFiles.length = 0;
  metaCalls = [];
  metaRoute = () => ({ status: 500, body: { error: { code: 1 } } });
  vi.stubEnv("SOCIAL_TOKEN_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("META_PARTNER_APP_SECRET", SECRET);
  vi.stubEnv("SESSION_SECRET", "session-secret");
  vi.stubEnv("NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED", "true");
  vi.stubGlobal("fetch", fetchMock);
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
  await connections.saveInstagramConnection({
    venueId,
    ownerId: "owner-1",
    metaUserId,
    scopes: ["instagram_basic"],
    account: { pageId: "page-1", pageName: "The Bar", pageToken: PAGE_TOKEN, instagramId: "17841400000000001", username: "thebar" },
  });
  return (await connections.loadInstagramConnection(venueId))!;
};

const newPost = async (format: "post" | "story" | "reel", connection: Awaited<ReturnType<typeof connectVenue>>) => {
  const created = await posts.createInstagramPost({
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
    expect(rules.socialCaptionProblem("x".repeat(2200))).toBeNull();
    expect(rules.socialCaptionProblem("x".repeat(2201))).not.toBeNull();
    expect(rules.socialCaptionProblem(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" "))).not.toBeNull();
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

    const outcome = await posts.publishInstagramPost({ venueId: "venue-a", postId: created.postId, connection });
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
      posts.publishInstagramPost({ venueId: "venue-a", postId: created.postId, connection }),
      posts.publishInstagramPost({ venueId: "venue-a", postId: created.postId, connection }),
    ]);
    expect([a, b].filter((outcome) => outcome.ok && outcome.post.status === "published")).toHaveLength(1);
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/media"))).toHaveLength(1);
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/media_publish"))).toHaveLength(1);
  });

  it("refuses before calling Meta when the file never arrived, or for another venue", async () => {
    const connection = await connectVenue();
    igRoutes();
    const created = await newPost("post", connection);
    expect(await posts.publishInstagramPost({ venueId: "venue-a", postId: created.postId, connection })).toEqual({ ok: false, code: "not_uploaded" });
    expect(await posts.publishInstagramPost({ venueId: "venue-b", postId: created.postId, connection })).toEqual({ ok: false, code: "not_found" });
    expect(metaCalls).toHaveLength(0);
  });

  it("a Story sends media_type STORIES and no caption", async () => {
    const connection = await connectVenue();
    igRoutes();
    const created = await newPost("story", connection);
    files.set(String(tables.social_posts[0].media_path), 1000);
    await posts.publishInstagramPost({ venueId: "venue-a", postId: created.postId, connection });
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
    const outcome = await posts.publishInstagramPost({ venueId: "venue-a", postId: created.postId, connection });
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

    const first = await posts.publishInstagramPost({ venueId: "venue-a", postId: created.postId, connection });
    expect(first).toMatchObject({ ok: true, post: { status: "processing" } });
    const container = metaCalls.find((call) => call.url.pathname.endsWith("/media"))!;
    expect(container.body?.get("media_type")).toBe("REELS");
    expect(container.body?.get("thumb_offset")).toBe("12600");
    expect(container.body?.get("video_url")).toContain(".mp4");

    expect((await posts.pollInstagramPost({ venueId: "venue-a", postId: created.postId, connection }))?.status).toBe("processing");
    const [x, y] = await Promise.all([
      posts.pollInstagramPost({ venueId: "venue-a", postId: created.postId, connection }),
      posts.pollInstagramPost({ venueId: "venue-a", postId: created.postId, connection }),
    ]);
    expect([x?.status, y?.status]).toContain("published");
    expect(metaCalls.filter((call) => call.url.pathname.endsWith("/media_publish"))).toHaveLength(1);
  });

  it("an upload abandoned for an hour is failed and its file deleted when Recent posts loads", async () => {
    const connection = await connectVenue();
    await newPost("reel", connection);
    tables.social_posts[0].created_at = new Date(Date.now() - 61 * 60_000).toISOString();
    const list = await posts.listRecentInstagramPosts("venue-a", connection);
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
    await connections.disconnectInstagram("venue-a");
    expect(metaCalls).toHaveLength(0);
    await connections.disconnectInstagram("venue-b");
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0].method).toBe("DELETE");
    expect(metaCalls[0].url.pathname).toMatch(/\/555\/permissions$/);
    expect(metaCalls[0].url.searchParams.get("access_token")).toBe(`870343082807996|${SECRET}`);
  });

  it("a pending account choice expires after an hour", async () => {
    await connections.savePendingInstagramChoice({
      venueId: "venue-a",
      ownerId: "owner-1",
      metaUserId: "555",
      scopes: [],
      userToken: "USER-TOKEN",
      expiresInS: 5_000_000,
      accounts: [
        { pageId: "p1", pageName: "One", pageToken: "t1", instagramId: "1", username: "one" },
        { pageId: "p2", pageName: "Two", pageToken: "t2", instagramId: "2", username: "two" },
      ],
    });
    expect(JSON.stringify(tables.social_connections[0].account_choices)).not.toContain("t1");
    const pending = await connections.loadInstagramConnection("venue-a");
    expect(connections.connectionView(pending)).toMatchObject({ state: "choose_account", choices: [{ instagramId: "1" }, { instagramId: "2" }] });
    expect(await connections.loadInstagramConnection("venue-a", Date.now() + 61 * 60_000)).toBeNull();
    expect(tables.social_connections).toHaveLength(0);
  });
});

describe("OAuth callback route", () => {
  const callback = async (accounts: unknown[], permissions = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"]) => {
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
    ...(ig ? { instagram_business_account: { id: ig, username: `ig${ig}` } } : {}),
  });

  it("one account: connects with the Page token; the user token is not kept", async () => {
    const location = await callback([page("1", "901"), page("2", null)]);
    expect(location.searchParams.get("socialResult")).toBe("connected");
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
  it("every /api/owner/social route answers 404", async () => {
    vi.stubEnv("NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED", "");
    const req = (path: string, method = "GET", body?: unknown) =>
      new Request(`https://h.test${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } } : {}) });
    const params = { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) };
    const statuses = [
      (await (await import("@/app/api/owner/social/meta/connect/route")).GET(req("/x?venueId=venue-a"))).status,
      (await (await import("@/app/api/owner/social/meta/callback/route")).GET(req("/x"))).status,
      (await (await import("@/app/api/owner/social/instagram/route")).GET(req("/x?venueId=venue-a"))).status,
      (await (await import("@/app/api/owner/social/instagram/route")).DELETE(req("/x?venueId=venue-a", "DELETE"))).status,
      (await (await import("@/app/api/owner/social/instagram/choose/route")).POST(req("/x", "POST", { venueId: "venue-a" }))).status,
      (await (await import("@/app/api/owner/social/posts/route")).POST(req("/x", "POST", { venueId: "venue-a" }))).status,
      (await (await import("@/app/api/owner/social/posts/[id]/route")).GET(req("/x?venueId=venue-a"), params)).status,
      (await (await import("@/app/api/owner/social/posts/[id]/publish/route")).POST(req("/x", "POST", { venueId: "venue-a" }), params)).status,
    ];
    expect(statuses).toEqual(Array(8).fill(404));
  });

  it("another venue's id is refused with the flag on", async () => {
    const { GET } = await import("@/app/api/owner/social/instagram/route");
    expect((await GET(new Request("https://h.test/x?venueId=venue-z"))).status).toBe(403);
  });
});
