import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CategoryBlitzRulesSheet } from "@/components/category-blitz/CategoryBlitzRulesSheet";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("Category Blitz rules popup, footer and lobby flash (how-to-play Phase 3)", () => {
  it("the popup is closed (renders nothing) until opened", () => {
    expect(renderToStaticMarkup(createElement(CategoryBlitzRulesSheet, { open: false, onClose: () => {} }))).toBe("");
  });

  it("the popup reads the shared rules list and sits on OwnerSheet", () => {
    const src = read("components/category-blitz/CategoryBlitzRulesSheet.tsx");
    expect(src).toContain("CATEGORY_BLITZ_RULES");
    expect(src).toContain("OwnerSheet");
  });

  it("both countdowns offer How to play", () => {
    expect(read("components/category-blitz/IntermissionStatus.tsx")).toContain("<HowToPlayButton");
    expect(read("components/category-blitz/CategoryBlitzGame.tsx")).toContain("<HowToPlayButton");
  });

  it("the autosave footer line is gone", () => {
    expect(read("components/category-blitz/CategoryBlitzGame.tsx")).not.toContain("Answers save automatically");
  });

  it("the legacy lobby waits for the first session response", () => {
    const game = read("components/category-blitz/CategoryBlitzGame.tsx");
    expect(game).toContain("!hasLoaded && !error");
    expect(game).toContain("(hasLoaded || error) &&");
    expect(read("lib/categoryBlitzRealtime.ts")).toContain("setHasLoaded(true)");
  });
});
