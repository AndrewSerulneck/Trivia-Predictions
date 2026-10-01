import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Light surfaces opt out of the dark element-level form CSS
// (docs/join-merch-store-plan.md Phase 4.4, F7).
//
// app/globals.css styles bare `button`, `input`, `select`, `textarea` and
// `.tp-clean-button` for the dark app: white/12% and slate-700 borders (the
// field ones with !important), a cyan focus border, weight 600. Those rules are
// unlayered, so on a white panel they beat plain Tailwind utilities. Each one is
// therefore written `<selector>:where(:not(.ht-light-surface *))`: `:where()`
// adds zero specificity, so every other surface matches exactly as before, and
// inside an `ht-light-surface` (the light OwnerSheet) a control's own classes
// are the whole story. This pins that a new or edited global form rule keeps the
// opt-out, instead of the store growing `!` utilities to fight it.

const SCOPE = ":where(:not(.ht-light-surface *))";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

type Rule = { selectors: string[]; body: string };

/** Top-level style rules only (skips @media / @supports / @layer / @keyframes blocks). */
const topLevelRules = (source: string): Rule[] => {
  const rules: Rule[] = [];
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf("{", i);
    if (open === -1) break;
    const prelude = source.slice(i, open).trim();
    // Find the matching close brace.
    let depth = 1;
    let j = open + 1;
    while (j < source.length && depth > 0) {
      if (source[j] === "{") depth += 1;
      else if (source[j] === "}") depth -= 1;
      j += 1;
    }
    const body = source.slice(open + 1, j - 1);
    // A prelude may carry a preceding `@import …;` / `@tailwind …;` statement.
    const selectorText = prelude.slice(prelude.lastIndexOf(";") + 1).trim();
    if (!selectorText.startsWith("@")) rules.push({ selectors: splitSelectors(selectorText), body });
    i = j;
  }
  return rules;
};

/** Split a selector list on top-level commas (not the ones inside `:where(...)`). */
const splitSelectors = (text: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

const rules = topLevelRules(css);
const allSelectors = rules.flatMap((rule) => rule.selectors);

// An element-level form selector with no ancestor/class scope: what applies to
// every control on every surface, the light panel included.
const GLOBAL_FORM_SELECTOR =
  /^(button|input|select|textarea|a\[role="button"\]|\.tp-clean-button)(:[\w-]+(\([^()]*\))?)*$/;

// Declarations that fight a light control's own classes.
const FIGHTING_DECLARATION = /(^|[;\s{])(border(-color|-width|-style)?|font-weight)\s*:/;

describe("light-surface CSS contract (app/globals.css)", () => {
  it("every global form rule that sets a border or weight skips .ht-light-surface", () => {
    const offenders = rules
      .filter((rule) => FIGHTING_DECLARATION.test(rule.body))
      .flatMap((rule) => rule.selectors.filter((sel) => GLOBAL_FORM_SELECTOR.test(sel)));
    expect(offenders).toEqual([]);
  });

  it("the scoped selectors are present, with the zero-specificity :where() wrapper", () => {
    for (const sel of [
      'button:not(:disabled)',
      'a[role="button"]',
      "input",
      "select",
      "textarea",
      "input:focus",
      "select:focus",
      "textarea:focus",
      ".tp-clean-button",
    ]) {
      expect(allSelectors, sel).toContain(`${sel}${SCOPE}`);
    }
  });

  it("the press, small-phone and iOS-zoom rules are NOT scoped (they suit the light panel too)", () => {
    expect(allSelectors).toContain("button:not(:disabled):active");
    expect(css).toMatch(/font-size:\s*16px\s*!important/);
    expect(css).not.toMatch(/:active:where\(:not\(\.ht-light-surface/);
  });
});
