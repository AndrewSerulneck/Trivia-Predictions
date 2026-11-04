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

  it("every /api/owner/social route is behind the flag and the owner gate", () => {
    const routes = walk("app/api/owner/social").filter((path) => path.endsWith("route.ts"));
    expect(routes.length).toBeGreaterThanOrEqual(6);
    for (const route of routes) {
      const source = read(route);
      const gated = source.includes("guardOwnerSocialVenue(") || (source.includes("isSocialPublishEnabled()") && source.includes("requireOwnerAuth("));
      expect(gated, route).toBe(true);
    }
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

  it("the sheet shows Post now only behind the flag", () => {
    const sheet = read("components/owner/social/ShareToSocialSheet.tsx");
    expect(sheet).toMatch(/isSocialPublishEnabled\(\) \? \(\s*<InstagramPostPanel/);
  });
});
