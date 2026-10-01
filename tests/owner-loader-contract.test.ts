import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// docs/partner-dashboard-merch-button-loader-speed-plan.md Phase 4: `HightopLoader` is
// the ONE loading screen in this app. Partner routes stopped falling back to the
// player-styled root loader, and the orange basketball is gone everywhere
// (Andrew, 2026-10-01, Q1: "everywhere. Get rid of the basketball.").

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Every .ts/.tsx under `app/`, `components/` and `lib/`. */
const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) out.push(relative(ROOT, full));
    }
  };
  for (const dir of ["app", "components", "lib"]) walk(join(ROOT, dir));
  return out;
};

describe("the basketball is gone (Phase 4b)", () => {
  it("has no BouncingBallLoader component left", () => {
    expect(existsSync(join(ROOT, "components/ui/BouncingBallLoader.tsx"))).toBe(false);
  });

  it("is imported by nothing under app/, components/ or lib/", () => {
    const offenders = sourceFiles().filter((file) => /from "@\/components\/ui\/BouncingBallLoader"/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("leaves no orange basketball markup behind", () => {
    // The ball was the only `bg-orange-400` + `border-orange-900` pair in the app.
    const offenders = sourceFiles().filter((file) => /border-orange-900/.test(read(file)));
    expect(offenders).toEqual([]);
  });

  it("keeps the label visible on every player loader that drew one", () => {
    // `BouncingBallLoader` always drew its label; `HightopLoader`'s is opt-in, so a
    // `label` without `showLabel` is a screen that silently lost its text.
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const source = read(file);
      if (file === "components/ui/HightopLoader.tsx") continue;
      for (const [tag] of source.matchAll(/<HightopLoader\b[^>]*\/>/g)) {
        if (/\blabel=/.test(tag) && !/\bshowLabel\b/.test(tag)) offenders.push(`${file}: ${tag}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("partner route transitions (Phase 4a)", () => {
  it("app/owner/loading.tsx renders the Hightop loader, not the root player one", () => {
    const loading = read("app/owner/loading.tsx");
    expect(loading).toMatch(/from "@\/components\/ui\/HightopLoader"/);
    expect(loading).toMatch(/<HightopLoader\b/);
    // The route loader IS the answer to the tap: no show-delay.
    expect(loading).toMatch(/delayMs=\{0\}/);
    expect(loading).not.toMatch(/RouteLoadingScreen/);
  });

  it("every signed-in /owner page shows the loader instead of a bare 'Loading…' line", () => {
    const pages = [
      "app/owner/dashboard/page.tsx",
      "app/owner/display/page.tsx",
      "app/owner/billing/page.tsx",
      "app/owner/billing/setup/page.tsx",
      "app/owner/account/page.tsx",
      "app/owner/game-settings/page.tsx",
    ];
    for (const page of pages) {
      const source = read(page);
      expect(source, `${page} must render HightopLoader`).toMatch(/<HightopLoader\b/);
      expect(source, `${page} still has a text-only loading line`).not.toMatch(/>Loading…</);
    }
  });

  it("owner sign-in success covers the form with the loader before it navigates", () => {
    const login = read("app/owner/login/page.tsx");
    expect(login).toMatch(/<HightopLoader\b[^>]*variant="fullScreen"/);
    // The loader must be raised before the push, not after it.
    const loaderAt = login.indexOf("setNavigating(true)");
    const pushAt = login.indexOf('router.push("/owner/dashboard")');
    expect(loaderAt).toBeGreaterThan(-1);
    expect(loaderAt).toBeLessThan(pushAt);
  });
});

describe("the dashboard shows one loader, not loader-then-skeletons (Phase 4, item 3)", () => {
  const dashboard = read("app/owner/dashboard/page.tsx");

  it("gates its first render on useLoaderVisible, so the loader cannot blink", () => {
    expect(dashboard).toMatch(/from "@\/lib\/useLoaderVisible"/);
    expect(dashboard).toMatch(/useLoaderVisible\(/);
    // The caller owns the timing, so the component must not re-pay the delay.
    expect(dashboard).toMatch(/<HightopLoader[^>]*delayMs=\{0\}/);
  });

  it("waits for the venue list AND both section lists before revealing", () => {
    expect(dashboard).toMatch(/onReady/);
    expect(dashboard).toMatch(/games\.status !== "loading" && rewards\.status !== "loading"/);
    expect(dashboard).toMatch(/loading \|\| \(selectedVenueId !== "" && !bodyReady\)/);
  });

  it("no longer renders page-level SectionSkeletons", () => {
    // SectionSkeleton survives INSIDE the two sections, for Retry — not as the
    // page's first-load state, which is what made it loader-then-skeletons.
    expect(dashboard).not.toMatch(/<SectionSkeleton/);
    expect(dashboard).not.toMatch(/import \{ SectionSkeleton \}/);
    expect(read("components/owner/dashboard/LiveGamesSection.tsx")).toMatch(/SectionSkeleton/);
    expect(read("components/owner/dashboard/RewardsSection.tsx")).toMatch(/SectionSkeleton/);
  });
});

describe("no two overlays can stack on /owner/* (Phase 4, item 6)", () => {
  it("tp:global-transition-show is only ever dispatched from the player join flow", () => {
    const emitters = sourceFiles().filter((file) => read(file).includes('"tp:global-transition-show"'));
    // The overlay itself listens; JoinFlow is the only thing that raises it.
    expect(emitters.sort()).toEqual(["components/join/JoinFlow.tsx", "components/ui/GlobalTransitionOverlay.tsx"]);
  });

  it("no /owner/* or /admin file raises a global transition at all", () => {
    const offenders = sourceFiles().filter(
      (file) =>
        (file.startsWith("app/owner/") || file.startsWith("components/owner/") || file.startsWith("app/admin")) &&
        read(file).includes("tp:global-transition"),
    );
    expect(offenders).toEqual([]);
  });
});
