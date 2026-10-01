import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { STORE_PAPER_HEX } from "@/lib/themeTokens";

describe("store paper token", () => {
  it("STORE_PAPER_HEX mirrors --ht-store-paper in app/globals.css", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    const match = css.match(/--ht-store-paper:\s*(#[0-9a-fA-F]{3,8})\s*;/);
    expect(match).not.toBeNull();
    expect(STORE_PAPER_HEX.toLowerCase()).toBe(match![1].toLowerCase());
  });
});
