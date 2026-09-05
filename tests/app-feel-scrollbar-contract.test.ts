import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const globalsCss = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

describe("app-feel scrollbar treatment", () => {
  it("hides scrollbar chrome across browsers without changing scrolling", () => {
    expect(globalsCss).toMatch(/html,\s*\nbody,\s*\n\*\s*\{\s*\n\s*scrollbar-width:\s*none;/);
    expect(globalsCss).toContain("-ms-overflow-style: none;");
    expect(globalsCss).toMatch(/\*::-webkit-scrollbar\s*\{\s*\n\s*display:\s*none;/);
    expect(globalsCss).toContain("overflow-y: auto;");
  });

  it("does not reserve empty desktop scrollbar rails", () => {
    expect(globalsCss).not.toContain("scrollbar-gutter: stable both-edges;");
  });
});
