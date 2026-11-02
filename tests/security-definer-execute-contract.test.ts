import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pick 'Em Phase 7.1c tripwire (docs/pickem-college-football-and-prize-plan.md §9 F11): no player
 * can call a SECURITY DEFINER function through the public API.
 *
 * A SECURITY DEFINER function runs as its owner, so RLS and table revokes don't limit it — only
 * EXECUTE does. Supabase's default privileges grant EXECUTE on every NEW public function to anon,
 * authenticated and service_role explicitly, so `revoke ... from public` alone never closes one
 * (that is how `settle_prediction_market` stayed callable by every signed-in player). So, replaying
 * every migration in order, each live SECURITY DEFINER function signature must end with EXECUTE
 * revoked from BOTH anon and authenticated — except trigger functions (the API can't call them)
 * and the RLS helpers below (policies run them as the querying role).
 *
 * A new server-only function: `revoke all on function public.f(<types>) from public, anon,
 * authenticated;` + `grant execute ... to service_role;` in the same migration.
 * SQL proof for 7.1c: `npm run test:security-definer-sql`.
 */
const MIGRATIONS_DIR = "supabase/migrations";
const LOCKDOWN_FILE = "20261101153306_server_only_security_definer_functions.sql";

/** Must stay executable by `authenticated`: RLS policies call them as the querying role. Each only answers about the caller. */
const RLS_HELPERS = new Set([
  "public.current_admin_venue_ids()",
  "public.is_current_user_for_analytics(uuid,text)",
  "public.is_current_admin_for_analytics_venue(text)",
]);

const LOCKDOWN_SIGNATURES = [
  "public.settle_prediction_market(text,text,boolean)",
  "public.settle_prediction_market(text,text,boolean,text)",
  "public.get_challenge_leaderboard_snapshot(uuid,text,uuid,integer,text)",
  "public.get_challenge_leaderboard_snapshot(uuid,text,uuid,integer,text,timestamptz)",
  "public.prune_user_analytics_raw_events(interval)",
  "public.refresh_user_analytics_rollups()",
  "public.refresh_live_trivia_inventory_summary_for_venue_category(text,text)",
  "public.refresh_live_trivia_inventory_summary_for_category(text)",
  "public.refresh_live_trivia_inventory_summary_for_venue(text)",
  "public.refresh_live_trivia_inventory_summary()",
];

const PLAYER_ROLES = ["anon", "authenticated"] as const;
type PlayerRole = (typeof PLAYER_ROLES)[number];

const TYPE_ALIASES: Record<string, string> = {
  int: "integer",
  int4: "integer",
  int8: "bigint",
  int2: "smallint",
  bool: "boolean",
  "timestamp with time zone": "timestamptz",
  "timestamp without time zone": "timestamp",
  float8: "double precision",
  varchar: "character varying",
};

const normalizeType = (raw: string): string => {
  const type = raw.trim().replace(/\s+/g, " ").replace(/\s*\[\s*\]/g, "[]");
  const array = type.endsWith("[]");
  const base = array ? type.slice(0, -2) : type;
  return `${TYPE_ALIASES[base] ?? base}${array ? "[]" : ""}`;
};

/** Splits on commas that are not inside parentheses or quotes. */
const splitTopLevel = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const char of text) {
    if (char === "'") quoted = !quoted;
    if (!quoted && char === "(") depth += 1;
    if (!quoted && char === ")") depth -= 1;
    if (!quoted && depth === 0 && char === ",") {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
};

/** The text inside the parentheses that open at `open`, and the index after the closing one. */
const balanced = (text: string, open: number): { inner: string; end: number } => {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return { inner: text.slice(open + 1, i), end: i + 1 };
    }
  }
  throw new Error(`unbalanced parentheses: ${text.slice(open, open + 80)}`);
};

