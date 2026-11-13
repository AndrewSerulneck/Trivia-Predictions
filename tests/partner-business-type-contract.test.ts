import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_LABELS,
  businessTypeLabel,
  parseBusinessType,
} from "@/lib/partnerBusinessType";
import { SIGNUP_BUSINESS_TYPE_REQUIRED, resolveSignupBusinessType } from "@/lib/selfServeSignup";

/**
 * Partner business type (docs/partner-business-type-plan.md).
 *
 * lib/partnerBusinessType.ts is the ONE home of the list. No other app file may
 * spell a stored value, and the migration's CHECK constraint must allow exactly
 * the same five.
 */

const ROOT = process.cwd();
const HOME = "lib/partnerBusinessType.ts";
const MIGRATION = "supabase/migrations/20261112214307_partner_business_type.sql";
const SIGNUP_ROUTE = "app/api/owner/signup/route.ts";

const listSourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
};

const relative = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

describe("the list", () => {
  it("is the five agreed values, in display order, with the agreed labels", () => {
    expect(BUSINESS_TYPES).toEqual(["bar_restaurant", "trivia_dj", "hotel", "movie_theater", "other"]);
    expect(BUSINESS_TYPES.map((type) => BUSINESS_TYPE_LABELS[type])).toEqual([
      "Bar/Restaurant",
      "Trivia DJ",
      "Hotel",
      "Movie theater",
      "Other",
    ]);
  });

  it("parses exact values only, and labels unknown as —", () => {
    for (const type of BUSINESS_TYPES) {
      expect(parseBusinessType(type)).toBe(type);
      expect(parseBusinessType(` ${type} `)).toBe(type);
    }
    for (const bad of ["", "bar", "Bar/Restaurant", "TRIVIA_DJ", null, undefined, 1, {}]) {
      expect(parseBusinessType(bad)).toBeNull();
    }
    expect(businessTypeLabel(null)).toBe("—");
    expect(businessTypeLabel(undefined)).toBe("—");
    expect(businessTypeLabel("movie_theater")).toBe("Movie theater");
  });

  it("no other app file spells a stored value", () => {
    const offenders: string[] = [];
    const needles = BUSINESS_TYPES.filter((type) => type !== "other" && type !== "hotel");
    for (const file of ["app", "lib", "components", "types"].flatMap(listSourceFiles)) {
      const rel = relative(file);
      if (rel === HOME) continue;
      const source = readFileSync(file, "utf8");
      for (const needle of needles) {
        if (source.includes(`"${needle}"`) || source.includes(`'${needle}'`)) offenders.push(`${rel}: ${needle}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("migration", () => {
  const sql = read(MIGRATION);

  it("adds a nullable text column with a CHECK on exactly the five values", () => {
    expect(sql).toMatch(/add column if not exists business_type text null/i);
    const check = sql.match(/business_type in \(([^)]*)\)/i);
    expect(check).not.toBeNull();
    const values = (check?.[1] ?? "").split(",").map((value) => value.trim().replace(/^'|'$/g, ""));
    expect(values).toEqual([...BUSINESS_TYPES]);
    expect(sql).toMatch(/business_type is null\s+or/i);
  });

  it("backfills only NULL rows, to bar_restaurant", () => {
    expect(sql).toMatch(
      /update public\.venue_owners\s+set business_type = 'bar_restaurant'\s+where business_type is null;/i
    );
  });

  it("is text + CHECK, not a Postgres enum", () => {
    expect(sql).not.toMatch(/create type/i);
  });
});

describe("signup route", () => {
  const route = read(SIGNUP_ROUTE);

  it("validates through resolveSignupBusinessType and writes business_type on the owner insert", () => {
    expect(route).toContain("resolveSignupBusinessType(body.businessType)");
    expect(route).toMatch(/business_type: businessType/);
  });

  it("checks the type only after the rate limiter has spoken", () => {
    expect(route.indexOf("rateLimitSignupSubmit(request")).toBeGreaterThan(-1);
    expect(route.indexOf("resolveSignupBusinessType(body.businessType)")).toBeGreaterThan(
      route.indexOf("rateLimitSignupSubmit(request")
    );
  });

  it("refuses a missing or unknown type (required since Phase 4)", () => {
    expect(SIGNUP_BUSINESS_TYPE_REQUIRED).toBe(true);
    expect(resolveSignupBusinessType(undefined).ok).toBe(false);
    expect(resolveSignupBusinessType(undefined, false)).toEqual({ ok: true, businessType: null });
    expect(resolveSignupBusinessType("hotel", true)).toEqual({ ok: true, businessType: "hotel" });
    expect(resolveSignupBusinessType("motel").ok).toBe(false);
  });
});
