import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Phase 8 tripwires for docs/partner-self-serve-signup-plan.md.
 *
 * The self-serve signup feature is a public, unauthenticated, Google-billed
 * surface gated only by a flag + a rate limiter. Every failure mode this file
 * guards is "a boundary quietly reopens at a call site" — a route that grows a
 * `requireAdminAuth` import, a radius bound hardcoded past `lib/selfServeSignup.ts`,
 * the flag env var read in a second place, the cron sweep picking up the feature
 * flag it is deliberately ungated from. None of these are caught by a behavioural
 * test.
 *
 * Scope note: the draft persistence, the step gate and the motion system are
 * already owned by tests/lib.signup-draft.test.ts and
 * tests/components.signup-shell-motion.test.ts; the rate limiter's window/hash
 * behaviour by tests/api.signup.rate-limit.test.ts; the unwind/claim branches by
 * tests/api.owner.signup.test.ts; the sweep's refusals by
 * tests/api.cron.signup-sweep.test.ts; and the auth.users FK set by
 * tests/lib.auth-users-fk-guard.test.ts. This file does not duplicate any of them.
 */

const REPO_ROOT = join(__dirname, "..");

const rel = (file: string): string => relative(REPO_ROOT, file).split(sep).join("/");

const read = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf8");

/** Strip block and line comments so prose ("...instead of requireAdminAuth...")
 *  never trips a "this identifier must not appear" assertion. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

const collectFiles = (dir: string, exts: RegExp): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, exts));
    else if (exts.test(entry)) out.push(full);
  }
  return out;
};

/** The three /api/signup/* routes plus the fourth public signup surface,
 *  POST /api/owner/signup, which lives outside the prefix but is the same
 *  unauthenticated, flag-gated, rate-limited boundary. */
const PUBLIC_SIGNUP_ROUTES = [
  "app/api/signup/maps-key/route.ts",
  "app/api/signup/places/route.ts",
  "app/api/signup/venue-map/route.ts",
  "app/api/owner/signup/route.ts",
] as const;

describe("self-serve signup — route auth boundary", () => {
  it("no public signup route imports requireAdminAuth", () => {
    for (const route of PUBLIC_SIGNUP_ROUTES) {
      const src = stripComments(read(route));
      expect(src, `${route} must not reference requireAdminAuth`).not.toMatch(
        /requireAdminAuth/,
      );
    }
  });

  it("every public signup route gates on the self-serve flag", () => {
    for (const route of PUBLIC_SIGNUP_ROUTES) {
      const src = stripComments(read(route));
      expect(src, `${route} must import isSelfServeSignupEnabled from @/lib/selfServeSignup`).toMatch(
        /isSelfServeSignupEnabled/,
      );
      expect(src, `${route} must import from @/lib/selfServeSignup`).toMatch(
        /from ["']@\/lib\/selfServeSignup["']/,
      );
    }
  });

  it("every public signup route wires the rate limiter", () => {
    // Assert the IMPORT, not an unconditional call: /api/signup/places returns
    // early on a sub-3-character query and /api/signup/venue-map on bad
    // coordinates, both BEFORE the limiter, on purpose (a request that never
    // reaches Google must not burn a slot).
    for (const route of PUBLIC_SIGNUP_ROUTES) {
      const src = stripComments(read(route));
      expect(src, `${route} must import rateLimit from @/lib/rateLimit`).toMatch(
        /from ["']@\/lib\/rateLimit["']/,
      );
      expect(src, `${route} must reference rateLimit`).toMatch(/\brateLimit\b/);
    }
  });
});

describe("self-serve signup — the flag env var is read in exactly one place", () => {
  it("process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED appears only in lib/selfServeSignup.ts", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "components"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.tsx?$/),
    ];
    const readers = files.filter((f) =>
      /process\.env\.NEXT_PUBLIC_SELF_SERVE_SIGNUP_ENABLED/.test(readFileSync(f, "utf8")),
    );
    expect(readers.map(rel)).toEqual(["lib/selfServeSignup.ts"]);
  });
});

