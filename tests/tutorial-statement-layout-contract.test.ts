import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { usesStatementTutorialLayout } from "@/components/venue/GameIdentityPanel";
import { VENUE_GAME_CARDS } from "@/lib/venueGameCards";

// Andrew, 2026-10-17: every game's tutorial cards follow Category Blitz's
// statement-first layout — big statement and detail on top, art below in the
// space left — "for these tutorials and for future ones when we make new games".
// Only the two trivia games still use the older eyebrow layout. A new game
// fails here until it is added to STATEMENT_LAYOUT_GAMES (GameIdentityPanel.tsx).
const OLDER_LAYOUT_GAMES = new Set(["speed-trivia", "live_trivia"]);

describe("game tutorial cards use the Category Blitz layout", () => {
  it("puts every game except the two trivia games on the statement layout", () => {
    for (const card of VENUE_GAME_CARDS) {
      expect(usesStatementTutorialLayout(card.key), card.key).toBe(!OLDER_LAYOUT_GAMES.has(card.key));
    }
  });

  it("gives statement-layout cards no eyebrow label (it is never shown)", () => {
    for (const card of VENUE_GAME_CARDS.filter((c) => usesStatementTutorialLayout(c.key))) {
      expect(card.steps.every((step) => step.stepLabel === undefined), card.key).toBe(true);
    }
  });

  // CLAUDE.md "Game tutorial cards": text wins, art shrinks — never a label under
  // 14px inside tutorial art. Whether names/art fit at 350px and 289px is checked
  // in a browser (a unit test can't lay text out), but a small literal is catchable.
  it("keeps every fixed text size in the tutorial art at 14px or more", () => {
    const source = readFileSync(join(process.cwd(), "components/venue/GameIdentityPanel.tsx"), "utf8");
    const tooSmall = [...source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter((m) => Number(m[1]) < 14).map((m) => m[0]);
    expect(tooSmall).toEqual([]);
  });
});
