import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 8 tripwire (docs/squares-and-brackets-plan.md): the bracket screens stay screens. Rules live in
// lib/brackets/*, reads are cheap, and nothing server-only or private reaches the browser.

const ROOT = join(__dirname, "..");
const COMPONENT_DIR = join(ROOT, "components/bracket");
const files = readdirSync(COMPONENT_DIR).filter((name) => /\.(ts|tsx)$/.test(name));
const source = (name: string) => readFileSync(join(COMPONENT_DIR, name), "utf8");
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("bracket screens (Phase 8)", () => {
  it("has the files this contract is about", () => {
    expect(files.sort()).toEqual(
      [
        "BracketEditor.tsx",
        "BracketGame.tsx",
        "BracketMatchups.tsx",
        "BracketReview.tsx",
        "BracketStandings.tsx",
        "BracketStepChips.tsx",
        "useBracketData.ts",
      ].sort(),
    );
  });

  it("never polls", () => {
    for (const name of files) {
      expect(code(source(name)), name).not.toMatch(/setInterval\s*\(/);
    }
  });

  it("reads the network in exactly two places: the data hook and the standings list", () => {
    const callers = files.filter((name) => /\bfetch\s*\(/.test(code(source(name))));
    expect(callers.sort()).toEqual(["BracketStandings.tsx", "useBracketData.ts"]);
  });

  it("imports server modules as types only (server-only code must not reach the browser)", () => {
    for (const name of [...files, "../../lib/bracketsView.ts"]) {
      const text = name.startsWith("..") ? readFileSync(join(COMPONENT_DIR, name), "utf8") : source(name);
      for (const match of text.matchAll(/^import\s+(?!type\b)[^;]*from\s+"(@\/lib\/brackets(?:Entries|Store|Sync|Admin|Feed))"/gm)) {
        throw new Error(`${name} imports ${match[1]} as a value`);
      }
    }
  });

  it("keeps the rules in lib/brackets: no screen decides what may be picked", () => {
    const editor = code(source("BracketEditor.tsx"));
    expect(editor).toContain("setBracketPick");
    for (const name of files) {
      expect(code(source(name)), name).not.toMatch(/parentOf|childSlots|slotCoversSeat|seatRangeOfSlot/);
    }
  });

  it("moves between steps only with the shared WizardFooter", () => {
    expect(code(source("BracketEditor.tsx"))).toContain("<WizardFooter");
    for (const name of files) {
      expect(code(source(name)), name).not.toMatch(/<(StepBackButton|NextButton)\b/);
    }
  });

  it("keeps the on-screen name in lib/venueGameCards.ts", () => {
    const page = readFileSync(join(ROOT, "app/bracket/page.tsx"), "utf8");
    expect(page).toContain("BRACKET_GAME_NAME");
    for (const name of files) {
      expect(code(source(name)), name).not.toContain("March Madness");
    }
  });

  it("the page does not exist while the flag is off", () => {
    const page = code(readFileSync(join(ROOT, "app/bracket/page.tsx"), "utf8"));
    expect(page).toMatch(/if \(!isBracketsEnabled\(\)\) notFound\(\)/);
  });

  it("is an in-session route and a known analytics game", () => {
    expect(readFileSync(join(ROOT, "components/auth/AuthNavigationGuard.tsx"), "utf8")).toContain('pathname.startsWith("/bracket")');
    expect(readFileSync(join(ROOT, "lib/analytics.ts"), "utf8")).toContain('pathname.startsWith("/bracket")) return "bracket"');
  });

  it("sends the player's id only as the signed-session userId parameter, never anyone else's", () => {
    // Standings and state responses carry no user id (pinned in brackets-contract.test.ts); the screens
    // must not read one out of a response either.
    for (const name of files) {
      expect(code(source(name)), name).not.toMatch(/\.user_?id\b|\.userId\b\s*===|row\.userId/);
    }
  });
});