describe("self-serve signup — radius bounds live only in lib/selfServeSignup.ts", () => {
  it("SIGNUP_RADIUS_MIN / SIGNUP_RADIUS_MAX / SIGNUP_DUPLICATE_RADIUS_METERS are assigned only there", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "components"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.tsx?$/),
    ];
    for (const constName of [
      "SIGNUP_RADIUS_MIN",
      "SIGNUP_RADIUS_MAX",
      "SIGNUP_DUPLICATE_RADIUS_METERS",
      "SIGNUP_FIELD_LIMITS",
      "SIGNUP_MAX_BODY_BYTES",
    ]) {
      const assignment = new RegExp(`(?:export\\s+)?const\\s+${constName}\\s*=`);
      const definers = files.filter((f) => assignment.test(readFileSync(f, "utf8")));
      expect(definers.map(rel), `${constName} must be defined only in lib/selfServeSignup.ts`).toEqual([
        "lib/selfServeSignup.ts",
      ]);
    }
  });

  it("the geofence step passes the named bounds, never raw 50/200 props", () => {
    const src = stripComments(read("components/signup/steps/GeofenceStep.tsx"));
    expect(src).toMatch(/min=\{SIGNUP_RADIUS_MIN\}/);
    expect(src).toMatch(/max=\{SIGNUP_RADIUS_MAX\}/);
    expect(src, "no hardcoded radius bound props").not.toMatch(/(?:min|max)=\{\s*(?:50|200)\s*\}/);
  });

  it("signup step components carry no bare-numeric maxLength", () => {
    const stepFiles = collectFiles(join(REPO_ROOT, "components/signup"), /\.tsx$/);
    for (const file of stepFiles) {
      const src = stripComments(readFileSync(file, "utf8"));
      const bareMaxLength = src.match(/maxLength=\{\s*\d+\s*\}/g) ?? [];
      expect(
        bareMaxLength,
        `${rel(file)} must use a named cap (SIGNUP_FIELD_LIMITS.* or SIGNUP_PLACES_QUERY_MAX_LENGTH), not a literal maxLength`,
      ).toEqual([]);
    }
  });

  it("AddressStep's Places box and the /api/signup/places route share one length cap", () => {
    // The autocomplete <input> is not a SignupDraft field, so it has no
    // SIGNUP_FIELD_LIMITS entry — but the client cap and the route's slice must
    // still agree, so both reference SIGNUP_PLACES_QUERY_MAX_LENGTH.
    const step = stripComments(read("components/signup/steps/AddressStep.tsx"));
    expect(step).toMatch(/maxLength=\{SIGNUP_PLACES_QUERY_MAX_LENGTH\}/);
    const route = stripComments(read("app/api/signup/places/route.ts"));
    expect(route).toMatch(/SIGNUP_PLACES_QUERY_MAX_LENGTH/);
    const defRe = /(?:export\s+)?const\s+SIGNUP_PLACES_QUERY_MAX_LENGTH\s*=/;
    const definers = collectFiles(join(REPO_ROOT, "lib"), /\.ts$/).filter((f) =>
      defRe.test(readFileSync(f, "utf8")),
    );
    expect(definers.map(rel)).toEqual(["lib/selfServeSignup.ts"]);
  });
});

describe("self-serve signup — the cron sweep is deliberately un-flag-gated", () => {
  const src = stripComments(read("app/api/cron/signup-sweep/route.ts"));

  it("authorises with isCronAuthorized", () => {
    expect(src).toMatch(/isCronAuthorized/);
  });

  it("does NOT import the self-serve feature flag (it must run even with the flag off)", () => {
    expect(src).not.toMatch(/isSelfServeSignupEnabled/);
  });

  it("does NOT import requireAdminAuth", () => {
    expect(src).not.toMatch(/requireAdminAuth/);
  });
});

describe("self-serve signup — signup_attempts has exactly one writer", () => {
  it("only lib/rateLimit.ts references the signup_attempts table", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "components"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.tsx?$/),
    ];
    const writers = files.filter((f) =>
      /\.from\(\s*["']signup_attempts["']\s*\)/.test(readFileSync(f, "utf8")),
    );
    expect(writers.map(rel)).toEqual(["lib/rateLimit.ts"]);
  });
});

