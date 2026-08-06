import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for Phase R4 of docs/admin-mobile-remediation-plan.md.
//
// The admin surface's ~20 sections are code-split behind `next/dynamic` in
// `components/admin/adminSectionComponents.tsx`. That split only works if
// NOTHING on the eager path to /admin also imports the sections statically.
//
// The bug this guards against is exactly what Phase 3 shipped and R4 fixed: the
// section registry (then `adminSections.tsx`) held both the metadata AND a
// `component:` field populated by ~20 static imports. Both shells and both
// `app/admin/*` server components import the metadata, so the static graph
// reached every section anyway and the `next/dynamic` layer was pure overhead —
// /admin shipped 1197 KiB of eager client chunks with every section body inside
// one 385 KiB chunk. Splitting the metadata out (component-free) took that to
// 614 KiB with every section body genuinely lazy.
//
// This failure mode is invisible to `tsc` and `eslint` — the code is correct,
// it is just all in one chunk — so a source-level contract test is the only
// automated guard. Assertions are about the module BOUNDARY, not about today's
// exact section list.

const read = (relativePath: string): string =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const META_PATH = "components/admin/adminSectionMeta.ts";
const COMPONENTS_PATH = "components/admin/adminSectionComponents.tsx";

const metaSource = read(META_PATH);
const componentsSource = read(COMPONENTS_PATH);

// The eager path into the admin surface: the two server components that resolve
// a slug, plus both client shells. Anything any of these imports statically is
// in /admin's first-load bundle.
const EAGER_PATH_FILES = [
  "app/admin/page.tsx",
  "app/admin/[section]/page.tsx",
  "components/admin/AdminShell.tsx",
  "components/admin/AdminMobileShell.tsx",
  "components/admin/mobile/MobileVenuesSection.tsx",
] as const;

// The ~20 code-split section components, by module path. Derived from the
// dynamic wrappers themselves so this list cannot drift from the real registry:
// add a section to adminSectionComponents.tsx and it is guarded automatically.
//
// Scoped to these specific modules on purpose. `components/admin/sections/` also
// holds small always-rendered chrome (e.g. QuestionInventoryAlert, a 63-line
// header banner) that is CORRECTLY eager — a blanket "nothing from sections/"
// rule would be wrong and would get disabled the first time it fired.
const SPLIT_SECTION_MODULES: readonly string[] = [
  ...componentsSource.matchAll(/dynamic\(\s*\(\)\s*=>\s*import\("([^"]+)"\)/g),
].map((m) => m[1]);

const staticSectionImports = (source: string): string[] =>
  SPLIT_SECTION_MODULES.filter((modulePath) =>
    new RegExp(`^\\s*import\\s+(?!type\\b)[\\s\\S]*?from\\s+"${modulePath}"`, "m").test(source)
  );

describe("admin section registry split", () => {
  it("actually found the split section modules to guard", () => {
    // Guards the guard: if the dynamic-wrapper regex above ever stops matching,
    // every other assertion in this file would pass vacuously.
    expect(SPLIT_SECTION_MODULES.length).toBeGreaterThanOrEqual(19);
    expect(SPLIT_SECTION_MODULES).toContain("@/components/admin/sections/BillingSection");
  });

  it("keeps the metadata module free of section-component imports", () => {
    // This is the whole fix. One static `import { FooSection } from
    // "@/components/admin/sections/FooSection"` here re-collapses the entire
    // admin surface into one eager chunk for every consumer at once.
    const stripped = stripComments(metaSource);
    expect(staticSectionImports(stripped)).toEqual([]);
    // Not even a type-only import needs to reach a section from here, and a
    // `.ts` (not `.tsx`) extension keeps JSX — and therefore a component —
    // structurally impossible in this module.
    expect(META_PATH.endsWith(".ts")).toBe(true);
    expect(stripped).not.toContain("react");
  });

  it("keeps the section components lazy — every section behind next/dynamic", () => {
    const stripped = stripComments(componentsSource);
    // No static section imports; every reference goes through dynamic(() =>
    // import(...)), which webpack/turbopack can actually split.
    expect(staticSectionImports(stripped)).toEqual([]);
  });

  it("keeps every eager entry point off the section modules", () => {
    for (const file of EAGER_PATH_FILES) {
      expect(
        staticSectionImports(stripComments(read(file))),
        `${file} statically imports an admin section — that defeats the code-split for /admin`
      ).toEqual([]);
    }
  });

  it("routes AdminConsole's section lookup through the dynamic wrappers", () => {
    // AdminConsole is the older duplicate console (plan §0 problem 7). It picks
    // a section from a map rather than a switch, and that map is what used to
    // hold the whole bundle hostage. It must resolve through the dynamic
    // wrappers, never through its own static imports.
    const stripped = stripComments(read("components/admin/AdminConsole.tsx"));
    expect(staticSectionImports(stripped)).toEqual([]);
    expect(stripped).toContain("ADMIN_CONSOLE_SECTION_RENDERERS");
    expect(componentsSource).toContain("ADMIN_CONSOLE_SECTION_RENDERERS");
  });

  it("keeps the mobile allowlist a literal 3-item array, never derived", () => {
    // Deliberate Phase 3 invariant, restated here because R4 moved this
    // constant between modules: adding a section to ADMIN_SECTION_OPTIONS must
    // never make it reachable on mobile — only editing this literal list does.
    const stripped = stripComments(metaSource);
    const match = stripped.match(/MOBILE_SECTION_ORDER\s*=\s*\[([\s\S]*?)\]\s*as const/);
    expect(match).not.toBeNull();
    const entries = (match?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    expect(entries).toHaveLength(3);
    expect(stripped).not.toMatch(/MOBILE_SECTION_ORDER[\s\S]{0,80}ADMIN_SECTION_OPTIONS/);
  });

  it("keeps one shared sectionLabel definition, not a per-shell copy", () => {
    expect(metaSource).toMatch(/export function sectionLabel\(/);
    // AdminMobileShell used to carry a duplicate local copy.
    expect(stripComments(read("components/admin/AdminMobileShell.tsx"))).not.toMatch(
      /function sectionLabel\(/
    );
  });

  it("no longer has the old combined registry module", () => {
    // If someone re-creates components/admin/adminSections.tsx, it will almost
    // certainly re-introduce the `component:` field and its static imports.
    expect(() => read("components/admin/adminSections.tsx")).toThrow();
  });
});
