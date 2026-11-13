import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Venue display Phase 3 (docs/venue-display-hype-and-intro-stinger-plan.md): brand chrome on every screen.

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("venue display brand chrome", () => {
  it("draws the drifting stage behind every mode and /tv", () => {
    expect(read("components/venue-screen/VenueScreenClient.tsx")).toContain("<BrandStage");
    expect(read("components/venue-screen/TvPairingDisplay.tsx")).toContain("<BrandStage");
  });

  it("animates only transform and opacity in the shared effects", () => {
    for (const file of ["BrandStage", "ShineSweep", "CountUp"]) {
      const source = read(`components/venue-screen/fx/${file}.tsx`);
      expect(source).not.toMatch(/filter|boxShadow|shadowBlur/);
    }
  });

  it("every effect has a reduced-motion path", () => {
    for (const file of ["BrandStage", "ShineSweep", "CountUp"]) {
      expect(read(`components/venue-screen/fx/${file}.tsx`)).toContain("useReducedMotion");
    }
  });

  it("header carries the logo with a shine, and the chip uses the game gradient", () => {
    const source = read("components/venue-screen/VenueScreenClient.tsx");
    expect(source).toContain("/brand/web/htc-logo-192.webp");
    expect(source).toContain("<ShineSweep");
    expect(source).toContain("accentSoft");
  });

  it("scores count up in Squares and Bracket", () => {
    expect(read("components/venue-screen/SquaresTvScreen.tsx")).toContain("<CountUp");
    expect(read("components/venue-screen/BracketTvScreen.tsx")).toContain("<CountUp");
  });

  it("the Bracket top 3 take the podium edge", () => {
    expect(read("components/venue-screen/BracketTvScreen.tsx")).toContain("getPodiumAccent(row.rank)");
  });

  it("mounts the fx engine once, armed after the intro, with a twinkle field", () => {
    const source = read("components/venue-screen/VenueScreenClient.tsx");
    expect(source.match(/<FxProvider/g)).toHaveLength(1);
    expect(source).toContain("armed={!introPlaying}");
    expect(source).toContain("<StageTwinkles");
    expect(read("components/venue-screen/fx/StageTwinkles.tsx")).toContain("fx.twinkles(");
  });

  it("the Bracket upset bursts once, keyed on the game, and rows keep their identity across polls", () => {
    const source = read("components/venue-screen/BracketTvScreen.tsx");
    expect(source).toContain("fx.burst({ key: upsetKey");
    expect(source).toContain("upset:${bracket.key}");
    expect(source).toContain("bracketRowKeys(bracket.standings.map((row) => row.username))");
    expect(source).toContain("key={rowKeys[index]}");
  });

  it("the logo file exists", () => {
    expect(fs.existsSync(path.join(process.cwd(), "public/brand/web/htc-logo-192.webp"))).toBe(true);
  });
});