describe("self-serve signup — the sweep's auth.users guard is spelled out in code", () => {
  const src = read("lib/signupSweep.ts");

  it("keeps the email filter on the orphaned-auth-user job", () => {
    // An auth.users row with no email is an anonymous player session, never a
    // partner. Removing this line makes the job's first run delete ~765
    // production player sessions.
    expect(stripComments(src)).toMatch(/if\s*\(\s*!email\s*\)\s*continue/);
  });

  it("checks all seven auth.users FK consumers, not just venue_owners", () => {
    for (const table of [
      "venue_owners",
      "accounts",
      "users",
      "username_change_attempts",
      "username_change_audit",
      "category_blitz_submissions",
      "category_blitz_session_participants",
    ]) {
      expect(src, `AUTH_USER_FK_CONSUMERS must list ${table}`).toMatch(
        new RegExp(`table:\\s*["']${table}["']`),
      );
    }
  });
});

describe("self-serve signup — /owner/register cutover", () => {
  const src = stripComments(read("app/owner/register/page.tsx"));

  it("redirects via the flag reader, not an admin gate", () => {
    expect(src).toMatch(/isSelfServeSignupEnabled/);
    expect(src).not.toMatch(/requireAdminAuth/);
  });
});

describe("self-serve signup — the Google Maps key split", () => {
  /** `browserGoogleMapsKey(` but NOT the `publicBrowserGoogleMapsKey(` that ends in it. */
  const FALLBACK_ACCESSOR = /(?<![A-Za-z0-9_])browserGoogleMapsKey\(/;

  it("the two maps-key routes serve the browser (referrer-restricted) key, never GOOGLE_MAPS_API_KEY", () => {
    for (const route of ["app/api/signup/maps-key/route.ts", "app/api/admin/maps-key/route.ts"]) {
      const src = stripComments(read(route));
      expect(src, `${route} must read the key through lib/googleMapsKeys`).toMatch(
        /from ["']@\/lib\/googleMapsKeys["']/,
      );
      expect(src, `${route} must not read GOOGLE_MAPS_API_KEY directly`).not.toMatch(
        /process\.env\.GOOGLE_MAPS_API_KEY/,
      );
    }
  });

  it("the PUBLIC maps-key route fails closed — no fallback to the server key (Finding #5)", () => {
    // /api/signup/maps-key hands its answer to an unauthenticated stranger, so
    // it must use publicBrowserGoogleMapsKey(), which returns
    // GOOGLE_MAPS_BROWSER_KEY or "". browserGoogleMapsKey()'s fallback to the
    // unrestricted server key is correct ONLY behind requireAdminAuth.
    const publicSrc = stripComments(read("app/api/signup/maps-key/route.ts"));
    expect(publicSrc, "must call publicBrowserGoogleMapsKey()").toMatch(
      /publicBrowserGoogleMapsKey\(\)/,
    );
    expect(publicSrc, "must NOT call the falling-back browserGoogleMapsKey()").not.toMatch(
      FALLBACK_ACCESSOR,
    );

    const adminSrc = stripComments(read("app/api/admin/maps-key/route.ts"));
    expect(adminSrc, "the authenticated route keeps the fallback").toMatch(FALLBACK_ACCESSOR);
  });

  it("publicBrowserGoogleMapsKey has exactly one definition and one caller", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "components"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.tsx?$/),
    ];
    const definers = files.filter((f) =>
      /const publicBrowserGoogleMapsKey\s*=/.test(readFileSync(f, "utf8")),
    );
    expect(definers.map(rel)).toEqual(["lib/googleMapsKeys.ts"]);

    const callers = files.filter((f) =>
      /publicBrowserGoogleMapsKey\(\)/.test(stripComments(readFileSync(f, "utf8"))),
    );
    expect(callers.map(rel).sort()).toEqual(["app/api/signup/maps-key/route.ts"]);
  });

  it("GOOGLE_MAPS_BROWSER_KEY is read in exactly one place", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "components"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.tsx?$/),
    ];
    const readers = files.filter((f) =>
      /process\.env\.GOOGLE_MAPS_BROWSER_KEY/.test(readFileSync(f, "utf8")),
    );
    expect(readers.map(rel)).toEqual(["lib/googleMapsKeys.ts"]);
  });

  it("no /api/signup/* route ever hands out the server key", () => {
    for (const route of collectFiles(join(REPO_ROOT, "app/api/signup"), /route\.ts$/)) {
      expect(stripComments(readFileSync(route, "utf8")), rel(route)).not.toMatch(
        /serverGoogleMapsKey/,
      );
    }
  });

  it("GOOGLE_MAPS_API_KEY is read only through lib/googleMapsKeys.ts (Finding #9)", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "components"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.tsx?$/),
    ];
    const readers = files.filter((f) =>
      /process\.env\.GOOGLE_MAPS_API_KEY/.test(readFileSync(f, "utf8")),
    );
    expect(readers.map(rel)).toEqual(["lib/googleMapsKeys.ts"]);
  });

  it("the Static Maps circle builder is not forked (Finding #10)", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.tsx?$/),
    ];
    const definers = files.filter((f) =>
      /function buildCirclePath\b/.test(readFileSync(f, "utf8")),
    );
    expect(definers.map(rel)).toEqual(["lib/venueStaticMap.ts"]);

    for (const route of ["app/api/admin/venue-map/route.ts", "app/api/signup/venue-map/route.ts"]) {
      expect(stripComments(read(route)), `${route} must delegate to lib/venueStaticMap`).toMatch(
        /from ["']@\/lib\/venueStaticMap["']/,
      );
    }
  });
});

