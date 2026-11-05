import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// docs/partner-social-promo-plan.md "Standing rules" (Phase 5): where social tokens may be touched, the
// one reader of each secret and flag, and the gate on every partner social route.

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const walk = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(ROOT, path)).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });

const SOURCE = ["app", "components", "lib"].flatMap(walk).map((path) => relative(ROOT, join(ROOT, path)));
/** Source without comments, so a rule matches code, not the prose that explains it. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const mentions = (needle: string, files: string[] = SOURCE) => files.filter((path) => code(path).includes(needle));

describe("social publishing contract", () => {
  it("SOCIAL_TOKEN_KEY has one reader: lib/social/crypto.ts", () => {
    expect(mentions("process.env.SOCIAL_TOKEN_KEY")).toEqual(["lib/social/crypto.ts"]);
  });

  it("only lib/social/socialConnections.ts reads or writes the encrypted token column", () => {
    // pos_connections has a column of the same name; POS code is its own boundary (lib/pos/crypto.ts).
    const notPos = SOURCE.filter((path) => !path.startsWith("lib/pos/"));
    expect(mentions("access_token_enc", notPos)).toEqual(["lib/social/socialConnections.ts"]);
  });

  it("META_PARTNER_APP_SECRET and the publish flag each have one reader", () => {
    expect(mentions("process.env.META_PARTNER_APP_SECRET")).toEqual(["lib/social/metaConfig.ts"]);
    expect(mentions("process.env.NEXT_PUBLIC_SOCIAL_PUBLISH_ENABLED")).toEqual(["lib/social/flags.ts"]);
  });

  it("every /api/owner/social route is behind the Post now gate and the owner gate", () => {
    const routes = walk("app/api/owner/social").filter((path) => path.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThanOrEqual(6);
    // Phase 18: the choose / disconnect routes are one line each over lib/social/socialProviderRoutes.ts,
    // whose every handler opens with the guard (checked below).
    const shared = /export const (POST|DELETE) = (chooseRoute|disconnectRoute)\("(instagram|facebook)"\);/;
    for (const route of routes) {
      const source = read(route);
      const gated =
        source.includes("guardOwnerSocialVenue(") ||
        (source.includes("isSocialPostNowLive()") && source.includes("requireOwnerAuth(")) ||
        shared.test(source);
      expect(gated, route).toBe(true);
    }
    const handlers = read("lib/social/socialProviderRoutes.ts").split(/export const (?=chooseRoute|disconnectRoute)/).slice(1);
    expect(handlers.map((handler) => handler.slice(0, handler.indexOf(" ")))).toEqual(["chooseRoute", "disconnectRoute"]);
    for (const handler of handlers) expect(handler).toContain("await guardOwnerSocialVenue(request, venueId);");
  });

  it("no owner social route spells out a provider name with a ternary (Phase 18: SOCIAL_POST_COPY.providers)", () => {
    for (const route of walk("app/api/owner/social")) {
      expect(read(route), route).not.toMatch(/"(Facebook|Instagram)"\s*:\s*"(Instagram|Facebook)"/);
    }
  });

  it("no component imports the server-side share details store (Phase 12)", () => {
    expect(mentions("@/lib/venueShareDetailsStore", SOURCE.filter((path) => path.startsWith("components")))).toEqual([]);
  });

  it("no log line in social code passes a token", () => {
    const files = [...walk("lib/social"), ...walk("app/api/owner/social"), ...walk("app/api/social")];
    for (const file of files) {
      const logs = read(file).match(/console\.(log|info|warn|error)\([^;]*?\);/gs) ?? [];
      for (const line of logs) expect(line, file).not.toMatch(/accessToken|pageToken|userToken|access_token|signedUrl|uploadUrl/);
    }
  });

  it("the login configuration is unset or a numeric Meta id, and never Meta's system-user preset scopes", async () => {
    const config = read("lib/social/metaConfig.ts");
    expect(config).toMatch(/META_PARTNER_LOGIN_CONFIG_ID: string \| null = (null|"\d{6,25}")/);
    for (const forbidden of ["ads_management", "business_management", "instagram_manage_messages", "pages_messaging"]) {
      expect(config).not.toContain(`"${forbidden}"`);
    }
  });

  it("the new tables are server-only and the bucket is private", () => {
    const migration = read("supabase/migrations/20261104193338_social_publishing.sql");
    for (const table of ["social_connections", "social_posts"]) {
      expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated;`);
      expect(migration).toContain(`alter table public.${table} force row level security;`);
    }
    expect(migration).toMatch(/values \('social-media', 'social-media', false/);
    expect(migration).not.toMatch(/create policy/i);
  });

  it("the Post now routes are live only while the sheet renders the Post now box (Phase 8, D32/D35)", () => {
    const flags = code("lib/social/flags.ts");
    const switchOn = /export const SOCIAL_POST_NOW_ON_SHEET = (true|false);/.exec(flags)?.[1];
    expect(switchOn, "SOCIAL_POST_NOW_ON_SHEET must be a literal true/false").toBeDefined();
    expect(flags).toContain("isSocialPublishEnabled() && SOCIAL_POST_NOW_ON_SHEET");
    const rendersBox = /<SocialPostNowPanel\b/.test(code("components/owner/social/ShareToSocialSheet.tsx"));
    expect(rendersBox).toBe(switchOn === "true");
    // Only flags.ts and tests may use the bare env flag; Post now callers use isSocialPostNowLive().
    expect(mentions("isSocialPublishEnabled(")).toEqual(["lib/social/flags.ts"]);
  });

  it("the sheet hands the Post now panel its props only through postNowProps (Phase 19, plan §5.13)", () => {
    // A Reel's picture format is "story" and the picture's bar name follows a tick: passing either straight through
    // would post a Reel MP4 as a Story or drop the bar from the caption (components/owner/social/postNowProps.ts).
    const mounts = code("components/owner/social/ShareToSocialSheet.tsx").match(/<SocialPostNowPanel\b[^>]*>/g) ?? [];
    for (const mount of mounts) expect(mount).toMatch(/^<SocialPostNowPanel \{\.\.\.postNowProps\(/);
    // The restore snippet in the sheet's comment says the same.
    expect(read("components/owner/social/ShareToSocialSheet.tsx")).toContain("<SocialPostNowPanel {...postNowProps({");
  });

  it("the Post now panel wires itself: own connect result, own caption (Phase 16)", () => {
    const panel = code("components/owner/social/SocialPostNowPanel.tsx");
    expect(panel).toContain("useSearchParams");
    expect(panel).toContain("socialCaptionProblem");
    expect(panel).not.toMatch(/\bconnectResult\??: /);
    expect(panel).not.toMatch(/^\s+caption\??: string;/m);
  });

  it("Meta's deauthorize / data-deletion callbacks are never behind the Post now gate", () => {
    for (const file of [...walk("app/api/social/meta"), "lib/social/metaCallbacks.ts"]) {
      expect(code(file), file).not.toMatch(/isSocialPostNowLive|isSocialPublishEnabled|guardOwnerSocialVenue/);
    }
  });

  it("no request that can claim a post outlives its lease (Phase 9, plan §5.3)", async () => {
    const rules = await import("@/lib/social/socialPublishRules");
    expect(rules.SOCIAL_PUBLISH_LEASE_MS).toBeGreaterThanOrEqual(rules.SOCIAL_ROUTE_MAX_DURATION_S * 1000 + 60_000);
    // Every route that can claim a post: the publish step, the poll and Recent posts.
    const claiming = walk("app")
      .filter((path) => path.endsWith("route.ts") && /\b(publishSocialPost|pollSocialPost|listRecentSocialPosts)\(/.test(code(path)))
      .sort();
    expect(claiming).toEqual([
      "app/api/owner/social/posts/[id]/publish/route.ts",
      "app/api/owner/social/posts/[id]/route.ts",
      "app/api/owner/social/status/route.ts",
    ]);
    for (const route of claiming) expect(code(route), route).toContain(`export const maxDuration = ${rules.SOCIAL_ROUTE_MAX_DURATION_S};`);
  });

  it("every post write goes through one fenced update, with no fallback that ignores a lost claim (Phase 9)", () => {
    const source = code("lib/social/socialPosts.ts");
    // moveIf is the only update; writes under a claim go through updateClaimed (status + claimed_at).
    expect(source.match(/\.update\(/g) ?? []).toHaveLength(1);
    expect(source).toContain('moveIf(row.id, "publishing", patch, { claimedAt: row.claimed_at })');
    expect(source).not.toMatch(/\?\?\s*\{\s*\.\.\.row/);
  });

  it("Facebook Page posting asks only for Page publishing permissions, and the Page token never goes in a URL", () => {
    const config = read("lib/social/metaConfig.ts");
    expect(config).toMatch(/META_FACEBOOK_REQUIRED_PERMISSIONS = \["pages_show_list", "pages_read_engagement", "pages_manage_posts"\]/);
    const graph = code("lib/social/metaGraph.ts");
    // The hosted Reel upload carries the token in the Authorization header only.
    expect(graph).toMatch(/rupload\.facebook\.com\/video-upload\/\$\{META_GRAPH_VERSION\}\/\$\{encodeURIComponent\(input\.videoId\)\}`/);
    expect(graph).toContain("Authorization: `OAuth ${input.pageToken}`");
  });
});
