import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guard for Phase R3 of docs/admin-mobile-remediation-plan.md.
//
// The admin surface renders inside a hard-locked box: AppShell gives it
// `fixed inset-0 h-screen w-screen overflow-hidden`, and globals.css's
// `.tp-admin-theme` rules pin html/body to `height: 100vh; overflow: hidden`.
// The document therefore CANNOT scroll on /admin. Every admin shell root must
// consequently be a DEFINITE height that inherits that box (`h-full`), with the
// inner pane doing the scrolling via `overflow-y-auto`.
//
// The bug this guards against: swapping a root to an indefinite `min-h-*`
// (`min-h-[100svh]`, `min-h-screen`). That silently breaks every `h-full`
// beneath it, the inner pane stops being a scroll container, the column grows
// past the clip boundary, and the overflowing content — the desktop header, the
// mobile 3-tab nav — becomes unreachable, because there is no document scroll
// to reach it with. That is the same clip-and-strand failure mode as commit
// 35115fc (docs/mobile-game-screen-blackout-plan.md), which has now been merged
// and reverted more than once. These assertions are about the height CONTRACT,
// not about today's exact class strings.

const read = (relativePath: string): string =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

const adminShellSource = read("components/admin/AdminShell.tsx");
const adminMobileShellSource = read("components/admin/AdminMobileShell.tsx");
const modeChooserSource = read("components/admin/AdminModeChooser.tsx");
const appShellSource = read("components/ui/AppShell.tsx");
const globalsCss = read("app/globals.css");

describe("admin shell height chain", () => {
  it("keeps the premise: AppShell's admin box is definite-height and non-scrolling", () => {
    // If this ever stops being true, the `h-full` roots below lose the parent
    // they resolve against and this whole contract has to be re-derived.
    expect(appShellSource).toMatch(/isAdmin[\s\S]{0,200}fixed inset-0 h-screen/);
    expect(appShellSource).toContain("overflow-hidden");
    expect(globalsCss).toMatch(
      /html\.tp-admin-theme,\s*body\.tp-admin-theme\s*\{[\s\S]*?overflow:\s*hidden\s*!important/
    );
  });

  it("gives every admin shell root a definite height, never an indefinite min-h", () => {
    const roots: ReadonlyArray<readonly [string, string]> = [
      ["AdminShell", adminShellSource],
      ["AdminMobileShell", adminMobileShellSource],
      ["AdminModeChooser", modeChooserSource],
    ];

    for (const [name, source] of roots) {
      // Strip comments so the explanatory notes (which necessarily name the
      // banned classes to explain why they are banned) don't trip the guard.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(
        code,
        `${name}: an indefinite min-h-* root breaks the h-full chain under AppShell's locked admin box`
      ).not.toMatch(/min-h-\[100svh\]|min-h-screen|minHeight:\s*["']100[sdl]?vh["']/);
    }
  });

  it("AdminMobileShell can scroll its content without pushing the tab bar out of view", () => {
    // The nav is the thing at risk: Venues and Partner Billing are long, and
    // they are two of the three tabs. `main` must be able to shrink below its
    // content (`min-h-0`) and scroll internally, while header and nav stay
    // `flex-none` so they are never the elements that give way.
    expect(adminMobileShellSource).toMatch(/<main className="[^"]*min-h-0[^"]*flex-1[^"]*overflow-y-auto/);
    expect(adminMobileShellSource).toMatch(/<header className="[^"]*flex-none/);
    expect(adminMobileShellSource).toMatch(/<nav className="[^"]*flex-none/);
  });

  it("AdminShell's main keeps overflow-hidden meaningful and its content pane scrollable", () => {
    // The plan's stated invariant: `main`'s `overflow-hidden` and the content
    // pane's height must either both be meaningful or both be removed. Keeping
    // them while removing the definite height they depend on was the actual bug.
    expect(adminShellSource).toMatch(/<main className="[^"]*h-full[^"]*min-h-0[^"]*overflow-hidden/);
    expect(adminShellSource).toMatch(/className="min-h-0 flex-1 overflow-y-auto/);
  });

  it("preserves the mobile shell's safe-area insets on the pinned chrome itself", () => {
    // Whichever fix was chosen had to keep both insets, and they must live on
    // the pinned elements rather than on a parent.
    expect(adminMobileShellSource).toMatch(/<header className="[^"]*pt-\[(?:calc\()?env\(safe-area-inset-top\)(?:\+[^)]*\))?\]/);
    expect(adminMobileShellSource).toMatch(/<nav className="[^"]*pb-\[(?:calc\()?env\(safe-area-inset-bottom\)(?:\+[^)]*\))?\]/);
  });

  it("does not let the mobile header's top inset eat its own content box", () => {
    // A definite `h-14` PLUS `pt-[env(safe-area-inset-top)]` collapses under
    // `box-sizing: border-box`: on a notched iPhone the ~47px inset consumes
    // the 3.5rem content box and leaves the title and the 44x44 "More" button
    // in a ~9px strip. The height must ADD the inset, not absorb it — either a
    // minimum (`min-h-14`, so the box grows) or an explicit
    // `h-[calc(3.5rem+env(safe-area-inset-top))]`.
    const header = adminMobileShellSource.match(/<header className="([^"]*)"/)?.[1] ?? "";
    expect(header, "AdminMobileShell has no <header> with a className").not.toBe("");
    expect(header).toMatch(/env\(safe-area-inset-top\)/);
    expect(
      header,
      "a definite h-14 absorbs the top inset under border-box; use min-h-14 or h-[calc(3.5rem+env(safe-area-inset-top))]"
    ).not.toMatch(/(?<![\w-])h-14(?![\w-])/);
  });

  it("does not leak a viewport clamp outside the admin components", () => {
    // The 35115fc failure was a clamp applied one level too broadly. Admin
    // height work must stay in admin component classes — no global CSS.
    const adminThemeBlocks = globalsCss.match(/\.tp-admin-theme[^{]*\{[^}]*\}/g) ?? [];
    for (const block of adminThemeBlocks) {
      expect(block).not.toMatch(/100svh/);
    }
  });
});