describe("self-serve signup — the rate limiter is atomic in Postgres (Finding #6)", () => {
  const src = stripComments(read("lib/rateLimit.ts"));

  it("decides the quota with the claim_signup_attempt RPC", () => {
    expect(src).toMatch(/\.rpc\(\s*["']claim_signup_attempt["']/);
  });

  it("never re-implements the quota check as a TypeScript read-then-write", () => {
    // The bug: SELECT the window, compare to max, then INSERT. Nothing held a
    // lock between the two round trips, so N concurrent callers all passed.
    // `pruneSignupAttempts` still uses `.from(...).delete()`, so this asserts on
    // the SELECT, not on `.from`.
    expect(src, "the limiter must not read signup_attempts to decide a quota").not.toMatch(
      /from\(["']signup_attempts["']\)\s*\.\s*select/,
    );
  });

  it("ships the migration that defines the RPC", () => {
    const migrations = collectFiles(join(REPO_ROOT, "supabase/migrations"), /\.sql$/);
    const definers = migrations.filter((f) =>
      /create or replace function public\.claim_signup_attempt/i.test(readFileSync(f, "utf8")),
    );
    expect(definers).toHaveLength(1);
    const migration = readFileSync(definers[0], "utf8");
    expect(migration, "the RPC must take the advisory lock").toMatch(/pg_advisory_xact_lock/);
    expect(migration, "the RPC must be service_role-only").toMatch(
      /grant execute on function public\.claim_signup_attempt[^;]*to service_role/i,
    );
  });
});

describe("self-serve signup — public routes return generic errors (Finding #7)", () => {
  it("/api/signup/places never puts the upstream message in the response body", () => {
    const src = stripComments(read("app/api/signup/places/route.ts"));
    expect(src, "the upstream text belongs in console.error, not the body").not.toMatch(
      /error:\s*message/,
    );
    expect(src).toMatch(/console\.error\(/);
  });

  it("/api/signup/email-available never puts the upstream message in the response body", () => {
    const src = stripComments(read("app/api/signup/email-available/route.ts"));
    expect(src, "the Postgres text belongs in console.error, not the body").not.toMatch(
      /error:\s*(?:result\.)?message/,
    );
    expect(src).toMatch(/console\.error\(/);
  });
});

/**
 * "Does this email already have a partner account?" is asked by the step-2
 * pre-check AND by the submit route. Two copies is the §2 root cause that
 * produced five of the original fifteen findings, and here it would be worse
 * than cosmetic: a pre-check that answers differently from the authority sends
 * a partner through five more steps to a 409 it already knew about.
 */
describe("self-serve signup — the owner-email lookup has exactly one home", () => {
  const LOOKUP_MODULE = "lib/ownerEmailAvailability.ts";

  /**
   * `app/api/owner/account/email/route.ts` asks a DIFFERENT question — "is this
   * address taken by someone OTHER than the owner making the request?"
   * (`.neq("id", owner.id)`), behind `requireOwnerAuth`, for an owner editing
   * their own account. It is allow-listed rather than folded in: giving
   * `ownerEmailExists` an `excludeOwnerId` option would put an authenticated
   * account-settings path on the signup flow's critical code for no signup
   * benefit. If a THIRD site appears, fold it in instead of extending this list.
   */
  const ALLOWED_OTHER_LOOKUPS = ["app/api/owner/account/email/route.ts"];

  it("venue_owners is queried by email in exactly one module", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.ts$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.ts$/),
    ];
    // A `.eq("email", …)` immediately downstream of `.from("venue_owners")`.
    const offenders = files.filter((file) => {
      const src = stripComments(readFileSync(file, "utf8"));
      return /from\(\s*["']venue_owners["']\s*\)[\s\S]{0,200}?\.eq\(\s*["']email["']/.test(src);
    });
    expect(offenders.map(rel).sort()).toEqual([...ALLOWED_OTHER_LOOKUPS, LOOKUP_MODULE].sort());
  });

  it("both callers go through ownerEmailExists", () => {
    for (const route of ["app/api/signup/email-available/route.ts", "app/api/owner/signup/route.ts"]) {
      const src = stripComments(read(route));
      expect(src, `${route} must call the shared lookup`).toMatch(/ownerEmailExists\(/);
      expect(src, `${route} must import it from @/lib/ownerEmailAvailability`).toMatch(
        /from\s+["']@\/lib\/ownerEmailAvailability["']/,
      );
    }
  });

  it("the taken message is defined once and never re-typed at a call site", () => {
    const files = [
      ...collectFiles(join(REPO_ROOT, "app"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "lib"), /\.tsx?$/),
      ...collectFiles(join(REPO_ROOT, "components"), /\.tsx?$/),
    ];
    const definers = files.filter((file) =>
      /const\s+OWNER_EMAIL_TAKEN_MESSAGE\s*=/.test(readFileSync(file, "utf8")),
    );
    expect(definers.map(rel)).toEqual([LOOKUP_MODULE]);
  });

  it("the pre-check is rate limited on its own bucket, and the flag gates it first", () => {
    const src = stripComments(read("app/api/signup/email-available/route.ts"));
    expect(src).toMatch(/isSelfServeSignupEnabled\(\)/);
    expect(src).toMatch(/rateLimit\(request,\s*["']emailCheck["']\)/);
    // The flag check must come before the limiter, which must come before the
    // lookup — an enumeration oracle should cost nothing when it is switched off.
    const flagAt = src.indexOf("isSelfServeSignupEnabled");
    const limitAt = src.indexOf("rateLimit(request");
    const lookupAt = src.indexOf("ownerEmailExists(");
    expect(flagAt).toBeGreaterThan(-1);
    expect(flagAt).toBeLessThan(limitAt);
    expect(limitAt).toBeLessThan(lookupAt);
  });
});

describe("self-serve signup — the wizard uses the shared navigation primitives", () => {
  it("no components/signup file imports NextButton or StepBackButton directly", () => {
    for (const file of collectFiles(join(REPO_ROOT, "components/signup"), /\.tsx?$/)) {
      const src = stripComments(readFileSync(file, "utf8"));
      expect(src, `${rel(file)} must not import NextButton`).not.toMatch(
        /import[^;]*\bNextButton\b[^;]*from/,
      );
      expect(src, `${rel(file)} must not import StepBackButton`).not.toMatch(
        /import[^;]*\bStepBackButton\b[^;]*from/,
      );
    }
  });

  it("SignupShell composes WizardFooter", () => {
    expect(read("components/signup/SignupShell.tsx")).toMatch(
      /from ["']@\/components\/navigation\/WizardFooter["']/,
    );
  });
});