const qualify = (name: string) => {
  const bare = name.replace(/"/g, "");
  return bare.includes(".") ? bare : `public.${bare}`;
};

/** A `create function` parameter list → its signature types (OUT params are not part of it). */
const parameterTypes = (inner: string): string[] =>
  splitTopLevel(inner)
    .map((param) => param.replace(/\s+(default\b|=)[\s\S]*$/, "").trim())
    .filter((param) => !/^out\s/.test(param))
    .map((param) => {
      const words = param.replace(/^(in|inout|variadic)\s+/, "").split(/\s+/);
      return normalizeType(words.length === 1 ? words[0] : words.slice(1).join(" "));
    });

/** A revoke/grant/drop argument list → types (those lists carry types only in this repo). */
const listTypes = (inner: string): string[] =>
  splitTopLevel(inner)
    .map((arg) => arg.trim())
    .filter(Boolean)
    .map(normalizeType);

const signature = (name: string, types: string[]) => `${qualify(name)}(${types.join(",")})`;

type Statement = { file: string; text: string };

/** Statements in file order: dollar-quoted bodies and comments removed, whitespace collapsed, lower-cased. */
const migrationStatements = (): Statement[] =>
  readdirSync(resolve(process.cwd(), MIGRATIONS_DIR))
    .filter((name) => /^\d{14}_.*\.sql$/.test(name))
    .sort()
    .flatMap((file) =>
      readFileSync(resolve(process.cwd(), join(MIGRATIONS_DIR, file)), "utf8")
        .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, " $body$ ")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/--.*$/gm, "")
        .split(";")
        .map((text) => text.replace(/\s+/g, " ").trim().toLowerCase())
        .filter(Boolean)
        .map((text) => ({ file, text })),
    );

/** Each signature named in `on function a(...), b(...)`. */
const functionList = (text: string): string[] => {
  const match = /\bon function (.+?) (?:from|to) /.exec(text);
  if (!match) return [];
  const list = match[1];
  const signatures: string[] = [];
  const nameAt = /([\w."]+)\s*\(/g;
  let found: RegExpExecArray | null;
  while ((found = nameAt.exec(list))) {
    const open = found.index + found[0].length - 1;
    const { inner, end } = balanced(list, open);
    signatures.push(signature(found[1], listTypes(inner)));
    nameAt.lastIndex = end;
  }
  return signatures;
};

type FunctionState = {
  file: string;
  securityDefiner: boolean;
  returnsTrigger: boolean;
  open: Record<PlayerRole, boolean>;
};

/** Replays every migration: which functions exist, and whether anon/authenticated can still execute each. */
const replay = (statements: Statement[]): Map<string, FunctionState> => {
  const functions = new Map<string, FunctionState>();
  for (const { file, text } of statements) {
    const create = /^create (?:or replace )?function ([\w."]+)\s*\(/.exec(text);
    if (create) {
      const { inner, end } = balanced(text, create[0].length - 1);
      const key = signature(create[1], parameterTypes(inner));
      const rest = text.slice(end);
      const existing = functions.get(key);
      functions.set(key, {
        file,
        securityDefiner: /\bsecurity definer\b/.test(rest),
        returnsTrigger: /^\s*returns trigger\b/.test(rest),
        // `create or replace` of an existing signature keeps its ACL; a new one gets the defaults.
        open: existing ? existing.open : { anon: true, authenticated: true },
      });
      continue;
    }
    const drop = /^drop function (?:if exists )?([\w."]+)\s*\(/.exec(text);
    if (drop) {
      const { inner } = balanced(text, drop[0].length - 1);
      functions.delete(signature(drop[1], listTypes(inner)));
      continue;
    }
    const revoke = /^revoke (?:all|execute)(?: privileges)? on function .+ from (.+)$/.exec(text);
    const grant = /^grant (?:all|execute)(?: privileges)? on function .+ to (.+)$/.exec(text);
    if (!revoke && !grant) continue;
    const roles = (revoke ?? grant)![1].split(",").map((role) => role.trim());
    for (const key of functionList(text)) {
      const state = functions.get(key);
      if (!state) continue;
      for (const role of PLAYER_ROLES) {
        if (revoke && roles.includes(role)) state.open[role] = false;
        // A grant to PUBLIC reaches every role.
        if (grant && (roles.includes(role) || roles.includes("public"))) state.open[role] = true;
      }
    }
  }
  return functions;
};

describe("security definer execute contract", () => {
  const statements = migrationStatements();
  const functions = replay(statements);

  it("finds the repo's SECURITY DEFINER functions (the parser isn't blind)", () => {
    const definers = [...functions.entries()].filter(([, state]) => state.securityDefiner);
    expect(definers.length).toBeGreaterThan(50);
    expect(functions.get("public.settle_prediction_market(text,text,boolean,text)")?.securityDefiner).toBe(true);
    expect(functions.get("public.sync_auth_user_display_name()")?.returnsTrigger).toBe(true);
    // The 8-argument award_cycle_winner was dropped in 20260720150000.
    expect(functions.has("public.award_cycle_winner(uuid,timestamptz,uuid,text,integer,integer,text,numeric)")).toBe(false);
  });

  it("every SECURITY DEFINER function is closed to anon and authenticated", () => {
    const open = [...functions.entries()]
      .filter(([key, state]) => state.securityDefiner && !state.returnsTrigger && !RLS_HELPERS.has(key))
      .flatMap(([key, state]) =>
        PLAYER_ROLES.filter((role) => state.open[role]).map((role) => `${key} is executable by ${role} (defined in ${state.file})`),
      );
    expect(open).toEqual([]);
  });

  it("the RLS helpers still exist (or come off the allowlist)", () => {
    for (const key of RLS_HELPERS) expect(functions.get(key)?.securityDefiner, key).toBe(true);
  });

  it(`${LOCKDOWN_FILE} revokes exactly the F11 functions, each a real signature, and keeps service_role`, () => {
    const lockdown = statements.filter((statement) => statement.file === LOCKDOWN_FILE);
    const revoked = lockdown.filter((s) => s.text.startsWith("revoke ")).flatMap((s) => {
      expect(s.text).toMatch(/ from public, anon, authenticated$/);
      return functionList(s.text);
    });
    const granted = lockdown.filter((s) => s.text.startsWith("grant ")).flatMap((s) => {
      expect(s.text).toMatch(/ to service_role$/);
      return functionList(s.text);
    });
    expect([...revoked].sort()).toEqual([...LOCKDOWN_SIGNATURES].sort());
    expect([...granted].sort()).toEqual([...LOCKDOWN_SIGNATURES].sort());
    // A signature that doesn't exist would make the migration fail in production.
    for (const key of LOCKDOWN_SIGNATURES) expect(functions.get(key)?.securityDefiner, key).toBe(true);
  });

  it("the replay catches what it is meant to", () => {
    const at = (text: string): Statement => ({ file: "x.sql", text });
    const states = replay([
      at("create function public.a(p_id uuid, p_n int default 3) returns void language sql security definer as $body$"),
      at("revoke all on function public.a(uuid, integer) from public"),
      at("create function public.b() returns void language sql security definer as $body$"),
      at("revoke all on function public.b() from public, anon, authenticated"),
      at("grant execute on function public.b() to public"),
      at("create function public.c(x text) returns void language sql security definer as $body$"),
      at("revoke all on function public.c(text), public.b() from public,anon,authenticated"),
      at("create or replace function public.c(y text) returns void language sql security definer as $body$"),
    ]);
    expect(states.get("public.a(uuid,integer)")?.open).toEqual({ anon: true, authenticated: true });
    expect(states.get("public.b()")?.open).toEqual({ anon: false, authenticated: false });
    expect(states.get("public.c(text)")?.open).toEqual({ anon: false, authenticated: false });
  });
});
